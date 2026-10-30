import "server-only";
import { createHash } from "node:crypto";
import type { z } from "zod";

/**
 * Model routing. Two tiers:
 *  - fast: high-volume structured extraction (transcript → guidance JSON, filing → profile). Cheapest capable model.
 *  - reasoning: synthesis over already-extracted evidence (bull/bear, Ask FINN answers). Used sparingly.
 * Deterministic Python-style maths never goes through either tier.
 * Provider is chosen by whichever key is configured (Gemini free tier first).
 */
export type LlmTier = "fast" | "reasoning";

interface Provider { name: string; url: string; key: string; models: Record<LlmTier, string>; kind: "openai" | "anthropic" }

function provider(): Provider | null {
  const env = process.env;
  if (env.GEMINI_API_KEY) return { name: "Gemini", kind: "openai", key: env.GEMINI_API_KEY, url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    models: { fast: env.FINN_MODEL_FAST ?? "gemini-3.5-flash-lite", reasoning: env.FINN_MODEL_REASONING ?? "gemini-3.8-flash" } };
  if (env.GROQ_API_KEY) return { name: "Groq", kind: "openai", key: env.GROQ_API_KEY, url: "https://api.groq.com/openai/v1/chat/completions",
    models: { fast: env.FINN_MODEL_FAST ?? "llama-3.1-8b-instant", reasoning: env.FINN_MODEL_REASONING ?? "llama-3.3-70b-versatile" } };
  if (env.OPENAI_API_KEY) return { name: "OpenAI", kind: "openai", key: env.OPENAI_API_KEY, url: "https://api.openai.com/v1/chat/completions",
    models: { fast: env.FINN_MODEL_FAST ?? "gpt-5-mini", reasoning: env.FINN_MODEL_REASONING ?? "gpt-5" } };
  if (env.ANTHROPIC_API_KEY) return { name: "Anthropic", kind: "anthropic", key: env.ANTHROPIC_API_KEY, url: "https://api.anthropic.com/v1/messages",
    models: { fast: env.FINN_MODEL_FAST ?? "claude-haiku-5-5", reasoning: env.FINN_MODEL_REASONING ?? "claude-sonnet-5-5" } };
  return null;
}

export function llmStatus(): { enabled: boolean; provider: string | null; models: Record<LlmTier, string> | null } {
  const p = provider();
  return { enabled: !!p, provider: p?.name ?? null, models: p?.models ?? null };
}

const cache = new Map<string, unknown>();
export const usage = { calls: 0, cacheHits: 0, inputChars: 0, outputChars: 0 };

/** JSON completion validated against a zod schema; one repair retry on invalid output. Results are cached by prompt hash. */
export async function llmJson<T>(tier: LlmTier, system: string, user: string, schema: z.ZodType<T>, maxTokens = 2000): Promise<T> {
  const p = provider();
  if (!p) throw new Error("No LLM provider configured (set GEMINI_API_KEY — free tier works)");
  const model = p.models[tier];
  const key = createHash("sha256").update(`${model}\n${system}\n${user}`).digest("hex");
  if (cache.has(key)) { usage.cacheHits++; return cache.get(key) as T; }

  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = attempt === 0 ? user : `${user}\n\nYour previous reply was not valid JSON for the schema (${lastErr}). Reply with JSON only.`;
    const raw = await complete(p, model, system, prompt, maxTokens);
    const json = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    try {
      const parsed = schema.parse(JSON.parse(json));
      cache.set(key, parsed);
      return parsed;
    } catch (e) { lastErr = (e as Error).message.slice(0, 200); }
  }
  throw new Error(`LLM output failed validation: ${lastErr}`);
}

async function complete(p: Provider, model: string, system: string, user: string, maxTokens: number): Promise<string> {
  usage.calls++; usage.inputChars += system.length + user.length;
  const res = p.kind === "anthropic"
    ? await fetch(p.url, { method: "POST", signal: AbortSignal.timeout(45000), headers: { "x-api-key": p.key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }) })
    : await fetch(p.url, { method: "POST", signal: AbortSignal.timeout(45000), headers: { Authorization: `Bearer ${p.key}`, "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: maxTokens, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }) });
  if (!res.ok) throw new Error(`${p.name} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const text: string = p.kind === "anthropic" ? j.content?.map((c: { text?: string }) => c.text ?? "").join("") : j.choices?.[0]?.message?.content ?? "";
  usage.outputChars += text.length;
  return text;
}
