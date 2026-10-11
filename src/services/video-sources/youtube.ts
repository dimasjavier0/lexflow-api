import { fetchJson, MAX_VIDEO_RESULTS, type VideoSource } from "./shared.js";

type SearchItem = { id: { videoId?: string }; snippet: { title: string; channelTitle: string; thumbnails?: { medium?: { url: string } } } };

/** Titles arrive HTML-escaped. */
function decodeEntities(text: string): string {
  return text.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/**
 * Matched by title, not by what is said. Needs a free API key (YOUTUBE_API_KEY); every
 * search spends 100 of the 10,000 daily quota units, which is why results are cached.
 */
export const youtubeVideos: VideoSource = {
  id: "youtube",
  isConfigured: () => Boolean(process.env.YOUTUBE_API_KEY),
  async search(term) {
    const params = new URLSearchParams({
      key: process.env.YOUTUBE_API_KEY ?? "",
      part: "snippet",
      type: "video",
      // The bare word mostly finds songs and brands; this steers towards vocabulary videos.
      q: `${term} meaning in English`,
      maxResults: String(MAX_VIDEO_RESULTS),
      videoEmbeddable: "true",
      videoDuration: "short",
      safeSearch: "strict",
      relevanceLanguage: "en",
    });
    const body = await fetchJson<{ items?: SearchItem[] }>(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);
    return (body.items ?? []).flatMap((item) => {
      const id = item.id.videoId;
      if (!id) return [];
      const pageUrl = `https://www.youtube.com/watch?v=${id}`;
      return [{
        url: pageUrl,
        provider: "youtube" as const,
        attribution: `YouTube: ${decodeEntities(item.snippet.channelTitle)}`,
        license: null,
        metadata: { kind: "embed" as const, externalId: id, thumbnailUrl: item.snippet.thumbnails?.medium?.url ?? null, duration: null, title: decodeEntities(item.snippet.title), pageUrl },
      }];
    });
  },
};
