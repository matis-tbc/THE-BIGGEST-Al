const LAST_SCHEDULED_KEY = "email-drafter.scheduled-local-time";

export function getLastScheduledLocal(): string | null {
  try {
    const v = window.localStorage.getItem(LAST_SCHEDULED_KEY);
    if (!v) return null;
    // Only return it if the stored time is still in the future; a stale past
    // time is worse than falling back to the default.
    const ms = new Date(v).getTime();
    if (!Number.isFinite(ms) || ms < Date.now()) return null;
    return v;
  } catch {
    return null;
  }
}

export function setLastScheduledLocal(local: string): void {
  try {
    window.localStorage.setItem(LAST_SCHEDULED_KEY, local);
  } catch {}
}

export function isoToLocalDatetime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
