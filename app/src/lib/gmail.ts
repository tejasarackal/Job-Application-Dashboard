// Gmail client. We use OAuth refresh-token flow (no browser auth needed
// once the user generates a refresh token once). Returns recent threads
// under the configured label ID.
import type { GmailThread } from "./types";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://gmail.googleapis.com/gmail/v1";

export function isConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN,
  );
}

let cachedAccessToken: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  // Cache for 50min (Google tokens are usually 1h).
  if (cachedAccessToken && cachedAccessToken.exp > Date.now()) {
    return cachedAccessToken.token;
  }
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`Google token ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = {
    token: json.access_token,
    exp: Date.now() + (json.expires_in - 60) * 1000,
  };
  return json.access_token;
}

interface ThreadsListResponse {
  threads?: Array<{ id: string; snippet: string; historyId: string }>;
}

interface MessageResponse {
  payload?: {
    headers?: Array<{ name: string; value: string }>;
  };
  snippet?: string;
  labelIds?: string[];
  internalDate?: string;
}

export async function recentThreads(limit = 15): Promise<GmailThread[]> {
  if (!isConfigured()) throw new Error("Gmail not configured");
  const token = await accessToken();
  const labelId = process.env.GMAIL_LABEL_ID || "Label_3";

  const listRes = await fetch(
    `${API}/users/me/threads?labelIds=${encodeURIComponent(labelId)}&maxResults=${limit}`,
    { headers: { Authorization: `Bearer ${token}` }, next: { revalidate: 60 } },
  );
  if (!listRes.ok) throw new Error(`Gmail list ${listRes.status}`);
  const list = (await listRes.json()) as ThreadsListResponse;
  const ids = (list.threads ?? []).map((t) => t.id);

  const threads = await Promise.all(
    ids.map(async (id): Promise<GmailThread | null> => {
      // Fetch the most recent message in each thread for the headers we need.
      const tRes = await fetch(
        `${API}/users/me/threads/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${token}` }, next: { revalidate: 60 } },
      );
      if (!tRes.ok) return null;
      const tJson = (await tRes.json()) as { messages?: MessageResponse[] };
      const last = tJson.messages?.[tJson.messages.length - 1];
      if (!last) return null;
      const headers = Object.fromEntries(
        (last.payload?.headers ?? []).map((h) => [h.name.toLowerCase(), h.value]),
      );
      return {
        id,
        subject: headers["subject"] ?? "(no subject)",
        from: headers["from"] ?? "—",
        date: headers["date"] ?? "",
        snippet: last.snippet ?? "",
        unread: (last.labelIds ?? []).includes("UNREAD"),
      };
    }),
  );
  return threads.filter((t): t is GmailThread => t !== null);
}
