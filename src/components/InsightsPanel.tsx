import type React from "react";
import { useEffect, useMemo, useState } from "react";

interface Metrics {
  total: number;
  submitted: number;
  delivered: number;
  failed: number;
  bounced: number;
  replyCount: number;
  replyRate: number;
}

interface CampaignRow {
  campaign_id: string | null;
  campaign_name: string | null;
  identity_email: string | null;
  total: number;
  submitted: number;
  delivered: number;
  failed: number;
  bounced: number;
  replies: number;
  last_activity: string | null;
}

interface ActivityEvent {
  type: "send" | "reply";
  id: string;
  at: string;
  identity_email: string;
  to_email?: string;
  from_address?: string;
  subject?: string;
  status?: string;
  campaign_name?: string;
  classification?: string;
}

interface TimelinePoint {
  bucket: string;
  sends: number;
  replies: number;
}

function pct(num: number, denom: number): string {
  if (denom === 0) return "—";
  return `${((num / denom) * 100).toFixed(1)}%`;
}

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function csvEscape(s: any): string {
  const v = s == null ? "" : String(s);
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

const Sparkline: React.FC<{
  points: TimelinePoint[];
  metric: "sends" | "replies";
  color: string;
}> = ({ points, metric, color }) => {
  if (!points.length) return <div className="h-8 bg-slate-900/40 rounded" />;
  const max = Math.max(1, ...points.map((p) => p[metric]));
  return (
    <div className="flex items-end gap-[2px] h-8">
      {points.map((p) => (
        <div
          key={p.bucket + metric}
          className={color}
          style={{
            height: `${(p[metric] / max) * 100}%`,
            width: 4,
            minHeight: p[metric] > 0 ? 2 : 0,
          }}
          title={`${p.bucket}: ${p[metric]}`}
        />
      ))}
    </div>
  );
};

export const InsightsPanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [identity, setIdentity] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (!window.electronAPI) return;
    setLoading(true);
    try {
      const profile = await window.electronAPI.getUserProfile();
      const id = profile?.email?.toLowerCase() || null;
      setIdentity(id);
      const filter = id ? { identityEmail: id } : undefined;
      const [m, c, a, t] = await Promise.all([
        window.electronAPI.dbMetrics(filter),
        window.electronAPI.dbListCampaigns(filter),
        window.electronAPI.dbRecentActivity({ ...(filter || {}), limit: 50 }),
        window.electronAPI.dbTimeline({ ...(filter || {}), days: 30 }),
      ]);
      setMetrics(m);
      setCampaigns(c);
      setActivity(a);
      setTimeline(t);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) refresh().catch(() => {});
  }, [open, refresh]);

  const exportCsv = async () => {
    if (!window.electronAPI) return;
    const rows = await window.electronAPI.dbListRecipients(
      identity ? { identityEmail: identity } : undefined,
    );
    const headers = [
      "campaign_name",
      "identity_email",
      "to_email",
      "to_name",
      "subject",
      "status",
      "submitted_at",
      "delivered_at",
      "failure_reason",
      "conversation_id",
    ];
    const lines = [headers.join(",")];
    for (const r of rows) {
      lines.push(headers.map((h) => csvEscape((r as any)[h])).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `emaildrafter-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const funnel = useMemo(() => {
    if (!metrics) return null;
    const total = metrics.total;
    const delivered = metrics.delivered;
    const replies = metrics.replyCount;
    return { total, delivered, replies };
  }, [metrics]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500 hover:text-white"
        title="Insights"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1v-6zm6-4a1 1 0 011-1h2a1 1 0 011 1v10a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-4a1 1 0 011-1h2a1 1 0 011 1v14a1 1 0 01-1 1h-2a1 1 0 01-1-1V3z" />
        </svg>
        Insights
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/50" onClick={() => setOpen(false)} />
          <div className="w-[900px] max-w-[95vw] h-full bg-slate-950 border-l border-slate-800 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Insights</h3>
                <p className="text-[11px] text-slate-500">
                  {identity || "All identities"} · last 30d timeline
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={refresh}
                  disabled={loading}
                  className="text-xs text-slate-300 hover:text-white px-2 py-1 rounded border border-slate-700 hover:border-slate-500 disabled:opacity-50"
                >
                  {loading ? "…" : "Refresh"}
                </button>
                <button
                  onClick={exportCsv}
                  className="text-xs text-slate-300 hover:text-white px-2 py-1 rounded border border-slate-700 hover:border-slate-500"
                >
                  Export CSV
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="text-slate-400 hover:text-white"
                  aria-label="Close"
                >
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Hero metrics */}
              <div className="grid grid-cols-5 gap-3">
                <HeroMetric label="Sent" value={metrics?.total ?? 0} />
                <HeroMetric
                  label="Delivered"
                  value={metrics?.delivered ?? 0}
                  sub={pct(metrics?.delivered ?? 0, metrics?.total ?? 0)}
                />
                <HeroMetric
                  label="Replied"
                  value={metrics?.replyCount ?? 0}
                  sub={pct(metrics?.replyCount ?? 0, metrics?.total ?? 0)}
                />
                <HeroMetric
                  label="Bounced"
                  value={metrics?.bounced ?? 0}
                  sub={pct(metrics?.bounced ?? 0, metrics?.total ?? 0)}
                  warn={(metrics?.bounced ?? 0) > 0}
                />
                <HeroMetric
                  label="Failed"
                  value={metrics?.failed ?? 0}
                  warn={(metrics?.failed ?? 0) > 0}
                />
              </div>

              {/* Timeline sparklines */}
              <div className="grid grid-cols-2 gap-3">
                <div className="border border-slate-800 rounded-md p-3">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">
                    Sends — 30d
                  </div>
                  <Sparkline points={timeline} metric="sends" color="bg-sky-500/70 rounded-sm" />
                </div>
                <div className="border border-slate-800 rounded-md p-3">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">
                    Replies — 30d
                  </div>
                  <Sparkline
                    points={timeline}
                    metric="replies"
                    color="bg-emerald-500/70 rounded-sm"
                  />
                </div>
              </div>

              {/* Funnel */}
              {funnel && funnel.total > 0 && (
                <div className="border border-slate-800 rounded-md p-3">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-3">
                    Funnel
                  </div>
                  <FunnelBar
                    label="Sent"
                    n={funnel.total}
                    max={funnel.total}
                    color="bg-slate-500/60"
                  />
                  <FunnelBar
                    label="Delivered"
                    n={funnel.delivered}
                    max={funnel.total}
                    color="bg-sky-500/70"
                  />
                  <FunnelBar
                    label="Replied"
                    n={funnel.replies}
                    max={funnel.total}
                    color="bg-emerald-500/70"
                  />
                </div>
              )}

              {/* Campaign table */}
              <div>
                <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">
                  Campaigns
                </div>
                {campaigns.length === 0 ? (
                  <div className="text-xs text-slate-500 border border-slate-800 rounded-md p-4">
                    No campaign data yet.
                  </div>
                ) : (
                  <div className="border border-slate-800 rounded-md overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-900/60 text-slate-400">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Campaign</th>
                          <th className="text-right px-2 py-2 font-medium">Sent</th>
                          <th className="text-right px-2 py-2 font-medium">Deliv.</th>
                          <th className="text-right px-2 py-2 font-medium">Replies</th>
                          <th className="text-right px-2 py-2 font-medium">Bounced</th>
                          <th className="text-right px-2 py-2 font-medium">Reply%</th>
                          <th className="text-right px-3 py-2 font-medium">Last activity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {campaigns.map((c) => (
                          <tr
                            key={(c.campaign_id || "_") + (c.identity_email || "")}
                            className="hover:bg-slate-900/40"
                          >
                            <td className="px-3 py-2 text-slate-200 truncate max-w-[280px]">
                              {c.campaign_name || (
                                <span className="text-slate-500">(unlabelled)</span>
                              )}
                            </td>
                            <td className="text-right px-2 py-2 text-slate-300 tabular-nums">
                              {c.total}
                            </td>
                            <td className="text-right px-2 py-2 text-slate-300 tabular-nums">
                              {c.delivered}
                            </td>
                            <td className="text-right px-2 py-2 text-slate-300 tabular-nums">
                              {c.replies}
                            </td>
                            <td
                              className={`text-right px-2 py-2 tabular-nums ${c.bounced > 0 ? "text-rose-300" : "text-slate-300"}`}
                            >
                              {c.bounced}
                            </td>
                            <td className="text-right px-2 py-2 text-slate-300 tabular-nums">
                              {pct(c.replies, c.total)}
                            </td>
                            <td className="text-right px-3 py-2 text-slate-500">
                              {fmtDate(c.last_activity || undefined)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Recent activity */}
              <div>
                <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">
                  Recent activity
                </div>
                {activity.length === 0 ? (
                  <div className="text-xs text-slate-500 border border-slate-800 rounded-md p-4">
                    No activity yet.
                  </div>
                ) : (
                  <ul className="border border-slate-800 rounded-md divide-y divide-slate-800">
                    {activity.map((e) => (
                      <li key={e.type + e.id} className="px-3 py-2 flex items-center gap-3">
                        <span
                          className={`text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${e.type === "send" ? "text-sky-300 border-sky-500/30 bg-sky-500/10" : "text-emerald-300 border-emerald-500/30 bg-emerald-500/10"}`}
                        >
                          {e.type}
                        </span>
                        <span className="text-xs text-slate-200 truncate flex-1">
                          {e.type === "send" ? e.to_email || "" : e.from_address || ""}
                          {e.subject && <span className="text-slate-500"> · {e.subject}</span>}
                        </span>
                        {e.status && <span className="text-[10px] text-slate-400">{e.status}</span>}
                        {e.classification && (
                          <span className="text-[10px] text-emerald-300">{e.classification}</span>
                        )}
                        <span className="text-[10px] text-slate-500 tabular-nums">
                          {fmtDate(e.at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const HeroMetric: React.FC<{ label: string; value: number; sub?: string; warn?: boolean }> = ({
  label,
  value,
  sub,
  warn,
}) => (
  <div
    className={`border rounded-md p-3 ${warn ? "border-rose-500/30 bg-rose-500/5" : "border-slate-800"}`}
  >
    <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    <div
      className={`text-2xl font-semibold tabular-nums ${warn ? "text-rose-300" : "text-slate-100"}`}
    >
      {value}
    </div>
    {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
  </div>
);

const FunnelBar: React.FC<{ label: string; n: number; max: number; color: string }> = ({
  label,
  n,
  max,
  color,
}) => {
  const w = max > 0 ? (n / max) * 100 : 0;
  return (
    <div className="mb-2 last:mb-0">
      <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
        <span>{label}</span>
        <span className="tabular-nums">
          {n} · {pct(n, max)}
        </span>
      </div>
      <div className="h-2 bg-slate-900/60 rounded-sm overflow-hidden">
        <div className={`${color} h-full`} style={{ width: `${w}%` }} />
      </div>
    </div>
  );
};
