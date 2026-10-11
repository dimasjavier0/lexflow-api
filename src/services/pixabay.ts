/** `url` is a link Pixabay keeps alive for 24 hours only: download it before storing it. */
export type PixabayImage = { id: number; previewUrl: string; url: string; pageUrl: string; tags: string; user: string };

export type PixabaySearchResult =
  | { status: "ok"; totalHits: number; images: PixabayImage[] }
  | { status: "unconfigured" }
  | { status: "failed" };

type PixabayHit = { id: number; previewURL: string; webformatURL: string; pageURL: string; tags: string; user: string };

async function requestPixabay(query: Record<string, string>): Promise<PixabaySearchResult> {
  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) return { status: "unconfigured" };

  const params = new URLSearchParams({ key: apiKey, ...query });
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

export async function searchPixabay(query: string, options: { page?: number; perPage: number }): Promise<PixabaySearchResult> {
  return requestPixabay({
    q: query,
    lang: "en",
    image_type: "photo",
    orientation: "horizontal",
    safesearch: "true",
    per_page: String(options.perPage),
    page: String(options.page ?? 1),
  });
}

/** Best-effort lookup for automatic enrichment: any failure simply yields no images. */
export async function findPixabayImages(term: string): Promise<PixabayImage[]> {
  // Pixabay rejects per_page below 3, so ask for the minimum and keep two.
  const result = await searchPixabay(term, { perPage: 3 });
  return result.status === "ok" ? result.images.slice(0, 2) : [];
}

/** Looks an image up again by its Pixabay id, which yields a fresh download link. */
export async function findPixabayImageById(id: number): Promise<PixabayImage | null> {
  const result = await requestPixabay({ id: String(id) });
  return result.status === "ok" ? result.images[0] ?? null : null;
}
