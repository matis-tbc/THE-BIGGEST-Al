const BOUNCE_SENDER_HINTS = [
  "mailer-daemon",
  "postmaster",
  "mail delivery subsystem",
  "mail-daemon",
];

const DSN_CONTENT_TYPE_HINTS = [
  "multipart/report",
  "report-type=delivery-status",
  "message/delivery-status",
];

export interface BounceDetection {
  isBounce: boolean;
  failedRecipients: string[];
  diagnostic?: string;
}

function safeLower(s: string | undefined | null): string {
  return (s || "").toLowerCase();
}

function parseTransportHeaders(raw: string): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  if (!raw) return map;
  const lines = raw.split(/\r?\n/);
  let currentKey: string | null = null;
  let currentVal = "";
  for (const line of lines) {
    if (/^\s/.test(line) && currentKey) {
      currentVal += ` ${line.trim()}`;
      continue;
    }
    if (currentKey) {
      (map[currentKey] = map[currentKey] || []).push(currentVal.trim());
    }
    const m = line.match(/^([^:]+):\s?(.*)$/);
    if (m) {
      currentKey = m[1].toLowerCase();
      currentVal = m[2];
    } else {
      currentKey = null;
      currentVal = "";
    }
  }
  if (currentKey) (map[currentKey] = map[currentKey] || []).push(currentVal.trim());
  return map;
}

export function detectBounce(args: {
  fromAddress?: string | null;
  subject?: string | null;
  rawHeaders?: string | null;
  body?: string | null;
}): BounceDetection {
  const fromLc = safeLower(args.fromAddress);
  const subjLc = safeLower(args.subject);
  const senderLooksLikeBounce =
    BOUNCE_SENDER_HINTS.some((h) => fromLc.includes(h)) ||
    subjLc.includes("undeliverable") ||
    subjLc.includes("delivery status notification") ||
    subjLc.includes("returned mail");

  const headers = args.rawHeaders ? parseTransportHeaders(args.rawHeaders) : {};
  const contentTypeVals = headers["content-type"] || [];
  const ctLc = contentTypeVals.map((v) => v.toLowerCase()).join(" ");
  const hasDsnContentType = DSN_CONTENT_TYPE_HINTS.some((h) => ctLc.includes(h));
  const autoSubmitted = (headers["auto-submitted"] || []).map((v) => v.toLowerCase());
  const isAutoReplied = autoSubmitted.some(
    (v) => v.includes("auto-replied") || v.includes("auto-generated"),
  );

  const xFailed = headers["x-failed-recipients"] || [];
  const failedFromHeader = xFailed
    .flatMap((v) => v.split(/[,\s;]+/))
    .map((v) => v.trim())
    .filter(Boolean);

  const finalRecipMatches = args.body
    ? [...args.body.matchAll(/final-recipient:\s*[^;]+;\s*([^\s<>]+@[^\s<>]+)/gi)]
    : [];
  const failedFromBody = finalRecipMatches.map((m) => m[1]);

  const failedRecipients = Array.from(
    new Set(
      [...failedFromHeader, ...failedFromBody]
        .map((e) => e.replace(/^<|>$/g, "").toLowerCase())
        .filter((e) => e.includes("@")),
    ),
  );

  const diagnosticMatch = args.body?.match(/diagnostic-code:\s*([^\n\r]+)/i);
  const diagnostic = diagnosticMatch?.[1]?.trim();

  const isBounce =
    (senderLooksLikeBounce || hasDsnContentType || failedRecipients.length > 0) &&
    (isAutoReplied || hasDsnContentType || senderLooksLikeBounce || failedRecipients.length > 0);

  return { isBounce, failedRecipients, diagnostic };
}
