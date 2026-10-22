import dotenv from "dotenv";
import { defineConfig, env } from "prisma/config";
import { fileURLToPath } from "node:url";

// A DATABASE_URL given in the terminal wins over .env, so `DATABASE_URL=... npx prisma migrate deploy`
// reaches the database it names (production) instead of the local one.
dotenv.config({
  path: fileURLToPath(new URL("./.env", import.meta.url)),
  override: false,
});

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
