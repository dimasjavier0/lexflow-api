import type { Request, Response } from "express";
import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { publicBaseUrl } from "../lib/public-url.js";
import { isPrismaError } from "../lib/prisma-errors.js";
import { normalizeTerm } from "../lib/text.js";
import { isUuid } from "../lib/validation.js";
import { generatePiperAudio } from "../services/piper.js";
import { findPixabayImages, searchPixabay } from "../services/pixabay.js";

dotenv.config({ path: path.resolve(process.cwd(), ".env"), override: true });

const collectionSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z.string().trim().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(500).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  isPublished: z.boolean().optional(),
});

const editCollectionSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullable().optional(),
  imageUrl: z.string().url().nullable(),
});

const wordSchema = z.object({
  term: z.string().trim().min(1).max(100),
  translationEs: z.string().trim().min(1).max(200),
  level: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).default("A1"),
  partOfSpeech: z.enum(["NOUN", "VERB", "ADJECTIVE", "ADVERB", "PRONOUN", "PREPOSITION", "CONJUNCTION", "DETERMINER", "INTERJECTION", "PHRASE"]).nullable().optional(),
  frequencyRank: z.number().int().min(1).max(1_000_000).nullable().optional(),
  images: z.array(z.object({
    url: z.string().url(),
    source: z.enum(["pixabay", "manual"]).default("pixabay"),
    attribution: z.string().trim().max(300).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })).max(4).optional(),
  isPublished: z.boolean().optional(),
});

const pixabaySearchSchema = z.object({
  q: z.string().trim().min(1).max(100),
  page: z.coerce.number().int().min(1).max(125).default(1),
});

const bulkWordsSchema = z.object({
  words: z.array(z.object({ term: z.string().trim().min(1).max(100), translationEs: z.string().trim().min(1).max(200) })).min(1).max(50),
  collectionName: z.string().trim().min(1).max(100).optional(),
  collectionSlug: z.string().trim().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
});

/** Shape of a word as the admin UI consumes it. */
const adminWordSelect = {
  id: true,
  term: true,
  translationEs: true,
  level: true,
  isPublished: true,
  partOfSpeech: true,
  frequencyRank: true,
  sentences: { orderBy: { position: "asc" }, select: { id: true, text: true, translationEs: true } },
  relationsFrom: { orderBy: { createdAt: "asc" }, select: { id: true, type: true, target: { select: { id: true, term: true } } } },
  images: { orderBy: { position: "asc" }, select: { id: true, url: true } },
  audios: { orderBy: { position: "asc" }, select: { id: true, url: true, voice: true, accent: true, provider: true } },
  videos: { orderBy: { position: "asc" }, select: { id: true, url: true } },
} as const;

type NewImage = { url: string; source: "pixabay" | "manual"; attribution?: string; metadata?: Record<string, unknown> };

function toImageRows(wordId: string, images: NewImage[]) {
  return images.map((image, index) => ({
    wordId,
    url: image.url,
    source: image.source,
    provider: image.source === "pixabay" ? "Pixabay" : undefined,
    attribution: image.attribution,
    metadata: image.metadata ? JSON.parse(JSON.stringify(image.metadata)) : undefined,
    position: index,
  }));
}

const sentenceSchema = z.object({
  text: z.string().trim().min(1).max(300),
  translationEs: z.string().trim().max(300).nullable().optional(),
});

const relationSchema = z.object({
  term: z.string().trim().min(1).max(100),
  type: z.enum(["SYNONYM", "ANTONYM", "DERIVED", "COLLOCATION", "PHRASAL", "RELATED"]),
});

