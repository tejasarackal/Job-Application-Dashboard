// llm.ts — thin Anthropic Messages client over fetch (no SDK dependency, keeps
// the Vercel bundle small). Used only for the SOP "judgment" steps: classifying
// Gmail emails (A2/A3) and drafting outreach (B3). Prompt caching is on by
// default for the (long, reused) system prompt.
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// Haiku for cheap high-volume classification; callers can override (e.g. Sonnet
// for drafting) via opts.model.
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

export interface ClaudeOpts {
  system: string;
  user: string;
  maxTokens?: number;
  model?: string;
  cacheSystem?: boolean;
}

export async function callClaude(opts: ClaudeOpts): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");

  const system = [
    {
      type: "text",
      text: opts.system,
      ...(opts.cacheSystem === false ? {} : { cache_control: { type: "ephemeral" } }),
    },
  ];

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model || DEFAULT_MODEL,
      max_tokens: opts.maxTokens ?? 512,
      system,
      messages: [{ role: "user", content: opts.user }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  return (data.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("")
    .trim();
}

// Tolerant JSON extractor — pulls the first {...} object out of a model reply
// even if it's wrapped in prose or ```json fences.
export function parseJsonObject<T>(s: string): T | null {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    return null;
  }
}
