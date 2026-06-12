// Board dispatch — route a scrape target to its native ATS adapter. custom/
// unknown/missing-token return [] here; those companies are covered by the
// scrape's LinkedIn f_C supplement instead.
import type { RawJob } from "./types";
import { fetchGreenhouse } from "./greenhouse";
import { fetchLever } from "./lever";
import { fetchAshby } from "./ashby";
import { fetchWorkdayBoard } from "./workday";

export type { RawJob } from "./types";

export interface BoardTarget {
  company: string;
  ats?: string;
  boardToken?: string;
  linkedinId?: string;
}

// Display board label for a target's ATS (used when the URL doesn't reveal it).
export const BOARD_LABEL: Record<string, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  workday: "Workday",
};

export async function fetchBoardJobs(
  t: BoardTarget,
  opts: { deadlineMs?: number; keywords?: readonly string[] } = {},
): Promise<RawJob[]> {
  const token = (t.boardToken ?? "").trim();
  if (!token) return [];
  switch (t.ats) {
    case "greenhouse":
      return fetchGreenhouse(token, t.company);
    case "lever":
      return fetchLever(token, t.company);
    case "ashby":
      return fetchAshby(token, t.company);
    case "workday":
      // Workday CXS is keyword-searched, so it takes the ACTOR's search keywords
      // (Phase 4) + the global deadline (it paginates per keyword). Greenhouse/
      // Lever/Ashby fetch ALL open roles and rely on the post-filter title gate.
      return fetchWorkdayBoard(token, t.company, { deadlineMs: opts.deadlineMs, keywords: opts.keywords });
    default:
      return [];
  }
}
