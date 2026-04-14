"use client";

import { useParams } from "next/navigation";
import { useWallet } from "@/contexts/WalletContext";
import StatusBadge from "@/components/StatusBadge";
import StatusStepper from "@/components/StatusStepper";
import { getPolicyById, type PolicyData } from "@/lib/mock/policies";

import { useState } from "react";

type Outcome = "NotSettled" | "FullMatch" | "PartialMatch" | "NoMatch";

interface MockContribution {
  investor: string;
  amount: string;
  outcome: Outcome;
  matched_amount?: string;
  token_amount?: string;
  claim_done?: boolean;
  refund_done?: boolean;
  created_at: string;
}

const MOCK_CONTRIBUTIONS: MockContribution[] = [
  { investor: "alice.testnet", amount: "500,000", outcome: "FullMatch", matched_amount: "500,000", token_amount: "250,000", claim_done: true, refund_done: false, created_at: "Apr 10, 2026" },
  { investor: "bob.testnet", amount: "1,200,000", outcome: "PartialMatch", matched_amount: "800,000", token_amount: "400,000", claim_done: false, refund_done: false, created_at: "Apr 11, 2026" },
  { investor: "carol.testnet", amount: "340,000", outcome: "NoMatch", matched_amount: "0", token_amount: "0", claim_done: false, refund_done: true, created_at: "Apr 11, 2026" },
  { investor: "dave.testnet", amount: "800,000", outcome: "FullMatch", matched_amount: "800,000", token_amount: "400,000", claim_done: false, refund_done: false, created_at: "Apr 12, 2026" },
];

interface MockPolicyTotals {
  total_demand: string;
  total_matched: string;
  ratio_bps: number;
  is_complete: boolean;
}

const MOCK_TOTALS: Record<number, MockPolicyTotals> = {
  3: { total_demand: "$45,000,000", total_matched: "$3,000,000", ratio_bps: 667, is_complete: true },
  4: { total_demand: "$81,100,000", total_matched: "$2,000,000", ratio_bps: 247, is_complete: true },
};

const OUTCOME_STYLES: Record<Outcome, string> = {
  NotSettled: "text-alpha-40",
  FullMatch: "text-neon-glow",
  PartialMatch: "text-status-subscribing",
  NoMatch: "text-status-refund",
};

const STATUS_TO_STEP: Record<string, number> = {
  Upcoming: 0,
  Subscribing: 1,
  Live: 3,
  Closed: 6,
};

