import { Router } from "express";
import {
  confirmMissingAdminImages,
  createAdminCollection,
  createAdminMedia,
  createAdminWord,
  createAdminWordsBulk,
  deleteAdminAudio,
  deleteAdminCollection,
  deleteAdminImage,
  deleteAdminVideo,
  fillMissingAdminImages,
  generateAdminAudio,
  listAdminCollections,
  listAdminWords,
  removeAdminCollectionWord,
  searchAdminPixabay,
  updateAdminCollection,
  updateAdminWord,
  updateCollectionPublication,
  updateCollectionWordsPublication,
  updateWordPublication,
  uploadAdminImage,
} from "../controllers/admin.controller.js";
import { imageUpload } from "../middlewares/image-upload.js";
import { rateLimit } from "../middlewares/rate-limit.js";
import { requireAdmin } from "../middlewares/require-admin.js";
import { requireAuth } from "../middlewares/require-auth.js";

export const adminRouter = Router();

// Routes that call Pixabay or run Piper for every request.
const externalWorkLimit = rateLimit({ windowMs: 60_000, max: 30 });

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get("/collections", listAdminCollections);
adminRouter.post("/collections", createAdminCollection);
adminRouter.patch("/collections/:collectionId", updateAdminCollection);
adminRouter.delete("/collections/:collectionId", deleteAdminCollection);
adminRouter.patch("/collections/:collectionId/publication", updateCollectionPublication);
adminRouter.get("/collections/:collectionId/words", listAdminWords);
adminRouter.post("/collections/:collectionId/words", createAdminWord);
adminRouter.post("/collections/:collectionId/words/bulk", externalWorkLimit, createAdminWordsBulk);
adminRouter.delete("/collections/:collectionId/words/:wordId", removeAdminCollectionWord);
adminRouter.patch("/collections/:collectionId/words/publication", updateCollectionWordsPublication);
adminRouter.post("/collections/:collectionId/images/fill-missing", externalWorkLimit, fillMissingAdminImages);
adminRouter.post("/collections/:collectionId/images/fill-missing/confirm", confirmMissingAdminImages);

adminRouter.patch("/words/:wordId", updateAdminWord);
adminRouter.patch("/words/:wordId/publication", updateWordPublication);
adminRouter.post("/words/:wordId/media", createAdminMedia);
adminRouter.post("/words/:wordId/images", imageUpload.single("image"), uploadAdminImage);
adminRouter.post("/words/:wordId/audio/generate", externalWorkLimit, generateAdminAudio);

adminRouter.delete("/images/:imageId", deleteAdminImage);
adminRouter.delete("/videos/:videoId", deleteAdminVideo);
adminRouter.delete("/audios/:audioId", deleteAdminAudio);

adminRouter.get("/pixabay/images", externalWorkLimit, searchAdminPixabay);
