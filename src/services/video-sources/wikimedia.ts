import { artistName, COMMONS_API, WIKIMEDIA_HEADERS } from "../../lib/wikimedia.js";
import { fetchJson, type VideoSource } from "./shared.js";

type Derivative = { src: string; transcodekey?: string };
type CommonsPage = {
  pageid: number;
  title: string;
  /** Position in the search results. */
  index?: number;
  videoinfo?: Array<{
    url: string;
    descriptionurl: string;
    thumburl?: string;
    duration?: number;
    derivatives?: Derivative[];
    extmetadata?: { Artist?: { value: string }; LicenseShortName?: { value: string } };
  }>;
};

/** Seconds. Longer videos are rarely about a single word. */
const MAX_LENGTH_SECONDS = 300;
/** Lightest first: a lesson card does not need more than 480p. */
const PREFERRED_TRANSCODES = ["480p.vp9.webm", "360p.vp9.webm", "240p.vp9.webm"];

/** Freely licensed footage from Wikimedia Commons. No API key. */
export const wikimediaVideos: VideoSource = {
  id: "wikimedia",
  isConfigured: () => true,
  async search(term) {
    const params = new URLSearchParams({
      action: "query",
      generator: "search",
      gsrnamespace: "6",
      // More than needed, since long videos are dropped below.
      gsrlimit: "30",
      gsrsearch: `${term} filetype:video`,
      prop: "videoinfo",
      viprop: "url|derivatives|extmetadata|size",
      viurlwidth: "480",
      viextmetadatafilter: "Artist|LicenseShortName",
      format: "json",
      formatversion: "2",
    });
    const body = await fetchJson<{ query?: { pages?: CommonsPage[] } }>(`${COMMONS_API}?${params.toString()}`, WIKIMEDIA_HEADERS);
    return (body.query?.pages ?? [])
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .flatMap((page) => {
        const info = page.videoinfo?.[0];
        if (!info || (info.duration ?? 0) > MAX_LENGTH_SECONDS) return [];
        const transcode = PREFERRED_TRANSCODES.map((key) => info.derivatives?.find((item) => item.transcodekey === key)).find(Boolean);
        // The original carries tracking parameters; the bare path is the stable URL.
        const original = new URL(info.url);
        return [{
          url: transcode?.src ?? `${original.origin}${original.pathname}`,
          provider: "wikimedia" as const,
          attribution: info.extmetadata?.Artist ? `Wikimedia Commons: ${artistName(info.extmetadata.Artist.value)}` : "Wikimedia Commons",
          license: info.extmetadata?.LicenseShortName?.value ?? null,
          metadata: {
            kind: "file" as const,
            externalId: String(page.pageid),
            thumbnailUrl: info.thumburl ?? null,
            duration: info.duration ? Math.round(info.duration) : null,
            title: page.title.replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, ""),
            pageUrl: info.descriptionurl,
          },
        }];
      });
  },
};
