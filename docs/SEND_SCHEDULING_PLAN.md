# Email Drafter — Send Pipeline + Analytics Plan

## Status

| Phase | What | Status |
|---|---|---|
| 0 | Account model lock + IT permissions | ✅ Shipped |
| — | Always draft-then-send pipeline | ✅ Shipped |
| — | Send-now (synchronous + stagger-via-deferred) | ✅ Shipped |
| — | Schedule via `PidTagDeferredSendTime` | ✅ Shipped |
| — | Send-all-drafts post-Draft action | ✅ Shipped |
| — | Reply tracking (localStorage) + 60s inbox `/delta` poller + notifications + Replies panel | ✅ Shipped |
| — | Skip auto-CC of self when sending as cuhyperloop | ✅ Shipped |
| 1 | SQLite telemetry store (replaces localStorage) | ✅ Shipped |
| 2 | Delivery confirmation (SentItems poll) + bounce detection (transport headers) | ✅ Shipped |
| 3 | Anthropic Haiku reply classification | ✅ Shipped |
| 4 | Insights dashboard (funnel, charts, per-campaign, drilldown, CSV) | ✅ Shipped |
| 5 | Polish: notification UX, backfill, stale-delta rotation, health indicator | ✅ Shipped |

For shipped-state architecture see `ARCHITECTURE.md`.

## Account model (locked)

**Direct sign-in** as either Matis personally or `cuhyperloop@colorado.edu` (a regular Entra user account, NOT a delegated shared mailbox). To switch identity, the SendOptionsPanel has a "Switch account" button that does `logout()` + `startLogin()`.

`Mail.Send.Shared` and `Mail.ReadWrite.Shared` are NOT used. Adding them required tenant admin consent CU IT was not going to grant, and the cuhyperloop direct-sign-in pattern works fine.

All Graph calls are `/me/...`.

## Architecture decisions (locked)

### Always draft-then-send (single code path)

Every recipient: `POST /me/messages` (create draft) → upload attachments via chunked upload session → optionally `POST /me/messages/{id}/send` (with optional `singleValueExtendedProperties` for deferred delivery). No `sendMail` shortcut. Draft mode stops after upload; Send-now and Schedule proceed to `/send`.

### Stagger uses deferred delivery server-side

`Send now` with `staggerSeconds > 0` does NOT loop in the renderer. It silently submits each recipient with `PidTagDeferredSendTime = now + 60s + (index * staggerSeconds)` and exits. Same Graph code path as Schedule. App can quit; Exchange handles release. Only `staggerSeconds = 0` uses the synchronous send loop.

Property: `singleValueExtendedProperties: [{ id: "SystemTime 0x3FEF", value: "<ISO UTC>" }]`. This is `PidTagDeferredSendTime` (MAPI `0x3FEF`). Deferred messages live in the user's Outbox until release.

### Reply scanning (current)

Per-identity inbox `/delta` polled every 60s while app is open. New messages joined client-side against tracked `conversationId`s. 410 Gone (token expiry > ~30 days idle) → fresh `/delta` and reconcile against existing rows.

Today this is renderer-side localStorage. Phase 1 moves it into SQLite.

### Reliability primitives

- **Append-only run log** at `app.getPath('userData')/runs/<runId>.jsonl` — written before IPC handlers return so renderer-side death doesn't lose state.
- **Idempotency**: every recipient row has a UUID generated client-side, sent as `client-request-id` for Graph dedup on retry.
- **Scope re-consent on launch**: parse JWT `scp` claim from stored token; if `Mail.Send` or `Mail.ReadWrite` is missing, force re-auth.

## Phase 1 — SQLite telemetry store (~1 day)

Replace `localStorage`-backed `replyTracker.ts` with `better-sqlite3` in main process. localStorage works for UI prefs but won't hold reply bodies for classification.

### Schema

