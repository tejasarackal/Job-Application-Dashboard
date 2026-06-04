// Static ATS + careers URL registry for the 101 H1B target companies.
// Keyed by employer name exactly as it appears in the Airtable H1B_Companies table.
// Source of truth: automate-job-search/_h1b_companies.md

export interface CompanyMeta {
  ats: "greenhouse" | "lever" | "workday" | "custom" | "unknown";
  careersUrl: string;
  // Display name the Greenhouse scraper's `companies_include` filter expects
  // (brand, not legal name). Defaults to the brand derived from the key.
  brand?: string;
  // Numeric LinkedIn company ID for the jobs-search `f_C=` filter. Lets the
  // LinkedIn scrape target ONLY this sponsor at the source (no dashboard-level
  // waste). Populate over time — see scripts/resolve-linkedin-ids.md. Companies
  // without an ID simply aren't searched on LinkedIn (no fabricated IDs). Backfill
  // method: see docs/plan/IMPLEMENTATION-workflow-engine.md § LinkedIn ID backfill.
  linkedinId?: string;
}

export const COMPANY_REGISTRY: Record<string, CompanyMeta> = {
  // Incubation
  "Meta Platforms Inc": { ats: "custom", careersUrl: "https://metacareers.com" },

  // Tier 1 — Large Tech
  "Apple Inc.": { ats: "custom", careersUrl: "https://jobs.apple.com" },
  "Google LLC": { ats: "custom", careersUrl: "https://careers.google.com" },
  "NVIDIA Corporation": { ats: "workday", careersUrl: "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite" },
  "Salesforce Inc.": { ats: "workday", careersUrl: "https://salesforce.wd12.myworkdayjobs.com/ExternalCareersPage" },
  "LinkedIn Corporation": { ats: "custom", careersUrl: "https://careers.linkedin.com" },
  "Intel Corporation": { ats: "workday", careersUrl: "https://intel.wd1.myworkdayjobs.com/External" },
  "PayPal Inc.": { ats: "workday", careersUrl: "https://paypal.wd1.myworkdayjobs.com/jobs" },
  "Cisco Systems Inc.": { ats: "workday", careersUrl: "https://jobs.cisco.com" },
  "ServiceNow Inc.": { ats: "workday", careersUrl: "https://careers.servicenow.com" },
  "Adobe Inc.": { ats: "workday", careersUrl: "https://adobe.wd5.myworkdayjobs.com/external_experienced" },
  "Intuit Inc.": { ats: "workday", careersUrl: "https://intuit.wd1.myworkdayjobs.com/Intuit_Careers" },
  "eBay Inc.": { ats: "workday", careersUrl: "https://ebay.wd5.myworkdayjobs.com/apply" },
  "Uber Technologies Inc.": { ats: "greenhouse", careersUrl: "https://www.uber.com/us/en/careers/" },
  "Workday Inc.": { ats: "workday", careersUrl: "https://workday.wd5.myworkdayjobs.com/Workday" },
  "Advanced Micro Devices Inc.": { ats: "workday", careersUrl: "https://amd.wd1.myworkdayjobs.com/jobs" },
  "VMware LLC": { ats: "workday", careersUrl: "https://careers.vmware.com" },
  "Palo Alto Networks Inc.": { ats: "workday", careersUrl: "https://jobs.paloaltonetworks.com" },
  "Amazon Development Center": { ats: "custom", careersUrl: "https://amazon.jobs" },

  // Tier 2 — Data / AI Infrastructure
  "Snowflake Inc.": { ats: "greenhouse", careersUrl: "https://careers.snowflake.com" },
  "Databricks Inc.": { ats: "greenhouse", careersUrl: "https://www.databricks.com/company/careers" },
  "Confluent Inc.": { ats: "greenhouse", careersUrl: "https://www.confluent.io/careers" },
  "Scale AI Inc.": { ats: "greenhouse", careersUrl: "https://scale.com/careers" },
  "Together Computer Inc.": { ats: "greenhouse", careersUrl: "https://www.together.ai/careers" },
  "Glean Technologies Inc.": { ats: "greenhouse", careersUrl: "https://glean.com/careers" },
  "Anyscale Inc.": { ats: "greenhouse", careersUrl: "https://www.anyscale.com/careers" },

  // Tier 3 — Finance / Fintech
  "Visa": { ats: "workday", careersUrl: "https://corporate.visa.com/en/careers.html" },
  "TikTok / ByteDance": { ats: "greenhouse", careersUrl: "https://careers.tiktok.com" },
  "Stripe Inc.": { ats: "greenhouse", careersUrl: "https://stripe.com/jobs" },
  "Block Inc. (Square)": { ats: "greenhouse", careersUrl: "https://block.xyz/careers" },
  "Robinhood Markets Inc.": { ats: "greenhouse", careersUrl: "https://careers.robinhood.com" },
  "Social Finance LLC (SoFi)": { ats: "workday", careersUrl: "https://www.sofi.com/careers" },
  "Coinbase Inc.": { ats: "greenhouse", careersUrl: "https://www.coinbase.com/careers" },
  "CyberSource Corporation": { ats: "workday", careersUrl: "https://jobs.visa.com" },
  "Chime Financial Inc.": { ats: "greenhouse", careersUrl: "https://careers.chime.com" },
  "Plaid Inc.": { ats: "lever", careersUrl: "https://plaid.com/careers" },

  // Tier 4 — Tech (Mid-Size)
  "Docusign Inc.": { ats: "workday", careersUrl: "https://careers.docusign.com" },
  "DoorDash Inc.": { ats: "greenhouse", careersUrl: "https://careers.doordash.com" },
  "Netflix Inc.": { ats: "custom", careersUrl: "https://jobs.netflix.com" },
  "Airbnb Inc.": { ats: "greenhouse", careersUrl: "https://careers.airbnb.com" },
  "OpenAI OpCo LLC": { ats: "greenhouse", careersUrl: "https://openai.com/careers" },
  "Atlassian US Inc.": { ats: "workday", careersUrl: "https://www.atlassian.com/company/careers" },
  "Splunk Technology Inc.": { ats: "workday", careersUrl: "https://www.splunk.com/en_us/careers.html" },
  "Pinterest Inc.": { ats: "greenhouse", careersUrl: "https://www.pinterestcareers.com" },
  "Twilio Inc.": { ats: "greenhouse", careersUrl: "https://www.twilio.com/en-us/company/jobs" },
  "Zoom Video Communications": { ats: "workday", careersUrl: "https://careers.zoom.us" },
  "Lyft Inc.": { ats: "greenhouse", careersUrl: "https://www.lyft.com/careers" },
  "Roblox Corporation": { ats: "workday", careersUrl: "https://careers.roblox.com" },
  "Fortinet Inc.": { ats: "workday", careersUrl: "https://www.fortinet.com/corporate/about-us/careers" },
  "Rippling People Center": { ats: "greenhouse", careersUrl: "https://www.rippling.com/jobs" },
  "Autodesk Inc.": { ats: "workday", careersUrl: "https://autodesk.wd1.myworkdayjobs.com/Ext" },
  "Safeway Inc. (tech division)": { ats: "custom", careersUrl: "https://www.albertsons.com/careers" },
  "Waymo LLC": { ats: "greenhouse", careersUrl: "https://waymo.com/careers" },
  "Reddit Inc.": { ats: "greenhouse", careersUrl: "https://redditinc.com/careers" },
  "Figma Inc.": { ats: "greenhouse", careersUrl: "https://www.figma.com/careers" },
  "Notion Labs Inc.": { ats: "greenhouse", careersUrl: "https://www.notion.so/careers" },
  "Sony Interactive Entertainment LLC": { ats: "workday", careersUrl: "https://sonyinteractive.com/careers" },
  "Guidewire Software Inc.": { ats: "workday", careersUrl: "https://careers.guidewire.com" },
  "Asana Inc.": { ats: "greenhouse", careersUrl: "https://asana.com/company/careers" },
  "Benchling Inc.": { ats: "greenhouse", careersUrl: "https://benchling.com/careers" },
  "Replit Inc.": { ats: "greenhouse", careersUrl: "https://replit.com/careers" },
  "Upscale AI Inc.": { ats: "unknown", careersUrl: "https://upscale.ai/careers" },
  "Apex.AI Inc.": { ats: "unknown", careersUrl: "https://www.apex.ai/careers" },

  // Tier 5 — AI Companies
  "Crusoe Energy Systems Inc.": { ats: "greenhouse", careersUrl: "https://crusoeenergy.com/careers" },
  "Anthropic PBC": { ats: "greenhouse", careersUrl: "https://anthropic.com/careers" },
  "Resolve AI Inc.": { ats: "unknown", careersUrl: "https://resolve.ai/careers" },
  "X.Ai LLC (xAI)": { ats: "greenhouse", careersUrl: "https://x.ai/careers" },
  "Sierra Technologies Inc.": { ats: "unknown", careersUrl: "https://sierra.ai/careers" },
  "Mistral AI Inc.": { ats: "lever", careersUrl: "https://mistral.ai/careers" },
  "Cerebras Systems Inc.": { ats: "greenhouse", careersUrl: "https://www.cerebras.net/careers" },
  "Writer Inc.": { ats: "greenhouse", careersUrl: "https://writer.com/careers" },
  "Perplexity AI Inc.": { ats: "greenhouse", careersUrl: "https://www.perplexity.ai/careers" },
  "Groq Inc.": { ats: "greenhouse", careersUrl: "https://groq.com/careers" },

  // Tier 6 — Hardware / Semiconductor
  "Tesla Inc.": { ats: "greenhouse", careersUrl: "https://www.tesla.com/careers" },
  "Lucid USA Inc.": { ats: "workday", careersUrl: "https://lucidmotors.com/careers" },
  "Zoox Inc.": { ats: "greenhouse", careersUrl: "https://zoox.com/careers" },
  "Synopsys Inc.": { ats: "workday", careersUrl: "https://synopsys.wd1.myworkdayjobs.com/Synopsys" },
  "Arista Networks": { ats: "workday", careersUrl: "https://www.arista.com/en/careers" },
  "Arm Inc.": { ats: "workday", careersUrl: "https://www.arm.com/careers" },
  "Applied Materials Inc.": { ats: "workday", careersUrl: "https://www.appliedmaterials.com/careers" },
  "Cadence Design Systems Inc.": { ats: "workday", careersUrl: "https://www.cadence.com/en_US/home/company/careers.html" },
  "Marvell Semiconductor Inc.": { ats: "workday", careersUrl: "https://www.marvell.com/company/careers.html" },
  "Pure Storage Inc.": { ats: "workday", careersUrl: "https://www.purestorage.com/careers" },
  "KLA Corporation": { ats: "workday", careersUrl: "https://www.kla.com/careers" },
  "Lam Research Corporation": { ats: "workday", careersUrl: "https://lamc.lamresearch.com/Careers" },
  "Xilinx Inc.": { ats: "workday", careersUrl: "https://amd.wd1.myworkdayjobs.com/jobs" },

  // Tier 7 — Healthcare Tech
  "Intuitive Surgical Operations Inc.": { ats: "workday", careersUrl: "https://careers.intuitive.com" },
  "Genentech Inc.": { ats: "workday", careersUrl: "https://www.gene.com/careers" },
  "Gilead Sciences Inc.": { ats: "workday", careersUrl: "https://gilead.wd1.myworkdayjobs.com/gileadcareers" },

  // Tier 8 — Consulting / Staffing
  "HCL America INC": { ats: "custom", careersUrl: "https://www.hcltech.com/careers" },
  "Persistent Systems Inc": { ats: "unknown", careersUrl: "https://www.persistent.com/careers" },
  "GlobalLogic Inc.": { ats: "unknown", careersUrl: "https://www.globallogic.com/careers" },
  "Tiger Analytics Inc.": { ats: "unknown", careersUrl: "https://www.tigeranalytics.com/careers" },
  "Infogain Corporation": { ats: "unknown", careersUrl: "https://www.infogain.com/careers" },
  "Nagarro Inc.": { ats: "unknown", careersUrl: "https://www.nagarro.com/en/careers" },
  "DGN Technologies Inc.": { ats: "unknown", careersUrl: "https://dgntechnologies.com/careers" },

  // Tier 9 — Academic / Research
  "The Leland Stanford Jr University": { ats: "custom", careersUrl: "https://jobs.stanford.edu" },
  "University of California San Francisco": { ats: "custom", careersUrl: "https://jobs.ucsf.edu" },
  "University of California Berkeley": { ats: "custom", careersUrl: "https://jobs.berkeley.edu" },
  "Lawrence Berkeley National Laboratory": { ats: "custom", careersUrl: "https://jobs.lbl.gov" },
};

