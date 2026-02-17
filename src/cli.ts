#!/usr/bin/env node
import { startGateway } from "./server.js";

const DEFAULT_BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

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
  const blockrunApiBase =
    (process.env.BLOCKRUN_API_BASE || "https://blockrun.ai/api").trim() ||
    "https://blockrun.ai/api";
  const defaultAmountUsd = Number(process.env.CLAWCREDIT_DEFAULT_AMOUNT_USD || 0.1);

  const clawCredit = {
    baseUrl: (process.env.CLAWCREDIT_API_BASE || "https://api.claw.credit").trim(),
    apiToken: required("CLAWCREDIT_API_TOKEN"),
    chain: (process.env.CLAWCREDIT_CHAIN || "BASE").trim(),
    asset: (process.env.CLAWCREDIT_ASSET || DEFAULT_BASE_USDC).trim(),
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
