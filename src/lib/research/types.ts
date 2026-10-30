import type { Provenance } from "../types";

/** How a statement in the report is known. Rendered as a chip next to every claim. */
export type FactKind = "reported" | "calc" | "mgmt" | "ai";

export interface SourceRef { id: string; title: string; url: string; period?: string; date?: string; loc?: string; type?: string }

export interface Fact {
  label: string;
  value: string;
  kind: FactKind;
  period?: string;
  detail?: string;
  tone?: "pos" | "neg" | "neutral";
  source?: SourceRef;
}

export interface Series { label: string; unit: string; points: { x: string; y: number | null }[] }

export interface Section<T> { status: "ok" | "partial" | "unavailable"; note?: string; data: T }

export interface GuidancePoint { givenIn: string; date: string; low: number | null; high: number | null; type: "explicit" | "qualitative"; statement?: string; note?: string; source: SourceRef }

export interface GuidanceTrack {
  key: string;
  fy: string;
  metric: string;
  label: string;
  unit: string;
  lowerIsBetter?: boolean;
  points: GuidancePoint[];
  actuals: { period: string; scope: string; value: number; derived?: boolean; note?: string; source: SourceRef }[];
  verdict: { code: "met" | "beat" | "missed" | "tracking_within" | "tracking_above" | "tracking_below" | "pending" | "qualitative"; text: string };
  revision: { direction: "raised" | "lowered" | "narrowed" | "widened" | "unchanged" | "single"; text: string };
  derivations: Fact[];
}

export interface ResearchReport {
  symbol: string;
  name: string;
  sector: string;
  kind: string;
  generatedAt: string;
  provenance: { fundamentals: Provenance; dossier: Provenance | null };
  price: { value: number | null; asOf: string | null; changePct: number | null };
  business: Section<{ summary: string | null; summaryKind: FactKind; segments: { name: string; value: number; ebitda?: number; unit?: string; source: SourceRef; derived?: boolean }[]; segmentsBasis?: string; evidence: Fact[]; context?: string | null }>;
  snapshot: Section<{ facts: Fact[] }>;
  trajectory: Section<{ annual: Series[]; quarterly: Series[]; facts: Fact[] }>;
  balanceSheet: Section<{ facts: Fact[]; series: Series[] }>;
  cash: Section<{ facts: Fact[]; series: Series[] }>;
  narrative: Section<{ tracks: GuidanceTrack[]; commentary: (Fact & { theme: string })[]; credibility: Fact[]; divergences: Fact[]; guidanceNote?: string; transcripts: SourceRef[]; method: string }>;
  guidance: Section<{ items: Fact[] }>;
  contradictions: Section<{ items: Fact[] }>;
  bullBear: Section<{ bull: Fact[]; bear: Fact[]; basis: "rules" | "llm" }>;
  documents: SourceRef[];
  warnings: string[];
}
