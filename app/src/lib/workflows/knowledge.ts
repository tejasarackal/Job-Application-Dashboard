// knowledge.ts — SOP reference content vendored from automate-job-search
// (_voice_guidelines.md, _about_me.md, _location_preferences.md). Kept as TS
// string constants (not .md files) so they bundle reliably into Vercel
// serverless functions. Source of truth still lives in automate-job-search;
// keep in sync when those change (PRD-workflow-engine.md R4).

export const ABOUT = `My name is Tejas Arackal. I'm a data engineer based in San Jose, CA with 12+ years of experience building data systems at scale — pipelines, warehouses, real-time analytics, and the governance programs that keep them running.

Background: started in database engineering at TCS in Mumbai (Java ETL, PL/SQL for financial clients); moved to the US for an M.S. in Engineering Management at Case Western Reserve; joined Segmint as a founding member of their data engineering team, building the entire DE function from scratch and shipping ETL + in-database analytics that processed over 10 billion financial transactions for major banks.

Since 2021 at Meta on the video data platform: built the first measurement system quantifying short-form video's revenue and engagement impact across Meta apps; co-led the video org's capacity governance program for a 23% efficiency gain worth over $7M in annualized compute savings; owns the video data namespace and is on-call leader for the team's core data stack.

Core stack: Python, Spark, Java, SQL as a constant, plus Kafka, Hive, Presto, Airflow, Greenplum, PostgreSQL, Cassandra, AWS S3. Dashboards in Tableau and Amazon QuickSight. Mentored 6 engineers, ran 50+ DE interviews.

Currently looking for a Senior or Staff Data Engineer role at a company that takes data infrastructure seriously — building at scale where pipeline quality, data governance, and compute efficiency are real priorities.`;

export const VOICE = `Voice: a real person, not a bot. Tejas is sharp and experienced (12 years in DE, currently at Meta), not job-desperate — selectively exploring. He reaches out because he genuinely found something interesting about the company.

Tone: slightly personal and human; confident not arrogant; direct (no warm-up sentences); conversational, peer-to-peer (not applicant-to-gatekeeper).

HARD RULES:
- Always open the body with: Hello {first_name},
- Mention the company name naturally somewhere in the body.
- No em dashes.
- Banned words: leverage, synergy, passionate, excited, thrilled, delighted, innovative, dynamic, genuinely, interesting environment, "makes this worth reaching out about", "I thought I'd reach out", "I figured I'd", "what seems like".
- Never open with "I hope this email finds you well" or any variation.
- Close with "Best,", "Thanks," or "Cheers," then first name only on the next line — one word, one name.
- Never introduce yourself by name in the body (the From: field shows it). No "My name is Tejas" / "Tejas here".
- The first sentence MUST start with "I" as the subject. Banned openers: participial ("Having spent X years..."), prepositional ("On the data team at Meta, I..."), dropped-pronoun ("Been at Meta..."). Correct: "I [verb] [role/place], and [hook]...".
- Max 5-6 sentences in the body. Vary sentence length — never three sentences in a row with the same rhythm.
- Exactly one specific data-related reference to the company or signal (a Snowflake migration, dbt adoption, a DE job posting, a new data leadership hire) — not generic praise.
- One credential mention allowed ("I led a similar initiative at Meta") — brief, not boastful.
- No fluff, no buzzwords. Use casual directional phrases ("I noticed", "Saw you're", "Looking at your stack,", "For context,") not formal setups.
- End with one soft, low-friction ask — a direct question, not a dramatic close.

BODY STRUCTURE — three paragraphs separated by blank lines:
  P1 (1-2 sentences): opening hook — Tejas's role + what was noticed about this company.
  P2 (1-2 sentences): the concrete connection — a specific Meta problem, the approach used, the parallel at this company. Name the actual problem and solution, never "similar work around X".
  P3 (1 sentence): the ask.

SUBJECT LINE: 6-10 words, credential + company interest, no sales triggers.
  Good: "Senior DE @ Meta | Interested in {Company}'s data work"
  Good: "Tejas Arackal | Data Eng role at {Company}"
  Bad: "Exciting opportunity to connect" / "Following up on my application"`;

// Location targeting lives canonically in filters.ts (checkLocation). This is a
// human-readable summary of the same rule for prompt context.
export const LOCATION = `Target: SF Bay Area (San Francisco, San Jose, Santa Clara, Sunnyvale, Mountain View, Palo Alto, Oakland, Berkeley, Redwood City and nearby) or US/California remote. Disqualifying: roles only in Seattle, New York, Austin, or offshore (India, etc.). CA in-office preferred, then CA/US remote.`;
