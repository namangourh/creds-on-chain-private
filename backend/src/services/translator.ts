// ─── Translation Service ─────────────────────────────────────────────────────
// Uses @qvac/translation-nmtcpp to translate text fully on-device.
// No API key, no cloud call — the translated text never leaves the machine.
//
// Falls back gracefully when the package is not installed: returns the original
// text unchanged so the UI degrades to English-only without crashing.

let translator: any | null = null;
let translatorInitAttempted = false;

async function getTranslator(): Promise<any | null> {
  if (translatorInitAttempted) return translator;
  translatorInitAttempted = true;
  try {
    const { Translator } = await import("@qvac/translation-nmtcpp");
    translator = new Translator();
    await translator.init();
    console.log("[translator] QVAC NMT engine ready — translation is fully on-device");
  } catch (e: any) {
    console.warn("[translator] QVAC translation unavailable:", e?.message);
    translator = null;
  }
  return translator;
}

// Supported language codes and their display names.
// This list is intentionally kept to QVAC's documented supported languages.
export const SUPPORTED_LANGUAGES: Record<string, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
  it: "Italiano",
  nl: "Nederlands",
  ru: "Русский",
  zh: "中文",
  ja: "日本語",
  ko: "한국어",
  ar: "العربية",
  hi: "हिन्दी",
  tr: "Türkçe",
  pl: "Polski",
};

import OpenAI from "openai";

let openaiClient: OpenAI;
function getOpenAI(): OpenAI {
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}

async function translateWithOpenAI(text: string, targetLang: string): Promise<string> {
  const langName = SUPPORTED_LANGUAGES[targetLang] ?? targetLang;
  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content: `You are a professional translator. Translate the following text into ${langName}. Output only the translated text with no explanation, no quotes, and no extra formatting.`,
      },
      { role: "user", content: text },
    ],
  });
  return response.choices[0]?.message?.content?.trim() ?? text;
}

export async function translateText(
  text: string,
  targetLang: string
): Promise<{ translated: string; usedQVAC: boolean }> {
  if (targetLang === "en" || !text.trim()) {
    return { translated: text, usedQVAC: false };
  }

  // Try QVAC local NMT first (fully on-device)
  const engine = await getTranslator();
  if (engine) {
    try {
      const result = await engine.translate(text, { from: "en", to: targetLang });
      const translated: string =
        typeof result === "string" ? result : result?.text ?? text;
      return { translated, usedQVAC: true };
    } catch (e: any) {
      console.warn("[translator] QVAC translation failed, falling back to OpenAI:", e?.message);
    }
  }

  // OpenAI fallback
  try {
    const translated = await translateWithOpenAI(text, targetLang);
    return { translated, usedQVAC: false };
  } catch (e: any) {
    console.warn("[translator] OpenAI translation failed:", e?.message);
    return { translated: text, usedQVAC: false };
  }
}


/** Returns true when the QVAC translation engine is loaded and ready. */
export async function isTranslationAvailable(): Promise<boolean> {
  const engine = await getTranslator();
  return engine !== null;
}
