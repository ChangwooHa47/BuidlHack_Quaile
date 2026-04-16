import { CONTRACT_IDS } from "./config";

/**
 * Convert NEAR amount to yoctoNEAR string.
 * 1 NEAR = 10^24 yoctoNEAR.
 */
export function parseNearAmount(nearAmount: string): string {
  const parts = nearAmount.split(".");
  const whole = parts[0] || "0";
  const frac = (parts[1] || "").padEnd(24, "0").slice(0, 24);
  return BigInt(whole) * BigInt(10 ** 24) + BigInt(frac) + "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Wallet = any;

/**
 * Call ido-escrow.contribute() with attestation bundle + ZK proof.
 *
 * NOTE: zk_proof_json and zk_public_inputs_json must be JSON *strings*
 * (not objects), matching the Rust `String` parameter type.
 */
export async function contribute(
  wallet: Wallet,
  policyId: number,
  bundle: object,
  zkProofJson: string,
  zkPublicInputsJson: string,
  depositNear: string,
) {
  return wallet.signAndSendTransaction({
    receiverId: CONTRACT_IDS.idoEscrow,
    actions: [
      {
        type: "FunctionCall",
        params: {
          methodName: "contribute",
          args: {
            policy_id: policyId,
            bundle,
            zk_proof_json: zkProofJson,
            zk_public_inputs_json: zkPublicInputsJson,
          },
          gas: "200000000000000",
          deposit: parseNearAmount(depositNear),
        },
      },
    ],
  });
}

export interface SaleConfigArgs {
  token_contract: string;
  total_allocation: string;
  price_per_token: string;
  payment_token: "Near" | { Nep141: string };
  subscription_start: number;
  subscription_end: number;
  live_end: number;
}

export async function registerPolicy(
  wallet: Wallet,
  name: string,
  ticker: string,
  description: string,
  chain: string,
  logoUrl: string,
  naturalLanguage: string,
  ipfsCid: string,
  saleConfig: SaleConfigArgs,
) {
  return wallet.signAndSendTransaction({
    receiverId: CONTRACT_IDS.policyRegistry,
    actions: [
      {
        type: "FunctionCall",
        params: {
          methodName: "register_policy",
          args: {
            name,
            ticker,
            description,
            chain,
            logo_url: logoUrl,
            natural_language: naturalLanguage,
            ipfs_cid: ipfsCid,
            sale_config: saleConfig,
          },
          gas: "100000000000000",
          deposit: "0",
        },
      },
    ],
  });
}

export async function updatePolicy(
  wallet: Wallet,
  id: number,
  name: string,
  ticker: string,
  description: string,
  chain: string,
  logoUrl: string,
  naturalLanguage: string,
  ipfsCid: string,
  saleConfig: SaleConfigArgs,
) {
  return wallet.signAndSendTransaction({
    receiverId: CONTRACT_IDS.policyRegistry,
    actions: [
      {
        type: "FunctionCall",
        params: {
          methodName: "update_policy",
          args: {
            id,
            name,
            ticker,
            description,
            chain,
            logo_url: logoUrl,
            natural_language: naturalLanguage,
            ipfs_cid: ipfsCid,
            sale_config: saleConfig,
          },
          gas: "100000000000000",
          deposit: "0",
        },
      },
    ],
  });
}

export async function forceStatus(
  wallet: Wallet,
  policyId: number,
  status: "Upcoming" | "Subscribing" | "Live" | "Closed",
) {
  return wallet.signAndSendTransaction({
    receiverId: CONTRACT_IDS.policyRegistry,
    actions: [
      {
        type: "FunctionCall",
        params: {
          methodName: "force_status",
          args: { id: policyId, status },
          gas: "50000000000000",
          deposit: "0",
        },
      },
    ],
  });
}

export async function advanceStatus(wallet: Wallet, policyId: number) {
  return wallet.signAndSendTransaction({
    receiverId: CONTRACT_IDS.policyRegistry,
    actions: [
      {
        type: "FunctionCall",
        params: {
          methodName: "advance_status",
          args: { id: policyId },
          gas: "50000000000000",
          deposit: "0",
        },
      },
    ],
  });
}

export async function settle(
  wallet: Wallet,
  policyId: number,
  maxContributions: number = 100,
) {
  return wallet.signAndSendTransaction({
    receiverId: CONTRACT_IDS.idoEscrow,
    actions: [
      {
        type: "FunctionCall",
        params: {
          methodName: "settle",
          args: { policy_id: policyId, max_contributions: maxContributions },
          gas: "300000000000000",
          deposit: "0",
        },
      },
    ],
  });
}

export async function claim(wallet: Wallet, policyId: number) {
  return wallet.signAndSendTransaction({
    receiverId: CONTRACT_IDS.idoEscrow,
    actions: [
      {
        type: "FunctionCall",
        params: {
          methodName: "claim",
          args: { policy_id: policyId },
          gas: "100000000000000",
          deposit: "0",
        },
      },
    ],
  });
}

export async function refund(wallet: Wallet, policyId: number) {
  return wallet.signAndSendTransaction({
    receiverId: CONTRACT_IDS.idoEscrow,
    actions: [
      {
        type: "FunctionCall",
        params: {
          methodName: "refund",
          args: { policy_id: policyId },
          gas: "100000000000000",
          deposit: "0",
        },
      },
    ],
  });
}
