/** Wikimedia asks API clients to identify themselves, ideally with a contact address. */
export const WIKIMEDIA_HEADERS = { "User-Agent": process.env.WIKIMEDIA_USER_AGENT ?? "LexFlow/0.1 (vocabulary learning app)" };

export const COMMONS_API = "https://commons.wikimedia.org/w/api.php";

/** The artist field is HTML on Commons, and Lingua Libre writes it as "Speaker: X Recorder: Y". */
export function artistName(html: string): string {
  const text = html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  return text.replace(/^Speaker:\s*/i, "").replace(/\s*Recorder:.*$/i, "");
}
