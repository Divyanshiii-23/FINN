import type { Category } from "../types";

export interface Classification { category: Category; subtype: string; rule: string }

type Rule = { cat: Category; sub: string | ((t: string) => string); re: RegExp; name: string };

// Ordered: first match wins. Routine paperwork is matched first so it can never be promoted by a later keyword.
const RULES: Rule[] = [
  { name: "results-newspaper", cat: "results", sub: "newspaper", re: /newspaper.*(financial )?results|publication of (the )?financial results/ },
  { name: "postal-ballot", cat: "postal_ballot", sub: "notice", re: /postal ballot/ },
  { name: "routine", cat: "unclassified", sub: "routine", re: /reg(ulation)?\.?\s*74\s*\(5\)|certificate under reg|loss of share certificate|duplicate share certificate|esg rating|allotment of esop|esop\s*\/\s*esps|\besps\b|grant of .*(stock )?options|\besos\b|trading window|monitoring agency|investor complaints|book closure|newspaper (publication|advertisement)|^announcement under regulation 30 \(lodr\)-newspaper publication/ },
  { name: "guarantee", cat: "unclassified", sub: "guarantee", re: /guarantee|indemnity|surety/ },
  { name: "earnings-call", cat: "earnings_call", sub: (t) => (/transcript/.test(t) ? "transcript" : /audio|recording|webcast|uploaded|held/.test(t) ? "recording" : "intimation"), re: /transcript|earnings call|conference call|earnings discussion|concall|audio recording/ },
  { name: "results-postponed", cat: "results", sub: "postponed", re: /board meeting.*postpone|postpone.*board meeting|results.*postpone/ },
  { name: "results-intimation", cat: "results", sub: "intimation", re: /board meeting (intimation|on|to be held|scheduled)|intimation of board meeting|to consider and approve.*results|board meeting.*to (approve|consider)/ },
  { name: "results-presentation", cat: "results", sub: "presentation", re: /(investor|analyst) presentation/ },
  { name: "results-press", cat: "results", sub: "press_release", re: /(press|media) release.*(results|q[1-4]\s*fy|quarter)/ },
  { name: "results-filing", cat: "results", sub: (t) => (/outcome/.test(t) ? "outcome" : /letter/.test(t) ? "letter" : "filing"), re: /financial results|results for the quarter|(un)?audited .*results|outcome of (the )?board meeting|board meeting outcome|shareholders'? letter/ },
  { name: "management", cat: "management_change", sub: (t) => (/re-?appoint/.test(t) ? "reappointment" : /resign|steps? down|cessation|retire|vacat/.test(t) && !/appoint|becomes|succeed/.test(t) ? "departure" : /change in/.test(t) ? "change" : "appointment"), re: /change in (md|ceo|cfo|management|directorate|director|key managerial)|appoint|resign|steps? down|cessation of|retire/ },
  { name: "credit-rating", cat: "credit_rating", sub: (t) => (/downgrad/.test(t) ? "downgrade" : /upgrad/.test(t) ? "upgrade" : /reaffirm/.test(t) ? "reaffirm" : "rating"), re: /credit rating|rating (upgrade|downgrade|reaffirm|action)|\b(crisil|icra|care ratings|india ratings)\b/ },
  { name: "dividend", cat: "dividend", sub: "dividend", re: /dividend|record date/ },
  { name: "bonus-split", cat: "bonus_split", sub: "bonus_split", re: /bonus issue|bonus shares|stock split|sub-?division of (equity )?shares/ },
  { name: "order-win", cat: "press_release", sub: "order_win", re: /award of order|receipt of order|orders? worth|bags? .*order|secured .*orders?|order inflow|received .*orders?/ },
  { name: "fund-raise", cat: "fund_raise", sub: (t) => (/repayment|redeem|redemption/.test(t) ? "repayment" : /ncd|debenture|bond/.test(t) ? "debt" : /buy-?back/.test(t) ? "buyback" : "equity"), re: /\bncds?\b|non-convertible|debenture|\bqip\b|qualified institutional|rights issue|preferential (issue|allotment)|commercial paper|buy-?back|fund ?rais|\bbonds?\b/ },
  { name: "m&a", cat: "M&A", sub: (t) => (/strike off/.test(t) ? "strike_off" : /amalgamation|merger|scheme of arrangement/.test(t) ? "scheme" : /subsidiar/.test(t) ? "subsidiary" : "deal"), re: /acqui|merger|amalgamation|demerger|scheme of arrangement|joint venture|subsidiar|stake (sale|purchase)|share swap|restructuring|strike off|slump sale|divest/ },
  { name: "litigation", cat: "litigation", sub: (t) => (/penalt|fine/.test(t) ? "penalty" : /cirp|insolven|nclt|nclat/.test(t) ? "insolvency" : "order"), re: /penalt|\bfine\b|nclt|nclat|cirp|insolven|litigation|\bcourt\b|tribunal|show cause|tax demand|gst demand|regulatory action|enforcement/ },
  { name: "insider", cat: "insider_trading", sub: "disclosure", re: /\bsast\b|reg(ulation)?\.?\s*29|insider trading|reg(ulation)?\.?\s*7\s*\(2\)|promoter.*(acqui|sale|sell|purchase)/ },
  { name: "pledging", cat: "pledging", sub: "pledge", re: /pledge|encumbrance/ },
  { name: "capex", cat: "capex", sub: (t) => (/cod|commercial operation|declared commercial|commission/.test(t) ? "commissioning" : "approval"), re: /\bcod\b|commercial operation|declared commercial|commission(ing|ed)|capacity (addition|expansion)|capex|greenfield|brownfield|new plant|production started/ },
  { name: "investor-meet", cat: "investor_meetings", sub: (t) => (/outcome/.test(t) ? "outcome" : "intimation"), re: /analyst|investor\(?s?\)? meet|investor conference|investor\/analyst|roadshow|investor meet/ },
  { name: "agm-egm", cat: "agm_egm", sub: "meeting", re: /\bagm\b|\begm\b|annual general meeting|extra-?ordinary general meeting/ },
  { name: "press-release", cat: "press_release", sub: (t) => (/approv/.test(t) ? "regulatory_approval" : "update"), re: /press release|media release|approv|launch|partnership|award|collaborat|designation|data|modernization|deploy/ },
];

export function classify(title: string, exchangeCategory?: string): Classification {
  const t = title.toLowerCase();
  for (const r of RULES) {
    if (r.re.test(t)) return { category: r.cat, subtype: typeof r.sub === "function" ? r.sub(t) : r.sub, rule: r.name };
  }
  // Fall back to the exchange's own category when the title is uninformative.
  const ex = (exchangeCategory ?? "").toLowerCase();
  if (/result/.test(ex)) return { category: "results", subtype: "filing", rule: "exchange-category" };
  if (/board meeting/.test(ex)) return { category: "results", subtype: "intimation", rule: "exchange-category" };
  if (/agm|egm/.test(ex)) return { category: "agm_egm", subtype: "meeting", rule: "exchange-category" };
  if (/insider|sast/.test(ex)) return { category: "insider_trading", subtype: "disclosure", rule: "exchange-category" };
  if (/corp\. action|corporate action/.test(ex)) return { category: "dividend", subtype: "dividend", rule: "exchange-category" };
  return { category: "unclassified", subtype: "other", rule: "default" };
}
