export const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export class SourceError extends Error {
  constructor(public source: string, message: string) { super(`${source}: ${message}`); }
}

interface Opts { timeoutMs?: number; headers?: Record<string, string>; revalidate?: number }

async function go(url: string, source: string, o: Opts): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en-IN,en;q=0.9", ...o.headers },
      signal: AbortSignal.timeout(o.timeoutMs ?? 7000),
      // Next.js data cache on the platform; harmless elsewhere.
      next: { revalidate: o.revalidate ?? 900 },
    } as RequestInit);
  } catch (e) {
    throw new SourceError(source, e instanceof Error ? e.message : "network error");
  }
  if (!res.ok) throw new SourceError(source, `HTTP ${res.status}`);
  return res;
}

export async function getJson<T = unknown>(url: string, source: string, o: Opts = {}): Promise<T> {
  const res = await go(url, source, { ...o, headers: { Accept: "application/json, text/plain, */*", ...o.headers } });
  const text = await res.text();
  try { return JSON.parse(text) as T; } catch { throw new SourceError(source, "invalid JSON (possibly blocked)"); }
}

export async function getText(url: string, source: string, o: Opts = {}): Promise<string> {
  const res = await go(url, source, o);
  return res.text();
}

export async function getBytes(url: string, source: string, o: Opts = {}): Promise<Uint8Array> {
  const res = await go(url, source, o);
  return new Uint8Array(await res.arrayBuffer());
}

/** Tiny in-process TTL cache — dedupes repeated calls within a warm serverless instance. */
const store = new Map<string, { at: number; v: unknown }>();
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.v as T;
  const v = await fn();
  store.set(key, { at: Date.now(), v });
  if (store.size > 500) store.delete(store.keys().next().value as string);
  return v;
}
