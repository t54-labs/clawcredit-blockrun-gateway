# @t54-labs/clawcredit-blockrun-sdk

[![npm version](https://img.shields.io/npm/v/@t54-labs/clawcredit-blockrun-sdk)](https://www.npmjs.com/package/@t54-labs/clawcredit-blockrun-sdk)
[![npm downloads](https://img.shields.io/npm/dm/@t54-labs/clawcredit-blockrun-sdk)](https://www.npmjs.com/package/@t54-labs/clawcredit-blockrun-sdk)
[![CI](https://img.shields.io/github/actions/workflow/status/t54-labs/clawcredit-blockrun-gateway/ci.yml?branch=main)](https://github.com/t54-labs/clawcredit-blockrun-gateway/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Standalone OpenAI-compatible gateway and SDK helpers to run BlockRun inference paid through `claw.credit`.

## What this repo provides

- SDK helpers: `createClawCreditFetch`, `startGateway`
- Standalone gateway endpoint: `POST /v1/chat/completions`
- OpenClaw setup automation: `scripts/setup-openclaw-clawcredit-gateway.sh`
- AI setup skill: [`SKILL.md`](./SKILL.md)

## Table of contents

- [Architecture](#architecture)
- [Hard prerequisite: register ClawCredit first](#hard-prerequisite-register-clawcredit-first)
- [Install and run](#install-and-run)
- [OpenClaw one-command setup](#openclaw-one-command-setup)
- [AI agent usage](#ai-agent-usage)
- [Configuration](#configuration)
- [Model behavior](#model-behavior)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Contributing and security](#contributing-and-security)

## Architecture

`OpenClaw / client -> clawcredit-blockrun-gateway -> claw.credit SDK -> BlockRun API`

The gateway normalizes request payloads for compatibility, handles payment through claw.credit, and returns OpenAI-style chat completion responses.

## Hard prerequisite: register ClawCredit first

Before this gateway can make paid inference calls, the agent must be registered with ClawCredit and have usable credit/token state.

Use the official ClawCredit skill as the source of truth:

- Official skill: `https://www.claw.credit/SKILL.md`
- Privacy policy (required consent before registration): `https://www.claw.credit/privacy`

At minimum, complete these steps first:

1. Register via ClawCredit SDK flow (with explicit privacy consent).
2. Ensure credentials are persisted (typically `~/.openclaw/agents/<agent>/agent/clawcredit.json`).
3. Confirm your token is valid and pre-qualification/credit status allows payment.
4. Export or pass the token to this gateway as `CLAWCREDIT_API_TOKEN`.

If registration/pre-qualification is not ready, payment calls can fail with `403` or `402`.

## Install and run

```bash
npm install
npm run build

export CLAWCREDIT_API_TOKEN=claw_xxx
export CLAWCREDIT_CHAIN=BASE
export CLAWCREDIT_ASSET=USDC

node dist/cli.js
# listening on http://127.0.0.1:3402
```

Quick health check:

```bash
curl -sS http://127.0.0.1:3402/health
```

## OpenClaw one-command setup

```bash
bash scripts/setup-openclaw-clawcredit-gateway.sh --token claw_xxx
```

This script will:

1. Build/start the gateway in background.
2. Sync real model IDs from `https://blockrun.ai/api/v1/models`.
3. Patch OpenClaw provider `blockruncc -> http://127.0.0.1:3402/v1`.
4. Restart OpenClaw gateway.
5. Set default model to `blockruncc/anthropic/claude-sonnet-4`.

Dry run:

```bash
bash scripts/setup-openclaw-clawcredit-gateway.sh --token claw_xxx --dry-run
```

## AI agent usage

For autonomous setup, use both skills together:

1. **Official ClawCredit registration skill**
   - `https://www.claw.credit/SKILL.md`
   - Covers consent, registration, pre-qualification checks, and repayment lifecycle.
2. **This repository's gateway setup skill**
   - [`./SKILL.md`](./SKILL.md)
   - Covers local gateway wiring, OpenClaw provider patching, and runtime verification.

Recommended order: finish official ClawCredit registration flow first, then run this repo's setup skill.

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `CLAWCREDIT_API_TOKEN` | Yes | - | ClawCredit API token used for payment calls |
| `CLAWCREDIT_API_BASE` | No | `https://api.claw.credit` | ClawCredit API base URL |
| `CLAWCREDIT_CHAIN` | No | `BASE` | Settlement chain for payment |
| `CLAWCREDIT_ASSET` | No | `USDC` | Settlement asset |
| `CLAWCREDIT_AGENT` | No | - | Optional agent name |
| `CLAWCREDIT_AGENT_ID` | No | - | Optional agent ID |
| `CLAWCREDIT_DEFAULT_AMOUNT_USD` | No | `0.1` | Baseline estimate for payment request |
| `BLOCKRUN_API_BASE` | No | `https://blockrun.ai/api` | Upstream BlockRun API base |
| `HOST` | No | `127.0.0.1` | Gateway bind host |
| `PORT` / `GATEWAY_PORT` | No | `3402` | Gateway bind port |

## Model behavior

- The gateway exposes real upstream model IDs from `BLOCKRUN_API_BASE/v1/models`.
- No synthetic "meta model" alias is required.
- OpenClaw-facing model names are `blockruncc/<upstream-model-id>`.

Example:

- `blockruncc/openai/gpt-4o`
- `blockruncc/anthropic/claude-sonnet-4`
- `blockruncc/anthropic/claude-opus-4.5`
- `blockruncc/moonshot/kimi-k2.5`

List current synced models:

```bash
openclaw models show | rg '^  blockruncc/'
```

## Troubleshooting

- `401 Unauthorized`
  - Token invalid/expired or wrong environment token.
- `403 prequalification_pending`
  - ClawCredit pre-qualification is not complete yet.
- `402 Payment Required`
  - Credit/repayment state blocks payment (check dashboard + repayment status).

Useful checks:

```bash
openclaw providers check-health
curl -sS http://127.0.0.1:3402/health
```

## Development

```bash
npm run typecheck
npm run test
npm run build
```

## Contributing and security

- Contributing guide: [`CONTRIBUTING.md`](./CONTRIBUTING.md)
- Security policy: [`SECURITY.md`](./SECURITY.md)
- Code of conduct: [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)
