// Deterministic extractors over filing titles / summaries. No model calls.

const UNIT_TO_CRORE: Record<string, number> = { crore: 1, crores: 1, cr: 1, lakh: 0.01, lakhs: 0.01, lac: 0.01, million: 0.1, mn: 0.1, billion: 100, bn: 100 };

/** First INR amount in the text, converted to ₹ crore. */
export function inrAmountCr(text: string): number | null {
  const m = text.match(/(?:rs\.?|₹|inr)\s*([\d,]+(?:\.\d+)?)\s*(crores?|cr|lakhs?|lac|million|mn|billion|bn)\b/i);
  if (!m) return null;
  const v = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(v) ? v * UNIT_TO_CRORE[m[2].toLowerCase()] : null;
}

/** Foreign-currency amount (USD/CAD/EUR/GBP) — returned raw, with currency, for immateriality checks. */
export function fxAmount(text: string): { currency: string; value: number } | null {
  const m = text.match(/\b(usd|cad|eur|gbp|aud|sgd)\s*([\d,]+(?:\.\d+)?)\s*(million|mn|billion|bn)?/i) ?? text.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(million|mn|billion|bn)?/i);
  if (!m) return null;
  if (m.length === 4) {
    const mult = /b/i.test(m[3] ?? "") ? 1e9 : /m/i.test(m[3] ?? "") ? 1e6 : 1;
    return { currency: m[1].toUpperCase(), value: Number(m[2].replace(/,/g, "")) * mult };
  }
  const mult = /b/i.test(m[2] ?? "") ? 1e9 : /m/i.test(m[2] ?? "") ? 1e6 : 1;
  return { currency: "USD", value: Number(m[1].replace(/,/g, "")) * mult };
}

const MONTHS: Record<string, number> = { jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11 };

/** All calendar dates mentioned in the text, as YYYY-MM-DD (e.g. "7 November 2026", "November 7, 2026", "30.10.2026"). */
export function datesIn(text: string, defaultYear: number): string[] {
  const out: string[] = [];
  const push = (y: number, m: number, d: number) => {
    if (m < 0 || m > 11 || d < 1 || d > 31) return;
    out.push(new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10));
  };
  const monthNames = Object.keys(MONTHS).join("|");
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?\\s+(${monthNames})\\.?,?\\s*(\\d{4})?`, "gi")))
    push(m[3] ? Number(m[3]) : defaultYear, MONTHS[m[2].toLowerCase()], Number(m[1]));
  for (const m of text.matchAll(new RegExp(`\\b(${monthNames})\\.?\\s+(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?,?\\s*(\\d{4})?`, "gi")))
    push(m[3] ? Number(m[3]) : defaultYear, MONTHS[m[1].toLowerCase()], Number(m[2]));
  for (const m of text.matchAll(/\b(\d{2})[./-](\d{2})[./-](\d{4})\b/g)) push(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return [...new Set(out)];
}

export interface RoleInfo { role: string; seniority: "top" | "board" | "kmp" }

export function roleFrom(text: string): RoleInfo {
  const t = text.toLowerCase();
  if (/\b(md|managing director)\b.*\b(ceo|chief executive)\b|\bmd\s*(&|and)\s*ceo\b/.test(t)) return { role: "MD & CEO", seniority: "top" };
  if (/\bceo\b|chief executive/.test(t)) return { role: "CEO", seniority: "top" };
  if (/\bcfo\b|chief financial/.test(t)) return { role: "CFO", seniority: "top" };
  if (/\bmd\b|managing director/.test(t)) return { role: "Managing Director", seniority: "top" };
  if (/chair(man|person)/.test(t)) return { role: "Chairperson", seniority: "top" };
  if (/whole[- ]time director|executive director/.test(t)) return { role: "Executive Director", seniority: "board" };
  if (/director|directorate|board/.test(t)) return { role: "Director", seniority: "board" };
  if (/ciso|company secretary|compliance officer|chief information|cto|coo|chief (risk|operating|technology|people)/.test(t)) {
    const m = t.match(/\b(ciso|company secretary|compliance officer|cto|coo)\b/);
    return { role: m ? m[1].toUpperCase().replace("COMPANY SECRETARY", "Company Secretary") : "Senior management", seniority: "kmp" };
  }
  return { role: "Management", seniority: "kmp" };
}

/** "X steps down; Y becomes MD and CEO" → names, best effort. */
export function namesFrom(text: string): { incoming?: string; outgoing?: string } {
  const name = "([A-Z][a-z]+(?:\\s+[A-Z][a-z.]+){1,3})";
  const outgoing = text.match(new RegExp(`${name}\\s+(?:steps? down|resigns?|retires?|ceases?)`))?.[1];
  const incoming = text.match(new RegExp(`${name}\\s+(?:becomes|appointed|re-?appointed|takes (?:over|charge)|joins)`))?.[1];
  return { incoming, outgoing };
}
