import { SkillReport } from "../types";

// ─── Prompts ──────────────────────────────────────────────────────────────────

const RESUME_PROMPT = `You are a technical recruiter. Extract the candidate's key skills and a brief experience summary from this resume text.
Output ONLY valid JSON with no markdown: { "skills": ["skill1", "skill2"], "summary": "...", "score": <0-100> }`;

const GITHUB_PROMPT = `Given this GitHub profile information (repos, languages, bio), list the person's top programming skills and a one-sentence summary of their expertise.
Output ONLY valid JSON with no markdown: { "skills": ["skill1", "skill2"], "summary": "...", "score": <0-100> }`;

const RETRY_SUFFIX =
  "\n\nImportant: your entire response must be a single valid JSON object with no surrounding text, no markdown, no code fences.";

// ─── Response parser ──────────────────────────────────────────────────────────

function parseSkillReport(raw: string): SkillReport | null {
  try {
    // Strip any accidental markdown fences the model may emit
    const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
    const parsed = JSON.parse(cleaned);
    if (
      Array.isArray(parsed.skills) &&
      typeof parsed.summary === "string" &&
      typeof parsed.score === "number" &&
      parsed.score >= 0 &&
      parsed.score <= 100
    ) {
      return {
        // Force string coercion so downstream UI code does not break on mixed primitive arrays.
        skills: parsed.skills.map(String),
        summary: parsed.summary,
        score: Math.round(parsed.score),
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ─── QVAC local LLM ───────────────────────────────────────────────────────────
// @qvac/llm-llamacpp runs fully on-device — no API key, no cloud call, no data
// leaves the machine. Dynamic import lets the backend start normally even when
// the package is not yet installed (graceful degradation to OpenAI fallback).

let qvacLLM: any | null = null;
let qvacInitAttempted = false;

async function getQVACLLM(): Promise<any | null> {
  if (qvacInitAttempted) return qvacLLM;
  qvacInitAttempted = true;
  try {
    const { LLM } = await import("@qvac/llm-llamacpp");
    // Use a compact instruction-tuned model that fits on consumer hardware.
    // Model is downloaded and cached by the QVAC runtime on first use.
    qvacLLM = new LLM({ model: "mistral-7b-instruct-v0.2" });
    await qvacLLM.init();
    console.log("[aiAnalyzer] QVAC local LLM ready — all analysis is on-device");
  } catch (e: any) {
    console.warn(
      "[aiAnalyzer] QVAC LLM unavailable — falling back to OpenAI:",
      e?.message
    );
    qvacLLM = null;
  }
  return qvacLLM;
}

// ─── OpenAI fallback ──────────────────────────────────────────────────────────
// Used transparently when QVAC is not installed. Keeps the dev experience
// identical: same prompts, same output shape.

import OpenAI from "openai";

let openaiClient: OpenAI;
function getOpenAI(): OpenAI {
  // Lazily initialize once so retries reuse the same configured SDK client.
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}

// ─── Core analysis ────────────────────────────────────────────────────────────

async function callLLM(prompt: string, text: string): Promise<string> {
  const fullPrompt = `${prompt}\n\n${text}`;
  const systemInstruction =
    "You output only valid JSON. No markdown, no explanation, no code fences.";

  // Try QVAC first (local, private)
  const llm = await getQVACLLM();
  if (llm) {
    try {
      const result = await llm.chat([
        { role: "system", content: systemInstruction },
        { role: "user", content: fullPrompt },
      ]);
      // QVAC returns the raw completion string
      return typeof result === "string" ? result : result?.content ?? "";
    } catch (e: any) {
      console.warn("[aiAnalyzer] QVAC inference error, falling back to OpenAI:", e?.message);
    }
  }

  // OpenAI fallback
  try {
    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: fullPrompt },
      ],
    });
    return response.choices[0]?.message?.content ?? "";
  } catch (e: any) {
    console.error("[aiAnalyzer] OpenAI error:", e?.status, e?.message, e?.error);
    const err = new Error(`AI analysis service unavailable: ${e?.message}`) as Error & { statusCode: number };
    err.statusCode = 502;
    throw err;
  }
}

export async function analyzeText(
  text: string,
  type: "resume" | "github"
): Promise<SkillReport> {
  const userPrompt = type === "resume" ? RESUME_PROMPT : GITHUB_PROMPT;

  // First attempt
  const raw = await callLLM(userPrompt, text);
  let report = parseSkillReport(raw);

  if (!report) {
    // Retry once with explicit format reminder.
    // One retry keeps UX resilient while avoiding runaway token costs.
    const raw2 = await callLLM(userPrompt + RETRY_SUFFIX, text);
    report = parseSkillReport(raw2);
  }

  if (!report) {
    const err = new Error("AI returned an invalid response format.") as Error & { statusCode: number };
    err.statusCode = 502;
    throw err;
  }

  return report;
}
