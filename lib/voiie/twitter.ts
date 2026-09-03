// Twitter/X API v2 client -- recent-tweet search for hunting, and DMs for
// outreach + reading consultation replies.
//
// Setup: developer.twitter.com -> create a Project + App with
// Elevated/Pro access (DM endpoints need at least the Basic paid tier as
// of API v2) -> grab a Bearer Token (app-only, for search) and OAuth 1.0a
// user context keys (for sending DMs as your outreach account). Webhook
// (Account Activity API) points at /api/voiie/webhooks/twitter.

import crypto from "node:crypto";
import { TwitterApi } from "twitter-api-v2";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not configured.`);
  return v;
}

/** App-only client -- sufficient for recent-tweet search. */
export function getAppOnlyClient(): TwitterApi {
  return new TwitterApi(requireEnv("TWITTER_BEARER_TOKEN"));
}

/** User-context client (OAuth 1.0a) -- required to send DMs as your outreach account. */
export function getUserContextClient(): TwitterApi {
  return new TwitterApi({
    appKey: requireEnv("TWITTER_API_KEY"),
    appSecret: requireEnv("TWITTER_API_SECRET"),
    accessToken: requireEnv("TWITTER_ACCESS_TOKEN"),
    accessSecret: requireEnv("TWITTER_ACCESS_SECRET"),
  });
}

export interface FoundTweet {
  id: string;
  authorId: string;
  authorHandle: string;
  text: string;
  createdAt: string;
}

/**
 * Searches recent tweets (last 7 days -- the free/basic search window)
 * for the hunt query, e.g.
 *   (need website OR looking for developer OR need landing page) -is:retweet
 */
export async function searchTweets(query: string, maxResults = 20): Promise<FoundTweet[]> {
  const client = getAppOnlyClient().v2;
  const result = await client.search(query, {
    max_results: Math.min(Math.max(maxResults, 10), 100),
    "tweet.fields": ["author_id", "created_at"],
    expansions: ["author_id"],
    "user.fields": ["username"],
  });

  const users = new Map((result.includes?.users ?? []).map((u) => [u.id, u.username]));

  const tweets: FoundTweet[] = [];
  for await (const tweet of result) {
    tweets.push({
      id: tweet.id,
      authorId: tweet.author_id ?? "",
      authorHandle: users.get(tweet.author_id ?? "") ?? "unknown",
      text: tweet.text,
      createdAt: tweet.created_at ?? new Date().toISOString(),
    });
    if (tweets.length >= maxResults) break;
  }
  return tweets;
}

/** Sends a DM to a user by their numeric Twitter user id. */
export async function sendTwitterDM(recipientId: string, text: string): Promise<void> {
  const client = getUserContextClient().v2;
  await client.sendDmToParticipant(recipientId, { text });
}

/** Looks up a user id by @handle -- needed before sendTwitterDM, which is id-based. */
export async function lookupUserIdByHandle(handle: string): Promise<string | null> {
  const client = getAppOnlyClient().v2;
  const user = await client.userByUsername(handle.replace(/^@/, ""));
  return user.data?.id ?? null;
}

/** Reverse of the above -- incoming DM webhook events carry a numeric sender_id, not a handle. */
export async function lookupHandleByUserId(userId: string): Promise<string | null> {
  const client = getAppOnlyClient().v2;
  const user = await client.user(userId);
  return user.data?.username ? `@${user.data.username}` : null;
}

/** Verifies the CRC challenge Twitter's Account Activity API sends when (re-)validating the webhook URL. */
export function computeCrcResponse(crcToken: string): string {
  const hmac = crypto.createHmac("sha256", requireEnv("TWITTER_API_SECRET")).update(crcToken).digest("base64");
  return `sha256=${hmac}`;
}
