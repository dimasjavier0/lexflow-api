// Reads the vocabulary catalogue in infra/catalog/ (see its README).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type CatalogLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type CatalogPartOfSpeech = "NOUN" | "VERB" | "ADJECTIVE" | "ADVERB" | "PRONOUN" | "PREPOSITION" | "CONJUNCTION" | "DETERMINER" | "INTERJECTION" | "PHRASE";
export type CatalogWord = { term: string; translationEs: string; level: CatalogLevel; partOfSpeech: CatalogPartOfSpeech | null; topic: string; visual: boolean };
export type CatalogTopic = { name: string; description: string };

const catalogFile = (name: string) => fileURLToPath(new URL(`../../catalog/${name}`, import.meta.url));

export function readCatalog(): CatalogWord[] {
  const [, ...lines] = readFileSync(catalogFile("words.tsv"), "utf8").trim().split(/\r?\n/);
  return lines.map((line) => {
    const [term, translationEs, level, partOfSpeech, topic, visual] = line.split("\t");
    return { term, translationEs, level: level as CatalogLevel, partOfSpeech: (partOfSpeech || null) as CatalogPartOfSpeech | null, topic, visual: visual === "1" };
  });
}

export function readTopics(): Record<string, CatalogTopic> {
  return JSON.parse(readFileSync(catalogFile("topics.json"), "utf8")) as Record<string, CatalogTopic>;
}

export function slugify(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
