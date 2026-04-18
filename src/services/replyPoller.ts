import {
  getReplies,
  recordReplies,
  getDeltaLink,
  setDeltaLink,
  type TrackedReply,
  getTrackedRecipientByConversation,
  migrateFromLocalStorageOnce,
} from "./replyTracker";

const POLL_INTERVAL_MS = 60_000;

type Listener = (replies: TrackedReply[]) => void;

export interface PollerHealth {
  lastPollAt: number | null;
  lastError: string | null;
}

type HealthListener = (h: PollerHealth) => void;

class ReplyPoller {
  private timer: number | null = null;
  private polling = false;
  private listeners = new Set<Listener>();
  private healthListeners = new Set<HealthListener>();
  private currentIdentity: string | null = null;
  private migrationPromise: Promise<void> | null = null;
  private health: PollerHealth = { lastPollAt: null, lastError: null };

  subscribeHealth(l: HealthListener): () => void {
    this.healthListeners.add(l);
    l(this.health);
    return () => this.healthListeners.delete(l);
  }

  getHealth(): PollerHealth {
    return this.health;
  }

  private emitHealth(): void {
    for (const l of this.healthListeners) {
      try {
        l(this.health);
      } catch {}
    }
  }

  async backfill(): Promise<void> {
    const a = window.electronAPI;
    if (!a) return;
    const profile = await a.getUserProfile();
    const id = profile?.email?.toLowerCase();
    if (!id) return;
    await a.dbClearDeltaToken(id, "Inbox");
    await a.dbClearDeltaToken(id, "SentItems");
    await this.poll();
  }

  start(): void {
    if (this.timer !== null) return;
    this.poll();
    this.timer = window.setInterval(() => this.poll(), POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    this.emitCurrent(listener);
    return () => this.listeners.delete(listener);
  }

  private async emitCurrent(listener: Listener): Promise<void> {
    try {
      const replies = await getReplies(this.currentIdentity ?? undefined);
      listener(replies);
    } catch (e) {
      console.warn("emitCurrent failed:", e);
    }
  }

  async poll(): Promise<void> {
    if (this.polling) return;
    if (!window.electronAPI) return;
    this.polling = true;
    try {
      if (!this.migrationPromise) this.migrationPromise = migrateFromLocalStorageOnce();
      await this.migrationPromise;

      const profile = await window.electronAPI.getUserProfile();
      const identityEmail = profile?.email?.toLowerCase() || null;
      if (!identityEmail) return;

      if (this.currentIdentity !== identityEmail) {
        this.currentIdentity = identityEmail;
      }

      this.pollSentItems(identityEmail).catch((e) => console.warn("SentItems poll failed:", e));

      const deltaLink = await getDeltaLink(identityEmail);
      const result = await window.electronAPI.pollInboxDelta({ deltaLink, identityEmail });

      if (!result.ok) {
        if (result.expired) {
          await setDeltaLink(identityEmail, undefined);
        }
        this.health = {
          lastPollAt: this.health.lastPollAt,
          lastError: result.error || "inbox delta failed",
        };
        this.emitHealth();
        return;
      }

      this.health = { lastPollAt: Date.now(), lastError: null };
      this.emitHealth();

      if (result.deltaLink) {
        await setDeltaLink(identityEmail, result.deltaLink);
      }

      if (result.messages.length === 0) return;

      const newReplies: TrackedReply[] = [];
      for (const m of result.messages) {
        const t = await getTrackedRecipientByConversation(m.conversationId, identityEmail);
        if (!t) continue;
        if (m.from && t.identityEmail && m.from.toLowerCase() === t.identityEmail.toLowerCase()) {
          continue;
        }
        if (m.from && m.from.toLowerCase() === identityEmail) {
          continue;
        }
        newReplies.push({
          id: m.id,
          conversationId: m.conversationId,
          recipientEmail: t.recipientEmail,
          recipientName: t.recipientName,
          campaignName: t.campaignName,
          runId: t.runId,
          fromAddress: m.from,
          fromName: m.fromName,
          subject: m.subject,
          bodyPreview: m.bodyPreview,
          rawBody: m.bodyContent || undefined,
          receivedAt: m.receivedDateTime,
          seen: false,
          identityEmail,
        });
      }

      if (newReplies.length === 0) return;

      const existing = await getReplies(identityEmail);
      const existingIds = new Set(existing.map((r) => r.id));
      const trulyNew = newReplies.filter((r) => !existingIds.has(r.id));
      if (trulyNew.length === 0) return;

      const all = await recordReplies(newReplies);
      for (const reply of trulyNew) {
        this.fireNotification(reply);
      }
      this.notifyListeners(all);
      this.health = { lastPollAt: Date.now(), lastError: null };
      this.emitHealth();
    } catch (err: any) {
      console.warn("Reply poll failed:", err);
      this.health = { lastPollAt: this.health.lastPollAt, lastError: err?.message || String(err) };
      this.emitHealth();
    } finally {
      this.polling = false;
    }
  }

  private async pollSentItems(identityEmail: string): Promise<void> {
    const a = window.electronAPI;
    if (!a) return;
    const token = await a.dbGetDeltaToken(identityEmail, "SentItems");
    const result = await a.pollSentItemsDelta({ deltaLink: token ?? undefined });
    if (!result.ok) {
      if (result.expired) await a.dbClearDeltaToken(identityEmail, "SentItems");
      return;
    }
    if (result.deltaLink) await a.dbSetDeltaToken(identityEmail, "SentItems", result.deltaLink);
    if (result.messages.length === 0) return;
    for (const m of result.messages) {
      const sentAt = m.sentDateTime || m.receivedDateTime;
      if (!sentAt) continue;
      if (m.internetMessageId) {
        await a.dbMarkDelivered({ internetMessageId: m.internetMessageId, identityEmail, sentAt });
        continue;
      }
      if (m.conversationId && m.toEmails.length > 0) {
        await a.dbMarkDelivered({
          conversationId: m.conversationId,
          toEmail: m.toEmails[0],
          identityEmail,
          sentAt,
        });
      }
    }
  }

  private fireNotification(reply: TrackedReply): void {
    try {
      if (typeof Notification === "undefined") return;
      const title = `Reply from ${reply.fromName || reply.fromAddress}`;
      const body = reply.subject ? `${reply.subject}\n${reply.bodyPreview}` : reply.bodyPreview;
      if (Notification.permission === "granted") {
        new Notification(title, { body });
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then((perm) => {
          if (perm === "granted") {
            new Notification(title, { body });
          }
        });
      }
    } catch (e) {
      console.warn("Notification failed:", e);
    }
  }

  private notifyListeners(replies: TrackedReply[]): void {
    for (const l of this.listeners) {
      try {
        l(replies);
      } catch (e) {
        console.warn("Reply listener threw:", e);
      }
    }
  }
}

export const replyPoller = new ReplyPoller();
