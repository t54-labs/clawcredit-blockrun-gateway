# @t54-labs/clawcredit-blockrun-sdk

SDK + standalone OpenAI-compatible gateway for **BlockRun inference paid via claw.credit SDK**.

This package provides:

- SDK helpers (`createClawCreditFetch`, `startGateway`)
- a standalone gateway service (`POST /v1/chat/completions`)
- a setup script for OpenClaw integration

## Why this exists

- Keep payment integration as a standalone `t54-labs` solution
- Let `ClawRouter` (or any other client) consume it as a low-coupling backend
- Standardize on official claw.credit SDK flow

## Quick start

```bash
npm install
npm run build

export CLAWCREDIT_API_TOKEN=claw_xxx
export CLAWCREDIT_CHAIN=BASE
export CLAWCREDIT_ASSET=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

node dist/cli.js
# listening on http://127.0.0.1:3402
```

## SDK usage

```ts
import { startGateway } from "@t54-labs/clawcredit-blockrun-sdk";

const gateway = await startGateway({
  port: 3402,
  clawCredit: {
    apiToken: process.env.CLAWCREDIT_API_TOKEN!,
    chain: "BASE",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  },
});
```

## OpenClaw one-command setup

Use the helper script to wire this gateway into OpenClaw as a standalone provider:

```bash
bash scripts/setup-openclaw-clawcredit-gateway.sh --token claw_xxx
```

This will:

- build/start the standalone gateway in background
- patch OpenClaw provider config (`blockruncc` -> `http://127.0.0.1:3402/v1`)
- restart OpenClaw gateway
- set active model to `blockruncc/premium`

Dry-run first:

```bash
bash scripts/setup-openclaw-clawcredit-gateway.sh --token claw_xxx --dry-run
```

Then call:

```bash
curl -sS http://127.0.0.1:3402/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model":"blockrun/premium",
    "messages":[{"role":"user","content":"hi"}],
    "max_tokens":64
  }'
```

## Environment variables

- `CLAWCREDIT_API_TOKEN` (required)
- `CLAWCREDIT_API_BASE` (default: `https://api.claw.credit`)
- `CLAWCREDIT_CHAIN` (default: `BASE`)
- `CLAWCREDIT_ASSET` (default: Base USDC)
- `CLAWCREDIT_AGENT` (optional)
- `CLAWCREDIT_AGENT_ID` (optional)
- `CLAWCREDIT_DEFAULT_AMOUNT_USD` (default: `0.1`)
- `BLOCKRUN_API_BASE` (default: `https://blockrun.ai/api`)
- `HOST` (default: `127.0.0.1`)
- `PORT` / `GATEWAY_PORT` (default: `3402`)

## Endpoints

- `GET /health`
- `POST /v1/chat/completions`

## Development

```bash
npm run typecheck
npm run test
npm run build
```
