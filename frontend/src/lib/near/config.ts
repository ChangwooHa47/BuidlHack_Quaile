export const NEAR_NETWORK = "testnet" as const;

export const NEAR_CONFIG = {
  networkId: NEAR_NETWORK,
  nodeUrl: `https://rpc.${NEAR_NETWORK}.near.org`,
  walletUrl: `https://wallet.${NEAR_NETWORK}.near.org`,
  helperUrl: `https://helper.${NEAR_NETWORK}.near.org`,
  explorerUrl: `https://explorer.${NEAR_NETWORK}.near.org`,
} as const;

export const CONTRACT_IDS = {
  policyRegistry: process.env.NEXT_PUBLIC_POLICY_REGISTRY ?? `policy.buidlnear.${NEAR_NETWORK}`,
  attestationVerifier: process.env.NEXT_PUBLIC_ATTESTATION_VERIFIER ?? `verifier.buidlnear.${NEAR_NETWORK}`,
  idoEscrow: process.env.NEXT_PUBLIC_IDO_ESCROW ?? `escrow.buidlnear.${NEAR_NETWORK}`,
} as const;

export const TEE_API_URL = process.env.NEXT_PUBLIC_TEE_API_URL ?? "http://localhost:8080";
