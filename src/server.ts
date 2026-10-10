import "dotenv/config";
import cors from "cors";
import express from "express";
import { getCollection, listCollections } from "./controllers/collections.controller.js";
import { getHealth } from "./controllers/health.controller.js";
import { getMe } from "./controllers/me.controller.js";
import { listProgress, summarizeProgress, updateProgress } from "./controllers/progress.controller.js";
import { errorHandler } from "./middlewares/error-handler.js";
import { uploadDirectory } from "./middlewares/image-upload.js";
import { rateLimit } from "./middlewares/rate-limit.js";
import { requireAuth } from "./middlewares/require-auth.js";
import { adminRouter } from "./routes/admin.routes.js";

const app = express();
const port = Number(process.env.API_PORT ?? 3000);

// Comma-separated list of allowed web origins. Unset (local development) allows any origin.
const corsOrigins = (process.env.CORS_ORIGINS ?? "").split(",").map((origin) => origin.trim()).filter(Boolean);

app.use(cors(corsOrigins.length ? { origin: corsOrigins } : undefined));
app.use(express.json());
app.use("/uploads", express.static(uploadDirectory));
app.get("/health", getHealth);
app.use(rateLimit({ windowMs: 60_000, max: 300 }));
app.get("/collections", listCollections);
app.get("/collections/:slug", getCollection);
app.get("/me", requireAuth, getMe);
app.put("/progress/:wordId", requireAuth, updateProgress);
app.get("/progress", requireAuth, listProgress);
app.get("/progress/summary", requireAuth, summarizeProgress);
app.use("/admin", adminRouter);
app.use(errorHandler);

app.listen(port, () => console.info(`LexFlow API listening on port ${port}`));
