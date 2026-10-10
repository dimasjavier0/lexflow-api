import type { Request, Response } from "express";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { once } from "node:events";
import dotenv from "dotenv";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { uploadDirectory } from "../middleware/image-upload.js";

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

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function translateTerm(term: string): Promise<string> {
  try {
    const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(term)}&langpair=en|es`);
    const body = await response.json() as { responseData?: { translatedText?: string } };
    return body.responseData?.translatedText?.trim() || term;
  } catch {
    return term;
  }
}

async function searchPixabayImages(term: string): Promise<Array<{ id: number; url: string; pageUrl: string; tags: string; user: string }>> {
  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) return [];
  const params = new URLSearchParams({ key: apiKey, q: term, lang: "en", image_type: "photo", orientation: "horizontal", safesearch: "true", per_page: "2", page: "1" });
  try {
    const response = await fetch(`https://pixabay.com/api/?${params.toString()}`);
    if (!response.ok) return [];
    const body = await response.json() as { hits?: Array<{ id: number; webformatURL: string; pageURL: string; tags: string; user: string }> };
    return (body.hits ?? []).map((image) => ({ id: image.id, url: image.webformatURL, pageUrl: image.pageURL, tags: image.tags, user: image.user }));
  } catch {
    return [];
  }
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

  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) {
    response.status(503).json({ message: "Pixabay is not configured" });
    return;
  }

  const params = new URLSearchParams({ key: apiKey, q: parsed.data.q, lang: "en", image_type: "photo", orientation: "horizontal", safesearch: "true", per_page: "4", page: String(parsed.data.page) });
  const pixabayResponse = await fetch(`https://pixabay.com/api/?${params.toString()}`);
  if (!pixabayResponse.ok) {
    response.status(502).json({ message: "Pixabay search failed" });
    return;
  }

  const body = await pixabayResponse.json() as { totalHits?: number; hits?: Array<{ id: number; previewURL: string; webformatURL: string; pageURL: string; tags: string; user: string }> };
  response.status(200).json({
    totalHits: body.totalHits ?? 0,
    images: (body.hits ?? []).map((image) => ({ id: image.id, previewUrl: image.previewURL, url: image.webformatURL, pageUrl: image.pageURL, tags: image.tags, user: image.user })),
  });
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
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      response.status(409).json({ message: "Collection slug already exists" });
      return;
    }
    throw error;
  }
}

export async function listAdminWords(request: Request, response: Response): Promise<void> {
  const collectionId = request.params.collectionId;
  if (typeof collectionId !== "string" || !uuidPattern.test(collectionId)) {
    response.status(400).json({ message: "Invalid collection id" });
    return;
  }

  const words = await prisma.collectionWord.findMany({
    where: { collectionId },
    orderBy: { position: "asc" },
    select: {
      position: true,
      word: {
        select: {
          id: true,
          term: true,
          translationEs: true,
          level: true,
          isPublished: true,
          images: { orderBy: { position: "asc" }, select: { id: true, url: true } },
          audios: { orderBy: { position: "asc" }, select: { id: true, url: true, voice: true, accent: true, provider: true } },
          videos: { orderBy: { position: "asc" }, select: { id: true, url: true } },
        },
      },
    },
  });

  response.status(200).json({ words });
}

