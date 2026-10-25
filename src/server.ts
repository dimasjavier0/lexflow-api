import "dotenv/config";
import cors from "cors";
import express from "express";
import { getCollection, listCollections, searchWords } from "./controllers/collections.controller.js";
import { connectFacebook, listFriends } from "./controllers/friends.controller.js";
import { getHealth } from "./controllers/health.controller.js";
import { getLeaderboard } from "./controllers/leaderboard.controller.js";
import { listLevels, summarizeLevelProgress } from "./controllers/levels.controller.js";
import { deleteMe, getMe, getMyDashboard, updateMe } from "./controllers/me.controller.js";
import { listProgress, summarizeProgress, updateProgress } from "./controllers/progress.controller.js";
import { listDueReviews, submitReview } from "./controllers/review.controller.js";
import { errorHandler } from "./middlewares/error-handler.js";
import { rateLimit } from "./middlewares/rate-limit.js";
import { requireAuth } from "./middlewares/require-auth.js";
import { requireOrigin } from "./middlewares/require-origin.js";
import { adminRouter } from "./routes/admin.routes.js";
import { localUploadDirectory, servesUploadsLocally } from "./services/file-store.js";

const app = express();
const port = Number(process.env.API_PORT ?? 3000);

// Comma-separated list of allowed web origins. Unset (local development) allows any origin;
// "none" allows no other origin, for when the web is served from the API's own domain.
const corsSetting = process.env.CORS_ORIGINS?.trim() ?? "";
const corsOrigins = corsSetting.split(",").map((origin) => origin.trim()).filter(Boolean);

// Behind CloudFront and the Lambda Function URL, the client's IP is this many proxies back.
// Without it every request would share one rate-limit window.
const trustedProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
if (trustedProxyHops > 0) app.set("trust proxy", trustedProxyHops);

if (corsSetting !== "none") app.use(cors(corsOrigins.length ? { origin: corsOrigins } : undefined));
app.use(express.json());
// The Lambda Web Adapter checks /health directly, without going through CloudFront.
app.get("/health", getHealth);
app.use(requireOrigin());
// In production CloudFront serves /uploads from S3.
if (servesUploadsLocally) app.use("/uploads", express.static(localUploadDirectory));
app.use(rateLimit({ windowMs: 60_000, max: 300 }));
app.get("/collections", listCollections);
app.get("/collections/:slug", getCollection);
app.get("/words/search", searchWords);
app.get("/levels", listLevels);
app.get("/me", requireAuth, getMe);
app.patch("/me", requireAuth, updateMe);
app.delete("/me", rateLimit({ windowMs: 60_000, max: 5 }), requireAuth, deleteMe);
app.get("/me/dashboard", requireAuth, getMyDashboard);
app.get("/me/friends", requireAuth, listFriends);
// Each call reads the friend list from Facebook, up to 50 pages.
app.post("/me/facebook", rateLimit({ windowMs: 60_000, max: 10 }), requireAuth, connectFacebook);
app.put("/progress/:wordId", requireAuth, updateProgress);
app.get("/progress", requireAuth, listProgress);
app.get("/progress/summary", requireAuth, summarizeProgress);
app.get("/progress/levels", requireAuth, summarizeLevelProgress);
app.get("/reviews/due", requireAuth, listDueReviews);
app.post("/reviews/:wordId", requireAuth, submitReview);
app.get("/leaderboard", requireAuth, getLeaderboard);
app.use("/admin", adminRouter);
app.use(errorHandler);

app.listen(port, () => console.info(`LexFlow API listening on port ${port}`));
