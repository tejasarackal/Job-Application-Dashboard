// Apollo API client. We only need a thin slice — list sequences and basic
// stats for the outreach health card.
import type { ApolloSequence } from "./types";

const API = "https://api.apollo.io/api/v1";

export function isConfigured(): boolean {
  return Boolean(process.env.APOLLO_API_KEY);
}

interface ApolloCampaignsResponse {
  emailer_campaigns?: Array<{
    id: string;
    name: string;
    active?: boolean;
    num_contacts?: number;
    num_messages_sent?: number;
    unique_opened_count?: number;
    unique_replied_count?: number;
  }>;
}

export async function listSequences(): Promise<ApolloSequence[]> {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error("Apollo not configured");

  const res = await fetch(`${API}/emailer_campaigns/search?per_page=25`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "x-api-key": key,
    },
    body: JSON.stringify({}),
    next: { revalidate: 120 },
  });
  if (!res.ok) throw new Error(`Apollo ${res.status}`);
  const json = (await res.json()) as ApolloCampaignsResponse;
  return (json.emailer_campaigns ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    active: Boolean(c.active),
    numContacts: c.num_contacts ?? 0,
    numSent: c.num_messages_sent,
    numOpened: c.unique_opened_count,
    numReplied: c.unique_replied_count,
  }));
}