export async function createAdminWord(request: Request, response: Response): Promise<void> {
  const collectionId = request.params.collectionId;
  if (typeof collectionId !== "string" || !uuidPattern.test(collectionId)) {
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

  const word = await prisma.word.upsert({
    where: { term: parsed.data.term },
    update: {
      translationEs: parsed.data.translationEs,
      level: parsed.data.level,
      isPublished: parsed.data.isPublished ?? false,
    },
    create: {
      term: parsed.data.term,
      translationEs: parsed.data.translationEs,
      level: parsed.data.level,
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
    await prisma.image.createMany({
      data: parsed.data.images.map((image, index) => ({
        wordId: word.id,
        url: image.url,
        source: image.source,
        provider: image.source === "pixabay" ? "Pixabay" : undefined,
        attribution: image.attribution,
        metadata: image.metadata ? JSON.parse(JSON.stringify(image.metadata)) : undefined,
        position: index,
      })),
    });
  }

  const relation = await prisma.collectionWord.create({
    data: { collectionId, wordId: word.id, position: (lastWord?.position ?? 0) + 1 },
    select: {
      position: true,
      word: {
        select: {
          id: true,
          term: true,
          translationEs: true,
          level: true,
          isPublished: true,
          images: { orderBy: { position: "asc" }, select: { id: true, url: true } },
          audios: { orderBy: { position: "asc" }, select: { id: true, url: true, voice: true, accent: true, provider: true } },
          videos: { orderBy: { position: "asc" }, select: { id: true, url: true } },
        },
      },
    },
  });

  response.status(201).json({ word: relation });
}

export async function createAdminWordsBulk(request: Request, response: Response): Promise<void> {
  const collectionId = request.params.collectionId;
  if (typeof collectionId !== "string" || (collectionId !== "new" && !uuidPattern.test(collectionId))) {
    response.status(400).json({ message: "Invalid collection id" });
    return;
  }

  const parsed = bulkWordsSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "Invalid word list", issues: parsed.error.issues });
    return;
  }

  let targetCollectionId = collectionId;
  if (collectionId === "new") {
    if (!parsed.data.collectionName || !parsed.data.collectionSlug) {
      response.status(400).json({ message: "A new collection requires name and slug" });
      return;
    }
    const collection = await prisma.collection.upsert({ where: { slug: parsed.data.collectionSlug }, update: {}, create: { name: parsed.data.collectionName, slug: parsed.data.collectionSlug, isPublished: false }, select: { id: true } });
    targetCollectionId = collection.id;
  } else {
    const collection = await prisma.collection.findUnique({ where: { id: collectionId }, select: { id: true } });
    if (!collection) {
      response.status(404).json({ message: "Collection not found" });
      return;
    }
  }

  const terms = [...new Map(parsed.data.words.map((word) => [word.term.toLowerCase(), word])).values()];
  const result = await prisma.$transaction(async (transaction) => {
    const lastWord = await transaction.collectionWord.findFirst({
      where: { collectionId: targetCollectionId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    let position = lastWord?.position ?? 0;
    const words: Array<{ id: string; term: string; translationEs: string; level: string; isPublished: boolean }> = [];
    let skipped = 0;

    for (const wordData of terms) {
      const term = wordData.term;
      const word = await transaction.word.upsert({
        where: { term },
        update: {},
        create: { term, translationEs: wordData.translationEs, level: "A1", isPublished: false },
        select: { id: true, term: true, translationEs: true, level: true, isPublished: true },
      });
      const existing = await transaction.collectionWord.findUnique({ where: { collectionId_wordId: { collectionId: targetCollectionId, wordId: word.id } } });
      if (existing) {
        skipped += 1;
        continue;
      }
      position += 1;
      await transaction.collectionWord.create({ data: { collectionId: targetCollectionId, wordId: word.id, position } });
      words.push(word);
    }

    return { words, skipped, received: terms.length };
  });

  const enrichedWords = [];
  let failedAudio = 0;
  for (const word of result.words) {
    const translationEs = terms.find((item) => item.term.toLowerCase() === word.term.toLowerCase())?.translationEs ?? await translateTerm(word.term);
    await prisma.word.update({ where: { id: word.id }, data: { translationEs } });
    const images = await searchPixabayImages(word.term);
    if (images.length) await prisma.image.createMany({ data: images.map((image, index) => ({ wordId: word.id, url: image.url, source: "pixabay", provider: "Pixabay", attribution: `Pixabay: ${image.user}`, metadata: { id: image.id, pageUrl: image.pageUrl, tags: image.tags }, position: index })) });
    try {
      const audio = await generatePiperAudio(request, word.id, word.term, "US");
      await prisma.audio.create({ data: { wordId: word.id, ...audio } });
    } catch { failedAudio += 1; }
    enrichedWords.push(await prisma.word.findUniqueOrThrow({ where: { id: word.id }, select: { id: true, term: true, translationEs: true, level: true, isPublished: true, images: { orderBy: { position: "asc" }, select: { id: true, url: true } }, audios: { orderBy: { position: "asc" }, select: { id: true, url: true, voice: true, accent: true, provider: true } }, videos: { orderBy: { position: "asc" }, select: { id: true, url: true } } } }));
  }
  response.status(201).json({ ...result, words: enrichedWords, failedAudio, collectionId: targetCollectionId });
}

export async function fillMissingAdminImages(request: Request, response: Response): Promise<void> {
  const collectionId = request.params.collectionId;
  if (typeof collectionId !== "string" || !uuidPattern.test(collectionId)) {
    response.status(400).json({ message: "Invalid collection id" });
    return;
  }

  const words = await prisma.collectionWord.findMany({ where: { collectionId }, select: { word: { select: { id: true, term: true, _count: { select: { images: true, audios: true } } } } } });
  const missing = words.filter(({ word }) => word._count.images === 0 || word._count.audios === 0);
  const previews: Array<{ wordId: string; term: string; images: Array<{ url: string; attribution: string; metadata: Record<string, unknown> }>; audio: { url: string; provider: string; voice: string; accent: string; metadata: Record<string, unknown> } | null }> = [];
  for (const item of missing) {
    const images = await searchPixabayImages(item.word.term);
    let audio = null;
    if (item.word._count.audios === 0) {
      try { audio = await generatePiperAudio(request, item.word.id, item.word.term, "US"); } catch { audio = null; }
    }
    previews.push({ wordId: item.word.id, term: item.word.term, images: item.word._count.images === 0 ? images.slice(0, 2).map((image) => ({ url: image.url, attribution: `Pixabay: ${image.user}`, metadata: { id: image.id, pageUrl: image.pageUrl, tags: image.tags } })) : [], audio });
  }
  response.status(200).json({ previews, scanned: words.length });
}

export async function confirmMissingAdminImages(request: Request, response: Response): Promise<void> {
  const collectionId = request.params.collectionId;
  const parsed = fillMissingConfirmSchema.safeParse(request.body);
  if (typeof collectionId !== "string" || !uuidPattern.test(collectionId) || !parsed.success) { response.status(400).json({ message: "Invalid maintenance preview" }); return; }
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
  if (typeof collectionId !== "string" || !uuidPattern.test(collectionId) || !parsed.success) {
    response.status(400).json({ message: "Invalid publication data" });
    return;
  }

  const collection = await prisma.collection.update({ where: { id: collectionId }, data: parsed.data });
  response.status(200).json({ collection });
}

export async function updateWordPublication(request: Request, response: Response): Promise<void> {
  const wordId = request.params.wordId;
  const parsed = publicationSchema.safeParse(request.body);
  if (typeof wordId !== "string" || !uuidPattern.test(wordId) || !parsed.success) {
    response.status(400).json({ message: "Invalid publication data" });
    return;
  }

  const word = await prisma.word.update({ where: { id: wordId }, data: parsed.data });
  response.status(200).json({ word });
}

export async function updateAdminWord(request: Request, response: Response): Promise<void> {
  const wordId = request.params.wordId;
  const parsed = wordSchema.partial().safeParse(request.body);
  if (typeof wordId !== "string" || !uuidPattern.test(wordId) || !parsed.success) {
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
        await transaction.image.createMany({
          data: newImages.map((image, index) => ({
            wordId,
            url: image.url,
            source: image.source,
            provider: image.source === "pixabay" ? "Pixabay" : undefined,
            attribution: image.attribution,
            metadata: image.metadata ? JSON.parse(JSON.stringify(image.metadata)) : undefined,
            position: index,
          })),
        });
      }
    }

    return transaction.word.findUniqueOrThrow({
      where: { id: updatedWord.id },
      select: {
        id: true,
        term: true,
        translationEs: true,
        level: true,
        isPublished: true,
        images: { orderBy: { position: "asc" }, select: { id: true, url: true } },
          audios: { orderBy: { position: "asc" }, select: { id: true, url: true, voice: true, accent: true, provider: true } },
        videos: { orderBy: { position: "asc" }, select: { id: true, url: true } },
      },
    });
  });
  response.status(200).json({ word });
}