const publicationSchema = z.object({ isPublished: z.boolean() });
const mediaSchema = z.object({
  type: z.enum(["image", "audio", "video"]),
  url: z.string().url(),
  source: z.string().trim().min(1).max(100).optional(),
  provider: z.string().trim().max(100).optional(),
  license: z.string().trim().max(200).optional(),
  attribution: z.string().trim().max(300).optional(),
});
const generateAudioSchema = z.object({
  accent: z.enum(["US", "UK"]).default("US"),
});
const fillMissingConfirmSchema = z.object({
  items: z.array(z.object({
    wordId: z.string().uuid(),
    images: z.array(z.object({ url: z.string().url(), attribution: z.string().optional(), metadata: z.record(z.string(), z.unknown()).optional() })).max(2),
    audio: z.object({ url: z.string().url(), provider: z.string(), voice: z.string(), accent: z.string(), metadata: z.record(z.string(), z.unknown()).optional() }).nullable(),
  })).max(50),
});

/** How many words are enriched (Pixabay + Piper) at the same time during a bulk import. */
const ENRICH_CONCURRENCY = 4;

/**
 * Existing words keyed by normalized term, so "Café", "cafe" and "CAFE" resolve to one word.
 * Loads every term: fine for a vocabulary-sized table, and it needs no database extension.
 */
async function loadWordIdsByTerm(): Promise<Map<string, string>> {
  const words = await prisma.word.findMany({ select: { id: true, term: true }, orderBy: { createdAt: "asc" } });
  const byTerm = new Map<string, string>();
  for (const word of words) {
    const key = normalizeTerm(word.term);
    if (!byTerm.has(key)) byTerm.set(key, word.id);
  }
  return byTerm;
}

/** Runs `task` over `items` with at most `limit` in flight. */
async function runPooled<T>(items: T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await task(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export async function listAdminCollections(_request: Request, response: Response): Promise<void> {
  const collections = await prisma.collection.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { words: true } } },
  });
  response.status(200).json({ collections });
}

export async function searchAdminPixabay(request: Request, response: Response): Promise<void> {
  const parsed = pixabaySearchSchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ message: "Invalid Pixabay search" });
    return;
  }

  const result = await searchPixabay(parsed.data.q, { page: parsed.data.page, perPage: 4 });
  if (result.status === "unconfigured") {
    response.status(503).json({ message: "Pixabay is not configured" });
    return;
  }
  if (result.status === "failed") {
    response.status(502).json({ message: "Pixabay search failed" });
    return;
  }

  response.status(200).json({ totalHits: result.totalHits, images: result.images });
}

export async function createAdminCollection(request: Request, response: Response): Promise<void> {
  const parsed = collectionSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "Invalid collection data", issues: parsed.error.issues });
    return;
  }

  try {
    const collection = await prisma.collection.create({ data: parsed.data });
    response.status(201).json({ collection });
  } catch (error) {
    if (isPrismaError(error, "P2002")) {
      response.status(409).json({ message: "Collection slug already exists" });
      return;
    }
    throw error;
  }
}

export async function listAdminWords(request: Request, response: Response): Promise<void> {
  const collectionId = request.params.collectionId;
  if (!isUuid(collectionId)) {
    response.status(400).json({ message: "Invalid collection id" });
    return;
  }

  const words = await prisma.collectionWord.findMany({
    where: { collectionId },
    orderBy: { position: "asc" },
    select: {
      position: true,
      word: {
        select: adminWordSelect,
      },
    },
  });

  response.status(200).json({ words });
}

