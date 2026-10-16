import { createHmac } from "node:crypto";
import { z } from "zod";

/** Pinned so a new Graph API release cannot change the answers under us. */
const GRAPH_URL = "https://graph.facebook.com/v26.0";
const REQUEST_TIMEOUT_MS = 10_000;
/** Facebook caps a friend list at 5000, which 50 pages of 100 cover. */
const FRIENDS_PAGE_SIZE = 100;
const MAX_FRIEND_PAGES = 50;
/** Graph errors that mean "slow down", not "bad token". */
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);

/** The token is invalid, expired, revoked or was issued to another app. */
export class FacebookTokenError extends Error {}
/** Facebook could not be reached or answered with a failure of its own. */
export class FacebookUnavailableError extends Error {}

export type FacebookAccount = {
  /** App-scoped user id: the same person has a different id in every app. */
  id: string;
  /** Whether the person let LexFlow read their friend list (`user_friends`). */
  friendsGranted: boolean;
  /** Ids of the friends who also signed in to LexFlow with Facebook and granted `user_friends`. */
  friendIds: string[];
};

const facebookIdSchema = z.string().regex(/^\d{1,30}$/);
const meSchema = z.object({ id: facebookIdSchema });
const permissionsSchema = z.object({ data: z.array(z.object({ permission: z.string(), status: z.string() })) });
const friendsPageSchema = z.object({
  data: z.array(z.object({ id: facebookIdSchema })),
  paging: z.object({ cursors: z.object({ after: z.string().optional() }).optional(), next: z.string().optional() }).optional(),
});
const graphErrorSchema = z.object({ error: z.object({ code: z.number().optional() }) });

/**
 * Signs each call with the app secret. Facebook rejects the call when the token was issued
 * to a different app, so a token from another app cannot pass for a LexFlow sign-in.
 */
function appSecretProof(accessToken: string, appSecret: string): string {
  return createHmac("sha256", appSecret).update(accessToken).digest("hex");
}

async function graphGet<T>(path: string, params: Record<string, string>, schema: z.ZodType<T>, accessToken: string, appSecret: string): Promise<T> {
  const url = new URL(`${GRAPH_URL}${path}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("appsecret_proof", appSecretProof(accessToken, appSecret));

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch {
    throw new FacebookUnavailableError(`Facebook did not answer ${path}`);
  }
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const code = graphErrorSchema.safeParse(body).data?.error.code;
    const isTokenProblem = response.status < 500 && (code === undefined || !RATE_LIMIT_CODES.has(code));
    throw isTokenProblem ? new FacebookTokenError(`Facebook rejected the token on ${path}`) : new FacebookUnavailableError(`Facebook answered ${response.status} on ${path}`);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new FacebookUnavailableError(`Unexpected Facebook answer on ${path}`);
  return parsed.data;
}

async function friendIds(accessToken: string, appSecret: string): Promise<string[]> {
  const ids: string[] = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_FRIEND_PAGES; page += 1) {
    const params: Record<string, string> = { fields: "id", limit: String(FRIENDS_PAGE_SIZE) };
    if (after) params.after = after;
    const body = await graphGet("/me/friends", params, friendsPageSchema, accessToken, appSecret);
    ids.push(...body.data.map((friend) => friend.id));
    after = body.paging?.cursors?.after;
    if (!body.paging?.next || !after) break;
  }
  return ids;
}

/** Who the token belongs to and which of their friends use LexFlow, read from the Graph API. */
export async function readFacebookAccount(accessToken: string, appSecret: string): Promise<FacebookAccount> {
  const [me, permissions] = await Promise.all([
    graphGet("/me", { fields: "id" }, meSchema, accessToken, appSecret),
    graphGet("/me/permissions", {}, permissionsSchema, accessToken, appSecret),
  ]);
  // The person can untick the friend list in Facebook's dialog, and Facebook does not ask
  // for it at all before App Review approves it (except for the app's own testers).
  const friendsGranted = permissions.data.some((row) => row.permission === "user_friends" && row.status === "granted");
  return { id: me.id, friendsGranted, friendIds: friendsGranted ? await friendIds(accessToken, appSecret) : [] };
}
