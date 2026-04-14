// Phase: 온체인 4개 (카드 상단 chip + 필터)
export type Phase = "Upcoming" | "Subscribing" | "Live" | "Closed";

// Status: Phase 내 세부 상태 (카드 CTA + 상세 사이드바)
export type Status =
  | "Upcoming"
  | "Subscription"
  | "Review"
  | "Contribution"
  | "Settlement"
  | "Refund"
  | "Claim"
  | "Closed";

// Status → Phase 매핑
export function phaseOf(status: Status): Phase {
  switch (status) {
    case "Upcoming": return "Upcoming";
    case "Subscription":
    case "Review":
    case "Contribution": return "Subscribing";
    case "Settlement":
    case "Refund":
    case "Claim": return "Live";
    case "Closed": return "Closed";
  }
}

export interface SaleInfo {
  target: string;
  totalSubscription?: string;
  progress?: number;
  currentPrice?: string;
  volume24h?: string;
  subscribers?: string;
  finalPrice?: string;
  totalRaised?: string;
}

export interface ProjectMeta {
  slug: string;
  name: string;
  ticker: string;
  chain?: string;
  description: string;
  status: Status;
  saleInfo: SaleInfo;
  opens?: string;
  closes?: string;
  audiences?: string[];
}
