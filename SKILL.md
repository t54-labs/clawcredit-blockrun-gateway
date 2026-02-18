---
name: openclaw-clawcredit-gateway-setup
description: Use when setting up OpenClaw to use the local clawcredit-blockrun gateway provider and validating end-to-end claw.credit paid inference.
---

# OpenClaw ClawCredit Gateway Setup

## Overview
Use this skill when OpenClaw should route requests through the standalone
`clawcredit-blockrun-gateway` and pay via claw.credit SDK.

This skill prioritizes:
- minimal config changes
- reproducible setup
- quick health/route verification

## Prerequisites
- `openclaw` CLI is installed and works.
- Node.js >= 20 is available.
- Repo exists locally (default: parent directory of this skill/script repository).
- User has a valid `CLAWCREDIT_API_TOKEN`.
- If the user does not have ClawCredit credentials yet, they must register first.
- Registration source of truth: `https://www.claw.credit/SKILL.md` (includes required consent + registration flow).

## Primary Workflow
1. Preview actions first:
```bash
bash scripts/setup-openclaw-clawcredit-gateway.sh --token <token> --dry-run
```

2. Apply setup:
```bash
bash scripts/setup-openclaw-clawcredit-gateway.sh --token <token>
```

3. Verify gateway health:
```bash
curl -sS http://127.0.0.1:3402/health
```
Expected: JSON with `"status":"ok"`.

4. Verify OpenClaw model routing:
```bash
openclaw models show | rg blockruncc
```
Expected provider/model includes real IDs like
`blockruncc/anthropic/claude-sonnet-4` and `blockruncc/anthropic/claude-opus-4.5`.

5. In chat session, use model:
```text
/model blockruncc/anthropic/claude-sonnet-4
```

## Safety Rules
- Do not remove or overwrite unrelated providers in `openclaw.json`.
- Prefer creating/updating provider `blockruncc` only.
- Use `--profile` when user works in non-default OpenClaw profile.

## Common Variants
- Custom gateway path:
```bash
bash scripts/setup-openclaw-clawcredit-gateway.sh \
  --token <token> \
  --gateway-dir /path/to/clawcredit-blockrun-gateway
```

- Custom profile:
```bash
bash scripts/setup-openclaw-clawcredit-gateway.sh \
  --token <token> \
  --profile <profile>
```

- Custom chain/asset:
```bash
bash scripts/setup-openclaw-clawcredit-gateway.sh \
  --token <token> \
  --chain BASE \
  --asset USDC
```

## Troubleshooting
- `CLAWCREDIT_API_TOKEN is required`:
  user must provide `--token`. If they are not registered yet, complete registration first via `https://www.claw.credit/SKILL.md`.

- Health check fails:
  inspect gateway logs:
```bash
tail -n 120 /tmp/clawcredit-blockrun-gateway/.run/gateway.log
```

- OpenClaw still uses old model:
```bash
openclaw gateway restart
openclaw models set blockruncc/anthropic/claude-sonnet-4
```

## Quick Reference
- Setup script: `scripts/setup-openclaw-clawcredit-gateway.sh`
- Default health endpoint: `http://127.0.0.1:3402/health` (changes if `--host`/`--port` is overridden)
- Default provider/model: `blockruncc/anthropic/claude-sonnet-4`
- Supported models: dynamically synced from `BLOCKRUN_API_BASE/v1/models`
