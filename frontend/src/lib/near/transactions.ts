import { actions as nearActions } from "near-api-js";
import type { Action } from "@near-wallet-selector/core";
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
 * Shared helper for every write call.
 *
 * wallet-selector 10.x exposes `{ type: "FunctionCall", params: {...} }` in its
 * public type but, at least for MyNearWallet, pipes the array straight into
 * near-api-js's `createTransaction` without any shape transform. near-api-js's
 * Borsh schema then expects `Action` instances (`{ functionCall: {...} }`) and
 * blows up with "Enum key (type) not found in enum schema" on raw objects.
 *
 * Building the Action through `actions.functionCall(...)` produces the exact
 * instance that the Borsh schema expects. The cast to the public Action[] type
 * papers over the wallet-selector type / runtime mismatch.
 */
async function callContract(
  wallet: Wallet,
  receiverId: string,
  methodName: string,
  args: object,
  gas: bigint,
  deposit: bigint,
) {
  const action = nearActions.functionCall(methodName, args, gas, deposit);
  return wallet.signAndSendTransaction({
    receiverId,
    actions: [action] as unknown as Action[],
  });
}

const GAS_VIEWISH = BigInt("50000000000000");
const GAS_STANDARD = BigInt("100000000000000");
const GAS_CONTRIBUTE = BigInt("200000000000000");
const GAS_SETTLE = BigInt("300000000000000");
const NO_DEPOSIT = BigInt(0);

/**
 * Stage 1: subscribe (Subscribing phase).
 * Pushes the attestation bundle + ZK proof on-chain without a deposit.
 * The contract records a Contribution entry with amount=0.
 */
export async function subscribe(
  wallet: Wallet,
  policyId: number,
  bundle: object,
  zkProofJson: string,
  zkPublicInputsJson: string,
) {
  return callContract(
    wallet,
    CONTRACT_IDS.idoEscrow,
    "subscribe",
    {
      policy_id: policyId,
      bundle,
      zk_proof_json: zkProofJson,
      zk_public_inputs_json: zkPublicInputsJson,
    },
    GAS_CONTRIBUTE,
    NO_DEPOSIT,
  );
}

/**
 * Stage 2: contribute (Contributing phase).
 * Attaches a NEAR deposit to an already-subscribed entry.
 * The investor must have called `subscribe()` during the Subscribing phase.
 */
export async function contribute(
  wallet: Wallet,
  policyId: number,
  depositNear: string,
) {
  return callContract(
    wallet,
    CONTRACT_IDS.idoEscrow,
    "contribute",
    { policy_id: policyId },
    GAS_CONTRIBUTE,
    BigInt(parseNearAmount(depositNear)),
  );
}

export interface SaleConfigArgs {
  token_contract: string;
  total_allocation: string;
  price_per_token: string;
  payment_token: "Near" | { Nep141: string };
  subscription_start: number;
  subscription_end: number;
  contribution_end: number;
  refunding_end: number;
  distributing_end: number;
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
  return callContract(
    wallet,
    CONTRACT_IDS.policyRegistry,
    "register_policy",
    {
      name,
      ticker,
      description,
      chain,
      logo_url: logoUrl,
      natural_language: naturalLanguage,
      ipfs_cid: ipfsCid,
      sale_config: saleConfig,
    },
    GAS_STANDARD,
    NO_DEPOSIT,
  );
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
  return callContract(
    wallet,
    CONTRACT_IDS.policyRegistry,
    "update_policy",
    {
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
    GAS_STANDARD,
    NO_DEPOSIT,
  );
}

export async function forceStatus(
  wallet: Wallet,
  policyId: number,
  status: "Upcoming" | "Subscribing" | "Contributing" | "Refunding" | "Distributing" | "Closed",
) {
  return callContract(
    wallet,
    CONTRACT_IDS.policyRegistry,
    "force_status",
    { id: policyId, status },
    GAS_VIEWISH,
    NO_DEPOSIT,
  );
}

export async function advanceStatus(wallet: Wallet, policyId: number) {
  return callContract(
    wallet,
    CONTRACT_IDS.policyRegistry,
    "advance_status",
    { id: policyId },
    GAS_VIEWISH,
    NO_DEPOSIT,
  );
}

export async function settle(
  wallet: Wallet,
  policyId: number,
  maxContributions: number = 100,
) {
  return callContract(
    wallet,
    CONTRACT_IDS.idoEscrow,
    "settle",
    { policy_id: policyId, max_contributions: maxContributions },
    GAS_SETTLE,
    NO_DEPOSIT,
  );
}

export async function claim(wallet: Wallet, policyId: number) {
  return callContract(
    wallet,
    CONTRACT_IDS.idoEscrow,
    "claim",
    { policy_id: policyId },
    GAS_STANDARD,
    NO_DEPOSIT,
  );
}

export async function refund(wallet: Wallet, policyId: number) {
  return callContract(
    wallet,
    CONTRACT_IDS.idoEscrow,
    "refund",
    { policy_id: policyId },
    GAS_STANDARD,
    NO_DEPOSIT,
  );
}
