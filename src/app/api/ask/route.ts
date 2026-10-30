import { z } from "zod";
import { ask } from "@/lib/research/ask";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ question: z.string().min(3).max(400), symbol: z.string().regex(/^[A-Za-z0-9&\-]{1,20}$/).nullish() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ask a question of 3–400 characters." }, { status: 400 });
  try {
    return Response.json(await ask(parsed.data.question, parsed.data.symbol));
  } catch (e) {
    console.error("[ask]", e);
    return Response.json({ error: "FINN couldn't answer that", detail: (e as Error).message }, { status: 500 });
  }
}
