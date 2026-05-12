import crypto from "crypto";

export function sha256Buffer(data: string): Buffer {
  return crypto.createHash("sha256").update(data, "utf8").digest();
}

export function sha256Hex(data: string): string {
  return crypto.createHash("sha256").update(data, "utf8").digest("hex");
}