export async function createAdminWord(request: Request, response: Response): Promise<void> {
  const collectionId = request.params.collectionId;
  if (!isUuid(collectionId)) {
    response.status(400).json({ message: "Invalid collection id" });
    return;
  }

  const parsed = wordSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "Invalid word data", issues: parsed.error.issues });
    return;
  }

  const collection = await prisma.collection.findUnique({ where: { id: collectionId }, select: { id: true } });
  if (!collection) {
    response.status(404).json({ message: "Collection not found" });
    return;
  }

  // Words are shared between collections: reusing a term refreshes its
  // translation and level but must not unpublish it elsewhere.
  // The term is matched ignoring accents and case, keeping the spelling already stored.
  const existingWordId = (await loadWordIdsByTerm()).get(normalizeTerm(parsed.data.term));
  const word = existingWordId
    ? await prisma.word.update({
      where: { id: existingWordId },
      data: { translationEs: parsed.data.translationEs, level: parsed.data.level, partOfSpeech: parsed.data.partOfSpeech, frequencyRank: parsed.data.frequencyRank },
    })
    : await prisma.word.create({
      data: {
        term: parsed.data.term,
        translationEs: parsed.data.translationEs,
        level: parsed.data.level,
        partOfSpeech: parsed.data.partOfSpeech,
        frequencyRank: parsed.data.frequencyRank,
        isPublished: parsed.data.isPublished ?? false,
      },
    });

  const existing = await prisma.collectionWord.findUnique({
    where: { collectionId_wordId: { collectionId, wordId: word.id } },
  });
  if (existing) {
    response.status(409).json({ message: "Word already belongs to this collection" });
    return;
  }

  const lastWord = await prisma.collectionWord.findFirst({
    where: { collectionId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  if (parsed.data.images?.length) {
    const existingImages = await prisma.image.count({ where: { wordId: word.id } });
    await prisma.image.createMany({
      data: toImageRows(word.id, parsed.data.images).map((row) => ({ ...row, position: existingImages + row.position })),
    });
  }

  const relation = await prisma.collectionWord.create({
    data: { collectionId, wordId: word.id, position: (lastWord?.position ?? 0) + 1 },
    select: {
      position: true,
      word: {
        select: adminWordSelect,
      },
    },
  });

  response.status(201).json({ word: relation });
}

export async function createAdminWordsBulk(request: Request, response: Response): Promise<void> {
  const collectionId = request.params.collectionId;
  if (collectionId !== "new" && !isUuid(collectionId)) {
    response.status(400).json({ message: "Invalid collection id" });
    return;
  }

  const parsed = bulkWordsSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "Invalid word list", issues: parsed.error.issues });
    return;
  }

  let targetCollectionId = collectionId;
  let collectionCreated = false;
  if (collectionId === "new") {
    const { collectionName, collectionSlug } = parsed.data;
    if (!collectionName || !collectionSlug) {
      response.status(400).json({ message: "A new collection requires name and slug" });
      return;
    }
    // A list named like an existing collection (ignoring accents and case) is added to it.
    const nameKey = normalizeTerm(collectionName);
    const collections = await prisma.collection.findMany({ select: { id: true, name: true, slug: true } });
    const match = collections.find((collection) => normalizeTerm(collection.name) === nameKey || collection.slug === collectionSlug);
    if (match) {
      targetCollectionId = match.id;
    } else {
      const collection = await prisma.collection.create({ data: { name: collectionName, slug: collectionSlug, isPublished: false }, select: { id: true } });
      targetCollectionId = collection.id;
      collectionCreated = true;
    }
  } else {
    const collection = await prisma.collection.findUnique({ where: { id: collectionId }, select: { id: true } });
    if (!collection) {
      response.status(404).json({ message: "Collection not found" });
      return;
    }
  }

  // Repeated terms inside the list keep their first appearance.
  const entries = new Map<string, { term: string; translationEs: string }>();
  for (const word of parsed.data.words) {
    const key = normalizeTerm(word.term);
    if (key && !entries.has(key)) entries.set(key, word);
  }

  const wordIdsByTerm = await loadWordIdsByTerm();
  const newEntries = [...entries].filter(([key]) => !wordIdsByTerm.has(key));
  const linkedWordIds = await prisma.$transaction(async (transaction) => {
    if (newEntries.length) {
      const created = await transaction.word.createManyAndReturn({
        data: newEntries.map(([, word]) => ({ term: word.term, translationEs: word.translationEs, level: "A1" as const, isPublished: false })),
        select: { id: true, term: true },
      });
      for (const word of created) wordIdsByTerm.set(normalizeTerm(word.term), word.id);
    }

    const links = await transaction.collectionWord.findMany({ where: { collectionId: targetCollectionId }, select: { wordId: true, position: true } });
    const alreadyLinked = new Set(links.map((link) => link.wordId));
    let position = Math.max(0, ...links.map((link) => link.position));
    // Map order is list order, so words keep the position they had in the list.
    const toLink = [...entries.keys()].map((key) => wordIdsByTerm.get(key)).filter((wordId): wordId is string => wordId !== undefined && !alreadyLinked.has(wordId));
    if (toLink.length) {
      await transaction.collectionWord.createMany({ data: toLink.map((wordId) => ({ collectionId: targetCollectionId, wordId, position: ++position })) });
    }
    return toLink;
  });

  // Words reused from other collections may already have media: only fill what is missing.
  const baseUrl = publicBaseUrl(request);
  const linked = await prisma.word.findMany({ where: { id: { in: linkedWordIds } }, select: { id: true, term: true, _count: { select: { images: true, audios: true } } } });
  let failedAudio = 0;
  await runPooled(linked, ENRICH_CONCURRENCY, async (word) => {
    if (word._count.images === 0) {
      const images = await findPixabayImages(word.term);
      if (images.length) await prisma.image.createMany({ data: images.map((image, index) => ({ wordId: word.id, url: image.url, source: "pixabay", provider: "Pixabay", attribution: `Pixabay: ${image.user}`, metadata: { id: image.id, pageUrl: image.pageUrl, tags: image.tags }, position: index })) });
    }
    if (word._count.audios === 0) {
      try {
        const audio = await generatePiperAudio(baseUrl, word.id, word.term, "US");
        await prisma.audio.create({ data: { wordId: word.id, ...audio } });
      } catch { failedAudio += 1; }
    }
  });

  const enriched = await prisma.word.findMany({ where: { id: { in: linkedWordIds } }, select: adminWordSelect });
  const order = new Map(linkedWordIds.map((wordId, index) => [wordId, index]));
  enriched.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  response.status(201).json({ words: enriched, skipped: entries.size - linkedWordIds.length, received: entries.size, failedAudio, collectionId: targetCollectionId, collectionCreated });
}

