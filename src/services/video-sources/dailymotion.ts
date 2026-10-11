import { fetchJson, MAX_VIDEO_RESULTS, type VideoSource } from "./shared.js";

type DailymotionVideo = { id: string; title: string; duration: number; thumbnail_360_url: string | null; allow_embed: boolean; "owner.screenname"?: string };

/** Minutes. Longer videos are rarely about a single word. */
const MAX_LENGTH_MINUTES = 5;

/**
 * Videos with speech, matched by title. Searching needs no API key; playing them inside the
 * app does need a Dailymotion player id on the web side (VITE_DAILYMOTION_PLAYER_ID).
 */
export const dailymotionVideos: VideoSource = {
  id: "dailymotion",
  isConfigured: () => true,
  async search(term) {
    const params = new URLSearchParams({
      search: term,
      fields: "id,title,duration,thumbnail_360_url,allow_embed,owner.screenname",
      languages: "en",
      family_filter: "true",
      shorter_than: String(MAX_LENGTH_MINUTES),
      // A few extra, since the ones that forbid embedding are dropped below.
      limit: String(MAX_VIDEO_RESULTS * 2),
    });
    const body = await fetchJson<{ list?: DailymotionVideo[] }>(`https://api.dailymotion.com/videos?${params.toString()}`);
    return (body.list ?? []).filter((video) => video.allow_embed).map((video) => ({
      url: `https://www.dailymotion.com/video/${video.id}`,
      provider: "dailymotion" as const,
      attribution: video["owner.screenname"] ? `Dailymotion: ${video["owner.screenname"]}` : "Dailymotion",
      license: null,
      metadata: { kind: "embed" as const, externalId: video.id, thumbnailUrl: video.thumbnail_360_url, duration: video.duration ?? null, title: video.title || null, pageUrl: `https://www.dailymotion.com/video/${video.id}` },
    }));
  },
};
