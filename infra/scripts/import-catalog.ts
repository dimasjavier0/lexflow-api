// Loads infra/catalog/words.tsv into the production database as drafts: one collection per topic
// (reusing the ones that already exist, by name) and every word linked to its topic. Words that
// already exist keep their data; they are only linked to their topic. Nothing is published:
// that is publish-catalog.ts. Safe to run again: it only adds what is missing.
//
//   AWS_PROFILE=lexflow MEDIA_BUCKET=<bucket> PUBLIC_BASE_URL=https://<domain> npx tsx infra/scripts/import-catalog.ts
import { readCatalog, readTopics, slugify } from "./lib/catalog.js";
import { useProduction } from "./lib/production.js";

await useProduction();
const { prisma } = await import("../../src/db/prisma.js");

const words = readCatalog();
const topics = readTopics();
console.log(`Catalogue: ${words.length} words in ${Object.keys(topics).length} topics.`);

// Collections: matched by name, created as drafts when missing.
const existing = await prisma.collection.findMany({ select: { id: true, name: true, slug: true } });
const collectionIdByTopic = new Map<string, string>();
for (const [key, topic] of Object.entries(topics)) {
  const match = existing.find((collection) => collection.name.toLowerCase() === topic.name.toLowerCase());
  if (match) {
    collectionIdByTopic.set(key, match.id);
    continue;
  }
  const created = await prisma.collection.create({ data: { name: topic.name, slug: slugify(topic.name), description: topic.description, isPublished: false }, select: { id: true } });
  collectionIdByTopic.set(key, created.id);
  console.log(`  + collection ${topic.name}`);
}

// Words: new ones in bulk, as drafts. A word already saved with other capitals ("House") is the
// same word: it is reused, never duplicated.
const idByLowerTerm = async () => new Map((await prisma.word.findMany({ select: { id: true, term: true } })).map((row) => [row.term.toLowerCase(), row.id]));
const before = await idByLowerTerm();
const created = await prisma.word.createMany({
  data: words.filter((word) => !before.has(word.term.toLowerCase())).map((word) => ({ term: word.term, translationEs: word.translationEs, level: word.level, partOfSpeech: word.partOfSpeech, isPublished: false })),
  skipDuplicates: true,
});
console.log(`Words: ${created.count} new, ${words.length - created.count} already there.`);

// Links: each word into its topic's collection, after the words it already holds.
const ids = await idByLowerTerm();
const nextPosition = new Map<string, number>();
for (const row of await prisma.collectionWord.groupBy({ by: ["collectionId"], _max: { position: true } })) nextPosition.set(row.collectionId, (row._max.position ?? 0) + 1);
const links = words.map((word) => {
  const collectionId = collectionIdByTopic.get(word.topic)!;
  const position = nextPosition.get(collectionId) ?? 1;
  nextPosition.set(collectionId, position + 1);
  return { collectionId, wordId: ids.get(word.term.toLowerCase())!, position };
});
const linked = await prisma.collectionWord.createMany({ data: links, skipDuplicates: true });
console.log(`Links: ${linked.count} new.`);

await prisma.$disconnect();
