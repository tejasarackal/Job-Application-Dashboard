// airtable.test.ts — formula-safety unit vectors (PRD §13A.10/.11, G13).
// Pure functions only: escapeFormulaString / recordIdFilter / ownerFilter.
// No network, no token needed.

import { describe, it, expect } from "vitest";
import { escapeFormulaString, recordIdFilter, ownerFilter } from "./airtable";

describe("escapeFormulaString", () => {
  it("escapes a single quote (O'Brien)", () => {
    // Backslash escaping for Airtable formula string literals: ' → \'.
    expect(escapeFormulaString("O'Brien")).toBe("O\\'Brien");
  });

  it("escapes a lone backslash (\\ → \\\\)", () => {
    expect(escapeFormulaString("a\\b")).toBe("a\\\\b");
  });

  it("escapes a trailing backslash (closing-quote attack)", () => {
    // A trailing `\` must become `\\` so it can't escape the closing quote that
    // the caller appends around the value.
    expect(escapeFormulaString("abc\\")).toBe("abc\\\\");
  });

  it("escapes backslash FIRST, then quote (\\' → \\\\\\')", () => {
    // Input is backslash followed by quote. Backslash → \\, quote → \'.
    expect(escapeFormulaString("\\'")).toBe("\\\\\\'");
  });

  it("neutralizes a formula-breakout payload (' OR TRUE() OR ')", () => {
    const out = escapeFormulaString("' OR TRUE() OR '");
    // Every single quote is now backslash-escaped — no unescaped ' survives to
    // close the literal and inject `OR TRUE()`.
    expect(out).toBe("\\' OR TRUE() OR \\'");
    expect(out).not.toMatch(/(^|[^\\])'/); // no un-escaped quote
  });

  it("neutralizes a role-injection payload ('),{Role}='admin)", () => {
    const out = escapeFormulaString("'),{Role}='admin");
    expect(out).toBe("\\'),{Role}=\\'admin");
    expect(out).not.toMatch(/(^|[^\\])'/);
  });

  it("throws on the empty string (blank-owner match-all)", () => {
    // {User Email}='' would match every blank-owner row (CR-S5) — must throw.
    expect(() => escapeFormulaString("")).toThrow();
  });

  it("throws on control characters \\r / \\n / \\0", () => {
    expect(() => escapeFormulaString("a\rb")).toThrow();
    expect(() => escapeFormulaString("a\nb")).toThrow();
    expect(() => escapeFormulaString("a\0b")).toThrow();
  });

  it("passes unicode through (curly apostrophe is not the ASCII quote)", () => {
    expect(escapeFormulaString("O’Brien")).toBe("O’Brien");
  });
});

describe("recordIdFilter", () => {
  it("builds an OR(RECORD_ID()=…) over valid record ids", () => {
    const f = recordIdFilter(["rec0123456789ABCD"]);
    expect(f).toBe("OR(RECORD_ID()='rec0123456789ABCD')");
  });

  it("rejects an injection payload disguised as a record id", () => {
    expect(() => recordIdFilter(["x') , TRUE(), ('"])).toThrow();
  });

  it("rejects ids that do not match ^rec[A-Za-z0-9]{14,17}$", () => {
    expect(() => recordIdFilter(["notarecord"])).toThrow();
    expect(() => recordIdFilter(["rec"])).toThrow();
    expect(() => recordIdFilter(["rec_with_symbols!!"])).toThrow();
  });

  it("throws on an empty id list", () => {
    expect(() => recordIdFilter([])).toThrow();
  });
});

describe("ownerFilter", () => {
  it("lowercases the email and wraps it in LOWER({User Email}) = '…'", () => {
    expect(ownerFilter("Tejas@Example.COM")).toBe("LOWER({User Email}) = 'tejas@example.com'");
  });

  it("escapes a quote in the email before interpolation", () => {
    // RFC allows ' in the local part; it must be escaped, not injected.
    expect(ownerFilter("o'brien@example.com")).toBe(
      "LOWER({User Email}) = 'o\\'brien@example.com'",
    );
  });

  it("throws on an empty / malformed email shape", () => {
    expect(() => ownerFilter("")).toThrow();
    expect(() => ownerFilter("not-an-email")).toThrow();
  });
});