```sql
CREATE TABLE recipients (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL,
  campaign_id     TEXT,
  campaign_name   TEXT,
  identity_email  TEXT NOT NULL,
  to_email        TEXT NOT NULL,
  to_name         TEXT,
  subject         TEXT,
  graph_message_id     TEXT,
  internet_message_id  TEXT,
  conversation_id      TEXT,
  mode            TEXT,
  scheduled_for   TEXT,
  submitted_at    TEXT,
  delivered_at    TEXT,
  status          TEXT NOT NULL,
  failure_reason  TEXT
);
CREATE INDEX idx_recipients_conv ON recipients(conversation_id);
CREATE INDEX idx_recipients_run ON recipients(run_id);
CREATE INDEX idx_recipients_identity ON recipients(identity_email);

CREATE TABLE replies (
  id                       TEXT PRIMARY KEY,
  recipient_id             TEXT REFERENCES recipients(id),
  conversation_id          TEXT NOT NULL,
  identity_email           TEXT NOT NULL,
  from_address             TEXT,
  from_name                TEXT,
  subject                  TEXT,
  body_preview             TEXT,
  raw_body                 TEXT,
  received_at              TEXT NOT NULL,
  classification           TEXT,
  classification_confidence REAL,
  classification_summary   TEXT,
  classified_at            TEXT,
  seen                     INTEGER DEFAULT 0
);
CREATE INDEX idx_replies_conv ON replies(conversation_id);

CREATE TABLE delta_tokens (
  identity_email TEXT NOT NULL,
  folder         TEXT NOT NULL,
  delta_link     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  PRIMARY KEY (identity_email, folder)
);

CREATE TABLE runs (
  id              TEXT PRIMARY KEY,
  campaign_id     TEXT,
  campaign_name   TEXT,
  identity_email  TEXT,
  mode            TEXT,
  stagger_seconds INTEGER,
  scheduled_for   TEXT,
  submitted_count INTEGER,
  failed_count    INTEGER,
  created_at      TEXT NOT NULL
);
```

### Files

- ADD `electron/db.ts` — single shared `Database` at `userData/emaildrafter.db`, runs migrations on first open.
- ADD `electron/repository/{recipients,replies,runs,deltaTokens}.ts` — thin CRUD wrappers.
- ADD `electron/migrate-from-localstorage.ts` — one-shot startup hook, idempotent.
- MODIFY `electron/main.ts` — wire DB init, replace inline run logging with repository inserts.
- ADD IPCs: `db:list-recipients`, `db:list-replies`, `db:list-runs`, `db:metrics`, `db:get-recipient-timeline`.
- MODIFY `src/services/replyTracker.ts` and `src/services/replyPoller.ts` — switch to IPC. Keep public API stable.
- DROP renderer-side `recordSentRecipients` writes; main process owns persistence.

### Migration

Existing localStorage migrated once on first launch; old keys removed after success. On failure, leave localStorage and surface a banner.

## Phase 2 — Delivery + bounce tracking (~1 day)

### Delivery confirmation

Add `mail:poll-sent-items-delta` per-identity. For each new SentItems message: match by `internetMessageId` or by `conversationId` + recipient email. On match, set `recipients.status = 'delivered'`, populate `delivered_at`.

Why SentItems polling: deferred-delivery messages sit in Outbox until release time, then move to SentItems on actual send. SentItems = real send time.

### Bounce detection

On each new Inbox `/delta` message that doesn't match a tracked conversationId, check transport headers:
- Expand `singleValueExtendedProperties($filter=id eq 'String 0x007D')` (`PR_TRANSPORT_MESSAGE_HEADERS`).
- Look for `Auto-Submitted: auto-replied`, `X-Failed-Recipients:`, `Content-Type: multipart/report; report-type=delivery-status`.
- If detected, parse `X-Failed-Recipients:` or DSN `Final-Recipient` → match to a tracked recipient by email → mark `status='bounced'`, `failure_reason=<diagnostic-code>`.

Catches ~95% of bounces. OOO and vacation autoreplies handled by Phase 3 classification.

### Files

