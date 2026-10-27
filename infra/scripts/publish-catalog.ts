// Publishes the vocabulary catalogue once it has been reviewed: every topic collection and every word
// in them become visible to learners. Without --yes it only reports what would change.
//
//   AWS_PROFILE=lexflow MEDIA_BUCKET=<bucket> PUBLIC_BASE_URL=https://<domain> npx tsx infra/scripts/publish-catalog.ts [--yes]
import { readTopics } from "./lib/catalog.js";
import { useProduction } from "./lib/production.js";

const confirmed = process.argv.includes("--yes");
await useProduction();
const { prisma } = await import("../../src/db/prisma.js");

const names = Object.values(readTopics()).map((topic) => topic.name.toLowerCase());
const collections = (await prisma.collection.findMany({ select: { id: true, name: true, isPublished: true } })).filter((collection) => names.includes(collection.name.toLowerCase()));
const ids = collections.map((collection) => collection.id);
const inTopics = { collections: { some: { collectionId: { in: ids } } } };

const [drafts, withoutAudio, withoutImage, withoutVideo] = await Promise.all([
  prisma.word.count({ where: { ...inTopics, isPublished: false } }),
  prisma.word.count({ where: { ...inTopics, audios: { none: {} } } }),
  prisma.word.count({ where: { ...inTopics, images: { none: {} } } }),
  prisma.word.count({ where: { ...inTopics, videos: { none: {} } } }),
]);
console.log(`Topic collections: ${collections.length} (${collections.filter((collection) => !collection.isPublished).length} unpublished).`);
console.log(`Words to publish: ${drafts}. Still missing: ${withoutAudio} audio, ${withoutImage} image, ${withoutVideo} video.`);

if (!confirmed) {
  console.log("Nothing changed. Run again with --yes to publish.");
} else {
  const words = await prisma.word.updateMany({ where: { ...inTopics, isPublished: false }, data: { isPublished: true } });
  const published = await prisma.collection.updateMany({ where: { id: { in: ids }, isPublished: false }, data: { isPublished: true } });
  console.log(`Published ${words.count} words and ${published.count} collections.`);
}
await prisma.$disconnect();
