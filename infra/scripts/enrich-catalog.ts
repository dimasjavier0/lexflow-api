// Gives every catalogue word its media in production, step by step (run after import-catalog.ts):
//
//   covers   one Pixabay photo per topic collection that has no cover
//   videos   a YouGlish link per word: real people saying it, played live (nothing is downloaded)
//   audio    US pronunciation generated with the Linux Piper of the API image (Docker) and uploaded to S3
//   images   one Pixabay photo for each word marked visual; the rest show their collection's cover
//
// Every step only fills what is missing, so it can be stopped and run again. Pixabay is asked at a
// slow, steady pace (PIXABAY_DELAY_MS) and only for visual words: its terms forbid mass downloads.
//
//   AWS_PROFILE=lexflow MEDIA_BUCKET=<bucket> PUBLIC_BASE_URL=https://<domain> \
//     npx tsx infra/scripts/enrich-catalog.ts covers videos audio images
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readCatalog, readTopics } from "./lib/catalog.js";
import { useProduction } from "./lib/production.js";

const STEPS = ["covers", "videos", "audio", "images"] as const;
type Step = (typeof STEPS)[number];
const requested = process.argv.slice(2).filter((arg): arg is Step => (STEPS as readonly string[]).includes(arg));
if (!requested.length) {
  console.error(`Choose one or more steps: ${STEPS.join(" ")}`);
  process.exit(1);
}
const PIXABAY_DELAY_MS = Number(process.env.PIXABAY_DELAY_MS ?? 1600);
const AUDIO_CONCURRENCY = Number(process.env.AUDIO_CONCURRENCY ?? 16);
const AUDIO_BATCH = Number(process.env.AUDIO_BATCH ?? 400);
/** The API image built from this repository's Dockerfile: `docker build -t lexflow-api:local .` */
const PIPER_IMAGE = process.env.PIPER_IMAGE ?? "lexflow-api:local";
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity;

const { publicBaseUrl } = await useProduction();
const { prisma } = await import("../../src/db/prisma.js");
const { findPixabayImages } = await import("../../src/services/pixabay.js");
const { storeRemoteImage } = await import("../../src/services/image-store.js");
const { saveUpload, uploadUrl } = await import("../../src/services/file-store.js");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const catalog = readCatalog();
const topics = readTopics();
// By lower case: words saved before the catalogue keep their own capitals ("House").
const catalogByTerm = new Map(catalog.map((word) => [word.term.toLowerCase(), word]));
/** Words added before the catalogue were chosen by hand and are concrete: they count as visual. */
const isVisual = (term: string) => catalogByTerm.get(term.toLowerCase())?.visual ?? true;

/** Prints a progress line every `every` items and at the end. */
function progress(label: string, total: number, every = 100) {
  let done = 0;
  return (extra = "") => {
    done += 1;
    if (done % every === 0 || done === total) console.log(`  ${label}: ${done}/${total}${extra ? ` · ${extra}` : ""}`);
  };
}

async function collectionsByTopic() {
  const names = Object.fromEntries(Object.entries(topics).map(([key, topic]) => [topic.name.toLowerCase(), key]));
  const rows = await prisma.collection.findMany({ select: { id: true, name: true, imageUrl: true } });
  return new Map(rows.filter((row) => names[row.name.toLowerCase()]).map((row) => [names[row.name.toLowerCase()], row]));
}

/** Every word of the topic collections (catalogue words and the ones added by hand before it). */
async function topicWords(where: object) {
  const collectionIds = [...(await collectionsByTopic()).values()].map((collection) => collection.id);
  return prisma.word.findMany({
    where: { ...where, collections: { some: { collectionId: { in: collectionIds } } } },
    select: { id: true, term: true, collections: { where: { collectionId: { in: collectionIds } }, select: { collectionId: true }, take: 1 } },
    orderBy: { term: "asc" },
    take: Number.isFinite(LIMIT) ? LIMIT : undefined,
  });
}

async function stepCovers() {
  const collections = [...(await collectionsByTopic()).entries()].filter(([, collection]) => !collection.imageUrl);
  console.log(`Covers: ${collections.length} collections without one.`);
  for (const [key, collection] of collections) {
    const [image] = await findPixabayImages(topics[key].name.replace(/ and /g, " "));
    const url = image ? await storeRemoteImage(publicBaseUrl, image.url) : null;
    if (url) await prisma.collection.update({ where: { id: collection.id }, data: { imageUrl: url } });
    console.log(`  ${collection.name}: ${url ? "ok" : "no image found"}`);
    await sleep(PIXABAY_DELAY_MS);
  }
}

