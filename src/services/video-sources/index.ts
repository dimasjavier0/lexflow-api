import { createTtlCache } from "../../lib/ttl-cache.js";
import { dailymotionVideos } from "./dailymotion.js";
import { pexelsVideos } from "./pexels.js";
import { pixabayVideos } from "./pixabay.js";
import { MAX_VIDEO_RESULTS, type VideoCandidate, type VideoProvider, type VideoSource } from "./shared.js";
import { wikimediaVideos } from "./wikimedia.js";
import { youtubeVideos } from "./youtube.js";

export { VIDEO_PROVIDERS, type VideoCandidate, type VideoProvider } from "./shared.js";

/** To add a source: write its module next to this file and register it here and in VIDEO_PROVIDERS. */
const SOURCES: Record<VideoProvider, VideoSource> = {
  pixabay: pixabayVideos,
  pexels: pexelsVideos,
  dailymotion: dailymotionVideos,
  wikimedia: wikimediaVideos,
  youtube: youtubeVideos,
};

export type VideoSearchResult =
  | { status: "ok"; videos: VideoCandidate[] }
  | { status: "unconfigured" }
  | { status: "failed" };

// Pixabay requires caching for 24 hours, and it spares YouTube's daily quota and Wikimedia's rate limit.
const cache = createTtlCache<VideoCandidate[]>(24 * 60 * 60 * 1000);

/** Videos about `term` from one source. Nothing is downloaded: results link to the provider. */
export async function searchVideos(provider: VideoProvider, term: string): Promise<VideoSearchResult> {
  const source = SOURCES[provider];
  if (!source.isConfigured()) return { status: "unconfigured" };

  const query = term.trim();
  const key = `${provider}:${query.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached) return { status: "ok", videos: cached };

  try {
    const videos = (await source.search(query)).slice(0, MAX_VIDEO_RESULTS);
    cache.set(key, videos);
    return { status: "ok", videos };
  } catch {
    return { status: "failed" };
  }
}