export default function PolicyDetailPage() {
  const params = useParams<{ id: string }>();
  const { isConnected, signIn } = useWallet();
  const policy = getPolicyById(Number(params.id));
  const [isSettling, setIsSettling] = useState(false);
  const [settleProgress, setSettleProgress] = useState<{ processed: number; total: number } | null>(null);
  const totals = policy ? MOCK_TOTALS[policy.id] : undefined;

  if (!isConnected) {
    return (
      <main className="flex-1">
        <div className="mx-auto max-w-[1200px] px-lg py-3xl text-center">
          <h1 className="text-2xl font-semibold text-gray-1000">Policy Detail</h1>
          <p className="mt-md text-sm text-alpha-40">Connect your NEAR wallet to view policy details.</p>
          <button onClick={signIn} className="mt-lg rounded-[10px] bg-neon-glow px-xl py-sm text-base font-medium text-gray-0">
            Connect Wallet
          </button>
        </div>
      </main>
    );
  }

  if (!policy) {
    return (
      <main className="flex-1">
        <div className="mx-auto max-w-[1200px] px-lg py-3xl text-center">
          <h1 className="text-2xl font-semibold text-gray-1000">Policy Not Found</h1>
          <p className="mt-md text-sm text-alpha-40">Policy #{params.id} does not exist.</p>
        </div>
      </main>
    );
  }

  const currentStep = STATUS_TO_STEP[policy.status] ?? 0;
  const canAdvance = policy.status === "Subscribing" && Date.now() > policy.sale_config.subscription_end;

  return (
    <main className="flex-1">
      <div className="mx-auto max-w-[1200px] px-lg py-xl">
        {/* Breadcrumb */}
        <p className="mb-lg text-sm text-alpha-40">
          My Policies &nbsp;/ &nbsp;<span className="text-gray-1000">Policy #{policy.id}</span>
        </p>

        {/* Header */}
        <div className="flex items-center gap-md">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] border border-alpha-12 bg-gray-150 text-lg font-medium text-alpha-60">
            {policy.sale_config.token_contract.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-sm">
              <h1 className="text-2xl font-semibold text-gray-1000">{policy.sale_config.token_contract.split(".")[0]}</h1>
              <StatusBadge phase={policy.status} />
            </div>
            <p className="text-[11px] text-alpha-40">Policy #{policy.id} · {policy.sale_config.token_contract}</p>
          </div>
        </div>

        <div className="mt-xl flex flex-col gap-xl lg:flex-row">
          {/* Left */}
          <div className="flex-1 space-y-xl">
            {/* Status Stepper */}
            <section>
              <StatusStepper
                currentStep={currentStep}
                dates={{
                  0: { line1: fmtDate(policy.sale_config.subscription_start) },
                  1: { line1: fmtDate(policy.sale_config.subscription_end) },
                  3: { line1: fmtDate(policy.sale_config.live_end) },
                }}
              />
              {canAdvance && (
                <button
                  onClick={() => alert("Mock: advance_status called")}
                  className="mt-md rounded-[10px] bg-neon-glow px-md py-xs text-sm font-medium text-gray-0 transition-colors hover:bg-neon-soft"
                >
                  Advance to Live
                </button>
              )}
            </section>

            {/* Subscription Stats */}
            {(policy.status === "Subscribing" || policy.status === "Live" || policy.status === "Closed") && (
              <section className="rounded-2xl border border-alpha-12 bg-[#1a1a1a] p-lg">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-gray-200 from-[16%] to-gray-0 opacity-60" />
                <h2 className="relative z-10 text-base font-medium text-gray-1000">Subscription Overview</h2>
                <div className="relative z-10 mt-md grid gap-md md:grid-cols-3">
                  <StatCard label="Subscribers" value={policy.subscribers?.toLocaleString() ?? "0"} />
                  <StatCard label="Total Contributed" value={policy.total_contributed ?? "$0"} />
                  <StatCard label="Progress" value={`${policy.progress?.toLocaleString() ?? 0}%`} highlight />
                </div>
                {policy.progress != null && (
                  <div className="relative z-10 mt-md">
                    <div className="flex items-center justify-between text-xs text-alpha-40">
                      <span>Target: {Number(policy.sale_config.total_allocation).toLocaleString()} tokens</span>
                      <span className="font-medium text-neon-glow">{policy.progress.toLocaleString()}%</span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-alpha-12">
                      <div className="h-full rounded-full bg-neon-glow" style={{ width: `${Math.min(policy.progress, 100)}%` }} />
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Selection Criteria */}
            <section className="rounded-2xl border border-alpha-12 bg-[#1a1a1a] p-lg">
              <h2 className="text-base font-medium text-gray-1000">Selection Criteria</h2>
              <p className="mt-sm whitespace-pre-line text-sm leading-relaxed text-alpha-60">{policy.natural_language}</p>
              {policy.ipfs_cid && (
                <p className="mt-sm text-xs text-alpha-40">
                  IPFS: <span className="text-neon-glow">{policy.ipfs_cid}</span>
                </p>
              )}
            </section>

            {/* Sale Config */}
            <section className="rounded-2xl border border-alpha-12 bg-[#1a1a1a] p-lg">
              <h2 className="text-base font-medium text-gray-1000">Sale Configuration</h2>
              <div className="mt-md divide-y divide-alpha-12">
                <DetailRow label="Token Contract" value={policy.sale_config.token_contract} />
                <DetailRow label="Total Allocation" value={`${Number(policy.sale_config.total_allocation).toLocaleString()} tokens`} />
                <DetailRow label="Price per Token" value={`${policy.sale_config.price_per_token} NEAR`} />
                <DetailRow label="Payment Token" value="NEAR" />
                <DetailRow label="Subscription Start" value={fmtDateFull(policy.sale_config.subscription_start)} />
                <DetailRow label="Subscription End" value={fmtDateFull(policy.sale_config.subscription_end)} />
                <DetailRow label="Live End" value={fmtDateFull(policy.sale_config.live_end)} />
              </div>
            </section>

            {/* Settlement Results (Live/Closed) */}
            {(policy.status === "Live" || policy.status === "Closed") && totals && (
              <section className="rounded-2xl border border-alpha-12 bg-[#1a1a1a] p-lg">
                <h2 className="text-base font-medium text-gray-1000">Settlement Results</h2>
                <div className="mt-md grid gap-md md:grid-cols-3">
                  <StatCard label="Total Demand" value={totals.total_demand} />
                  <StatCard label="Total Matched" value={totals.total_matched} />
                  <StatCard label="Match Ratio" value={`${(totals.ratio_bps / 100).toFixed(1)}%`} highlight />
                </div>
                {/* Demand vs Supply bar */}
                <div className="mt-md">
                  <div className="flex items-center justify-between text-xs text-alpha-40">
                    <span>Demand</span>
                    <span>Supply (Target)</span>
                  </div>
                  <div className="mt-1 relative h-3 w-full overflow-hidden rounded-full bg-alpha-12">
                    <div className="absolute inset-y-0 left-0 rounded-full bg-neon-glow/30" style={{ width: "100%" }} />
                    <div className="absolute inset-y-0 left-0 rounded-full bg-neon-glow" style={{ width: `${Math.min(totals.ratio_bps / 100, 100)}%` }} />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="text-alpha-40">Matched: {(totals.ratio_bps / 100).toFixed(1)}%</span>
                    <span className={totals.is_complete ? "text-neon-glow" : "text-alpha-40"}>
                      {totals.is_complete ? "✓ Complete" : "In Progress"}
                    </span>
                  </div>
                </div>
              </section>
            )}

            {/* Settle Button (Live, not yet settled) */}
            {policy.status === "Live" && !totals && (
              <section className="rounded-2xl border border-alpha-12 bg-[#1a1a1a] p-lg">
                <h2 className="text-base font-medium text-gray-1000">Settlement</h2>
                <p className="mt-xs text-sm text-alpha-40">Subscription period ended. Trigger settlement to match contributions.</p>
                <button
                  disabled={isSettling}
                  onClick={async () => {
                    setIsSettling(true);
                    // Mock batch settlement
                    for (let i = 0; i <= 4; i++) {
                      await new Promise((r) => setTimeout(r, 800));
                      setSettleProgress({ processed: i, total: 4 });
                    }
                    setIsSettling(false);
                    setSettleProgress(null);
                    alert("Mock: Settlement complete. Reload to see results.");
                  }}
                  className="mt-md rounded-[10px] bg-neon-glow px-xl py-sm text-sm font-medium text-gray-0 transition-colors hover:bg-neon-soft disabled:opacity-40"
                >
                  {isSettling
                    ? `Settling... (${settleProgress?.processed ?? 0}/${settleProgress?.total ?? "?"})`
                    : "Start Settlement"}
                </button>
              </section>
            )}

            {/* Contributions Table */}
            {(policy.status === "Subscribing" || policy.status === "Live" || policy.status === "Closed") && (
              <section className="rounded-2xl border border-alpha-12 bg-[#1a1a1a] p-lg">
                <h2 className="text-base font-medium text-gray-1000">Contributions</h2>
                <div className="mt-md overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-alpha-12 text-left text-xs text-alpha-40">
                        <th className="pb-sm font-medium">Investor</th>
                        <th className="pb-sm font-medium">Amount</th>
                        <th className="pb-sm font-medium">Outcome</th>
                        <th className="pb-sm font-medium">Matched</th>
                        <th className="pb-sm font-medium">Tokens</th>
                        <th className="pb-sm font-medium">Claim</th>
                        <th className="pb-sm font-medium">Refund</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-alpha-12">
                      {MOCK_CONTRIBUTIONS.map((c) => (
                        <tr key={c.investor}>
                          <td className="py-sm text-gray-1000">{c.investor}</td>
                          <td className="py-sm text-gray-1000">{c.amount}</td>
                          <td className="py-sm">
                            <span className={`text-xs font-medium ${OUTCOME_STYLES[c.outcome]}`}>
                              {c.outcome}
                            </span>
                          </td>
                          <td className="py-sm text-gray-1000">{c.matched_amount ?? "—"}</td>
                          <td className="py-sm text-gray-1000">{c.token_amount ?? "—"}</td>
                          <td className="py-sm">
                            {c.claim_done ? <span className="text-xs text-neon-glow">✓</span> : <span className="text-xs text-alpha-40">—</span>}
                          </td>
                          <td className="py-sm">
                            {c.refund_done ? <span className="text-xs text-neon-glow">✓</span> : <span className="text-xs text-alpha-40">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>

          {/* Right Sidebar — Quick Stats */}
          <aside className="w-full shrink-0 lg:w-[340px]">
            <div className="sticky top-20 rounded-2xl border border-alpha-12 bg-[#1a1a1a] p-lg">
              <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-gray-200 from-[16%] to-gray-0 opacity-60" />
              <div className="relative z-10">
                <div className="flex items-center gap-sm">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md border border-alpha-12 bg-gray-150 text-xs font-medium text-alpha-60">
                    {policy.sale_config.token_contract.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-gray-1000">{policy.sale_config.token_contract.split(".")[0]}</span>
                  <StatusBadge phase={policy.status} />
                </div>

                <div className="mt-lg space-y-sm">
                  <SidebarRow label="Target" value={`${Number(policy.sale_config.total_allocation).toLocaleString()} tokens`} />
                  <SidebarRow label="Price" value={`${policy.sale_config.price_per_token} NEAR`} />
                  {policy.subscribers != null && <SidebarRow label="Subscribers" value={policy.subscribers.toLocaleString()} />}
                  {policy.total_contributed && <SidebarRow label="Contributed" value={policy.total_contributed} />}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl border border-alpha-12 bg-gray-150 p-md">
      <p className="text-xs text-alpha-40">{label}</p>
      <p className={`mt-xs text-xl font-semibold ${highlight ? "text-neon-glow" : "text-gray-1000"}`}>{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-sm">
      <span className="text-sm text-alpha-40">{label}</span>
      <span className="text-sm font-medium text-gray-1000">{value}</span>
    </div>
  );
}

function SidebarRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-alpha-40">{label}</span>
      <span className="text-sm font-medium text-gray-1000">{value}</span>
    </div>
  );
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtDateFull(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
