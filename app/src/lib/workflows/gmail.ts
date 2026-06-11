// gmail.ts — minimal Gmail REST client (server-side). Read/search + draft/label;
// there is deliberately NO send path, and scope `gmail.modify` cannot send.
//
// Per-user (Phase 3b): getAccessToken accepts an explicit refresh token (the
// ACTOR's, decrypted) and caches the resulting access token per refresh token.
// With no argument it falls back to the owner's GOOGLE_REFRESH_TOKEN env (cron /
// owner). Each member run threads its own access token into the calls below, so
// a member's sync only ever touches the member's own mailbox.
import { createHash } from "crypto";

const tokenCache = new Map<string, { token: string; exp: number }>();

export async function getAccessToken(refreshToken?: string): Promise<string> {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  const refresh = refreshToken ?? process.env.GOOGLE_REFRESH_TOKEN;
  if (!id || !secret || !refresh) throw new Error("Gmail OAuth env not set (GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN)");

  // Cache per refresh token (hashed so plaintext secrets aren't used as keys).
  const cacheKey = refreshToken ? "u:" + createHash("sha256").update(refreshToken).digest("hex").slice(0, 24) : "owner";
  const c = tokenCache.get(cacheKey);
  if (c && c.exp > Date.now() + 60_000) return c.token;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Gmail token refresh ${res.status} (${(await res.text()).slice(0, 120)})`);
  const j = (await res.json()) as { access_token: string; expires_in?: number };
  const entry = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  tokenCache.set(cacheKey, entry);
  return entry.token;
}

export interface GmailMsg {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
}

export async function searchMessageIds(
  query: string,
  max = 20,
  accessToken?: string, // ACTOR's token (Phase 3b); omit → owner env token
): Promise<Array<{ id: string; threadId: string }>> {
  const token = accessToken ?? (await getAccessToken());
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", String(max));
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Gmail search ${res.status}`);
  const j = (await res.json()) as { messages?: Array<{ id: string; threadId: string }> };
  return j.messages ?? [];
}

export async function getMessage(id: string, accessToken?: string): Promise<GmailMsg> {
  const token = accessToken ?? (await getAccessToken());
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Gmail get ${res.status}`);
  const m = (await res.json()) as {
    id: string;
    threadId: string;
    snippet?: string;
    payload?: GmailPart;
  };
  const headers = headerMap(m.payload);
  return {
    id: m.id,
    threadId: m.threadId,
    from: headers["from"] ?? "",
    subject: headers["subject"] ?? "",
    date: headers["date"] ?? "",
    snippet: m.snippet ?? "",
    body: extractPlainBody(m.payload).slice(0, 4000),
  };
}

interface GmailPart {
  mimeType?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string };
  parts?: GmailPart[];
}

function headerMap(payload?: GmailPart): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of payload?.headers ?? []) out[h.name.toLowerCase()] = h.value;
  return out;
}

function extractPlainBody(payload?: GmailPart): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) return decodeB64(payload.body.data);
  for (const part of payload.parts ?? []) {
    if (part.mimeType === "text/plain" && part.body?.data) return decodeB64(part.body.data);
  }
  // Recurse into multipart containers; fall back to any text we can find.
  for (const part of payload.parts ?? []) {
    const b = extractPlainBody(part);
    if (b) return b;
  }
  if (payload.body?.data) return decodeB64(payload.body.data);
  return "";
}

function decodeB64(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

// ── Draft creation + labeling (Phase 2) ───────────────────────────────────────
// scope `gmail.modify`: can create drafts + apply labels, CANNOT send. There is
// deliberately no send path anywhere in this module.

function encodeB64Url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildMime(to: string, subject: string, body: string): string {
  // Encode the subject per RFC 2047 so non-ASCII survives; body is UTF-8 text.
  const encSubject = `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
  return [
    `To: ${to}`,
    `Subject: ${encSubject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
  ].join("\r\n");
}

export interface CreatedDraft {
  draftId: string;
  messageId: string;
  threadId: string;
}

// Creates a Gmail draft (never sends). The REST response carries the underlying
// message id directly, so we avoid the SOP's list_drafts message-id lookup.
export async function createDraft(to: string, subject: string, body: string, accessToken?: string): Promise<CreatedDraft> {
  const token = accessToken ?? (await getAccessToken());
  const raw = encodeB64Url(buildMime(to, subject, body));
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { raw } }),
  });
  if (!res.ok) throw new Error(`Gmail createDraft ${res.status} ${(await res.text()).slice(0, 160)}`);
  const j = (await res.json()) as { id: string; message?: { id: string; threadId: string } };
  return { draftId: j.id, messageId: j.message?.id ?? "", threadId: j.message?.threadId ?? "" };
}

// Returns the id of the named label, creating it if it doesn't exist.
export async function ensureLabel(name: string, accessToken?: string): Promise<string> {
  const token = accessToken ?? (await getAccessToken());
  const listRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listRes.ok) throw new Error(`Gmail labels ${listRes.status}`);
  const { labels = [] } = (await listRes.json()) as { labels?: Array<{ id: string; name: string }> };
  const found = labels.find((l) => l.name === name);
  if (found) return found.id;

  const createRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, labelListVisibility: "labelShow", messageListVisibility: "show" }),
  });
  if (!createRes.ok) throw new Error(`Gmail createLabel ${createRes.status}`);
  return ((await createRes.json()) as { id: string }).id;
}

export async function labelMessage(messageId: string, labelId: string, accessToken?: string): Promise<void> {
  if (!messageId) return;
  const token = accessToken ?? (await getAccessToken());
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ addLabelIds: [labelId] }),
  });
  if (!res.ok) throw new Error(`Gmail labelMessage ${res.status}`);
}