export async function fillMissingAdminImages(request: Request, response: Response): Promise<void> {
  const collectionId = request.params.collectionId;
  if (!isUuid(collectionId)) {
    response.status(400).json({ message: "Invalid collection id" });
    return;
  }

  const words = await prisma.collectionWord.findMany({ where: { collectionId }, select: { word: { select: { id: true, term: true, _count: { select: { images: true, audios: true } } } } } });
  const missing = words.filter(({ word }) => word._count.images === 0 || word._count.audios === 0);
  const previews: Array<{ wordId: string; term: string; images: Array<{ url: string; attribution: string; metadata: Record<string, unknown> }>; audio: { url: string; provider: string; voice: string; accent: string; metadata: Record<string, unknown> } | null }> = [];
  for (const item of missing) {
    const images = await findPixabayImages(item.word.term);
    let audio = null;
    if (item.word._count.audios === 0) {
      try { audio = await generatePiperAudio(publicBaseUrl(request), item.word.id, item.word.term, "US"); } catch { audio = null; }
    }
    previews.push({ wordId: item.word.id, term: item.word.term, images: item.word._count.images === 0 ? images.slice(0, 2).map((image) => ({ url: image.url, attribution: `Pixabay: ${image.user}`, metadata: { id: image.id, pageUrl: image.pageUrl, tags: image.tags } })) : [], audio });
  }
  response.status(200).json({ previews, scanned: words.length });
}