- MODIFY `electron/main.ts` `mail:poll-inbox-delta` to return raw extended properties for header inspection.
- ADD `electron/main.ts` IPC `mail:poll-sent-items-delta`.
- ADD `electron/bounceParser.ts` — pure function `detectBounce(headers, body) → {isBounce, failedRecipients[], diagnostic}`.
- MODIFY `src/services/replyPoller.ts` — also poll SentItems on each tick; route bounces to `db:mark-bounce`.

## Phase 3 — Reply classification (Anthropic Haiku, ~half day)

Each new `replies` row gets one Haiku call. Cached by message id; never re-run.

```
Classify this email reply into ONE of:
- interested | not_interested | auto_reply | out_of_office
- bounce | needs_followup | other

Return strict JSON: {"category": "...", "confidence": 0.0-1.0, "summary": "one short sentence"}.

Sender: <from>
Subject: <subject>
Body: <body>
```

Cost: ~$0.0012/reply × ~150 replies/mo (50 contacts × 10 campaigns × 30% reply rate) = **~$0.18/mo**.

### Files

- ADD `electron/anthropic.ts` (extract from `companyGeneratorService.ts`) and `electron/classifyReply.ts`.
- MODIFY `replyPoller` — fire-and-forget classification after persisting a new reply; update row on return.
- ADD IPC `replies:reclassify(replyId)` for manual override.
- UI: classification badge in Replies panel + Insights tables.

## Phase 4 — Insights dashboard (~2 days)

New top-level **Insights** tab.

**Hero metrics** (with sparklines): Total sent, Delivery rate, Reply rate, Avg time to reply, Bounce rate.

**Funnel chart** per-campaign or aggregate: Submitted → Delivered → Replied → Interested.

**Sends over time** — bar chart, daily 30d / weekly 6mo.

**Replies over time** — line chart, classification stacked.

**Per-campaign table** — sortable, drill-down on click.

**Per-recipient timeline** — send → delivery → all replies with classification, body previews, "Open in Outlook" link.

**Recent activity feed** — last 50 events.

**Filters**: identity, date range, campaign, classification.

**CSV export** per-campaign with all status columns.

### Files

- ADD `src/pages/Insights/{index,HeroMetrics,FunnelChart,SendsTimeline,RepliesTimeline,CampaignTable,RecipientDrilldown,ActivityFeed}.tsx`.
- USE `recharts` (~50KB gzipped, Tailwind-friendly).
- ADD navigation entry — Insights becomes a parallel mode toggled from the header, not a step in the campaign flow.

## Phase 5 — Polish + reliability (~half day)

- One-time "enable notifications" prompt instead of silent `Notification.requestPermission()`.
- Backfill button: "Re-scan inbox from scratch" → clear delta tokens, re-poll.
- Preemptive delta-token rotation at 28 days (before Graph 410).
- Header health dot: green = polled <2 min, yellow = 2–10 min, red = stalled / error.
- Re-consent banner on missing `Mail.Send` scope.

## Out of scope (defer / never)

- Cloud worker / Azure Function / Power Automate — Outlook deferred delivery makes them unnecessary.
- Real-time webhook subscriptions — needs public HTTPS relay, overkill for team volume.
- Read receipts / open tracking — Outlook receipts unreliable; tracking pixels out-of-policy on CU mailbox.
- Send-As delegation for shared mailboxes — current direct-sign-in pattern works without admin-consent friction.
- Multi-account simultaneous polling — would need stored refresh tokens for both accounts and a token-switching layer. Defer until requested.

## Verification per phase

- **Phase 1**: 5 test sends → 5 SQLite `recipients` rows → reply to one → lands in `replies` → restart app → Replies panel still shows it.
- **Phase 2**: Schedule for +3 min → quit app → re-open after 4 min → status flipped from `submitted` to `delivered`. Send to `nobody@nonexistent-tld.invalid` → marked `bounced` within 5 min.
- **Phase 3**: Reply with "interested let's chat" → classification=`interested` within ~10s. OOO autoreply → classification=`out_of_office`.
- **Phase 4**: Walk every dashboard screen, hero metrics match SQL aggregates, CSV export round-trips, drilldown opens conversation in Outlook web.
- **Phase 5**: Kill network 2 min → health dot red → recovers automatically when network returns.
