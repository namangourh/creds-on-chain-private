const REQUIRED = [
  "OPENAI_API_KEY",
  "PINATA_API_KEY",
  "PINATA_API_SECRET",
  "PROGRAM_ID",
  "JWT_SECRET",
  "DATABASE_URL",
] as const;

export function validateEnv(): void {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(
      `[startup] Missing required environment variables:\n  ${missing.join("\n  ")}\n` +
      "Set them in your .env file (local) or hosting dashboard (production) and restart."
    );
    process.exit(1);
  }
}
