import assert from "node:assert/strict";

import { resolveBlockrunApiBase, resolveChainAssetDefaults } from "../src/payment-defaults.js";

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

function testBaseDefaultsToUsdc(): void {
  const result = resolveChainAssetDefaults({
    chain: "base",
  });
  check(result.chain === "BASE", "normalizes chain to uppercase");
  check(result.asset === "USDC", "defaults BASE asset to USDC");
}

function testXrplDefaultsToRlusd(): void {
  const result = resolveChainAssetDefaults({
    chain: "xrpl",
  });
  check(result.chain === "XRPL", "supports XRPL chain");
  check(result.asset === "RLUSD", "defaults XRPL asset to RLUSD");
}

function testExplicitAssetWins(): void {
  const result = resolveChainAssetDefaults({
    chain: "XRPL",
    asset: "CUSTOM_ASSET",
  });
  check(result.asset === "CUSTOM_ASSET", "keeps explicit asset value");
}

function testXrplDefaultsToXrplBlockrunApi(): void {
  const result = resolveBlockrunApiBase({
    chain: "XRPL",
  });
  check(result === "https://xrpl.blockrun.ai/api", "defaults XRPL endpoint to xrpl.blockrun.ai");
}

function testBaseDefaultsToBaseBlockrunApi(): void {
  const result = resolveBlockrunApiBase({
    chain: "BASE",
  });
  check(result === "https://blockrun.ai/api", "defaults BASE endpoint to blockrun.ai");
}

function testExplicitBlockrunApiWins(): void {
  const result = resolveBlockrunApiBase({
    chain: "XRPL",
    blockrunApiBase: "https://custom.blockrun.example/api",
  });
  check(result === "https://custom.blockrun.example/api", "keeps explicit BLOCKRUN_API_BASE value");
}

function run(): void {
  console.log("\n═══ Chain/Asset Defaults Test ═══\n");

  try {
    testBaseDefaultsToUsdc();
    testXrplDefaultsToRlusd();
    testExplicitAssetWins();
    testXrplDefaultsToXrplBlockrunApi();
    testBaseDefaultsToBaseBlockrunApi();
    testExplicitBlockrunApiWins();
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
