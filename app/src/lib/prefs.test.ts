// prefs.test.ts — UserPrefs defensive-parse + drift-guard (PRD §13A.13/.14).
// prefsOrNeutral must NEVER yield tejasDefaults for arbitrary input (owner-bio
// leak is its own breach class). tejasDefaults must mirror OWNER_PREFS/knowledge.

import { describe, it, expect } from "vitest";
import {
  prefsOrNeutral,
  neutralDefaults,
  tejasDefaults,
  serializePrefs,
  PREFS_MAX_CHARS,
  type UserPrefs,
} from "./prefs";
import { OWNER_PREFS } from "@/lib/workflows/filters";
import { ABOUT, VOICE } from "@/lib/workflows/knowledge";

describe("prefsOrNeutral (defensive parse)", () => {
  it("malformed JSON degrades to neutral, NEVER tejasDefaults", () => {
    const out = prefsOrNeutral("not json {{{");
    expect(out).toEqual(neutralDefaults());
    // Hard assertion: no owner bio/voice/keywords leaked.
    expect(out.voice).toBeUndefined();
    expect(out.about).toBeUndefined();
    expect(out.jobPrefs.titleKeywords).toEqual([]);
    expect(out).not.toEqual(tejasDefaults());
  });

  it("schema-invalid JSON (wrong types) degrades to neutral", () => {
    const out = prefsOrNeutral(JSON.stringify({ v: 1, jobPrefs: { titleKeywords: "nope" } }));
    expect(out).toEqual(neutralDefaults());
  });

  it("null / empty / whitespace → neutral", () => {
    expect(prefsOrNeutral(null)).toEqual(neutralDefaults());
    expect(prefsOrNeutral(undefined)).toEqual(neutralDefaults());
    expect(prefsOrNeutral("")).toEqual(neutralDefaults());
    expect(prefsOrNeutral("   ")).toEqual(neutralDefaults());
  });

  it("valid prefs round-trip cleanly", () => {
    const prefs: UserPrefs = {
      v: 1,
      identity: { outreachEmail: "m@x.com" },
      jobPrefs: { titleKeywords: ["data engineer"], locations: ["Austin"], remotePref: "remote_only" },
      voice: "casual",
      about: "I do data.",
    };
    expect(prefsOrNeutral(JSON.stringify(prefs))).toEqual(prefs);
  });

  it("strips unknown keys (zod object strip)", () => {
    const raw = {
      v: 1,
      identity: { outreachEmail: "m@x.com", injected: "x" },
      jobPrefs: {
        titleKeywords: [],
        locations: [],
        remotePref: "no_preference",
        minMatchScore: 99, // unknown future key
      },
      junk: "dropped",
    };
    const out = prefsOrNeutral(JSON.stringify(raw));
    // Known fields survive; unknown keys at every level are stripped.
    expect(out.v).toBe(1);
    expect(out.identity).toEqual({ outreachEmail: "m@x.com" });
    expect(out.jobPrefs).toEqual({ titleKeywords: [], locations: [], remotePref: "no_preference" });
    expect((out as unknown as Record<string, unknown>).junk).toBeUndefined();
    expect((out.jobPrefs as unknown as Record<string, unknown>).minMatchScore).toBeUndefined();
    expect((out.identity as unknown as Record<string, unknown>).injected).toBeUndefined();
  });
});

describe("tejasDefaults parity (drift guard)", () => {
  it("titleKeywords/locations mirror OWNER_PREFS exactly", () => {
    const t = tejasDefaults();
    expect(t.jobPrefs.titleKeywords).toEqual([...OWNER_PREFS.titleKeywords]);
    expect(t.jobPrefs.locations).toEqual([...OWNER_PREFS.locations]);
  });

  it("voice/about mirror the knowledge.ts constants verbatim", () => {
    const t = tejasDefaults();
    expect(t.voice).toBe(VOICE);
    expect(t.about).toBe(ABOUT);
  });

  it("is a valid, round-trippable UserPrefs (remotePref onsite_ok)", () => {
    const t = tejasDefaults();
    expect(t.jobPrefs.remotePref).toBe("onsite_ok");
    // It parses through the schema unchanged (no drift from the v1 shape).
    expect(prefsOrNeutral(JSON.stringify(t))).toEqual(t);
  });
});

describe("serializePrefs (write-size guard)", () => {
  it("serializes a normal prefs object", () => {
    expect(JSON.parse(serializePrefs(neutralDefaults()))).toEqual(neutralDefaults());
  });

  it("throws when the serialized JSON exceeds the cap (>90k)", () => {
    const huge: UserPrefs = {
      ...neutralDefaults(),
      about: "x".repeat(PREFS_MAX_CHARS + 1),
    };
    expect(() => serializePrefs(huge)).toThrow();
  });
});
