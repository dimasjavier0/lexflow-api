import { fetchJson, MAX_VIDEO_RESULTS, type VideoSource } from "./shared.js";

type VideoFile = { file_type: string; width: number | null; link: string };
type PexelsVideo = { id: number; url: string; image: string; duration: number; user: { name: string }; video_files: VideoFile[] };

const MIN_WIDTH = 640;

/** Stock clips. Needs a free API key (PEXELS_API_KEY). */
export const pexelsVideos: VideoSource = {
  id: "pexels",
  isConfigured: () => Boolean(process.env.PEXELS_API_KEY),
  async search(term) {
    const params = new URLSearchParams({ query: term, per_page: String(MAX_VIDEO_RESULTS), orientation: "landscape" });
    const body = await fetchJson<{ videos?: PexelsVideo[] }>(`https://api.pexels.com/videos/search?${params.toString()}`, { Authorization: process.env.PEXELS_API_KEY ?? "" });
    return (body.videos ?? []).flatMap((video) => {
      // The lightest MP4 that is still at least 640px wide, or the widest one available.
      const files = video.video_files.filter((file) => file.file_type === "video/mp4").sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
      const file = files.find((item) => (item.width ?? 0) >= MIN_WIDTH) ?? files.at(-1);
      if (!file) return [];
      return [{
        url: file.link,
        provider: "pexels" as const,
        attribution: `Pexels: ${video.user.name}`,
        license: "Pexels License",
        metadata: { kind: "file" as const, externalId: String(video.id), thumbnailUrl: video.image || null, duration: video.duration ?? null, title: null, pageUrl: video.url },
      }];
    });
  },
};
