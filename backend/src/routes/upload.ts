import { Router, Request, Response } from "express";
import multer from "multer";
import { parsePdf } from "../services/pdfParser";
import { fetchGithubProfile } from "../services/githubFetcher";
import { analyzeText } from "../services/aiAnalyzer";
import { uploadReport } from "../services/ipfsClient";
import { sha256Hex } from "../services/hashUtils";
import { extractTextFromImage, isImageOnlyContent } from "../services/ocrExtractor";

const router = Router();

// Accept PDF files and common image formats for scanned resumes (QVAC OCR path)
const ACCEPTED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/tiff",
  "image/bmp",
  "image/webp",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (ACCEPTED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and image files (JPEG, PNG, TIFF, BMP, WebP) are accepted."));
    }
  },
});

router.post("/", upload.single("file"), async (req: Request, res: Response) => {
  try {
    let text: string;

    // Accept exactly one source mode per request so downstream prompts stay consistent.
    if (req.file) {
      const mime = req.file.mimetype;

      if (mime === "application/pdf") {
        // Standard PDF path: extract embedded text
        text = await parsePdf(req.file.buffer);

        // If the PDF is image-only (scanned), fall through to QVAC OCR
        if (isImageOnlyContent(text)) {
          console.log("[upload] Image-only PDF detected — routing to QVAC OCR");
          text = await extractTextFromImage(req.file.buffer);
        }
      } else {
        // Direct image upload — use QVAC OCR on-device
        console.log(`[upload] Image file (${mime}) — routing to QVAC OCR`);
        text = await extractTextFromImage(req.file.buffer);
      }
    } else if (req.body?.githubUsername) {
      // GitHub path
      text = await fetchGithubProfile(req.body.githubUsername);
    } else {
      res.status(400).json({ error: "Provide a PDF/image file or githubUsername." });
      return;
    }

    const type = req.file ? "resume" : "github";
    // AI output is normalized into SkillReport before any persistence.
    // analyzeText now uses QVAC local LLM (falls back to OpenAI if unavailable).
    const skillReport = await analyzeText(text, type);

    // Upload report JSON to IPFS
    const cid = await uploadReport(skillReport);

    // Hash exactly what will be reconstructed client-side with JSON.stringify(report).
    // This keeps the on-chain check deterministic across backend/frontend code paths.
    const jsonString = JSON.stringify(skillReport);
    const hash = sha256Hex(jsonString);

    res.json({ skillReport, cid, hash });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message || "Upload failed." });
  }
});

export default router;
