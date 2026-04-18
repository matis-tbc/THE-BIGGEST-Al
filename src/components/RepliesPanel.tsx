import React, { useEffect, useState } from "react";
import { replyPoller, PollerHealth } from "../services/replyPoller";
import { TrackedReply, getReplies, markAllRepliesSeen, markReplySeen } from "../services/replyTracker";

const CLASSIFICATION_COLORS: Record<string, string> = {
  interested: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  not_interested: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  auto_reply: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  out_of_office: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  bounce: "bg-rose-600/20 text-rose-200 border-rose-600/40",
  needs_followup: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  other: "bg-slate-600/15 text-slate-400 border-slate-600/30",
};

const ClassificationBadge: React.FC<{ category: string }> = ({ category }) => {
  const cls = CLASSIFICATION_COLORS[category] || CLASSIFICATION_COLORS.other;
  const label = category.replace(/_/g, " ");
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  );
};

function healthTone(h: PollerHealth): { color: string; label: string } {
  if (h.lastError) return { color: "bg-rose-500", label: `Error: ${h.lastError.slice(0, 80)}` };
  if (!h.lastPollAt) return { color: "bg-slate-500", label: "Poller idle" };
  const ageMin = (Date.now() - h.lastPollAt) / 60000;
  if (ageMin < 2) return { color: "bg-emerald-500", label: `Polled ${ageMin < 1 ? "just now" : `${Math.round(ageMin)}m ago`}` };
  if (ageMin < 10) return { color: "bg-amber-500", label: `Polled ${Math.round(ageMin)}m ago` };
  return { color: "bg-rose-500", label: `Stalled — last poll ${Math.round(ageMin)}m ago` };
}

export const RepliesPanel: React.FC = () => {
  const [replies, setReplies] = useState<TrackedReply[]>([]);
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [health, setHealth] = useState<PollerHealth>({ lastPollAt: null, lastError: null });
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>(typeof Notification !== "undefined" ? Notification.permission : "denied");

  useEffect(() => {
    let cancelled = false;
    getReplies().then((r) => { if (!cancelled) setReplies(r); }).catch(() => {});
    const unsub = replyPoller.subscribe(setReplies);
    const unsubHealth = replyPoller.subscribeHealth(setHealth);
    const tick = window.setInterval(() => setHealth(replyPoller.getHealth()), 30_000);
    return () => { cancelled = true; unsub(); unsubHealth(); window.clearInterval(tick); };
  }, []);

  const requestNotifications = async () => {
    if (typeof Notification === "undefined") return;
    const perm = await Notification.requestPermission();
    setNotifPerm(perm);
  };

  const backfill = async () => {
    setRefreshing(true);
    try { await replyPoller.backfill(); } finally { setRefreshing(false); }
  };

  const unread = replies.filter((r) => !r.seen).length;

  const refresh = async () => {
    setRefreshing(true);
    try {
      await replyPoller.poll();
    } finally {
      setRefreshing(false);
    }
  };

  const openPanel = () => {
    setOpen(true);
  };

  const closePanel = () => {
    setOpen(false);
    if (unread > 0) {
      markAllRepliesSeen().then(setReplies).catch(() => {});
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        className="relative inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500 hover:text-white"
        title={healthTone(health).label}
      >
        <span className={`h-2 w-2 rounded-full ${healthTone(health).color}`} />
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm2 0v.01L10 11l6-5.99V5H4zm12 2.408l-5.4 5.391a1 1 0 01-1.2 0L4 7.408V15h12V7.408z"/></svg>
        Replies
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-semibold text-white min-w-[18px] h-[18px]">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/50" onClick={closePanel} />
          <div className="w-[420px] max-w-[90vw] h-full bg-slate-950 border-l border-slate-800 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Replies</h3>
                <p className="text-[11px] text-slate-500">Inbox replies matched to campaign sends</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={refresh}
                  disabled={refreshing}
                  className="text-xs text-slate-300 hover:text-white px-2 py-1 rounded border border-slate-700 hover:border-slate-500 disabled:opacity-50"
                >
                  {refreshing ? "..." : "Refresh"}
                </button>
                <button
                  type="button"
                  onClick={backfill}
                  disabled={refreshing}
                  className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded border border-slate-700 hover:border-slate-500 disabled:opacity-50"
                  title="Clear delta tokens and re-scan inbox from scratch"
                >
                  Backfill
                </button>
                <button
                  type="button"
                  onClick={closePanel}
                  className="text-slate-400 hover:text-white"
                  aria-label="Close"
                >
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
                </button>
              </div>
            </div>
            {notifPerm === "default" && (
              <div className="border-b border-slate-800 px-4 py-2 bg-sky-500/5 flex items-center justify-between">
                <span className="text-[11px] text-slate-300">Enable desktop notifications for new replies?</span>
                <div className="flex gap-2">
                  <button onClick={requestNotifications} className="text-[11px] text-sky-300 hover:text-sky-200 px-2 py-0.5 rounded border border-sky-500/40">Enable</button>
                  <button onClick={() => setNotifPerm("denied")} className="text-[11px] text-slate-500 hover:text-slate-300 px-2 py-0.5">Not now</button>
                </div>
              </div>
            )}
            <div className="flex-1 overflow-y-auto">
              {replies.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">
                  No replies yet. The poller checks every 60s. Replies are matched by Outlook conversation thread, so they'll appear here whether they reply directly to the campaign email or to a CC.
                </div>
              ) : (
                <ul className="divide-y divide-slate-800">
                  {replies.map((r) => (
                    <li
                      key={r.id}
                      className={`px-4 py-3 hover:bg-slate-900/60 cursor-pointer ${!r.seen ? "bg-sky-500/5" : ""}`}
                      onClick={() => {
                        markReplySeen(r.id).then(setReplies).catch(() => {});
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-medium text-slate-100 truncate">{r.fromName || r.fromAddress}</span>
                            {!r.seen && <span className="h-2 w-2 rounded-full bg-sky-400 flex-shrink-0" />}
                            {r.classification && <ClassificationBadge category={r.classification} />}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">{r.fromAddress}</div>
                          <div className="text-xs text-slate-300 mt-1 truncate">{r.subject || "(no subject)"}</div>
                          <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">{r.bodyPreview}</div>
                        </div>
                        <div className="text-[10px] text-slate-500 flex-shrink-0 text-right">
                          {new Date(r.receivedAt).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                      {r.recipientEmail && (
                        <div className="mt-1.5 text-[10px] text-slate-500">
                          → reply to send to <span className="text-slate-400">{r.recipientName || r.recipientEmail}</span>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
