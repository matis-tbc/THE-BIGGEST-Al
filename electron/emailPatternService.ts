import * as dns from "node:dns";

// Re-export pure logic from shared module
export {
  detectPattern,
  detectDomainPattern,
  guessEmail,
  guessEmailBatch,
  backtestPatterns,
  parseLinkedInUrl,
} from "./emailPatterns";

export interface MxResult {
  valid: boolean;
  domain: string;
  exchanges: string[];
  cached: boolean;
}

// MX record verification with TTL cache (5 minutes)
const MX_CACHE_TTL = 5 * 60 * 1000;
const mxCache = new Map<string, { result: MxResult; timestamp: number }>();

export async function verifyMx(domain: string): Promise<MxResult> {
  const lowerDomain = domain.toLowerCase();

  const cached = mxCache.get(lowerDomain);
  if (cached && Date.now() - cached.timestamp < MX_CACHE_TTL) {
    return { ...cached.result, cached: true };
  }

  try {
    const records = await dns.promises.resolveMx(lowerDomain);
    const result: MxResult = {
      valid: records.length > 0,
      domain: lowerDomain,
      exchanges: records.map((r) => r.exchange),
      cached: false,
    };
    mxCache.set(lowerDomain, { result, timestamp: Date.now() });
    return result;
  } catch {
    const result: MxResult = {
      valid: false,
      domain: lowerDomain,
      exchanges: [],
      cached: false,
    };
    mxCache.set(lowerDomain, { result, timestamp: Date.now() });
    return result;
  }
}
