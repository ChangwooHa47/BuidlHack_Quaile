export const SUPPORTED_CHAINS: Record<number, string> = {
  // Mainnets
  1: "eip155:1",
  8453: "eip155:8453",
  42161: "eip155:42161",
  10: "eip155:10",
  137: "eip155:137",
  56: "eip155:56",
  // Testnets
  11155111: "eip155:11155111", // Sepolia
  84532: "eip155:84532",       // Base Sepolia
  421614: "eip155:421614",     // Arbitrum Sepolia
  11155420: "eip155:11155420", // OP Sepolia
  80002: "eip155:80002",       // Polygon Amoy
  97: "eip155:97",             // BSC Testnet
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
