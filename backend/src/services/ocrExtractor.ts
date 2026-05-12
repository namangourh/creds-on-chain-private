// ─── OCR Service ──────────────────────────────────────────────────────────────
// Uses @qvac/ocr-onnx to extract text from image buffers (JPEG, PNG, TIFF) or
// image-only PDFs entirely on-device. No data ever leaves the machine.
//
// Falls back gracefully to an empty string (with a warning) when the QVAC
// package is not installed, so the upload route can decide how to proceed.

let ocrEngine: any | null = null;
let ocrInitAttempted = false;

async function getOCREngine(): Promise<any | null> {
  if (ocrInitAttempted) return ocrEngine;
  ocrInitAttempted = true;
  try {
    const { OCR } = await import("@qvac/ocr-onnx");
    ocrEngine = new OCR();
    await ocrEngine.init();
    console.log("[ocr] QVAC OCR engine ready — text extraction is fully on-device");
  } catch (e: any) {
    console.warn("[ocr] QVAC OCR unavailable:", e?.message);
    ocrEngine = null;
  }
  return ocrEngine;
}

/**
 * Extract text from an image buffer (JPEG / PNG / BMP / TIFF).
 * Returns the recognized text, or throws if OCR is unavailable.
 */
export async function extractTextFromImage(buffer: Buffer): Promise<string> {
  const engine = await getOCREngine();
  if (!engine) {
    const err = new Error(
      "OCR engine (QVAC) is not available on this server. Please upload a text-based PDF or GitHub username instead."
    ) as Error & { statusCode: number };
    err.statusCode = 422;
    throw err;
  }
  const result = await engine.recognize(buffer);
  // QVAC OCR returns { text: string } or the string directly depending on version
  return typeof result === "string" ? result : result?.text ?? "";
}

/**
 * Detect whether a PDF is image-only (scanned) by checking if pdf-parse yields
 * less than 80 characters of meaningful text.  Image-only PDFs contain no
 * embedded text — their content is rasterized onto pages.
 */
export function isImageOnlyContent(pdfText: string): boolean {
  const meaningful = pdfText.replace(/\s+/g, " ").trim();
  return meaningful.length < 80;
}

/** Returns true when the QVAC OCR engine is loaded and ready. */
export async function isOCRAvailable(): Promise<boolean> {
  const engine = await getOCREngine();
  return engine !== null;
}
