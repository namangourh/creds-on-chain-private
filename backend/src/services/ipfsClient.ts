import PinataClient from "@pinata/sdk";
import { SkillReport } from "../types";

let pinata: PinataClient;

function getClient(): PinataClient {
  if (!pinata) {
    // Singleton client keeps auth config centralized and avoids re-instantiation per request.
    pinata = new PinataClient(
      process.env.PINATA_API_KEY!,
      process.env.PINATA_API_SECRET!
    );
  }
  return pinata;
}

export async function uploadReport(report: SkillReport): Promise<string> {
  try {
    const client = getClient();
    const result = await client.pinJSONToIPFS(report, {
      pinataMetadata: {
        name: `skill-report-${Date.now()}`,
      },
    });
    return result.IpfsHash;
  } catch (e) {
    const err = new Error("Failed to store report on IPFS.") as Error & { statusCode: number };
    err.statusCode = 502;
    throw err;
  }
}

export async function fetchReport(cid: string): Promise<SkillReport> {
  // Gateway URL is intentionally explicit to keep IPFS reads browser-friendly and cacheable.
  const url = `https://gateway.pinata.cloud/ipfs/${cid}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    const err = new Error(`Failed to fetch report from IPFS: ${res.status}`) as Error & { statusCode: number };
    err.statusCode = 502;
    throw err;
  }
  return res.json() as Promise<SkillReport>;
}
