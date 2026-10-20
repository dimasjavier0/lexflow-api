const REQUEST_TIMEOUT_MS = 10_000;

/** Supabase did not answer, or refused the deletion. */
export class SupabaseAdminError extends Error {}

/** The secret service-role key; only the server may hold it. Null when account deletion is not configured. */
export function supabaseServiceKey(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

/**
 * Deletes the sign-in account from Supabase Auth, together with its Google and Facebook identities.
 * A user Supabase no longer knows counts as deleted, so a retried request still succeeds.
 */
export async function deleteAuthUser(id: string, serviceKey: string): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  if (!supabaseUrl) throw new SupabaseAdminError("SUPABASE_URL is not set");

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${id}`, {
      method: "DELETE",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new SupabaseAdminError("Supabase did not answer");
  }
  if (!response.ok && response.status !== 404) throw new SupabaseAdminError(`Supabase answered ${response.status}`);
}
