import assert from "node:assert/strict";

import { resolveChainAssetDefaults } from "../src/payment-defaults.js";

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

function run(): void {
  console.log("\n═══ Chain/Asset Defaults Test ═══\n");

  try {
    testBaseDefaultsToUsdc();
    testXrplDefaultsToRlusd();
    testExplicitAssetWins();
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
