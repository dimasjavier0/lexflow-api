import "dotenv/config";
import cors from "cors";
import express from "express";
import { getHealth } from "./controllers/health.controller.js";
import { getMe } from "./controllers/me.controller.js";
import { errorHandler } from "./middlewares/error-handler.js";
import { requireAuth } from "./middlewares/require-auth.js";

const app = express();
const port = Number(process.env.API_PORT ?? 3000);

app.use(cors());
app.use(express.json());
app.get("/health", getHealth);
app.get("/me", requireAuth, getMe);
app.use(errorHandler);

app.listen(port, () => console.info(`LexFlow API listening on port ${port}`));
