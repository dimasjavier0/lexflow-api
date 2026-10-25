import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { Pool } from "pg";

// A DATABASE_URL already in the environment (production secrets, or one set in the terminal)
// wins over .env, so scripts aimed at production never fall back to the local database.
dotenv.config({
  path: fileURLToPath(new URL("../../.env", import.meta.url)),
  override: false,
});

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("Missing DATABASE_URL");
}

// Each Lambda instance handles one request at a time; a couple of connections is plenty there.
const pool = new Pool({ connectionString: databaseUrl, max: Number(process.env.DATABASE_POOL_MAX ?? 10) });
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });