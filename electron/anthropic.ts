const ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export interface AnthropicMessageOptions {
  model: string;
  maxTokens?: number;
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

export function getApiKey(): string {
  return process.env.ANTHROPIC_API_KEY || "";
}

export async function anthropicMessage(opts: AnthropicMessageOptions): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      messages: opts.messages,
    }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Anthropic API ${res.status}: ${errBody}`);
  }
  const data = (await res.json()) as any;
  return data?.content?.[0]?.text ?? "";
}
