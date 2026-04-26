import crypto from "node:crypto";
import { RequestHandler } from "express";
import { env } from "../config/env";

type JwtPayload = {
  aud?: string | string[];
  dest?: string;
  exp?: number;
  nbf?: number;
  iss?: string;
  sub?: string;
};

function decodeBase64Url(input: string): Buffer {
  const padLength = (4 - (input.length % 4)) % 4;
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padLength);
  return Buffer.from(normalized, "base64");
}

function isAllowedAudience(aud: JwtPayload["aud"]): boolean {
  if (typeof aud === "string") {
    return aud === env.shopifyApiKey;
  }
  if (Array.isArray(aud)) {
    return aud.includes(env.shopifyApiKey);
  }
  return false;
}

function verifyJwt(token: string): JwtPayload {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid token format");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const headerJson = decodeBase64Url(encodedHeader).toString("utf8");
  const payloadJson = decodeBase64Url(encodedPayload).toString("utf8");
  const header = JSON.parse(headerJson) as { alg?: string; typ?: string };
  const payload = JSON.parse(payloadJson) as JwtPayload;

  if (header.alg !== "HS256") {
    throw new Error("Unsupported token algorithm");
  }

  const signedData = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = crypto
    .createHmac("sha256", env.shopifyApiSecret)
    .update(signedData, "utf8")
    .digest("base64url");

  const a = Buffer.from(expectedSignature, "utf8");
  const b = Buffer.from(encodedSignature, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("Token signature mismatch");
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && payload.exp <= nowSec) {
    throw new Error("Session token expired");
  }
  if (typeof payload.nbf === "number" && payload.nbf > nowSec) {
    throw new Error("Session token not active yet");
  }
  if (!isAllowedAudience(payload.aud)) {
    throw new Error("Invalid token audience");
  }
  if (typeof payload.dest !== "string" || !payload.dest.includes(".myshopify.com")) {
    throw new Error("Invalid destination shop");
  }

  return payload;
}

export const verifyShopifySessionToken: RequestHandler = (req, res, next) => {
  try {
    const auth = req.header("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) {
      return res.status(401).json({ ok: false, message: "Missing bearer token" });
    }

    const token = auth.slice("Bearer ".length).trim();
    if (!token) {
      return res.status(401).json({ ok: false, message: "Missing session token" });
    }

    const payload = verifyJwt(token);
    res.locals.shopifySession = payload;
    return next();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid session token";
    return res.status(401).json({ ok: false, message });
  }
};