export async function confirmMissingAdminImages(request: Request, response: Response): Promise<void> {
  const collectionId = request.params.collectionId;
  const parsed = fillMissingConfirmSchema.safeParse(request.body);
  if (!isUuid(collectionId) || !parsed.success) { response.status(400).json({ message: "Invalid maintenance preview" }); return; }
  const allowed = new Set((await prisma.collectionWord.findMany({ where: { collectionId }, select: { wordId: true } })).map((item) => item.wordId));
  let saved = 0;
  for (const item of parsed.data.items) {
    if (!allowed.has(item.wordId)) continue;
    const existingImages = await prisma.image.count({ where: { wordId: item.wordId } });
    if (existingImages === 0 && item.images.length) await prisma.image.createMany({ data: item.images.slice(0, 2).map((image, index) => ({ wordId: item.wordId, url: image.url, source: "pixabay", provider: "Pixabay", attribution: image.attribution, metadata: image.metadata ? JSON.parse(JSON.stringify(image.metadata)) : undefined, position: index })) });
    const existingAudio = await prisma.audio.count({ where: { wordId: item.wordId } });
    if (existingAudio === 0 && item.audio) await prisma.audio.create({ data: { wordId: item.wordId, ...item.audio, metadata: item.audio.metadata ? JSON.parse(JSON.stringify(item.audio.metadata)) : undefined } });
    saved += 1;
  }
  response.status(200).json({ saved });
}

export async function updateCollectionPublication(request: Request, response: Response): Promise<void> {
  const collectionId = request.params.collectionId;
  const parsed = publicationSchema.safeParse(request.body);
  if (!isUuid(collectionId) || !parsed.success) {
    response.status(400).json({ message: "Invalid publication data" });
    return;
  }

  const collection = await prisma.collection.update({ where: { id: collectionId }, data: parsed.data });
  response.status(200).json({ collection });
}

export async function updateWordPublication(request: Request, response: Response): Promise<void> {
  const wordId = request.params.wordId;
  const parsed = publicationSchema.safeParse(request.body);
  if (!isUuid(wordId) || !parsed.success) {
    response.status(400).json({ message: "Invalid publication data" });
    return;
  }

  const word = await prisma.word.update({ where: { id: wordId }, data: parsed.data });
  response.status(200).json({ word });
}

export async function updateCollectionWordsPublication(request: Request, response: Response): Promise<void> {
  const collectionId = request.params.collectionId;
  const parsed = publicationSchema.safeParse(request.body);
  if (!isUuid(collectionId) || !parsed.success) {
    response.status(400).json({ message: "Invalid publication data" });
    return;
  }

  const result = await prisma.word.updateMany({
    where: { collections: { some: { collectionId } } },
    data: parsed.data,
  });
  response.status(200).json({ updated: result.count });
}

export async function updateAdminWord(request: Request, response: Response): Promise<void> {
  const wordId = request.params.wordId;
  const parsed = wordSchema.partial().safeParse(request.body);
  if (!isUuid(wordId) || !parsed.success) {
    response.status(400).json({ message: "Invalid word data", issues: parsed.success ? undefined : parsed.error.issues });
    return;
  }

  const { images, ...wordData } = parsed.data;
  const word = await prisma.$transaction(async (transaction) => {
    const updatedWord = await transaction.word.update({
      where: { id: wordId },
      data: wordData,
    });

    if (images?.length) {
      const existingImages = await transaction.image.findMany({
        where: { wordId, url: { in: images.map((image) => image.url) } },
        select: { url: true },
      });
      const existingUrls = new Set(existingImages.map((image) => image.url));
      const newImages = images.filter((image) => !existingUrls.has(image.url));
      if (newImages.length) {
        const existingCount = await transaction.image.count({ where: { wordId } });
        await transaction.image.createMany({
          data: toImageRows(wordId, newImages).map((row) => ({ ...row, position: existingCount + row.position })),
        });
      }
    }

    return transaction.word.findUniqueOrThrow({
      where: { id: updatedWord.id },
      select: adminWordSelect,
    });
  });
  response.status(200).json({ word });
}

