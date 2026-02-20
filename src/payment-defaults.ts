const DEFAULT_CHAIN = "XRPL";
const DEFAULT_ASSET = "RLUSD";
const DEFAULT_BLOCKRUN_API_BASE = "https://xrpl.blockrun.ai/api";
const CHAIN_ASSET_DEFAULTS: Record<string, string> = {
  BASE: "USDC",
  XRPL: "RLUSD",
};
const CHAIN_BLOCKRUN_API_DEFAULTS: Record<string, string> = {
  BASE: "https://blockrun.ai/api",
  XRPL: DEFAULT_BLOCKRUN_API_BASE,
};

export type ChainAssetDefaultsInput = {
  chain?: string;
  asset?: string;
};

export type ChainAssetDefaults = {
  chain: string;
  asset: string;
};

export type BlockrunApiBaseInput = {
  chain?: string;
  blockrunApiBase?: string;
};

function normalizeValue(value?: string, fallback = ""): string {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

export function resolveChainAssetDefaults(input: ChainAssetDefaultsInput): ChainAssetDefaults {
  const chain = normalizeValue(input.chain, DEFAULT_CHAIN).toUpperCase();
  const explicitAsset = normalizeValue(input.asset);
  if (explicitAsset) {
    return {
      chain,
      asset: explicitAsset,
    };
  }

  return {
    chain,
    asset: CHAIN_ASSET_DEFAULTS[chain] || DEFAULT_ASSET,
  };
}

export function resolveBlockrunApiBase(input: BlockrunApiBaseInput): string {
  const chain = normalizeValue(input.chain, DEFAULT_CHAIN).toUpperCase();
  const explicitApiBase = normalizeValue(input.blockrunApiBase);
  if (explicitApiBase) return explicitApiBase;
  return CHAIN_BLOCKRUN_API_DEFAULTS[chain] || DEFAULT_BLOCKRUN_API_BASE;
}
