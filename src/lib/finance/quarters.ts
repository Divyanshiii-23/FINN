const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function parseQuarterLabel(label: string): { month: number; year: number } | null {
  const m = label.trim().match(/^([A-Za-z]{3})\w*\s+(\d{4})$/);
  if (!m) return null;
  const month = MON.indexOf(m[1]);
  return month < 0 ? null : { month, year: Number(m[2]) };
}

export function quarterLabel(month: number, year: number): string {
  return `${MON[month]} ${year}`;
}

export function shiftQuarter(label: string, quarters: number): string | null {
  const p = parseQuarterLabel(label);
  if (!p) return null;
  const total = p.year * 12 + p.month + quarters * 3;
  return quarterLabel(((total % 12) + 12) % 12, Math.floor(total / 12));
}

/** "Sep 2026" → "Q2 FY27" (Indian fiscal year, April–March). */
export function fiscalLabel(label: string): string {
  const p = parseQuarterLabel(label);
  if (!p) return label;
  const fyEnd = p.month >= 3 ? p.year + 1 : p.year;
  const q = p.month >= 3 ? Math.floor((p.month - 3) / 3) + 1 : 4;
  return `Q${q} FY${String(fyEnd).slice(2)}`;
}

/** The quarter most likely reported by a results filing on `date` (results come 2–8 weeks after quarter end). */
export function quarterReportedOn(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() - 1; // a month back, then snap to quarter end
  let month = ((total % 12) + 12) % 12;
  let year = Math.floor(total / 12);
  const qEnd = [2, 5, 8, 11];
  while (!qEnd.includes(month)) { month -= 1; if (month < 0) { month = 11; year -= 1; } }
  return quarterLabel(month, year);
}

/** Trailing-twelve-month sum of a quarterly row ending at the last available column. */
export function ttm(row: (number | null)[] | undefined): number | null {
  if (!row || row.length < 4) return null;
  const last4 = row.slice(-4);
  return last4.some((v) => v == null) ? null : (last4 as number[]).reduce((a, b) => a + b, 0);
}
