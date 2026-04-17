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
    contribution_end: number;
    refunding_end: number;
    distributing_end: number;
  };
  status: "Upcoming" | "Subscribing" | "Contributing" | "Refunding" | "Distributing" | "Closed";
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
 * Fetch all policies by probing ids in parallel up to the registry's
 * next_policy_id. The registry assigns ids sequentially, but deletions leave
 * gaps — so a single null no longer means "end of list".
 */
export async function getAllPolicies(): Promise<OnChainPolicy[]> {
  let upperBound: number;
  try {
    const total = await viewCall<number>(
      CONTRACT_IDS.policyRegistry,
      "total_policies",
      {},
    );
    // next_policy_id is monotonically increasing, so current id-space is
    // [0, total + slack). Slack covers policies deleted from the live set.
    upperBound = Math.max(Number(total) + 16, 32);
  } catch {
    upperBound = 32;
  }

  const ids = Array.from({ length: upperBound }, (_, i) => i);
  const results = await Promise.all(
    ids.map((id) =>
      viewCall<OnChainPolicy | null>(
        CONTRACT_IDS.policyRegistry,
        "get_policy",
        { id },
      ).catch(() => null),
    ),
  );
  return results.filter((p): p is OnChainPolicy => p !== null);
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
