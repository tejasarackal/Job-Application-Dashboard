import { describe, it, expect } from "vitest";
import { selectRevalidationTargets } from "./revalidateListings";
import type { JobListing, ScrapeTarget } from "@/lib/types";

let n = 0;
const lst = (o: Partial<JobListing>): JobListing => ({
  id: `rec${(n++).toString().padStart(14, "0")}`,
  title: "Senior Data Engineer",
  company: "Acme",
  ...o,
});
const tgt = (company: string, ats?: string, boardToken = "tok"): ScrapeTarget =>
  ({ id: `t-${company}`, company, ats, boardToken }) as ScrapeTarget;

describe("selectRevalidationTargets", () => {
  it("keeps only native targets whose company has an ACTIVE (pre-apply) listing", () => {
    const existing = [
      lst({ company: "NVIDIA Corporation", status: "new" }),
      lst({ company: "DoorDash", status: "applied" }), // actioned → not revalidated
      lst({ company: "Stripe", status: "skipped" }), // actioned → not revalidated
    ];
    const targets = [
      tgt("NVIDIA", "workday"),
      tgt("DoorDash", "greenhouse"),
      tgt("Stripe", "greenhouse"),
      tgt("Airbnb", "greenhouse"), // no listing at all
    ];
    expect(selectRevalidationTargets(existing, targets).map((t) => t.company)).toEqual(["NVIDIA"]);
  });

  it("matches listing↔target across legal-suffix differences (the real NVIDIA/Salesforce case)", () => {
    // Listings store a short company name; Scrape_Targets store the legal name —
    // normalizeCompany collapses both ("NVIDIA" / "NVIDIA Corporation" → "nvidia").
    const existing = [lst({ company: "NVIDIA", status: "new" }), lst({ company: "Salesforce", status: "queued" })];
    const targets = [tgt("NVIDIA Corporation", "workday"), tgt("Salesforce Inc", "workday")];
    expect(selectRevalidationTargets(existing, targets).map((t) => t.company).sort()).toEqual([
      "NVIDIA Corporation",
      "Salesforce Inc",
    ]);
  });

  it("excludes non-native targets (custom/unknown/missing token) even with an active listing", () => {
    const existing = [lst({ company: "Databricks", status: "new" })];
    const targets = [
      tgt("Databricks", "custom"),
      tgt("Databricks", "greenhouse", ""), // missing token → not native
    ];
    expect(selectRevalidationTargets(existing, targets)).toEqual([]);
  });

  it("returns nothing when no listing is in a pre-apply state", () => {
    const existing = [lst({ company: "NVIDIA", status: "applied" }), lst({ company: "NVIDIA", status: "expired" })];
    expect(selectRevalidationTargets(existing, [tgt("NVIDIA", "workday")])).toEqual([]);
  });
});