export async function createAdminMedia(request: Request, response: Response): Promise<void> {
  const wordId = request.params.wordId;
  const parsed = mediaSchema.safeParse(request.body);
  if (typeof wordId !== "string" || !uuidPattern.test(wordId) || !parsed.success) {
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
  if (typeof wordId !== "string" || !uuidPattern.test(wordId) || !request.file) {
    response.status(400).json({ message: "An image file is required" });
    return;
  }

  const word = await prisma.word.findUnique({ where: { id: wordId }, select: { id: true } });
  if (!word) {
    response.status(404).json({ message: "Word not found" });
    return;
  }

  const apiUrl = `${request.protocol}://${request.get("host")}`;
  const image = await prisma.image.create({
    data: {
      wordId,
      url: `${apiUrl}/uploads/${request.file.filename}`,
      source: "local-upload",
      metadata: { originalName: request.file.originalname, mimeType: request.file.mimetype },
    },
  });

  response.status(201).json({ image });
}

export async function deleteAdminImage(request: Request, response: Response): Promise<void> {
  const imageId = request.params.imageId;
  if (typeof imageId !== "string" || !uuidPattern.test(imageId)) {
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
  if (typeof videoId !== "string" || !uuidPattern.test(videoId)) {
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

export async function deleteAdminAudio(request: Request, response: Response): Promise<void> {
  const audioId = request.params.audioId;
  if (typeof audioId !== "string" || !uuidPattern.test(audioId)) {
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
  if (typeof collectionId !== "string" || !uuidPattern.test(collectionId) || !parsed.success) {
    response.status(400).json({ message: "Invalid collection data", issues: parsed.success ? undefined : parsed.error.issues });
    return;
  }

  const collection = await prisma.collection.update({ where: { id: collectionId }, data: parsed.data, include: { _count: { select: { words: true } } } });
  response.status(200).json({ collection });
}

async function generatePiperAudio(request: Request, wordId: string, term: string, accent: "US" | "UK") {
  const piperPath = process.env.PIPER_PATH ?? "piper";
  const configuredModelPath = accent === "UK" ? process.env.PIPER_VOICE_MODEL_UK : process.env.PIPER_VOICE_MODEL_US;
  const modelCandidates = configuredModelPath ? [
    path.isAbsolute(configuredModelPath) ? configuredModelPath : path.resolve(process.cwd(), configuredModelPath),
    path.isAbsolute(configuredModelPath) ? configuredModelPath : path.resolve(process.cwd(), "../..", configuredModelPath),
  ] : [];
  const modelPath = modelCandidates.find((candidate) => existsSync(candidate));
  if (!modelPath) {
    throw new Error(`No se encontró el modelo Piper configurado: ${configuredModelPath ?? "sin ruta"}`);
  }

  const filename = `audio-${wordId}-${Date.now()}.wav`;
  const outputPath = path.join(uploadDirectory, filename);
  try {
    const child = spawn(piperPath, ["--model", modelPath, "--output_file", outputPath], { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    const processError = new Promise<Error>((_, reject) => child.once("error", reject));
    const processClose = once(child, "close").then(([exitCode]) => {
      if (exitCode !== 0) throw new Error(stderr.trim() || `Piper terminó con código ${exitCode}`);
    });
    child.stdin.write(`${term}\n`);
    child.stdin.end();
    await Promise.race([processClose, processError]);
  } catch (error) {
    await fs.rm(outputPath, { force: true });
    throw new Error(error instanceof Error ? `No se pudo generar el audio: ${error.message}` : "No se pudo generar el audio.");
  }

  const apiUrl = `${request.protocol}://${request.get("host")}`;
  return { url: `${apiUrl}/uploads/${filename}`, provider: "piper", voice: accent === "UK" ? "en_GB" : "en_US", accent, metadata: { text: term, filename } };
}

export async function generateAdminAudio(request: Request, response: Response): Promise<void> {
  const wordId = request.params.wordId;
  const parsed = generateAudioSchema.safeParse(request.body);
  if (typeof wordId !== "string" || !uuidPattern.test(wordId) || !parsed.success) {
    response.status(400).json({ message: "Invalid audio generation data" });
    return;
  }

  const word = await prisma.word.findUnique({ where: { id: wordId }, select: { id: true, term: true } });
  if (!word) {
    response.status(404).json({ message: "Word not found" });
    return;
  }

  try {
    const generated = await generatePiperAudio(request, word.id, word.term, parsed.data.accent);
    const audio = await prisma.audio.create({ data: { wordId: word.id, ...generated } });
  response.status(201).json({ audio });
  } catch (error) {
    response.status(503).json({ message: error instanceof Error ? error.message : "No se pudo generar el audio." });
  }
}