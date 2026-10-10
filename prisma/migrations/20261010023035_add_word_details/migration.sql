-- CreateEnum
CREATE TYPE "PartOfSpeech" AS ENUM ('NOUN', 'VERB', 'ADJECTIVE', 'ADVERB', 'PRONOUN', 'PREPOSITION', 'CONJUNCTION', 'DETERMINER', 'INTERJECTION', 'PHRASE');

-- CreateEnum
CREATE TYPE "WordRelationshipType" AS ENUM ('SYNONYM', 'ANTONYM', 'DERIVED', 'COLLOCATION', 'PHRASAL', 'RELATED');

-- AlterTable
ALTER TABLE "Word" ADD COLUMN     "frequencyRank" INTEGER,
ADD COLUMN     "partOfSpeech" "PartOfSpeech";

-- CreateTable
CREATE TABLE "ExampleSentence" (
    "id" UUID NOT NULL,
    "wordId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "translationEs" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExampleSentence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WordRelationship" (
    "id" UUID NOT NULL,
    "sourceWordId" UUID NOT NULL,
    "targetWordId" UUID NOT NULL,
    "type" "WordRelationshipType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WordRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExampleSentence_wordId_position_idx" ON "ExampleSentence"("wordId", "position");

-- CreateIndex
CREATE INDEX "WordRelationship_targetWordId_idx" ON "WordRelationship"("targetWordId");

-- CreateIndex
CREATE UNIQUE INDEX "WordRelationship_sourceWordId_targetWordId_type_key" ON "WordRelationship"("sourceWordId", "targetWordId", "type");

-- AddForeignKey
ALTER TABLE "ExampleSentence" ADD CONSTRAINT "ExampleSentence_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WordRelationship" ADD CONSTRAINT "WordRelationship_sourceWordId_fkey" FOREIGN KEY ("sourceWordId") REFERENCES "Word"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WordRelationship" ADD CONSTRAINT "WordRelationship_targetWordId_fkey" FOREIGN KEY ("targetWordId") REFERENCES "Word"("id") ON DELETE CASCADE ON UPDATE CASCADE;