// Fuzzy lookup: try exact match, then normalize legal suffixes and retry.
const _normalized = new Map<string, CompanyMeta>();
for (const [name, meta] of Object.entries(COMPANY_REGISTRY)) {
  _normalized.set(name.toLowerCase().replace(/[.,]?\s*(inc|llc|ltd|corp|pbc|llp)\.?$/i, "").trim(), meta);
}

export function lookupCompany(employer: string): CompanyMeta | undefined {
  const exact = COMPANY_REGISTRY[employer];
  if (exact) return exact;
  const key = employer.toLowerCase().replace(/[.,]?\s*(inc|llc|ltd|corp|pbc|llp)\.?$/i, "").trim();
  return _normalized.get(key);
}

// Brand name for a registry key — drops legal suffixes and any "(...)"/"/ ..."
// qualifier so "Block Inc. (Square)" → "Block", "Anthropic PBC" → "Anthropic".
// This is what the Greenhouse scraper's `companies_include` filter matches on.
export function deriveBrand(name: string): string {
  return name
    .replace(/\s*\(.*?\)/g, "")
    .replace(/\s*\/.*$/, "")
    .replace(/[.,]?\s*(inc|llc|ltd|corp|corporation|pbc|llp|co)\.?$/i, "")
    .trim();
}

