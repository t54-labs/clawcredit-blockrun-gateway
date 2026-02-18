import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { startGateway } from "../src/server.js";

const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);
const pkg = require(join(__dirname, "..", "package.json")) as { version: string };
const EXPECTED_USER_AGENT = `clawcredit-blockrun-gateway/${pkg.version}`;

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg}`);
    failed++;
  }
}

async function startMockClawCreditServer() {
  let lastHeaders: Record<string, string> = {};
  let lastPayload: Record<string, unknown> | null = null;

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.url !== "/v1/transaction/pay" || req.method !== "POST") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not_found" }));
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const raw = Buffer.concat(chunks).toString("utf-8");
    const body = JSON.parse(raw) as Record<string, unknown>;

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") headers[key.toLowerCase()] = value;
    }

    lastHeaders = headers;
    lastPayload = body;

    const merchantResponse = {
      id: "chatcmpl-mock",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "moonshot/kimi-k2.5",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "hello from standalone gateway" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "success",
        tx_hash: "mock-tx-hash",
        chain: "BASE",
        amount_charged: 0.01,
        remaining_balance: 10.0,
        merchant_response: merchantResponse,
      }),
    );
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as AddressInfo).port;

  return {
    port,
    getLastHeaders: () => lastHeaders,
    getLastPayload: () => lastPayload,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function run(): Promise<void> {
  console.log("\n═══ Standalone Gateway Integration Test ═══\n");

  const credit = await startMockClawCreditServer();
  const gateway = await startGateway({
    port: 0,
    blockrunApiBase: "https://blockrun.ai/api",
    clawCredit: {
      baseUrl: `http://127.0.0.1:${credit.port}`,
      apiToken: "claw_test_token",
      chain: "BASE",
      asset: BASE_USDC,
    },
    defaultAmountUsd: 0.1,
  });

  try {
    const health = await fetch(`${gateway.baseUrl}/health`);
    assert(health.ok, "health endpoint returns 200");

    const response = await fetch(`${gateway.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "developer", content: "You are a helpful assistant." },
          { role: "user", content: "Say hello" },
        ],
        max_tokens: 32,
        stream: true,
      }),
    });

    assert(response.ok, `gateway request succeeded (${response.status})`);

    const contentType = response.headers.get("content-type") || "";
    assert(
      contentType.includes("text/event-stream"),
      "stream=true returns SSE content-type",
    );

    const sseText = await response.text();
    const dataLines = sseText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data: "));
    assert(dataLines.length > 0, "SSE response includes data lines");

    const hasDone = dataLines.some((line) => line === "data: [DONE]");
    assert(hasDone, "SSE response includes [DONE] terminator");

    const chunkPayloads = dataLines
      .filter((line) => line !== "data: [DONE]")
      .map((line) => JSON.parse(line.slice("data: ".length)) as Record<string, unknown>);

    const hasChunkObject = chunkPayloads.some(
      (payload) => payload.object === "chat.completion.chunk",
    );
    assert(hasChunkObject, "SSE payload uses OpenAI chat.completion.chunk objects");

    const streamedText = chunkPayloads
      .map((payload) => {
        const choices = payload.choices as Array<Record<string, unknown>> | undefined;
        const delta = choices?.[0]?.delta as Record<string, unknown> | undefined;
        return typeof delta?.content === "string" ? delta.content : "";
      })
      .join("");
    assert(streamedText.includes("standalone gateway"), "SSE delta includes model content");

    const headers = credit.getLastHeaders();
    assert(
      headers.authorization === "Bearer claw_test_token",
      "claw.credit call included Authorization header",
    );

    const payload = credit.getLastPayload() as Record<string, unknown> | null;
    assert(payload != null, "claw.credit pay payload captured");
    if (payload) {
      const tx = payload.transaction as Record<string, unknown>;
      const reqBody = payload.request_body as Record<string, unknown>;
      const http = reqBody.http as Record<string, unknown>;
      const httpHeaders = (http.headers ?? {}) as Record<string, unknown>;
      const body = reqBody.body as Record<string, unknown>;
      const messages = Array.isArray(body.messages)
        ? (body.messages as Array<Record<string, unknown>>)
        : [];

      assert(tx.chain === "BASE", "transaction.chain forwarded");
      assert(tx.asset === BASE_USDC, "transaction.asset forwarded");
      assert(typeof tx.amount === "number" && (tx.amount as number) > 0, "transaction.amount > 0");
      assert(
        typeof tx.recipient === "string" &&
          (tx.recipient as string).endsWith("/v1/chat/completions"),
        "transaction.recipient points to BlockRun chat endpoint",
      );
      assert(http.url === tx.recipient, "request_body.http.url matches transaction.recipient");
      assert(
        httpHeaders["user-agent"] === EXPECTED_USER_AGENT,
        "request_body.http.headers.user-agent uses clawcredit-blockrun-gateway/<version>",
      );
      assert(body.stream === false, "stream=true request normalized to stream=false");
      assert(messages.length === 2, "message array forwarded");
      assert(messages[0]?.role === "system", "developer role normalized to system");
      assert(messages[1]?.role === "user", "user role preserved");
    }
  } finally {
    await gateway.close();
    await credit.close();
  }

  console.log("\n═══════════════════════════════════");
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log("═══════════════════════════════════\n");
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
