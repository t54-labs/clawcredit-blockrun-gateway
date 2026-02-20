const DEFAULT_CHAIN = "BASE";
const DEFAULT_ASSET = "USDC";
const CHAIN_ASSET_DEFAULTS: Record<string, string> = {
  BASE: "USDC",
  XRPL: "RLUSD",
};

export type ChainAssetDefaultsInput = {
  chain?: string;
  asset?: string;
};

export type ChainAssetDefaults = {
  chain: string;
  asset: string;
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
