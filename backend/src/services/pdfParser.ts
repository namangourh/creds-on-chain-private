import pdfParse from "pdf-parse";

export async function parsePdf(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer);
  const text = data.text.trim();

  if (text.length < 50) {
    const err = new Error("Could not extract text from the provided PDF.") as Error & { statusCode: number };
    err.statusCode = 422;
    throw err;
  }

  return text;
}
