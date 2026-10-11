import { createTtlCache } from "../lib/ttl-cache.js";
import { artistName, COMMONS_API, WIKIMEDIA_HEADERS as REQUEST_HEADERS } from "../lib/wikimedia.js";

const WIKTIONARY_API = "https://en.wiktionary.org/w/api.php";
const TIMEOUT_MS = 6000;
// Kept short: a slow check only costs the MP3 variant, never the recording.
const TRANSCODE_CHECK_TIMEOUT_MS = 2500;
const MAX_RESULTS = 12;
// Wikimedia rate-limits bursts, and admins retype and switch accents: remember each word for a while.
const cache = createTtlCache<RecordedAudio[]>(60 * 60 * 1000);

/** English pronunciation files: "En-us-apple.ogg" or Lingua Libre's "LL-Q1860 (eng)-Speaker-apple.wav". */
const ENGLISH_AUDIO_PATTERN = /^File:(?:En-|LL-Q1860 \(eng\)-).+\.(?:ogg|oga|wav|mp3|flac)$/i;
const ACCENT_PATTERN = /^File:En-([a-z]{2})-/i;
const LINGUA_LIBRE_PREFIX = "LL-Q1860 (eng)";

type WikiPage = {
  title: string;
  imageinfo?: Array<{
    url: string;
    descriptionurl: string;
    extmetadata?: { Artist?: { value: string }; LicenseShortName?: { value: string } };
  }>;
};

export type RecordedAudio = {
  url: string;
  provider: "wikimedia";
  /** "US", "UK", "AU"... or null when the file name does not say. */
  accent: string | null;
  metadata: { text: string; sourceUrl: string; license: string | null; artist: string | null };
};

function accentOf(title: string): string | null {
  const code = ACCENT_PATTERN.exec(title)?.[1].toUpperCase();
  return code === "GB" ? "UK" : code ?? null;
}

/** File pages matching a query, with their download info, or null when the request failed. */
async function fetchFilePages(api: string, query: Record<string, string>): Promise<WikiPage[] | null> {
  try {
    const params = new URLSearchParams({
      action: "query",
      prop: "imageinfo",
      iiprop: "url|extmetadata",
      iiextmetadatafilter: "Artist|LicenseShortName",
      format: "json",
      formatversion: "2",
      ...query,
    });
    const response = await fetch(`${api}?${params.toString()}`, { headers: REQUEST_HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) return null;
    const body = await response.json() as { query?: { pages?: WikiPage[] } };
    return body.query?.pages ?? [];
  } catch {
    return null;
  }
}

/**
 * Lingua Libre files are named "prefix-Speaker-word.wav". Searching for "run" also finds
 * "hit-and-run", so only names with nothing between the speaker and the exact word are kept.
 */
function isLinguaLibreRecordingOf(title: string, term: string): boolean {
  const name = title.replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "").replace(/_/g, " ");
  const prefix = `${LINGUA_LIBRE_PREFIX}-`;
  if (!name.startsWith(prefix)) return false;
  const rest = name.slice(prefix.length).toLowerCase();
  const suffix = `-${term.toLowerCase()}`;
  return rest.endsWith(suffix) && !rest.slice(0, -suffix.length).includes("-");
}

/**
 * Ogg does not play in every browser, so prefer the MP3 transcode Commons keeps next to the
 * original when it exists. WAV plays everywhere and is used as is, which saves a request.
 */
async function playableUrl(originalUrl: string): Promise<string> {
  const original = new URL(originalUrl);
  const cleanUrl = `${original.origin}${original.pathname}`;
  if (!/\.(ogg|oga|flac)$/i.test(cleanUrl)) return cleanUrl;
  const filename = original.pathname.split("/").pop() ?? "";
  const mp3Url = `${original.origin}${original.pathname.replace("/commons/", "/commons/transcoded/")}/${filename}.mp3`;
  const mp3 = await fetch(mp3Url, { method: "HEAD", headers: REQUEST_HEADERS, signal: AbortSignal.timeout(TRANSCODE_CHECK_TIMEOUT_MS) }).catch(() => null);
  return mp3?.ok ? mp3Url : cleanUrl;
}

/** Every English recording of the term, unsorted. Throws when Wikimedia could not be reached. */
async function loadRecordings(term: string): Promise<RecordedAudio[]> {
  const key = term.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  const [entryFiles, speakerFiles] = await Promise.all([
    // The recordings its English Wiktionary entry uses. Entries are case-sensitive and almost always lowercase.
    fetchFilePages(WIKTIONARY_API, { generator: "images", titles: [...new Set([term, key])].join("|"), gimlimit: "max" }),
    // Lingua Libre recordings by other speakers.
    fetchFilePages(COMMONS_API, { generator: "search", gsrnamespace: "6", gsrlimit: "50", gsrsearch: `intitle:"${term.replace(/"/g, "")}" intitle:"${LINGUA_LIBRE_PREFIX}" filetype:audio` }),
  ]);
  if (!entryFiles && !speakerFiles) throw new Error("Wikimedia is unavailable");

  const byTitle = new Map<string, WikiPage>();
  for (const page of entryFiles ?? []) {
    if (ENGLISH_AUDIO_PATTERN.test(page.title) && page.imageinfo?.[0]) byTitle.set(page.title, page);
  }
  for (const page of speakerFiles ?? []) {
    if (isLinguaLibreRecordingOf(page.title, term) && page.imageinfo?.[0]) byTitle.set(page.title, page);
  }

  const recordings = await Promise.all([...byTitle.values()].map(async (page) => {
    const info = page.imageinfo![0];
    return {
      url: await playableUrl(info.url),
      provider: "wikimedia" as const,
      accent: accentOf(page.title),
      metadata: {
        text: term,
        sourceUrl: info.descriptionurl,
        license: info.extmetadata?.LicenseShortName?.value ?? null,
        artist: info.extmetadata?.Artist ? artistName(info.extmetadata.Artist.value) : null,
      },
    };
  }));

  // A partial answer is worth showing but not remembering.
  if (entryFiles && speakerFiles) cache.set(key, recordings);
  return recordings;
}

/**
 * Human recordings of `term` hosted on Wikimedia Commons, with the requested accent first.
 * Nothing is downloaded: results link to Wikimedia.
 * Resolves to an empty list when there are none, and throws when Wikimedia cannot be reached.
 */
export async function findRecordedAudios(term: string, accent: "US" | "UK"): Promise<RecordedAudio[]> {
  const rank = (recording: RecordedAudio) => (recording.accent === accent ? 0 : recording.accent ? 1 : 2);
  return [...await loadRecordings(term.trim())]
    .sort((a, b) => rank(a) - rank(b) || a.metadata.sourceUrl.localeCompare(b.metadata.sourceUrl))
    .slice(0, MAX_RESULTS);
}
