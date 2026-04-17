import type { Phase } from "@/types";

export interface PolicyData {
  id: number;
  foundation: string;
  natural_language: string;
  ipfs_cid: string;
  status: Phase;
  created_at: number;
  sale_config: {
    token_contract: string;
    total_allocation: string;
    price_per_token: string;
    subscription_start: number;
    subscription_end: number;
    live_end: number;
  };
  // Aggregated stats (from escrow)
  subscribers?: number;
  total_contributed?: string;
  progress?: number;
}

export const MOCK_POLICIES: PolicyData[] = [
  {
    id: 1,
    foundation: "foundation.testnet",
    natural_language: "Long-term NEAR holders who have held NEAR for at least 90 days and have at least 3 on-chain transactions. Prefer holders with DAO participation and active governance voting history.",
    ipfs_cid: "bafybeibxyz123",
    status: "Upcoming",
    created_at: Date.now() * 1_000_000,
    sale_config: {
      token_contract: "momentum.testnet",
      total_allocation: "10000000",
      price_per_token: "0.001",
      subscription_start: Date.now() + 7 * 86400000,
      subscription_end: Date.now() + 14 * 86400000,
      live_end: Date.now() + 21 * 86400000,
    },
  },
  {
    id: 2,
    foundation: "foundation.testnet",
    natural_language: "Active DeFi users with history of providing liquidity on major DEXes. Must have interacted with at least 2 DeFi protocols in the past 6 months.",
    ipfs_cid: "bafybeiabc456",
    status: "Subscribing",
    created_at: (Date.now() - 5 * 86400000) * 1_000_000,
    sale_config: {
      token_contract: "cetus.testnet",
      total_allocation: "5000000",
      price_per_token: "0.0025",
      subscription_start: Date.now() - 3 * 86400000,
      subscription_end: Date.now() + 4 * 86400000,
      live_end: Date.now() + 11 * 86400000,
    },
    subscribers: 3841,
    total_contributed: "$2,340,000",
    progress: 52,
  },
  {
    id: 3,
    foundation: "foundation.testnet",
    natural_language: "Ecosystem builders and developers who have contributed to open-source blockchain projects. GitHub activity is weighted heavily in evaluation.",
    ipfs_cid: "bafybeiqwe789",
    status: "Distributing",
    created_at: (Date.now() - 20 * 86400000) * 1_000_000,
    sale_config: {
      token_contract: "navi.testnet",
      total_allocation: "8000000",
      price_per_token: "0.002",
      subscription_start: Date.now() - 15 * 86400000,
      subscription_end: Date.now() - 5 * 86400000,
      live_end: Date.now() + 5 * 86400000,
    },
    subscribers: 12483,
    total_contributed: "$45,000,000",
    progress: 1500,
  },
  {
    id: 4,
    foundation: "foundation.testnet",
    natural_language: "Community members with consistent on-chain governance participation across NEAR ecosystem DAOs.",
    ipfs_cid: "bafybeirst012",
    status: "Closed",
    created_at: (Date.now() - 60 * 86400000) * 1_000_000,
    sale_config: {
      token_contract: "aurora.testnet",
      total_allocation: "3000000",
      price_per_token: "0.003",
      subscription_start: Date.now() - 50 * 86400000,
      subscription_end: Date.now() - 40 * 86400000,
      live_end: Date.now() - 30 * 86400000,
    },
    subscribers: 8920,
    total_contributed: "$81,100,000",
    progress: 2703,
  },
];

export function getPoliciesByFoundation(foundation: string): PolicyData[] {
  return MOCK_POLICIES.filter((p) => p.foundation === foundation);
}

export function getPolicyById(id: number): PolicyData | undefined {
  return MOCK_POLICIES.find((p) => p.id === id);
}
