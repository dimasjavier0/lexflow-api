import type { JWTPayload } from "jose";

export type ProviderProfile = { name: string | null; avatarUrl: string | null };

const MAX_NAME_LENGTH = 60;
const MAX_URL_LENGTH = 500;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hostname(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.hostname : null;
  } catch {
    return null;
  }
}

/** Name and picture of the Google or Facebook account, which Supabase copies into the access token on every sign-in. */
export function providerProfile(claims: JWTPayload): ProviderProfile {
  const metadata = (typeof claims.user_metadata === "object" && claims.user_metadata !== null ? claims.user_metadata : {}) as Record<string, unknown>;
  const picture = text(metadata.avatar_url) ?? text(metadata.picture);
  return {
    name: (text(metadata.full_name) ?? text(metadata.name))?.slice(0, MAX_NAME_LENGTH) ?? null,
    avatarUrl: picture && picture.length <= MAX_URL_LENGTH && hostname(picture) ? picture : null,
  };
}

/**
 * Google and Facebook serve account pictures from these hosts, so a stored one is a copy to keep
 * fresh rather than the learner's own choice. Facebook's links also expire after a while.
 */
function isProviderPicture(url: string): boolean {
  const host = hostname(url);
  return host !== null && [".googleusercontent.com", ".fbsbx.com", ".fbcdn.net"].some((suffix) => host.endsWith(suffix));
}

/**
 * What to copy from the sign-in account into a stored profile: the name when there is none,
 * and the picture unless the learner replaced it with an image of their own.
 */
export function providerProfilePatch(stored: ProviderProfile, provider: ProviderProfile): Partial<{ name: string; avatarUrl: string }> | null {
  const patch: Partial<{ name: string; avatarUrl: string }> = {};
  if (!stored.name && provider.name) patch.name = provider.name;
  if (provider.avatarUrl && provider.avatarUrl !== stored.avatarUrl && (!stored.avatarUrl || isProviderPicture(stored.avatarUrl))) patch.avatarUrl = provider.avatarUrl;
  return Object.keys(patch).length ? patch : null;
}
