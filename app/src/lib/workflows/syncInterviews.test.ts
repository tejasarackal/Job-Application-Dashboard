import { describe, it, expect } from "vitest";
import {
  normalizeRole,
  normalizeInterviewer,
  roleCompat,
  resolveRole,
  mapStage,
  findExisting,
  shouldAdvance,
  isRealInterviewEvidence,
} from "./syncInterviews";
import type { Interview } from "@/lib/types";

const iv = (p: Partial<Interview>): Interview => ({ id: p.id ?? "rec", company: p.company ?? "—", ...p }) as Interview;

// Mirrors the live Applications table for the two multi-role companies.
const APPS = [
  { company: "Applied Materials", jobTitle: "Business Intelligence Analyst (R2519741)" },
  { company: "Applied Materials", jobTitle: "Data Scientist/Analytics V (R2618356)" },
  { company: "Notion", jobTitle: "Data Engineer, People Analytics" },
  { company: "Notion", jobTitle: "Data Engineer, Go-To-Market" },
  { company: "Snowflake", jobTitle: "Senior Data Engineer - Product" },
];

describe("normalizeRole", () => {
  it("strips req-id parens + punctuation", () => {
    expect(normalizeRole("Business Intelligence Analyst (R2519741)")).toBe("business intelligence analyst");
    expect(normalizeRole("Data Engineer, People Analytics")).toBe("data engineer people analytics");
    expect(normalizeRole("Engineer II – Data Engineer (R0063591)")).toBe("engineer ii data engineer");
  });
});

describe("roleCompat", () => {
  it("treats generic ⊆ specific (and blanks) as compatible", () => {
    expect(roleCompat("Data Engineer", "Data Engineer, People Analytics")).toBe(true);
    expect(roleCompat("", "anything")).toBe(true);
    expect(roleCompat("Business Intelligence Analyst (R2519741)", "Business Intelligence Analyst")).toBe(true);
  });
  it("rejects genuinely different roles", () => {
    expect(roleCompat("Business Intelligence Analyst", "Data Engineer")).toBe(false);
    expect(roleCompat("Data Scientist/Analytics V", "Data Engineer")).toBe(false);
  });
});

describe("resolveRole", () => {
  it("heals a vague extraction to the authoritative pipeline title", () => {
    // Notion: generic "Data Engineer" → the real People-Analytics title.
    expect(resolveRole("Notion", "Data Engineer, People Analytics", APPS)).toBe("Data Engineer, People Analytics");
    expect(resolveRole("Applied Materials", "Business Intelligence Analyst", APPS)).toBe(
      "Business Intelligence Analyst (R2519741)",
    );
  });
  it("uses the sole known role when extraction is empty", () => {
    expect(resolveRole("Snowflake", "", APPS)).toBe("Senior Data Engineer - Product");
  });
  it("never fabricates: empty + multiple roles → blank (heals later via findExisting)", () => {
    expect(resolveRole("Applied Materials", "", APPS)).toBe("");
  });
  it("keeps a verbatim role when the company has no application match", () => {
    expect(resolveRole("BrandNewCo", "Staff Data Engineer", APPS)).toBe("Staff Data Engineer");
    // and crucially never returns the old hardcoded "Data Engineer" default
    expect(resolveRole("BrandNewCo", "", APPS)).toBe("");
  });
});

describe("mapStage", () => {
  it("maps clear round types", () => {
    expect(mapStage("Phone screen with recruiter")).toBe("Recruiter Screen");
    expect(mapStage("Technical coding round")).toBe("Technical Screen");
    expect(mapStage("HM fit call")).toBe("Hiring Manager");
    expect(mapStage("System design interview")).toBe("System Design");
  });
  it("returns '' for modality-only text (caller falls back to generic 'Interview')", () => {
    expect(mapStage("Virtual interview via Microsoft Teams")).toBe("");
    expect(mapStage("Interview confirmation sent; calendar invitation to follow")).toBe("");
  });
});

