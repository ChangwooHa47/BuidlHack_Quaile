// Phase: 온체인 6개 — 시간 기반 lifecycle
export type Phase = "Upcoming" | "Subscribing" | "Contributing" | "Refunding" | "Distributing" | "Closed";

// Status: Phase 기준 표시 (추후 세부 Status는 디자인 확정 시 추가)
export type Status = Phase;

// Status → Phase 매핑 (현재 1:1)
export function phaseOf(status: Status): Phase {
  return status;
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
