import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { validateEmail } from "../utils/csvParser";
import { getLastScheduledLocal } from "../services/userPrefs";

export type SendMode = "draft" | "send-now" | "schedule";

export interface SendOptionsValue {
  mode: SendMode;
  staggerSeconds: number;
  scheduledForIso?: string;
  /**
   * CC addresses applied to every draft. Undefined = use the hard-coded
   * default inside batchProcessor. Empty array = explicit no-CC. Non-empty
   * array = user-provided list. The dispatch pipeline still auto-removes the
   * active sender's address from this list to prevent self-CC.
   */
  ccEmails?: string[];
}

const DEFAULT_CC_EMAIL = "cuhyperloop@colorado.edu";

function parseCcInputRaw(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

export function parseCcInput(raw: string): string[] {
  return parseCcInputRaw(raw).filter((v) => validateEmail(v));
}

function formatCcList(list: string[] | undefined): string {
  return (list ?? []).join(", ");
}

interface SendOptionsPanelProps {
  recipientCount: number;
  value: SendOptionsValue | null;
  onChange: (value: SendOptionsValue) => void;
  disabled?: boolean;
  /** Default mode when `value` is null (i.e. on first render). */
  defaultMode?: SendMode;
  /** Default scheduled time (local datetime-local string, e.g. "2026-04-24T08:00"). */
  defaultScheduledLocal?: string;
}

const MODE_OPTIONS: Array<{ id: SendMode; label: string; description: string }> = [
  {
    id: "draft",
    label: "Draft",
    description: "Create drafts in Outlook for manual review and sending.",
  },
  {
    id: "send-now",
    label: "Send now",
    description: "Send immediately. With a stagger, sends from Microsoft's cloud, app can quit.",
  },
  {
    id: "schedule",
    label: "Schedule",
    description: "Send at a future time. Held server-side, app can quit.",
  },
];

function localToUtcIso(localValue: string): string {
  const date = new Date(localValue);
  return date.toISOString();
}

function nowPlus30Minutes(): string {
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
  defaultMode,
  defaultScheduledLocal: defaultScheduledProp,
}) => {
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [accountName, setAccountName] = useState<string | null>(null);
  const [scopeWarning, setScopeWarning] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  // Initial scheduled time: if the caller provided a default (e.g. non-outreach
  // campaigns default to tomorrow 8 AM), honor that first. Otherwise try the
  // user's last-used scheduled time (useful during outreach when you often
  // batch multiple sends to the same window). Fall back to now + 30 min.
  const [scheduledLocal, setScheduledLocal] = useState<string>(
    defaultScheduledProp ?? getLastScheduledLocal() ?? nowPlus30Minutes(),
  );
  const [ccInput, setCcInput] = useState<string>("");
  const [ccInitialized, setCcInitialized] = useState(false);

  const loadAccount = async () => {
    if (!window.electronAPI) return;
    const [profile, scopeCheck] = await Promise.all([
      window.electronAPI.getUserProfile(),
      window.electronAPI.checkScopes(),
    ]);
    setAccountEmail(profile?.email || null);
    setAccountName(profile?.displayName || null);
    if (scopeCheck?.missing && scopeCheck.missing.length > 0) {
      setScopeWarning(
        `Missing permissions: ${scopeCheck.missing.join(", ")}. Sign out and back in to re-consent.`,
      );
    } else {
      setScopeWarning(null);
    }
  };

  useEffect(() => {
    loadAccount();
    if (!value) {
      const initialMode = defaultMode ?? "draft";
      const initial: SendOptionsValue = { mode: initialMode, staggerSeconds: 0 };
      if (initialMode === "schedule") {
        initial.scheduledForIso = localToUtcIso(defaultScheduledProp ?? scheduledLocal);
      }
      onChange(initial);
    }
  }, [loadAccount, value, onChange, defaultMode, defaultScheduledProp, scheduledLocal]);

  // Seed the CC input once we know who is signed in. Rule:
  //   signed in as cuhyperloop@... -> empty (don't CC yourself)
  //   anyone else                  -> default to the team inbox for visibility
  // User can freely override the field after this initial seed.
  useEffect(() => {
    if (ccInitialized || !accountEmail) return;
    const signedInAsTeam = accountEmail.toLowerCase().startsWith("cuhyperloop@");
    const initial = signedInAsTeam ? [] : [DEFAULT_CC_EMAIL];
    setCcInput(formatCcList(initial));
    onChange({ ...(value ?? { mode: "draft", staggerSeconds: 0 }), ccEmails: initial });
    setCcInitialized(true);
  }, [accountEmail, ccInitialized, value, onChange]);

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
  }, [loadAccount]);

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
  const accountBadge = isHyperloop
    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
    : "bg-sky-500/20 text-sky-300 border-sky-500/40";

  const showSchedule = current.mode === "schedule";
  const showStagger = current.mode === "send-now" || current.mode === "schedule";

  const invalidCcTokens = useMemo(() => {
    return parseCcInputRaw(ccInput).filter((v) => !validateEmail(v));
  }, [ccInput]);

  return (
    <div className="space-y-5 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      {scopeWarning && (
        <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200">
          {scopeWarning}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border flex-shrink-0 ${accountBadge}`}
          >
            {isHyperloop ? "Hyperloop" : "Personal"}
          </span>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-slate-100 truncate">
              {accountName || "(loading...)"}
            </span>
            <span className="text-xs text-slate-400 truncate">{accountEmail || ""}</span>
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
                <div className="mt-1 text-[11px] text-slate-400 leading-snug">
                  {opt.description}
                </div>
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

      <div className="space-y-2">
        <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide">
          CC (comma-separated, optional)
        </label>
        <input
          type="text"
          value={ccInput}
          onChange={(e) => {
            setCcInput(e.target.value);
            update({ ccEmails: parseCcInput(e.target.value) });
          }}
          disabled={disabled}
          placeholder={isHyperloop ? "No CC (sending from team inbox)" : "cuhyperloop@colorado.edu"}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-sky-400 focus:outline-none"
        />
        {invalidCcTokens.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {invalidCcTokens.map((token) => (
              <span
                key={token}
                title="Not a valid email — will be skipped"
                className="inline-flex items-center gap-1 rounded border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-300"
              >
                {token}
              </span>
            ))}
          </div>
        )}
        <div className="text-[11px] text-slate-500">
          Applied to every draft. The active sender ({accountEmail || "…"}) is automatically
          excluded, so you never CC yourself. Leave blank for no CC. Invalid emails are dropped
          before sending.
        </div>
      </div>

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
              onChange={(e) =>
                update({ staggerSeconds: Math.max(0, Math.min(600, Number(e.target.value) || 0)) })
              }
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
