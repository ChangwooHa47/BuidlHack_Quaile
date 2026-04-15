import { CONTRACT_IDS } from "./config";
import { viewCall } from "./rpc";

/** On-chain Policy struct (mirrors tee-shared Policy). */
export interface OnChainPolicy {
  id: number;
  foundation: string;
  name: string;
  ticker: string;
  description: string;
  chain: string;
  logo_url: string;
  natural_language: string;
  ipfs_cid: string;
  sale_config: {
    token_contract: string;
    total_allocation: string;
    price_per_token: string;
    payment_token: "Near" | { Nep141: string };
    subscription_start: number;
    subscription_end: number;
    live_end: number;
  };
  status: "Upcoming" | "Subscribing" | "Live" | "Closed";
  created_at: number;
}

export interface OnChainContribution {
  investor: string;
  policy_id: number;
  amount: string;
  attestation_hash: number[];
  outcome: "NotSettled" | "FullMatch" | "PartialMatch" | "NoMatch";
  matched_amount: string;
  token_amount: string;
  token_contract: string;
  claim_done: boolean;
  refund_done: boolean;
  created_at: number;
}

export interface PolicyTotals {
  total_demand: string;
  total_matched: string;
  ratio_bps: number;
  settled_at: number;
  is_complete: boolean;
}

/**
 * Fetch all policies by iterating from id=0 until null.
 * No `get_all_policies` view exists on-chain.
 */
export async function getAllPolicies(): Promise<OnChainPolicy[]> {
  const policies: OnChainPolicy[] = [];
  for (let id = 0; ; id++) {
    try {
      const policy = await viewCall<OnChainPolicy | null>(
        CONTRACT_IDS.policyRegistry,
        "get_policy",
        { id },
      );
      if (!policy) break;
      policies.push(policy);
    } catch {
      break;
    }
  }
  return policies;
}

export async function getPolicy(id: number): Promise<OnChainPolicy | null> {
  try {
    return await viewCall<OnChainPolicy | null>(
      CONTRACT_IDS.policyRegistry,
      "get_policy",
      { id },
    );
  } catch {
    return null;
  }
}

export async function getContribution(
  investor: string,
  policyId: number,
): Promise<OnChainContribution | null> {
  try {
    return await viewCall<OnChainContribution | null>(
      CONTRACT_IDS.idoEscrow,
      "get_contribution",
      { investor, policy_id: policyId },
    );
  } catch {
    return null;
  }
}

export async function getPolicyTotals(
  policyId: number,
): Promise<PolicyTotals | null> {
  try {
    return await viewCall<PolicyTotals | null>(
      CONTRACT_IDS.idoEscrow,
      "get_policy_totals",
      { policy_id: policyId },
    );
  } catch {
    return null;
  }
}

export async function getPolicyPendingTotal(policyId: number): Promise<string> {
  try {
    return await viewCall<string>(
      CONTRACT_IDS.idoEscrow,
      "get_policy_pending_total",
      { policy_id: policyId },
    );
  } catch {
    return "0";
  }
}

export async function getPolicyInvestorCount(policyId: number): Promise<number> {
  try {
    return await viewCall<number>(
      CONTRACT_IDS.idoEscrow,
      "get_policy_investor_count",
      { policy_id: policyId },
    );
  } catch {
    return 0;
  }
}