async function stepVideos() {
  const words = await topicWords({ videos: { none: {} } });
  const created = await prisma.video.createMany({
    data: words.map((word) => ({
      wordId: word.id,
      url: `https://youglish.com/pronounce/${encodeURIComponent(word.term)}/english/us`,
      source: "search",
      provider: "youglish",
      metadata: { kind: "youglish", accent: "us", text: word.term },
    })),
  });
  console.log(`Videos: ${created.count} YouGlish links added.`);
}

/**
 * Synthesizes a batch with the Linux Piper inside the API's own image (the voice the Lambda uses),
 * loading the model once for the whole batch: about 30 times faster than one Piper per word.
 */
async function synthesizeBatch(batch: Array<{ id: string; term: string }>, folder: string): Promise<Map<string, string>> {
  const filenames = new Map(batch.map((word) => [word.id, `audio-${word.id}-${Date.now()}.wav`]));
  const input = batch.map((word) => JSON.stringify({ text: word.term, output_file: `/out/${filenames.get(word.id)}` })).join("\n") + "\n";
  await new Promise<void>((resolve, reject) => {
    const child = spawn("docker", ["run", "--rm", "-i", "--user", "root", "-v", `${folder}:/out`, "--entrypoint", "/opt/piper/piper", PIPER_IMAGE, "--model", "/opt/voices/en_US-amy-medium.onnx", "--json-input"], { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`Piper exited with ${code}: ${stderr.slice(-300)}`))));
    child.stdin.end(input);
  });
  return filenames;
}

async function stepAudio() {
  const words = await topicWords({ audios: { none: {} } });
  console.log(`Audio: ${words.length} words without pronunciation (Piper in ${PIPER_IMAGE}, batches of ${AUDIO_BATCH}).`);
  const tick = progress("audio", words.length, AUDIO_BATCH);
  const folder = await mkdtemp(path.join(os.tmpdir(), "lexflow-audio-"));
  let failed = 0;
  try {
    for (let start = 0; start < words.length; start += AUDIO_BATCH) {
      const batch = words.slice(start, start + AUDIO_BATCH);
      const filenames = await synthesizeBatch(batch, folder);
      const rows: Array<{ wordId: string; url: string; provider: string; voice: string; accent: string; metadata: { text: string; filename: string } }> = [];
      const queue = [...batch];
      await Promise.all(Array.from({ length: AUDIO_CONCURRENCY }, async () => {
        for (let word = queue.shift(); word; word = queue.shift()) {
          const filename = filenames.get(word.id)!;
          const file = path.join(folder, filename);
          try {
            await saveUpload(filename, await readFile(file), "audio/wav");
            rows.push({ wordId: word.id, url: uploadUrl(publicBaseUrl, filename), provider: "piper", voice: "en_US", accent: "US", metadata: { text: word.term, filename } });
          } catch (error) {
            failed += 1;
            console.error(`  audio failed for "${word.term}": ${error instanceof Error ? error.message : error}`);
          } finally {
            await rm(file, { force: true });
          }
          tick(failed ? `${failed} failed` : "");
        }
      }));
      await prisma.audio.createMany({ data: rows });
    }
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

async function stepImages() {
  const coverById = new Map([...(await collectionsByTopic()).values()].map((collection) => [collection.id, collection.imageUrl]));
  const words = await topicWords({ images: { none: {} } });
  const visual = words.filter((word) => isVisual(word.term));
  console.log(`Images: ${words.length} words without one (${visual.length} visual, searched on Pixabay; the rest use their collection cover).`);

  const useCover = async (word: (typeof words)[number]) => {
    const cover = coverById.get(word.collections[0]?.collectionId ?? "");
    if (!cover) return false;
    await prisma.image.create({ data: { wordId: word.id, url: cover, source: "manual", attribution: "Portada de la colección", metadata: { collectionCover: true } } });
    return true;
  };

  let found = 0, fallback = 0;
  const tick = progress("images", visual.length, 50);
  for (const word of visual) {
    const [image] = await findPixabayImages(word.term);
    const url = image ? await storeRemoteImage(publicBaseUrl, image.url) : null;
    if (url && image) {
      await prisma.image.create({ data: { wordId: word.id, url, source: "pixabay", attribution: `Pixabay: ${image.user}`, metadata: { id: image.id, pageUrl: image.pageUrl, tags: image.tags } } });
      found += 1;
    } else if (await useCover(word)) fallback += 1;
    tick(`${found} from Pixabay, ${fallback} with the cover`);
    await sleep(PIXABAY_DELAY_MS);
  }

  let covered = 0;
  for (const word of words.filter((word) => !isVisual(word.term))) if (await useCover(word)) covered += 1;
  console.log(`  ${covered} non-visual words now show their collection cover.`);
}

const run: Record<Step, () => Promise<void>> = { covers: stepCovers, videos: stepVideos, audio: stepAudio, images: stepImages };
for (const step of STEPS) if (requested.includes(step)) await run[step]();
await prisma.$disconnect();
