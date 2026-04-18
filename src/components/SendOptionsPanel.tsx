import React, { useEffect, useState } from "react";

export type SendMode = "draft" | "send-now" | "schedule";

export interface SendOptionsValue {
  mode: SendMode;
  staggerSeconds: number;
  scheduledForIso?: string;
}

interface SendOptionsPanelProps {
  recipientCount: number;
  value: SendOptionsValue | null;
  onChange: (value: SendOptionsValue) => void;
  disabled?: boolean;
}

const MODE_OPTIONS: Array<{ id: SendMode; label: string; description: string }> = [
  { id: "draft", label: "Draft", description: "Create drafts in Outlook for manual review and sending." },
  { id: "send-now", label: "Send now", description: "Send immediately. With a stagger, sends from Microsoft's cloud, app can quit." },
  { id: "schedule", label: "Schedule", description: "Send at a future time. Held server-side, app can quit." },
];

function localToUtcIso(localValue: string): string {
  const date = new Date(localValue);
  return date.toISOString();
}

function defaultScheduledLocal(): string {
  const d = new Date(Date.now() + 30 * 60 * 1000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const SendOptionsPanel: React.FC<SendOptionsPanelProps> = ({
  recipientCount,
  value,
  onChange,
  disabled,
}) => {
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [accountName, setAccountName] = useState<string | null>(null);
  const [scopeWarning, setScopeWarning] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [scheduledLocal, setScheduledLocal] = useState<string>(defaultScheduledLocal());

  const loadAccount = async () => {
    if (!window.electronAPI) return;
    const [profile, scopeCheck] = await Promise.all([
      window.electronAPI.getUserProfile(),
      window.electronAPI.checkScopes(),
    ]);
    setAccountEmail(profile?.email || null);
    setAccountName(profile?.displayName || null);
    if (scopeCheck && scopeCheck.missing && scopeCheck.missing.length > 0) {
      setScopeWarning(`Missing permissions: ${scopeCheck.missing.join(", ")}. Sign out and back in to re-consent.`);
    } else {
      setScopeWarning(null);
    }
  };

  useEffect(() => {
    loadAccount();
    if (!value) {
      onChange({ mode: "draft", staggerSeconds: 0 });
    }
  }, []);

  const switchAccount = async () => {
    if (!window.electronAPI) return;
    setSwitching(true);
    try {
      await window.electronAPI.logout();
      await window.electronAPI.startLogin();
    } finally {
      setSwitching(false);
    }
  };

  useEffect(() => {
    if (!window.electronAPI?.onAuthCompleted) return;
    const off = window.electronAPI.onAuthCompleted(() => {
      loadAccount();
    });
    return off;
  }, []);

  const current: SendOptionsValue = value || {
    mode: "draft",
    staggerSeconds: 0,
  };

  const update = (patch: Partial<SendOptionsValue>) => {
    onChange({ ...current, ...patch });
  };

  const stagger = current.staggerSeconds || 0;
  const totalSeconds = stagger * Math.max(0, recipientCount - 1);
  const totalMinutes = Math.round(totalSeconds / 6) / 10;

  const isHyperloop = (accountEmail || "").toLowerCase().startsWith("cuhyperloop@");
  const accountBadge = isHyperloop ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" : "bg-sky-500/20 text-sky-300 border-sky-500/40";

  const showSchedule = current.mode === "schedule";
  const showStagger = current.mode === "send-now" || current.mode === "schedule";

  return (
    <div className="space-y-5 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      {scopeWarning && (
        <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200">
          {scopeWarning}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border flex-shrink-0 ${accountBadge}`}>
            {isHyperloop ? "Hyperloop" : "Personal"}
          </span>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-slate-100 truncate">
              {accountName || "(loading...)"}
            </span>
            <span className="text-xs text-slate-400 truncate">
              {accountEmail || ""}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={switchAccount}
          disabled={disabled || switching}
          className="text-xs px-3 py-1 rounded border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
        >
          {switching ? "Switching..." : "Switch account"}
        </button>
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide">
          Mode
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {MODE_OPTIONS.map((opt) => {
            const isActive = current.mode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                disabled={disabled}
                onClick={() => update({ mode: opt.id })}
                className={`rounded-lg border px-3 py-2 text-left transition ${
                  isActive
                    ? "border-sky-400 bg-sky-500/10"
                    : "border-slate-700 bg-slate-900/40 hover:border-slate-600"
                } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <div className="text-sm font-medium text-slate-100">{opt.label}</div>
                <div className="mt-1 text-[11px] text-slate-400 leading-snug">{opt.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      {showSchedule && (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide">
            Send at
          </label>
          <input
            type="datetime-local"
            value={scheduledLocal}
            onChange={(e) => {
              setScheduledLocal(e.target.value);
              update({ scheduledForIso: localToUtcIso(e.target.value) });
            }}
            disabled={disabled}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-sky-400 focus:outline-none"
          />
          <div className="text-[11px] text-slate-500">
            Local time. Held server-side until release. App can quit after submit.
          </div>
        </div>
      )}

      {showStagger && (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide">
            Stagger (seconds between recipients)
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={0}
              max={600}
              step={5}
              value={stagger}
              onChange={(e) => update({ staggerSeconds: Math.max(0, Math.min(600, Number(e.target.value) || 0)) })}
              disabled={disabled}
              className="w-24 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-sky-400 focus:outline-none"
            />
            <div className="text-xs text-slate-400">
              {stagger > 0
                ? `${recipientCount} recipients spread across ~${totalMinutes} min. Stagger > 0 routes through Outlook deferred delivery; app can quit.`
                : "No spread. Sends back-to-back from this app while it stays open."}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