export async function createAdminMedia(request: Request, response: Response): Promise<void> {
  const wordId = request.params.wordId;
  const parsed = mediaSchema.safeParse(request.body);
  if (!isUuid(wordId) || !parsed.success) {
    response.status(400).json({ message: "Invalid media data", issues: parsed.success ? undefined : parsed.error.issues });
    return;
  }

  const { type, ...data } = parsed.data;
  const word = await prisma.word.findUnique({ where: { id: wordId }, select: { id: true } });
  if (!word) {
    response.status(404).json({ message: "Word not found" });
    return;
  }

  const resource = type === "image"
    ? await prisma.image.create({ data: { wordId, url: data.url, source: data.source ?? "manual", provider: data.provider, license: data.license, attribution: data.attribution } })
    : type === "audio"
      ? await prisma.audio.create({ data: { wordId, url: data.url, provider: data.provider } })
      : await prisma.video.create({ data: { wordId, url: data.url, source: data.source ?? "manual", provider: data.provider, license: data.license, attribution: data.attribution } });

  response.status(201).json({ resource });
}

export async function uploadAdminImage(request: Request, response: Response): Promise<void> {
  const wordId = request.params.wordId;
  if (!isUuid(wordId) || !request.file) {
    response.status(400).json({ message: "An image file is required" });
    return;
  }

  const word = await prisma.word.findUnique({ where: { id: wordId }, select: { id: true } });
  if (!word) {
    response.status(404).json({ message: "Word not found" });
    return;
  }

  const image = await prisma.image.create({
    data: {
      wordId,
      url: `${publicBaseUrl(request)}/uploads/${request.file.filename}`,
      source: "local-upload",
      metadata: { originalName: request.file.originalname, mimeType: request.file.mimetype },
    },
  });

  response.status(201).json({ image });
}

export async function deleteAdminImage(request: Request, response: Response): Promise<void> {
  const imageId = request.params.imageId;
  if (!isUuid(imageId)) {
    response.status(400).json({ message: "Invalid image id" });
    return;
  }

  const image = await prisma.image.findUnique({ where: { id: imageId }, select: { id: true } });
  if (!image) {
    response.status(404).json({ message: "Image not found" });
    return;
  }

  await prisma.image.delete({ where: { id: imageId } });
  response.status(204).send();
}

export async function deleteAdminVideo(request: Request, response: Response): Promise<void> {
  const videoId = request.params.videoId;
  if (!isUuid(videoId)) {
    response.status(400).json({ message: "Invalid video id" });
    return;
  }

  const video = await prisma.video.findUnique({ where: { id: videoId }, select: { id: true } });
  if (!video) {
    response.status(404).json({ message: "Video not found" });
    return;
  }

  await prisma.video.delete({ where: { id: videoId } });
  response.status(204).send();
}

export async function createAdminSentence(request: Request, response: Response): Promise<void> {
  const wordId = request.params.wordId;
  const parsed = sentenceSchema.safeParse(request.body);
  if (!isUuid(wordId) || !parsed.success) {
    response.status(400).json({ message: "Invalid sentence data" });
    return;
  }

  const word = await prisma.word.findUnique({ where: { id: wordId }, select: { _count: { select: { sentences: true } } } });
  if (!word) {
    response.status(404).json({ message: "Word not found" });
    return;
  }

  const sentence = await prisma.exampleSentence.create({
    data: { wordId, text: parsed.data.text, translationEs: parsed.data.translationEs || null, position: word._count.sentences },
    select: { id: true, text: true, translationEs: true },
  });
  response.status(201).json({ sentence });
}

export async function deleteAdminSentence(request: Request, response: Response): Promise<void> {
  const sentenceId = request.params.sentenceId;
  if (!isUuid(sentenceId)) {
    response.status(400).json({ message: "Invalid sentence id" });
    return;
  }

  await prisma.exampleSentence.delete({ where: { id: sentenceId } });
  response.status(204).send();
}

