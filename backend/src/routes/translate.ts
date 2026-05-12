import { Router, Request, Response } from "express";
import {
  translateText,
  isTranslationAvailable,
  SUPPORTED_LANGUAGES,
} from "../services/translator";

const router = Router();

/**
 * GET /api/translate/languages
 * Returns the list of supported language codes and display names.
 */
router.get("/languages", async (_req: Request, res: Response) => {
  const available = await isTranslationAvailable();
  res.json({ languages: SUPPORTED_LANGUAGES, qvacAvailable: available });
});

/**
 * POST /api/translate
 * Body: { text: string; targetLang: string }
 * Returns: { translated: string; usedQVAC: boolean }
 *
 * All translation runs on-device via @qvac/translation-nmtcpp.
 * The text never leaves the server machine. Falls back to returning
 * the original text when QVAC is not installed.
 */
router.post("/", async (req: Request, res: Response) => {
  const { text, targetLang } = req.body as { text?: string; targetLang?: string };

  if (!text || typeof text !== "string") {
    res.status(400).json({ error: "Missing or invalid field: text" });
    return;
  }
  if (!targetLang || typeof targetLang !== "string") {
    res.status(400).json({ error: "Missing or invalid field: targetLang" });
    return;
  }
  if (!SUPPORTED_LANGUAGES[targetLang]) {
    res.status(400).json({ error: `Unsupported language: ${targetLang}` });
    return;
  }

  try {
    const result = await translateText(text, targetLang);
    res.json(result);
  } catch (err: any) {
    console.error("[translate] error:", err.message);
    res.status(500).json({ error: "Translation failed." });
  }
});

export default router;
