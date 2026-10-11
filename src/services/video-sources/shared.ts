export const VIDEO_PROVIDERS = ["pixabay", "pexels", "dailymotion", "wikimedia", "youtube"] as const;
export type VideoProvider = (typeof VIDEO_PROVIDERS)[number];

/** A video found by a source, ready to preview and, if the admin keeps it, to store as a `Video` row. */
export type VideoCandidate = {
  /** The media file itself for `kind: "file"`, or the video's public page for `kind: "embed"`. */
  url: string;
  provider: VideoProvider;
  attribution: string | null;
  license: string | null;
  metadata: {
    kind: "file" | "embed";
    /** The provider's id of the video; embeds are built from it. */
    externalId: string;
    thumbnailUrl: string | null;
    /** Seconds. */
    duration: number | null;
    title: string | null;
    pageUrl: string;
  };
};

export type VideoSource = {
  id: VideoProvider;
  /** False while the source's API key is missing. */
  isConfigured(): boolean;
  /** Rejects when the provider cannot be reached or answers with an error. */
  search(term: string): Promise<VideoCandidate[]>;
};

export const MAX_VIDEO_RESULTS = 12;
const REQUEST_TIMEOUT_MS = 8000;

/** GETs JSON with a timeout. The error never carries the URL, which may hold an API key. */
export async function fetchJson<T>(url: string, headers?: Record<string, string>): Promise<T> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Video source answered ${response.status}`);
  return await response.json() as T;
}