describe("findExisting — collapses the variants that used to duplicate", () => {
  it("Applied Materials / Corey Hart: every virtual-interview variant maps to one row", () => {
    const rows = [
      iv({ id: "corey", company: "Applied Materials", role: "Business Intelligence Analyst", interviewer: "Corey Hart", scheduledAt: "2026-06-08T17:00:00.000Z", stage: "Interview" }),
    ];
    // same interviewer, role healed to "" → matches (a/c)
    expect(findExisting(rows, "Applied Materials", "", "Corey Hart", "")?.id).toBe("corey");
    // confidently-wrong "Data Engineer" for the same person → matches (c)
    expect(findExisting(rows, "Applied Materials", "Data Engineer", "Corey Hart", "")?.id).toBe("corey");
    // recruiter (Sasha Pan) email for the same slot → matches (b) same-event
    expect(findExisting(rows, "Applied Materials", "", "Sasha Pan", "2026-06-08T10:00:00.000Z")?.id).toBe("corey");
  });
  it("Notion / Janelle Bullock: generic role + blank stage map to the People-Analytics row", () => {
    const rows = [
      iv({ id: "janelle", company: "Notion", role: "Data Engineer, People Analytics", interviewer: "Janelle Bullock", stage: "Recruiter Screen" }),
    ];
    expect(findExisting(rows, "Notion", "Data Engineer", "Janelle Bullock", "")?.id).toBe("janelle");
    expect(findExisting(rows, "Notion", "", "Janelle Bullock", "")?.id).toBe("janelle");
  });
  it("does NOT merge a genuinely different role/person at the same company", () => {
    const rows = [
      iv({ id: "janelle", company: "Notion", role: "Data Engineer, People Analytics", interviewer: "Janelle Bullock" }),
    ];
    // different interviewer + incompatible role + no shared slot → new row
    expect(findExisting(rows, "Notion", "Data Engineer, Go-To-Market", "Notion's Recruiting Team", "")).toBeUndefined();
  });
});

describe("shouldAdvance", () => {
  it("is monotonic and ignores no-ops", () => {
    expect(shouldAdvance(undefined, "Scheduled")).toBe(true);
    expect(shouldAdvance("Scheduled", "Completed")).toBe(true);
    expect(shouldAdvance("Completed", "Scheduled")).toBe(false);
    expect(shouldAdvance("Scheduled", "Scheduled")).toBe(false);
  });
});

describe("isRealInterviewEvidence — gates phantom interview rows", () => {
  it("rejects a screening decision with no interview signal (the BUG-025 case)", () => {
    // Notion 'Go-To-Market' rejection: terminal status, no interviewer/date, generic stage.
    expect(isRealInterviewEvidence("Rejected", "", "", "Interview")).toBe(false);
    expect(isRealInterviewEvidence("Cancelled", "", "", "Interview")).toBe(false);
  });
  it("accepts a rejection that closes out a real interview (named interviewer)", () => {
    expect(isRealInterviewEvidence("Rejected", "", "Janelle Bullock", "Interview")).toBe(true);
  });
  it("accepts forward-looking and evidenced rows", () => {
    expect(isRealInterviewEvidence("Scheduled", "", "", "Interview")).toBe(true); // invite
    expect(isRealInterviewEvidence("Awaiting Feedback", "2026-06-10T17:00:00.000Z", "", "Interview")).toBe(true); // has a slot
    expect(isRealInterviewEvidence("Completed", "", "", "Onsite / Final")).toBe(true); // specific round
  });
});

describe("normalizeInterviewer", () => {
  it("lowercases + collapses", () => {
    expect(normalizeInterviewer("Janelle  Bullock")).toBe("janelle bullock");
    expect(normalizeInterviewer("Notion's Recruiting Team")).toBe("notion s recruiting team");
  });
});
