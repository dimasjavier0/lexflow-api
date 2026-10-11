import type { JWTPayload } from "jose";

export type GoogleProfile = { name: string | null; avatarUrl: string | null };

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

/** Name and picture of the Google account, which Supabase copies into the access token on every sign-in. */
export function googleProfile(claims: JWTPayload): GoogleProfile {
  const metadata = (typeof claims.user_metadata === "object" && claims.user_metadata !== null ? claims.user_metadata : {}) as Record<string, unknown>;
  const picture = text(metadata.avatar_url) ?? text(metadata.picture);
  return {
    name: (text(metadata.full_name) ?? text(metadata.name))?.slice(0, MAX_NAME_LENGTH) ?? null,
    avatarUrl: picture && picture.length <= MAX_URL_LENGTH && hostname(picture) ? picture : null,
  };
}

/** Google serves account pictures from here, so a stored one is a copy to keep fresh rather than the learner's own choice. */
function isGooglePicture(url: string): boolean {
  return hostname(url)?.endsWith(".googleusercontent.com") ?? false;
}

/**
 * What to copy from the Google account into a stored profile: the name when there is none,
 * and the picture unless the learner replaced it with an image of their own.
 */
export function googleProfilePatch(stored: GoogleProfile, google: GoogleProfile): Partial<{ name: string; avatarUrl: string }> | null {
  const patch: Partial<{ name: string; avatarUrl: string }> = {};
  if (!stored.name && google.name) patch.name = google.name;
  if (google.avatarUrl && google.avatarUrl !== stored.avatarUrl && (!stored.avatarUrl || isGooglePicture(stored.avatarUrl))) patch.avatarUrl = google.avatarUrl;
  return Object.keys(patch).length ? patch : null;
}
