import type { RawAnnouncement } from "../types";
import { cached, getJson, SourceError } from "./http";

interface BseRow {
  NEWSSUB?: string; HEADLINE?: string; NEWS_DT?: string; DT_TM?: string; ATTACHMENTNAME?: string;
  CATEGORYNAME?: string; SUBCATNAME?: string; MORE?: string; NSURL?: string;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

/** Corporate announcements for one BSE scrip over the last `days` days (BSE's public JSON endpoint). */
export async function bseAnnouncements(scrip: string, days = 30): Promise<RawAnnouncement[]> {
  return cached(`bse:${scrip}:${days}`, 10 * 60e3, async () => {
    const to = new Date(Date.now() + 5.5 * 3600e3);
    const from = new Date(to.getTime() - days * 86400e3);
    const url = `https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w?pageno=1&strCat=-1&strPrevDate=${ymd(from)}&strScrip=${scrip}&strSearch=P&strToDate=${ymd(to)}&strType=C&subcategory=-1`;
    const j = await getJson<{ Table?: BseRow[] }>(url, "BSE announcements", {
      revalidate: 600,
      headers: { Referer: "https://www.bseindia.com/", Origin: "https://www.bseindia.com" },
    });
    if (!Array.isArray(j.Table)) throw new SourceError("BSE announcements", "unexpected payload");
    return j.Table.map((r): RawAnnouncement => {
      const ts = r.DT_TM ?? r.NEWS_DT ?? "";
      return {
        date: ts.slice(0, 10),
        time: ts.length >= 16 ? ts.slice(11, 16) : undefined,
        title: (r.NEWSSUB || r.HEADLINE || "Announcement").trim(),
        url: r.ATTACHMENTNAME ? `https://www.bseindia.com/xml-data/corpfiling/AttachLive/${r.ATTACHMENTNAME}` : r.NSURL || "https://www.bseindia.com/corporates/ann.html",
        sourceCategory: [r.CATEGORYNAME, r.SUBCATNAME].filter(Boolean).join(" / ") || undefined,
        summary: r.MORE || (r.HEADLINE && r.HEADLINE !== r.NEWSSUB ? r.HEADLINE : undefined),
      };
    }).filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a.date));
  });
}
