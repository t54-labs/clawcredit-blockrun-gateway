#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
DEFAULT_GATEWAY_DIR="$(cd -- "${SCRIPT_DIR}/.." >/dev/null 2>&1 && pwd)"
DEFAULT_PORT="3402"
DEFAULT_PROVIDER_ID="blockruncc"
DEFAULT_MODEL_ID="anthropic/claude-sonnet-4"
DEFAULT_HOST="127.0.0.1"
DEFAULT_BLOCKRUN_API_BASE="https://blockrun.ai/api"
DEFAULT_CLAWCREDIT_BASE_URL="https://api.claw.credit"
DEFAULT_CHAIN="BASE"
DEFAULT_ASSET_BASE_USDC="USDC"
DEFAULT_AMOUNT_USD="0.1"

usage() {
  cat <<'EOF'
Setup OpenClaw with standalone clawcredit-blockrun-gateway.

What this script does:
  1) Builds and starts standalone gateway as a background process
  2) Adds/updates OpenClaw provider (default: blockruncc) -> http://127.0.0.1:<port>/v1
  3) Restarts OpenClaw gateway
  4) Optionally switches active model to <provider>/<model>

Usage:
  setup-openclaw-clawcredit-gateway.sh --token <claw_token> [options]

Options:
  --token <token>         Required CLAWCREDIT_API_TOKEN
  --gateway-dir <path>    Gateway repo dir (default: parent directory of this script)
  --port <port>           Gateway port (default: 3402)
  --host <host>           Gateway host bind (default: 127.0.0.1)
  --provider <id>         OpenClaw provider id (default: blockruncc)
  --model <id>            Model id to set active (default: anthropic/claude-sonnet-4)
  --profile <name>        OpenClaw profile for CLI commands
  --state-dir <path>      OpenClaw state dir override
  --blockrun-api <url>    BLOCKRUN_API_BASE (default: https://blockrun.ai/api)
  --cc-base-url <url>     CLAWCREDIT_API_BASE (default: https://api.claw.credit)
  --chain <name>          CLAWCREDIT_CHAIN (default: BASE)
  --asset <value>         CLAWCREDIT_ASSET (default: USDC on BASE)
  --amount-usd <num>      CLAWCREDIT_DEFAULT_AMOUNT_USD (default: 0.1)
  --no-model-set          Skip `openclaw models set`
  --no-restart            Skip `openclaw gateway restart`
  --dry-run               Print actions only
  -h, --help              Show help
EOF
}

log() { printf '%s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing command: $1"
}

resolve_state_dir() {
  local explicit="${1:-}"
  local profile="${2:-}"
  local home="${HOME}"

  if [[ -n "$explicit" ]]; then
    printf '%s' "$explicit"
    return 0
  fi
  if [[ -n "${OPENCLAW_STATE_DIR:-}" ]]; then
    printf '%s' "${OPENCLAW_STATE_DIR}"
    return 0
  fi
  if [[ -n "$profile" ]]; then
    printf '%s' "${home}/.openclaw-${profile}"
    return 0
  fi
  if [[ -d "${home}/.openclaw" ]]; then
    printf '%s' "${home}/.openclaw"
    return 0
  fi
  if [[ -d "${home}/.moltbot" ]]; then
    printf '%s' "${home}/.moltbot"
    return 0
  fi
  printf '%s' "${home}/.openclaw"
}

TOKEN="${CLAWCREDIT_API_TOKEN:-}"
GATEWAY_DIR="$DEFAULT_GATEWAY_DIR"
PORT="$DEFAULT_PORT"
HOST="$DEFAULT_HOST"
PROVIDER_ID="$DEFAULT_PROVIDER_ID"
MODEL_ID="$DEFAULT_MODEL_ID"
OPENCLAW_PROFILE=""
OPENCLAW_STATE_DIR_ARG=""
BLOCKRUN_API_BASE="$DEFAULT_BLOCKRUN_API_BASE"
CLAWCREDIT_BASE_URL="$DEFAULT_CLAWCREDIT_BASE_URL"
CLAWCREDIT_CHAIN="${CLAWCREDIT_CHAIN:-$DEFAULT_CHAIN}"
CLAWCREDIT_ASSET="${CLAWCREDIT_ASSET:-}"
DEFAULT_AMOUNT_USD="$DEFAULT_AMOUNT_USD"
NO_MODEL_SET="0"
NO_RESTART="0"
DRY_RUN="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --token)
      [[ $# -ge 2 ]] || die "--token requires a value"
      TOKEN="$2"
      shift 2
      ;;
    --gateway-dir)
      [[ $# -ge 2 ]] || die "--gateway-dir requires a value"
      GATEWAY_DIR="$2"
      shift 2
      ;;
    --port)
      [[ $# -ge 2 ]] || die "--port requires a value"
      PORT="$2"
      shift 2
      ;;
    --host)
      [[ $# -ge 2 ]] || die "--host requires a value"
      HOST="$2"
      shift 2
      ;;
    --provider)
      [[ $# -ge 2 ]] || die "--provider requires a value"
      PROVIDER_ID="$2"
      shift 2
      ;;
    --model)
      [[ $# -ge 2 ]] || die "--model requires a value"
      MODEL_ID="$2"
      shift 2
      ;;
    --profile)
      [[ $# -ge 2 ]] || die "--profile requires a value"
      OPENCLAW_PROFILE="$2"
      shift 2
      ;;
    --state-dir)
      [[ $# -ge 2 ]] || die "--state-dir requires a value"
      OPENCLAW_STATE_DIR_ARG="$2"
      shift 2
      ;;
    --blockrun-api)
      [[ $# -ge 2 ]] || die "--blockrun-api requires a value"
      BLOCKRUN_API_BASE="$2"
      shift 2
      ;;
    --cc-base-url)
      [[ $# -ge 2 ]] || die "--cc-base-url requires a value"
      CLAWCREDIT_BASE_URL="$2"
      shift 2
      ;;
    --chain)
      [[ $# -ge 2 ]] || die "--chain requires a value"
      CLAWCREDIT_CHAIN="$2"
      shift 2
      ;;
    --asset)
      [[ $# -ge 2 ]] || die "--asset requires a value"
      CLAWCREDIT_ASSET="$2"
      shift 2
      ;;
    --amount-usd)
      [[ $# -ge 2 ]] || die "--amount-usd requires a value"
      DEFAULT_AMOUNT_USD="$2"
      shift 2
      ;;
    --no-model-set)
      NO_MODEL_SET="1"
      shift
      ;;
    --no-restart)
      NO_RESTART="1"
      shift
      ;;
    --dry-run)
      DRY_RUN="1"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

need_cmd node
need_cmd npm
need_cmd curl
need_cmd openclaw

[[ -n "$TOKEN" ]] || die "--token is required"
[[ -d "$GATEWAY_DIR" ]] || die "Gateway dir not found: $GATEWAY_DIR"
[[ -f "$GATEWAY_DIR/package.json" ]] || die "Not a Node repo: $GATEWAY_DIR"

CLAWCREDIT_CHAIN="$(printf '%s' "$CLAWCREDIT_CHAIN" | tr '[:lower:]' '[:upper:]')"
if [[ -z "$CLAWCREDIT_ASSET" ]]; then
  if [[ "$CLAWCREDIT_CHAIN" == "BASE" ]]; then
    CLAWCREDIT_ASSET="$DEFAULT_ASSET_BASE_USDC"
  else
    die "--asset is required for chain=$CLAWCREDIT_CHAIN"
  fi
fi

STATE_DIR="$(resolve_state_dir "$OPENCLAW_STATE_DIR_ARG" "$OPENCLAW_PROFILE")"
OPENCLAW_JSON="$STATE_DIR/openclaw.json"

OPENCLAW_CMD=(openclaw)
if [[ -n "$OPENCLAW_PROFILE" ]]; then
  OPENCLAW_CMD+=(--profile "$OPENCLAW_PROFILE")
fi

RUN_DIR="$GATEWAY_DIR/.run"
ENV_FILE="$RUN_DIR/gateway.env"
PID_FILE="$RUN_DIR/gateway.pid"
LOG_FILE="$RUN_DIR/gateway.log"
HEALTH_URL="http://127.0.0.1:${PORT}/health"
BASE_URL="http://127.0.0.1:${PORT}/v1"

log ""
log "Standalone gateway setup"
log "  gateway dir: $GATEWAY_DIR"
log "  gateway listen: ${HOST}:${PORT}"
log "  OpenClaw state dir: $STATE_DIR"
log "  provider/model: ${PROVIDER_ID}/${MODEL_ID}"
log "  exposed models: dynamic sync from ${BLOCKRUN_API_BASE%/}/v1/models"
log "  blockrun api: $BLOCKRUN_API_BASE"
log "  clawcredit: $CLAWCREDIT_BASE_URL ($CLAWCREDIT_CHAIN)"
log ""

if [[ "$DRY_RUN" == "1" ]]; then
  log "[dry-run] Would run npm install/build in $GATEWAY_DIR"
  log "[dry-run] Would start gateway and wait for $HEALTH_URL"
  log "[dry-run] Would fetch upstream models from ${BLOCKRUN_API_BASE%/}/v1/models"
  log "[dry-run] Would patch $OPENCLAW_JSON with provider=$PROVIDER_ID baseUrl=$BASE_URL and synced model list"
  if [[ "$NO_RESTART" != "1" ]]; then
    log "[dry-run] Would run: ${OPENCLAW_CMD[*]} gateway restart"
  fi
  if [[ "$NO_MODEL_SET" != "1" ]]; then
    log "[dry-run] Would run: ${OPENCLAW_CMD[*]} models set ${PROVIDER_ID}/${MODEL_ID}"
  fi
  exit 0
fi

mkdir -p "$RUN_DIR"

log "→ Building gateway..."
(
  cd "$GATEWAY_DIR"
  if [[ ! -d node_modules ]]; then
    npm install
  fi
  npm run build
)

log "→ Writing runtime env: $ENV_FILE"
{
  printf 'PORT=%q\n' "$PORT"
  printf 'HOST=%q\n' "$HOST"
  printf 'BLOCKRUN_API_BASE=%q\n' "$BLOCKRUN_API_BASE"
  printf 'CLAWCREDIT_API_TOKEN=%q\n' "$TOKEN"
  printf 'CLAWCREDIT_API_BASE=%q\n' "$CLAWCREDIT_BASE_URL"
  printf 'CLAWCREDIT_CHAIN=%q\n' "$CLAWCREDIT_CHAIN"
  printf 'CLAWCREDIT_ASSET=%q\n' "$CLAWCREDIT_ASSET"
  printf 'CLAWCREDIT_DEFAULT_AMOUNT_USD=%q\n' "$DEFAULT_AMOUNT_USD"
} >"$ENV_FILE"

if [[ -f "$PID_FILE" ]]; then
  old_pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "$old_pid" ]] && kill -0 "$old_pid" 2>/dev/null; then
    log "→ Stopping previous gateway process (pid=$old_pid)"
    kill "$old_pid" || true
    for _ in {1..20}; do
      if kill -0 "$old_pid" 2>/dev/null; then
        sleep 0.2
      else
        break
      fi
    done
  fi
fi

log "→ Starting gateway in background..."
(
  cd "$GATEWAY_DIR"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  nohup node dist/cli.js >"$LOG_FILE" 2>&1 &
  echo "$!" >"$PID_FILE"
)

log "→ Waiting for health endpoint..."
ready="0"
for i in {1..40}; do
  if curl -fsS "$HEALTH_URL" >/tmp/clawcredit_blockrun_gateway_health.json 2>/dev/null; then
    ready="1"
    break
  fi
  sleep 0.5
done

if [[ "$ready" != "1" ]]; then
  warn "Gateway failed to become healthy. Last log lines:"
  tail -n 80 "$LOG_FILE" || true
  die "Gateway startup failed"
fi

log "→ Patching OpenClaw provider config: $OPENCLAW_JSON"
node - "$OPENCLAW_JSON" "$PROVIDER_ID" "$BASE_URL" "$MODEL_ID" "$BLOCKRUN_API_BASE" "$GATEWAY_DIR/scripts/openclaw-model-sync.cjs" <<'NODE'
const fs = require("fs");
const path = require("path");

const configPath = process.argv[2];
const providerId = process.argv[3];
const baseUrl = process.argv[4];
const defaultModelId = process.argv[5];
const blockrunApiBase = process.argv[6];
const helperPath = process.argv[7];
const {
  extractUpstreamModels,
  buildFallbackModels,
  syncOpenClawConfig,
} = require(helperPath);

async function fetchModels(apiBase) {
  const endpoint = `${String(apiBase || "").replace(/\/+$/, "")}/v1/models`;
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`upstream models status=${response.status}`);
    const payload = await response.json();
    const models = extractUpstreamModels(payload);
    if (!Array.isArray(models) || models.length === 0) {
      throw new Error("upstream models payload empty");
    }
    return { models, source: "upstream", endpoint };
  } catch (err) {
    return {
      models: buildFallbackModels(),
      source: "fallback",
      endpoint,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  let config = {};
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, "utf8");
    if (raw.trim()) config = JSON.parse(raw);
  }

  const modelResult = await fetchModels(blockrunApiBase);
  const { updatedConfig, effectiveDefaultModelId } = syncOpenClawConfig(config, {
    providerId,
    baseUrl,
    requestedDefaultModelId: defaultModelId,
    models: modelResult.models,
  });

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
  console.log(`updated ${configPath}`);
  console.log(`provider ${providerId} models synced: ${modelResult.models.length} (${modelResult.source})`);
  console.log(`provider ${providerId} default model: ${effectiveDefaultModelId}`);
  if (modelResult.source === "fallback") {
    console.log(`provider ${providerId} sync warning: ${modelResult.error}`);
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`failed to patch ${configPath}: ${msg}`);
  process.exit(1);
});
NODE

if [[ "$NO_RESTART" != "1" ]]; then
  log "→ Restarting OpenClaw gateway..."
  "${OPENCLAW_CMD[@]}" gateway restart
fi

if [[ "$NO_MODEL_SET" != "1" ]]; then
  log "→ Setting active model: ${PROVIDER_ID}/${MODEL_ID}"
  "${OPENCLAW_CMD[@]}" models set "${PROVIDER_ID}/${MODEL_ID}" || warn "models set failed; set manually later"
fi

log ""
log "Done."
log "  Gateway PID: $(cat "$PID_FILE")"
log "  Health: $HEALTH_URL"
log "  Provider: $PROVIDER_ID  baseUrl=$BASE_URL"
log "  Tail logs: tail -f $LOG_FILE"
log ""