export async function createAdminRelation(request: Request, response: Response): Promise<void> {
  const wordId = request.params.wordId;
  const parsed = relationSchema.safeParse(request.body);
  if (!isUuid(wordId) || !parsed.success) {
    response.status(400).json({ message: "Invalid relationship data" });
    return;
  }

  const target = await prisma.word.findFirst({ where: { term: { equals: parsed.data.term, mode: "insensitive" } }, select: { id: true } });
  if (!target) {
    response.status(404).json({ message: "Related word not found" });
    return;
  }
  if (target.id === wordId) {
    response.status(400).json({ message: "A word cannot be related to itself" });
    return;
  }

  // A duplicate (same pair and type) surfaces as a 409 through the unique constraint.
  const relation = await prisma.wordRelationship.create({
    data: { sourceWordId: wordId, targetWordId: target.id, type: parsed.data.type },
    select: { id: true, type: true, target: { select: { id: true, term: true } } },
  });
  response.status(201).json({ relation });
}

export async function deleteAdminRelation(request: Request, response: Response): Promise<void> {
  const relationId = request.params.relationId;
  if (!isUuid(relationId)) {
    response.status(400).json({ message: "Invalid relationship id" });
    return;
  }

  await prisma.wordRelationship.delete({ where: { id: relationId } });
  response.status(204).send();
}

export async function deleteAdminCollection(request: Request, response: Response): Promise<void> {
  const collectionId = request.params.collectionId;
  if (!isUuid(collectionId)) {
    response.status(400).json({ message: "Invalid collection id" });
    return;
  }

  await prisma.$transaction(async (transaction) => {
    const links = await transaction.collectionWord.findMany({ where: { collectionId }, select: { wordId: true } });
    await transaction.collection.delete({ where: { id: collectionId } });
    // Words that only lived in this collection would be unreachable from the admin UI.
    await transaction.word.deleteMany({ where: { id: { in: links.map((link) => link.wordId) }, collections: { none: {} } } });
  });
  response.status(204).send();
}

export async function removeAdminCollectionWord(request: Request, response: Response): Promise<void> {
  const { collectionId, wordId } = request.params;
  if (!isUuid(collectionId) || !isUuid(wordId)) {
    response.status(400).json({ message: "Invalid collection or word id" });
    return;
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.collectionWord.delete({ where: { collectionId_wordId: { collectionId, wordId } } });
    await transaction.word.deleteMany({ where: { id: wordId, collections: { none: {} } } });
  });
  response.status(204).send();
}

export async function deleteAdminAudio(request: Request, response: Response): Promise<void> {
  const audioId = request.params.audioId;
  if (!isUuid(audioId)) {
    response.status(400).json({ message: "Invalid audio id" });
    return;
  }

  const audio = await prisma.audio.findUnique({ where: { id: audioId }, select: { id: true } });
  if (!audio) {
    response.status(404).json({ message: "Audio not found" });
    return;
  }

  await prisma.audio.delete({ where: { id: audioId } });
  response.status(204).send();
}

export async function updateAdminCollection(request: Request, response: Response): Promise<void> {
  const collectionId = request.params.collectionId;
  const parsed = editCollectionSchema.safeParse(request.body);
  if (!isUuid(collectionId) || !parsed.success) {
    response.status(400).json({ message: "Invalid collection data", issues: parsed.success ? undefined : parsed.error.issues });
    return;
  }

  const collection = await prisma.collection.update({ where: { id: collectionId }, data: parsed.data, include: { _count: { select: { words: true } } } });
  response.status(200).json({ collection });
}

export async function generateAdminAudio(request: Request, response: Response): Promise<void> {
  const wordId = request.params.wordId;
  const parsed = generateAudioSchema.safeParse(request.body);
  if (!isUuid(wordId) || !parsed.success) {
    response.status(400).json({ message: "Invalid audio generation data" });
    return;
  }

  const word = await prisma.word.findUnique({ where: { id: wordId }, select: { id: true, term: true } });
  if (!word) {
    response.status(404).json({ message: "Word not found" });
    return;
  }

  try {
    const generated = await generatePiperAudio(publicBaseUrl(request), word.id, word.term, parsed.data.accent);
    const audio = await prisma.audio.create({ data: { wordId: word.id, ...generated } });
  response.status(201).json({ audio });
  } catch (error) {
    response.status(503).json({ message: error instanceof Error ? error.message : "No se pudo generar el audio." });
  }
}