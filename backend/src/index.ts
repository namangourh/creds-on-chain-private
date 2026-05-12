import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
dotenv.config();

import { validateEnv } from "./services/validateEnv";
validateEnv();

import uploadRouter from "./routes/upload";
import registerRouter from "./routes/register";
import profileRouter from "./routes/profile";
import profilesRouter from "./routes/profiles";
import unlockRouter from "./routes/unlock";
import reportRouter from "./routes/report";
import searchRouter from "./routes/search";
import translateRouter from "./routes/translate";
import { seedStoreFromDB } from "./services/embeddings";

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

// Tight limit on upload — each request calls OpenAI + Pinata
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many upload requests. Please wait a minute and try again." },
});

// General limiter for all other API routes
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
});

app.use("/api/upload", uploadLimiter, uploadRouter);
app.use("/api/register", apiLimiter, registerRouter);
app.use("/api/profile", apiLimiter, profileRouter);
app.use("/api/profiles", apiLimiter, profilesRouter);
app.use("/api/unlock", apiLimiter, unlockRouter);
app.use("/api/report", apiLimiter, reportRouter);
app.use("/api/search", apiLimiter, searchRouter);
app.use("/api/translate", apiLimiter, translateRouter);

// Health check
app.get("/health", (_req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);

  // Warm up the embedding store in the background so the first search is instant.
  // Fire-and-forget — server starts accepting requests immediately.
  seedStoreFromDB().catch(e =>
    console.warn("[startup] embedding seed failed:", e?.message)
  );

  // Self-ping every 10 min to prevent Render free tier from sleeping the container.
  // Only runs in production so local dev isn't affected.
  if (process.env.NODE_ENV === "production" && process.env.RENDER_EXTERNAL_URL) {
    const url = `${process.env.RENDER_EXTERNAL_URL}/health`;
    setInterval(async () => {
      try {
        await fetch(url);
        console.log("[keep-alive] pinged", url);
      } catch (e) {
        console.warn("[keep-alive] ping failed:", (e as Error).message);
      }
    }, 10 * 60 * 1000);
  }
});
