export type PixabayImage = { id: number; previewUrl: string; url: string; pageUrl: string; tags: string; user: string };

export type PixabaySearchResult =
  | { status: "ok"; totalHits: number; images: PixabayImage[] }
  | { status: "unconfigured" }
  | { status: "failed" };

type PixabayHit = { id: number; previewURL: string; webformatURL: string; pageURL: string; tags: string; user: string };

export async function searchPixabay(query: string, options: { page?: number; perPage: number }): Promise<PixabaySearchResult> {
  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) return { status: "unconfigured" };

  const params = new URLSearchParams({
    key: apiKey,
    q: query,
    lang: "en",
    image_type: "photo",
    orientation: "horizontal",
    safesearch: "true",
    per_page: String(options.perPage),
    page: String(options.page ?? 1),
  });
  try {
    const response = await fetch(`https://pixabay.com/api/?${params.toString()}`);
    if (!response.ok) return { status: "failed" };
    const body = await response.json() as { totalHits?: number; hits?: PixabayHit[] };
    return {
      status: "ok",
      totalHits: body.totalHits ?? 0,
      images: (body.hits ?? []).map((hit) => ({ id: hit.id, previewUrl: hit.previewURL, url: hit.webformatURL, pageUrl: hit.pageURL, tags: hit.tags, user: hit.user })),
    };
  } catch {
    return { status: "failed" };
  }
}

/** Best-effort lookup for automatic enrichment: any failure simply yields no images. */
export async function findPixabayImages(term: string): Promise<PixabayImage[]> {
  // Pixabay rejects per_page below 3, so ask for the minimum and keep two.
  const result = await searchPixabay(term, { perPage: 3 });
  return result.status === "ok" ? result.images.slice(0, 2) : [];
}