// Greenhouse-ATS sponsor brands — fed to the Greenhouse actor's
// `companies_include` so the scrape returns ONLY H1B sponsors at the source.
export function greenhouseBrands(): string[] {
  return Object.entries(COMPANY_REGISTRY)
    .filter(([, m]) => m.ats === "greenhouse")
    .map(([name, m]) => m.brand ?? deriveBrand(name));
}

// Populated LinkedIn company IDs across the registry — fed to the LinkedIn
// jobs-search `f_C=` filter so that scrape is also source-scoped to sponsors.
export function linkedinCompanyIds(): string[] {
  return Object.values(COMPANY_REGISTRY)
    .map((m) => m.linkedinId)
    .filter((id): id is string => Boolean(id));
}

// Workday sponsors whose careers URL is a directly-addressable Workday tenant
// (`{tenant}.wdN.myworkdayjobs.com/{site}`). These map to the public CXS JSON API
// (`/wday/cxs/{tenant}/{site}/jobs`) so the scrape can pull their DE postings
// without Apify. Vanity-domain Workday companies (jobs.cisco.com, etc.) are
// skipped — their tenant isn't derivable from the URL. `name` is the full
// registry key so isH1bSponsor() matches it exactly.
export interface WorkdayTarget {
  name: string;
  host: string;
  tenant: string;
  site: string;
}

export function workdayTargets(): WorkdayTarget[] {
  const out: WorkdayTarget[] = [];
  for (const [name, meta] of Object.entries(COMPANY_REGISTRY)) {
    if (meta.ats !== "workday") continue;
    const m = meta.careersUrl.match(/^https?:\/\/(([^.]+)\.wd\d+\.myworkdayjobs\.com)\/([^/?#]+)/i);
    if (m) out.push({ name, host: m[1], tenant: m[2], site: m[3] });
  }
  return out;
}
