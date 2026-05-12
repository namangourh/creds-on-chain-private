import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { fetchReport } from "../services/ipfsClient";

const router = Router();

router.get("/:cid", async (req: Request, res: Response) => {
  const { cid } = req.params;
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header." });
    return;
  }

  const token = authHeader.slice(7);
  const secret = process.env.JWT_SECRET!;

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, secret) as jwt.JwtPayload;
  } catch {
    res.status(401).json({ error: "Invalid or expired token." });
    return;
  }

  if (payload.cid !== cid) {
    // CID binding prevents a valid token from being reused for other reports.
    res.status(403).json({ error: "Token is not valid for this report." });
    return;
  }

  try {
    const report = await fetchReport(cid);
    res.json(report);
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
