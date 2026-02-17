import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
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
};

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
    return Buffer.from(JSON.stringify(parsed));
  } catch {
    return body;
  }
}

export async function startGateway(options: GatewayOptions): Promise<GatewayInstance> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 3402;
  const apiBase = (options.blockrunApiBase ?? "https://blockrun.ai/api").replace(/\/+$/, "");
  const defaultAmountUsd = Number.isFinite(options.defaultAmountUsd)
    ? Number(options.defaultAmountUsd)
    : 0.1;
  const payFetch = createClawCreditFetch(options.clawCredit);

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
      const body = await readBody(req);
      const normalized = normalizePayloadForGateway(body);
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
      res.writeHead(upstream.status, {
        "content-type": upstream.headers.get("content-type") || "application/json",
      });
      res.end(responseBody);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
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
