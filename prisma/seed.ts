import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

dotenv.config({
	path: fileURLToPath(new URL("../../../.env", import.meta.url)),
	override: true,
});

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const words = [
	{ term: "apple", translationEs: "manzana", position: 1 },
	{ term: "bread", translationEs: "pan", position: 2 },
	{ term: "water", translationEs: "agua", position: 3 },
];

async function main() {
	const collection = await prisma.collection.upsert({
		where: { slug: "food" },
		update: {
			name: "Food",
			description: "Basic food and drink vocabulary.",
			isPublished: true,
		},
		create: {
			name: "Food",
			slug: "food",
			description: "Basic food and drink vocabulary.",
			isPublished: true,
		},
	});

	for (const wordData of words) {
		const word = await prisma.word.upsert({
			where: { term: wordData.term },
			update: {
				translationEs: wordData.translationEs,
				level: "A1",
				isPublished: true,
			},
			create: {
				term: wordData.term,
				translationEs: wordData.translationEs,
				level: "A1",
				isPublished: true,
			},
		});

		await prisma.collectionWord.upsert({
			where: {
				collectionId_wordId: {
					collectionId: collection.id,
					wordId: word.id,
				},
			},
			update: { position: wordData.position },
			create: {
				collectionId: collection.id,
				wordId: word.id,
				position: wordData.position,
			},
		});
	}

	console.info(`Seeded collection "${collection.slug}" with ${words.length} words.`);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
		await pool.end();
	});
