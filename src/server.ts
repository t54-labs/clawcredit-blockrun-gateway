import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { createClawCreditFetch, type ClawCreditConfig } from "./clawcredit.js";
import { USER_AGENT } from "./version.js";

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

type NormalizedGatewayRequest = {
  body: Buffer;
  requestedStream: boolean;
};

type CompletionResponseChoice = {
  index?: number;
  message?: {
    role?: string;
    content?: string;
    tool_calls?: unknown[];
  };
  delta?: {
    role?: string;
    content?: string;
    tool_calls?: unknown[];
  };
  finish_reason?: string | null;
};

type CompletionResponse = {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: CompletionResponseChoice[];
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

function normalizePayloadForGateway(body: Buffer): NormalizedGatewayRequest {
  try {
    const parsed = JSON.parse(body.toString("utf-8")) as CompletionRequest;
    const requestedStream = parsed.stream === true;
    if (parsed.stream === true) parsed.stream = false;
    if (Array.isArray(parsed.messages)) {
      parsed.messages = normalizeMessageRoles(parsed.messages);
    }
    return { body: Buffer.from(JSON.stringify(parsed)), requestedStream };
  } catch {
    return { body, requestedStream: false };
  }
}

function convertJsonCompletionToSseBody(responseBody: string): string {
  let payload: CompletionResponse | null = null;
  try {
    payload = JSON.parse(responseBody) as CompletionResponse;
  } catch {
    payload = null;
  }

  if (!payload || !Array.isArray(payload.choices) || payload.choices.length === 0) {
    return `data: ${responseBody}\n\ndata: [DONE]\n\n`;
  }

  const created = payload.created ?? Math.floor(Date.now() / 1000);
  const baseChunk = {
    id: payload.id ?? `chatcmpl-${Date.now()}`,
    object: "chat.completion.chunk",
    created,
    model: payload.model ?? "unknown",
    system_fingerprint: null,
  };

  const out: string[] = [];
  for (const choice of payload.choices) {
    const index = Number.isFinite(choice.index) ? Number(choice.index) : 0;
    const role = choice.message?.role ?? choice.delta?.role ?? "assistant";
    const content = choice.message?.content ?? choice.delta?.content ?? "";
    const toolCalls = choice.message?.tool_calls ?? choice.delta?.tool_calls;

    out.push(
      `data: ${JSON.stringify({
        ...baseChunk,
        choices: [{ index, delta: { role }, logprobs: null, finish_reason: null }],
      })}\n\n`,
    );

    if (typeof content === "string" && content.length > 0) {
      out.push(
        `data: ${JSON.stringify({
          ...baseChunk,
          choices: [{ index, delta: { content }, logprobs: null, finish_reason: null }],
        })}\n\n`,
      );
    }

    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      out.push(
        `data: ${JSON.stringify({
          ...baseChunk,
          choices: [{ index, delta: { tool_calls: toolCalls }, logprobs: null, finish_reason: null }],
        })}\n\n`,
      );
    }

    out.push(
      `data: ${JSON.stringify({
        ...baseChunk,
        choices: [
          {
            index,
            delta: {},
            logprobs: null,
            finish_reason:
              Array.isArray(toolCalls) && toolCalls.length > 0
                ? "tool_calls"
                : (choice.finish_reason ?? "stop"),
          },
        ],
      })}\n\n`,
    );
  }

  out.push("data: [DONE]\n\n");
  return out.join("");
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
      const normalizedReq = normalizePayloadForGateway(body);
      const normalized = normalizedReq.body;
      const requestedStream = normalizedReq.requestedStream;
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
      headers.set("user-agent", USER_AGENT);

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
      if (requestedStream && upstream.ok) {
        const sseBody = convertJsonCompletionToSseBody(responseBody);
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        res.end(sseBody);
        return;
      }

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
