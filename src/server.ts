import "dotenv/config";
import cors from "cors";
import express from "express";
import { getHealth } from "./controllers/health.controller.js";
import { getMe } from "./controllers/me.controller.js";
import { getCollection, listCollections } from "./controllers/collections.controller.js";
import { updateProgress } from "./controllers/progress.controller.js";
import { createAdminCollection, createAdminMedia, createAdminWord, listAdminCollections, listAdminWords, updateCollectionPublication, updateWordPublication } from "./controllers/admin.controller.js";
import { errorHandler } from "./middlewares/error-handler.js";
import { requireAdmin } from "./middlewares/require-admin.js";
import { requireAuth } from "./middlewares/require-auth.js";

const app = express();
const port = Number(process.env.API_PORT ?? 3000);

app.use(cors());
app.use(express.json());
app.get("/health", getHealth);
app.get("/collections", listCollections);
app.get("/collections/:slug", getCollection);
app.get("/me", requireAuth, getMe);
app.put("/progress/:wordId", requireAuth, updateProgress);
app.get("/admin/collections", requireAuth, requireAdmin, listAdminCollections);
app.post("/admin/collections", requireAuth, requireAdmin, createAdminCollection);
app.get("/admin/collections/:collectionId/words", requireAuth, requireAdmin, listAdminWords);
app.post("/admin/collections/:collectionId/words", requireAuth, requireAdmin, createAdminWord);
app.patch("/admin/collections/:collectionId/publication", requireAuth, requireAdmin, updateCollectionPublication);
app.patch("/admin/words/:wordId/publication", requireAuth, requireAdmin, updateWordPublication);
app.post("/admin/words/:wordId/media", requireAuth, requireAdmin, createAdminMedia);
app.use(errorHandler);

app.listen(port, () => console.info(`LexFlow API listening on port ${port}`));
