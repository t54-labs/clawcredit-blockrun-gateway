import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
type SyncedModel = {
  id: string;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  [key: string]: unknown;
};

const {
  extractUpstreamModels,
  syncOpenClawConfig,
} = require("../scripts/openclaw-model-sync.cjs") as {
  extractUpstreamModels: (payload: unknown) => SyncedModel[];
  syncOpenClawConfig: (
    config: Record<string, unknown>,
    options: {
      providerId: string;
      baseUrl: string;
      requestedDefaultModelId: string;
      models: SyncedModel[];
    },
  ) => { updatedConfig: Record<string, unknown>; effectiveDefaultModelId: string };
};

let passed = 0;
let failed = 0;

function check(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

function testExtractUpstreamModels(): void {
  const payload = {
    object: "list",
    data: [
      {
        id: "openai/gpt-4o",
        pricing: { input: 2.5, output: 10 },
      },
      {
        id: "anthropic/claude-opus-4.5",
        pricing: { input: 5, output: 25 },
        context_window: 200000,
        max_tokens: 8192,
      },
    ],
  };

  const models = extractUpstreamModels(payload);
  check(models.length === 2, "extracts all model entries");
  check(models[1]?.id === "anthropic/claude-opus-4.5", "keeps full upstream model id");
  check(models[1]?.cost?.output === 25, "maps pricing.output");
}

function testSyncOpenClawConfig(): void {
  const models = extractUpstreamModels({
    data: [
      { id: "openai/gpt-4o", pricing: { input: 2.5, output: 10 } },
      { id: "anthropic/claude-opus-4.5", pricing: { input: 5, output: 25 } },
    ],
  });

  const inputConfig = {
    models: { providers: {} },
    agents: {
      defaults: {
        models: {
          "blockruncc/premium": {},
          "other-provider/model-x": {},
        },
      },
    },
  };

  const { updatedConfig, effectiveDefaultModelId } = syncOpenClawConfig(inputConfig, {
    providerId: "blockruncc",
    baseUrl: "http://127.0.0.1:3402/v1",
    requestedDefaultModelId: "openai/gpt-4o",
    models,
  });

  const providerModels = (
    (updatedConfig.models as Record<string, unknown>)?.providers as Record<string, unknown>
  )?.blockruncc as Record<string, unknown>;

  const allowed =
    (((updatedConfig.agents as Record<string, unknown>)?.defaults as Record<string, unknown>)
      ?.models as Record<string, unknown>) || {};

  check(
    Array.isArray(providerModels?.models) &&
      (providerModels.models as Array<Record<string, unknown>>).some(
        (m) => m.id === "anthropic/claude-opus-4.5",
      ),
    "writes full upstream model IDs to provider models",
  );
  check(effectiveDefaultModelId === "openai/gpt-4o", "keeps requested default if present");
  check(!("blockruncc/premium" in allowed), "removes stale premium alias from allowlist");
  check(
    "blockruncc/anthropic/claude-opus-4.5" in allowed,
    "adds synced model IDs to allowlist",
  );
  check("other-provider/model-x" in allowed, "preserves unrelated provider allowlist entries");
}

function run(): void {
  console.log("\n═══ OpenClaw Model Sync Test ═══\n");

  try {
    testExtractUpstreamModels();
    testSyncOpenClawConfig();
  } catch (err) {
    console.error(err);
    failed++;
  }

  console.log("\n═══════════════════════════════════");
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log("═══════════════════════════════════\n");
  process.exit(failed > 0 ? 1 : 0);
}

run();
