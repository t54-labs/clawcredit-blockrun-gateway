"use strict";

const FALLBACK_MODEL_IDS = [
  "openai/gpt-4o",
  "openai/gpt-4o-mini",
  "anthropic/claude-sonnet-4",
  "anthropic/claude-haiku-4.5",
];

function asNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function inferReasoning(modelId) {
  const id = String(modelId || "").toLowerCase();
  return (
    id.includes("reasoner") ||
    id.includes("reasoning") ||
    id.includes("/o1") ||
    id.includes("/o3") ||
    id.includes("/o4") ||
    id.includes("opus") ||
    id.includes("sonnet") ||
    id.includes("gpt-5")
  );
}

function inferInputModes(modelId) {
  const id = String(modelId || "").toLowerCase();
  if (
    id.includes("gpt-4o") ||
    id.includes("gemini") ||
    id.includes("vision") ||
    id.includes("claude-sonnet")
  ) {
    return ["text", "image"];
  }
  return ["text"];
}

function toModelConfig(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id) return null;

  const pricing =
    raw.pricing && typeof raw.pricing === "object" && !Array.isArray(raw.pricing) ? raw.pricing : {};

  return {
    id,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : id,
    api: "openai-completions",
    reasoning: inferReasoning(id),
    input: inferInputModes(id),
    cost: {
      input: asNumber(pricing.input, 0),
      output: asNumber(pricing.output, 0),
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: asNumber(raw.contextWindow ?? raw.context_window, 200000),
    maxTokens: asNumber(raw.maxTokens ?? raw.max_tokens ?? raw.maxOutput, 65536),
  };
}

function extractUpstreamModels(payload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.data)) {
    return [];
  }

  const out = [];
  const seen = new Set();
  for (const item of payload.data) {
    const model = toModelConfig(item);
    if (!model) continue;
    if (seen.has(model.id)) continue;
    seen.add(model.id);
    out.push(model);
  }
  return out;
}

function buildFallbackModels() {
  return FALLBACK_MODEL_IDS.map((id) =>
    toModelConfig({
      id,
      pricing: { input: 0, output: 0 },
      context_window: 200000,
      max_tokens: 65536,
    }),
  ).filter(Boolean);
}

function pickDefaultModel(models, requestedDefaultModelId) {
  const requested = String(requestedDefaultModelId || "").trim();
  const ids = new Set((models || []).map((m) => m.id));
  if (requested && ids.has(requested)) return requested;
  if (ids.has("openai/gpt-4o")) return "openai/gpt-4o";
  if (Array.isArray(models) && models.length > 0) return models[0].id;
  return "openai/gpt-4o";
}

function ensureObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function syncOpenClawConfig(config, options) {
  const safeConfig = ensureObject(config);
  const providerId = String(options.providerId || "").trim();
  const baseUrl = String(options.baseUrl || "").trim();
  const models = Array.isArray(options.models) ? options.models : [];

  safeConfig.models = ensureObject(safeConfig.models);
  safeConfig.models.providers = ensureObject(safeConfig.models.providers);

  const existing = ensureObject(safeConfig.models.providers[providerId]);
  existing.baseUrl = baseUrl;
  existing.apiKey = "clawcredit-gateway";
  existing.api = "openai-completions";
  existing.models = models;
  safeConfig.models.providers[providerId] = existing;

  const effectiveDefaultModelId = pickDefaultModel(models, options.requestedDefaultModelId);

  safeConfig.agents = ensureObject(safeConfig.agents);
  safeConfig.agents.defaults = ensureObject(safeConfig.agents.defaults);
  const allowlist = ensureObject(safeConfig.agents.defaults.models);

  for (const key of Object.keys(allowlist)) {
    if (key.startsWith(`${providerId}/`)) {
      delete allowlist[key];
    }
  }
  for (const model of models) {
    allowlist[`${providerId}/${model.id}`] = {};
  }
  safeConfig.agents.defaults.models = allowlist;

  return {
    updatedConfig: safeConfig,
    effectiveDefaultModelId,
  };
}

module.exports = {
  FALLBACK_MODEL_IDS,
  extractUpstreamModels,
  buildFallbackModels,
  pickDefaultModel,
  syncOpenClawConfig,
};
