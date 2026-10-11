import { fetchJson, MAX_VIDEO_RESULTS, type VideoSource } from "./shared.js";

type Rendition = { url: string; thumbnail: string };
type Hit = { id: number; pageURL: string; tags: string; duration?: number; user: string; videos: { tiny?: Rendition; small?: Rendition } };

/** Stock clips. Unlike its images, Pixabay lets videos be linked directly, and their URLs do not expire. */
export const pixabayVideos: VideoSource = {
  id: "pixabay",
  isConfigured: () => Boolean(process.env.PIXABAY_API_KEY),
  async search(term) {
    const params = new URLSearchParams({ key: process.env.PIXABAY_API_KEY ?? "", q: term, lang: "en", safesearch: "true", per_page: String(MAX_VIDEO_RESULTS) });
    const body = await fetchJson<{ hits?: Hit[] }>(`https://pixabay.com/api/videos/?${params.toString()}`);
    return (body.hits ?? []).flatMap((hit) => {
      // "tiny" is the lightest rendition and still 360p–720p, plenty for a lesson card.
      const file = hit.videos.tiny?.url ? hit.videos.tiny : hit.videos.small;
      if (!file?.url) return [];
      return [{
        url: file.url,
        provider: "pixabay" as const,
        attribution: `Pixabay: ${hit.user}`,
        license: "Pixabay Content License",
        metadata: { kind: "file" as const, externalId: String(hit.id), thumbnailUrl: file.thumbnail || null, duration: hit.duration ?? null, title: hit.tags || null, pageUrl: hit.pageURL },
      }];
    });
  },
};
