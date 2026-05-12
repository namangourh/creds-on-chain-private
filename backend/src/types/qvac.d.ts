// ─── QVAC SDK Type Stubs ─────────────────────────────────────────────────────
// These packages run fully on-device via the QVAC runtime. They are not
// published to npm so we declare them as `any` to satisfy the TypeScript
// compiler. Runtime imports are guarded with try/catch for graceful fallback.

declare module "@qvac/llm-llamacpp" {
  export class LLM {
    constructor(options: { model: string; [key: string]: any });
    init(): Promise<void>;
    chat(messages: Array<{ role: string; content: string }>): Promise<string | { content: string }>;
    [key: string]: any;
  }
}

declare module "@qvac/embed-llamacpp" {
  export class Embedder {
    constructor(options?: { model?: string; [key: string]: any });
    init(): Promise<void>;
    embed(text: string): Promise<number[]>;
    [key: string]: any;
  }
}

declare module "@qvac/ocr-onnx" {
  export class OCR {
    constructor(options?: { [key: string]: any });
    init(): Promise<void>;
    recognize(buffer: Buffer): Promise<string | { text: string }>;
    [key: string]: any;
  }
}

declare module "@qvac/translation-nmtcpp" {
  export class Translator {
    constructor(options?: { [key: string]: any });
    init(): Promise<void>;
    translate(text: string, options: { from: string; to: string }): Promise<string | { text: string }>;
    [key: string]: any;
  }
}
