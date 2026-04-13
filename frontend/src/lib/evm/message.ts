export const SUPPORTED_CHAINS: Record<number, string> = {
  1: "eip155:1",
  8453: "eip155:8453",
  42161: "eip155:42161",
  10: "eip155:10",
  137: "eip155:137",
  56: "eip155:56",
};

export function buildCanonicalMessage(
  policyId: number,
  nonceHex: string,
  timestampNs: bigint,
  chainId: number,
  address: string,
): string {
  const chainDescriptor = SUPPORTED_CHAINS[chainId];
  if (!chainDescriptor) throw new Error(`Unsupported chain: ${chainId}`);
  return `buidl-near-ai|v1|${policyId}|${nonceHex}|${timestampNs}|${chainDescriptor}|${address.toLowerCase()}`;
}

export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function nowNs(): bigint {
  return BigInt(Date.now()) * BigInt(1_000_000);
}
