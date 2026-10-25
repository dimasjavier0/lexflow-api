// Read-only summary of the production catalogue: collections and word counts.
import { useProduction } from "./lib/production.js";
await useProduction();
const { prisma } = await import("../../src/db/prisma.js");
const collections = await prisma.collection.findMany({ orderBy: { name: "asc" }, select: { name: true, slug: true, isPublished: true, imageUrl: true, _count: { select: { words: true } } } });
console.table(collections.map((c) => ({ name: c.name, slug: c.slug, published: c.isPublished, words: c._count.words, cover: c.imageUrl ? "sí" : "no" })));
const [words, published, images, audios, videos, users] = await Promise.all([prisma.word.count(), prisma.word.count({ where: { isPublished: true } }), prisma.image.count(), prisma.audio.count(), prisma.video.count(), prisma.user.count()]);
console.log({ words, published, images, audios, videos, users });
await prisma.$disconnect();
