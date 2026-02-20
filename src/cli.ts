#!/usr/bin/env node
import { startGateway } from "./server.js";
import { resolveBlockrunApiBase, resolveChainAssetDefaults } from "./payment-defaults.js";

function required(name: string): string {
  const value = (process.env[name] || "").trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function main(): Promise<void> {
  const port = Number(process.env.PORT || process.env.GATEWAY_PORT || 3402);
  const host = (process.env.HOST || "127.0.0.1").trim();
  const defaultAmountUsd = Number(process.env.CLAWCREDIT_DEFAULT_AMOUNT_USD || 0.1);
  const chainAndAsset = resolveChainAssetDefaults({
    chain: process.env.CLAWCREDIT_CHAIN,
    asset: process.env.CLAWCREDIT_ASSET,
  });
  const blockrunApiBase = resolveBlockrunApiBase({
    chain: chainAndAsset.chain,
    blockrunApiBase: process.env.BLOCKRUN_API_BASE,
  });

  const clawCredit = {
    baseUrl: (process.env.CLAWCREDIT_API_BASE || "https://api.claw.credit").trim(),
    apiToken: required("CLAWCREDIT_API_TOKEN"),
    chain: chainAndAsset.chain,
    asset: chainAndAsset.asset,
    agent: (process.env.CLAWCREDIT_AGENT || "").trim() || undefined,
    agentId: (process.env.CLAWCREDIT_AGENT_ID || "").trim() || undefined,
  };

  const gateway = await startGateway({
    port,
    host,
    blockrunApiBase,
    clawCredit,
    defaultAmountUsd,
  });

  console.log(`[clawcredit-blockrun-gateway] listening on ${gateway.baseUrl}`);
  console.log(
    `[clawcredit-blockrun-gateway] blockrun=${blockrunApiBase} clawcredit=${clawCredit.baseUrl} chain=${clawCredit.chain}`,
  );

  const shutdown = async () => {
    await gateway.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[clawcredit-blockrun-gateway] startup failed: ${msg}`);
  process.exit(1);
});
