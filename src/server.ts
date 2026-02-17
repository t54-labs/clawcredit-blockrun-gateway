import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { createClawCreditFetch, type ClawCreditConfig } from "./clawcredit.js";

export type GatewayOptions = {
  port?: number;
  host?: string;
  blockrunApiBase?: string;
  clawCredit: ClawCreditConfig;
  defaultAmountUsd?: number;
};

export type GatewayInstance = {
  port: number;
  baseUrl: string;
  close: () => Promise<void>;
};

type CompletionRequest = {
  model?: string;
  stream?: boolean;
  max_tokens?: number;
  messages?: Array<Record<string, unknown>>;
};

const VALID_ROLES = new Set(["system", "user", "assistant", "tool", "function"]);
const ROLE_MAPPINGS: Record<string, string> = {
  developer: "system",
  model: "assistant",
};

function normalizeMessageRoles(messages: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  if (messages.length === 0) return messages;

  let hasChanges = false;
  const normalized = messages.map((msg) => {
    const role = msg.role;
    if (typeof role !== "string") {
      hasChanges = true;
      return { ...msg, role: "user" };
    }
    if (VALID_ROLES.has(role)) return msg;

    const mappedRole = ROLE_MAPPINGS[role];
    if (mappedRole) {
      hasChanges = true;
      return { ...msg, role: mappedRole };
    }

    hasChanges = true;
    return { ...msg, role: "user" };
  });

  return hasChanges ? normalized : messages;
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const text = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(text).toString(),
  });
  res.end(text);
}

function extractMaxTokens(body: Buffer): number {
  try {
    const parsed = JSON.parse(body.toString("utf-8")) as CompletionRequest;
    return parsed.max_tokens && Number.isFinite(parsed.max_tokens) ? parsed.max_tokens : 512;
  } catch {
    return 512;
  }
}

function normalizePayloadForGateway(body: Buffer): Buffer {
  try {
    const parsed = JSON.parse(body.toString("utf-8")) as CompletionRequest;
    if (parsed.stream === true) parsed.stream = false;
    if (Array.isArray(parsed.messages)) {
      parsed.messages = normalizeMessageRoles(parsed.messages);
    }
    return Buffer.from(JSON.stringify(parsed));
  } catch {
    return body;
  }
}

function parseJsonIfPossible(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function safeHeadersObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function createCaptureWriter() {
  const enabled =
    process.env.GATEWAY_CAPTURE === "1" || process.env.GATEWAY_CAPTURE === "true";
  const file =
    (process.env.GATEWAY_CAPTURE_FILE || "/tmp/clawcredit-blockrun-gateway/.run/capture.jsonl").trim();

  if (!enabled) {
    return (_entry: unknown) => {};
  }

  mkdirSync(dirname(file), { recursive: true });
  return (entry: unknown) => {
    try {
      appendFileSync(file, `${JSON.stringify(entry)}\n`, "utf-8");
    } catch {
      // Best-effort debug capture only.
    }
  };
}

export async function startGateway(options: GatewayOptions): Promise<GatewayInstance> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 3402;
  const apiBase = (options.blockrunApiBase ?? "https://blockrun.ai/api").replace(/\/+$/, "");
  const defaultAmountUsd = Number.isFinite(options.defaultAmountUsd)
    ? Number(options.defaultAmountUsd)
    : 0.1;
  const payFetch = createClawCreditFetch(options.clawCredit);
  const writeCapture = createCaptureWriter();

  const server = createServer(async (req, res) => {
    if (req.url === "/health") {
      return sendJson(res, 200, {
        status: "ok",
        service: "clawcredit-blockrun-gateway",
        payment_mode: "clawcredit",
      });
    }

    if (req.url !== "/v1/chat/completions" || req.method !== "POST") {
      return sendJson(res, 404, { error: "Not found" });
    }

    try {
      const requestId = randomUUID();
      const startedAt = Date.now();
      const body = await readBody(req);
      const normalized = normalizePayloadForGateway(body);
      const normalizedText = normalized.toString("utf-8");
      const maxTokens = extractMaxTokens(normalized);

      const estimatedMicros = String(
        Math.max(10_000, Math.round(defaultAmountUsd * 1_000_000 + maxTokens * 8)),
      );

      const upstreamUrl = `${apiBase}/v1/chat/completions`;

      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value !== "string") continue;
        const lower = key.toLowerCase();
        if (lower === "host" || lower === "content-length" || lower === "connection") continue;
        headers.set(key, value);
      }
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }

      writeCapture({
        kind: "request",
        requestId,
        at: new Date().toISOString(),
        source: {
          userAgent: req.headers["user-agent"] || null,
          xOpenClawSession: req.headers["x-openclaw-session-id"] || null,
        },
        method: "POST",
        target: upstreamUrl,
        estimatedMicros,
        headers: safeHeadersObject(headers),
        body: parseJsonIfPossible(normalizedText),
      });

      const upstream = await payFetch(
        upstreamUrl,
        {
          method: "POST",
          headers,
          body: new Uint8Array(normalized),
        },
        { estimatedAmount: estimatedMicros },
      );

      const responseBody = await upstream.text();
      writeCapture({
        kind: "response",
        requestId,
        at: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        status: upstream.status,
        headers: safeHeadersObject(upstream.headers),
        body: parseJsonIfPossible(responseBody),
      });
      res.writeHead(upstream.status, {
        "content-type": upstream.headers.get("content-type") || "application/json",
      });
      res.end(responseBody);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      writeCapture({
        kind: "error",
        at: new Date().toISOString(),
        message: msg,
      });
      sendJson(res, 502, { error: msg });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  const actualPort = (server.address() as AddressInfo).port;
  return {
    port: actualPort,
    baseUrl: `http://${host}:${actualPort}`,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}
