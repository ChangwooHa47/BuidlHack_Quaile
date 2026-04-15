"use client";

import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import StatusStepper from "@/components/StatusStepper";
import ProjectHero from "@/components/ProjectHero";
import { useWallet } from "@/contexts/WalletContext";
import { advanceStatus, settle } from "@/lib/near/transactions";

const PROJECT = {
  name: "Momentum",
  ticker: "MMT",
  chains: ["MMT", "SUI"],
  socials: ["X", "D", "T"],
  phase: "Subscribing" as const,
  description:
    "The leading concentrated liquidity DEX on Sui, delivering top APRs for liquidity providers. Powered by the ve(3,3) model.",
  currentStep: 2,
  stats: {
    subscribers: "3,841",
    totalRaised: "$81,190,980",
    progress: 1805,
    target: "$4,500,000",
    eligible: "2,910",
    pending: "931",
  },
  details: [
    { label: "Token Name", value: "MMT" },
    { label: "Token Chain", value: "Sui" },
    { label: "Subscription Assets", value: "BNB · SUI · USDT" },
    { label: "Fully Diluted Valuation", value: "$250M — $350M" },
    { label: "Community Offering Amount", value: "$4,500,000" },
    { label: "Vesting", value: "6 month linear" },
  ],
  recentContributions: [
    { investor: "alice.testnet", amount: "$500,000", time: "2 min ago" },
    { investor: "bob.testnet", amount: "$1,200,000", time: "15 min ago" },
    { investor: "carol.testnet", amount: "$340,000", time: "1 hr ago" },
    { investor: "dave.testnet", amount: "$800,000", time: "3 hr ago" },
    { investor: "eve.testnet", amount: "$2,100,000", time: "5 hr ago" },
  ],
};

export default function CompanyDashboard() {
  const { selector } = useWallet();
  const canAdvance = PROJECT.phase === "Subscribing";
  const POLICY_ID = 0; // TODO: dynamic from URL/state

  async function handleAdvance() {
    if (!selector) return;
    const wallet = await selector.wallet("my-near-wallet");
    await advanceStatus(wallet, POLICY_ID);
    window.location.reload();
  }

  async function handleSettle() {
    if (!selector) return;
    const wallet = await selector.wallet("my-near-wallet");
    await settle(wallet, POLICY_ID);
    window.location.reload();
  }

  return (
    <main className="flex-1 bg-gray-50">
      {/* Header */}
      <div className="mx-auto max-w-[1440px] px-[80px] pt-[56px] pb-[32px]">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="text-alpha-40">Company</span>
          <span className="text-alpha-40">›</span>
          <span className="text-alpha-60">Momentum</span>
        </div>
        <div className="mt-[32px]">
          <ProjectHero
            name={PROJECT.name}
            ticker={PROJECT.ticker}
            phase={PROJECT.phase}
            description={PROJECT.description}
            chains={PROJECT.chains}
            socials={PROJECT.socials}
            extraLink={{ label: "Edit Evaluation Criteria", href: "/company/criteria" }}
          />
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto flex max-w-[1440px] gap-[48px] px-[80px] pb-[56px]">
        {/* Left */}
        <div className="flex-1 space-y-[32px]">
          {/* KPI Cards */}
          <div className="grid grid-cols-3 gap-md">
            <KpiCard label="Subscribers" value={PROJECT.stats.subscribers} sub={`${PROJECT.stats.eligible} eligible · ${PROJECT.stats.pending} pending`} />
            <KpiCard label="Total Raised" value={PROJECT.stats.totalRaised} highlight />
            <KpiCard label="Progress" value={`${PROJECT.stats.progress.toLocaleString()}% of target`} sub={`Target: ${PROJECT.stats.target}`} highlight />
          </div>

          {/* Fundraise Bar */}
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[32px] font-semibold text-gray-1000">{PROJECT.stats.totalRaised}</span>
              <span className="text-base font-medium text-neon-glow">
                {PROJECT.stats.progress.toLocaleString()}% <span className="text-sm text-alpha-40">of target</span>
              </span>
            </div>
            <div className="mb-2 h-[6px] w-full overflow-hidden rounded-full bg-alpha-12">
              <div className="h-full rounded-full bg-neon-glow" style={{ width: `${Math.min(PROJECT.stats.progress, 100)}%` }} />
            </div>
            <div className="flex items-center justify-between text-xs text-alpha-40">
              <span>Target <span className="text-neon-glow">{PROJECT.stats.target}</span></span>
            </div>
          </section>

          {/* Status Stepper */}
          <StatusStepper
            currentStep={PROJECT.currentStep}
            dates={{
              0: { line1: "25 Oct", line2: "02:00 UTC" },
              1: { line1: "26 Oct", line2: "10:00 UTC" },
              2: { line1: "28 Oct", line2: "11:00 UTC" },
              3: { line1: "Nov 2025" },
              4: { line1: "Nov 2025" },
              5: { line1: "Dec 2025" },
            }}
          />

          {/* Recent Contributions */}
          <section className="rounded-[14px] border border-alpha-12 bg-gray-200 p-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-medium text-gray-1000">Recent Contributions</h3>
              <span className="text-xs text-alpha-40">Last 24h</span>
            </div>
            <div className="mt-md divide-y divide-alpha-12">
              {PROJECT.recentContributions.map((c) => (
                <div key={c.investor + c.time} className="flex items-center justify-between py-[10px]">
                  <div>
                    <span className="text-sm text-gray-1000">{c.investor}</span>
                    <span className="ml-2 text-xs text-alpha-40">{c.time}</span>
                  </div>
                  <span className="text-sm font-medium text-gray-1000">{c.amount}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Settlement Results */}
          <section className="rounded-[14px] border border-alpha-12 bg-gray-200 p-lg">
            <h3 className="text-base font-medium text-gray-1000">Settlement Results</h3>
            <div className="mt-md grid grid-cols-3 gap-md">
              <MiniStat label="Total Demand" value="$81,190,980" />
              <MiniStat label="Total Matched" value="$4,500,000" />
              <MiniStat label="Match Ratio" value="5.5%" highlight />
            </div>
            <div className="mt-md">
              <div className="flex items-center justify-between text-xs text-alpha-40">
                <span>Demand</span>
                <span>Supply (Target)</span>
              </div>
              <div className="relative mt-1 h-3 w-full overflow-hidden rounded-full bg-alpha-12">
                <div className="absolute inset-y-0 left-0 rounded-full bg-neon-glow/20" style={{ width: "100%" }} />
                <div className="absolute inset-y-0 left-0 rounded-full bg-neon-glow" style={{ width: "5.5%" }} />
              </div>
              <p className="mt-1 text-right text-xs text-neon-glow">✓ Settlement Complete</p>
            </div>
          </section>

          {/* Detailed Contributions Table */}
          <section className="rounded-[14px] border border-alpha-12 bg-gray-200 p-lg">
            <h3 className="text-base font-medium text-gray-1000">All Contributions</h3>
            <div className="mt-md overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-alpha-12 text-left text-[11px] font-medium uppercase tracking-wider text-alpha-40">
                    <th className="pb-sm">Investor</th>
                    <th className="pb-sm">Amount</th>
                    <th className="pb-sm">Outcome</th>
                    <th className="pb-sm">Matched</th>
                    <th className="pb-sm">Tokens</th>
                    <th className="pb-sm">Claim</th>
                    <th className="pb-sm">Refund</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-alpha-12">
                  {[
                    { investor: "alice.testnet", amount: "$500,000", outcome: "FullMatch" as const, matched: "$500,000", tokens: "250,000", claim: true, refund: false },
                    { investor: "bob.testnet", amount: "$1,200,000", outcome: "PartialMatch" as const, matched: "$800,000", tokens: "400,000", claim: false, refund: false },
                    { investor: "carol.testnet", amount: "$340,000", outcome: "NoMatch" as const, matched: "$0", tokens: "0", claim: false, refund: true },
                    { investor: "dave.testnet", amount: "$800,000", outcome: "FullMatch" as const, matched: "$800,000", tokens: "400,000", claim: true, refund: false },
                    { investor: "eve.testnet", amount: "$2,100,000", outcome: "PartialMatch" as const, matched: "$1,400,000", tokens: "700,000", claim: false, refund: false },
                  ].map((c) => (
                    <tr key={c.investor}>
                      <td className="py-sm text-gray-1000">{c.investor}</td>
                      <td className="py-sm text-gray-1000">{c.amount}</td>
                      <td className="py-sm">
                        <span className={`text-xs font-medium ${c.outcome === "FullMatch" ? "text-neon-glow" : c.outcome === "PartialMatch" ? "text-status-subscribing" : "text-status-refund"}`}>
                          {c.outcome}
                        </span>
                      </td>
                      <td className="py-sm text-gray-1000">{c.matched}</td>
                      <td className="py-sm text-gray-1000">{c.tokens}</td>
                      <td className="py-sm">{c.claim ? <span className="text-xs text-neon-glow">✓</span> : <span className="text-xs text-alpha-40">—</span>}</td>
                      <td className="py-sm">{c.refund ? <span className="text-xs text-neon-glow">✓</span> : <span className="text-xs text-alpha-40">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Project Details (collapsible) */}
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-[20px] font-medium text-gray-1000">
              Project Details
              <span className="text-sm text-alpha-40 transition-transform group-open:rotate-90">▶</span>
            </summary>
            <div className="mt-md divide-y divide-alpha-12">
              {PROJECT.details.map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between py-sm">
                  <span className="text-sm text-alpha-40">{label}</span>
                  <span className="text-sm font-medium text-gray-1000">{value}</span>
                </div>
              ))}
            </div>
          </details>
        </div>

        {/* Right Sidebar */}
        <aside className="w-[340px] shrink-0">
          <div className="sticky top-[88px] space-y-md">
            <div className="rounded-[14px] border border-alpha-12 bg-gray-200 p-lg">
              <div className="flex items-center gap-sm">
                <div className="flex h-8 w-8 items-center justify-center rounded-md border border-alpha-20 bg-gray-300 text-xs font-medium text-alpha-60">M</div>
                <span className="text-sm font-medium text-gray-1000">{PROJECT.name}</span>
                <StatusBadge phase={PROJECT.phase} />
              </div>
              <div className="mt-lg space-y-[10px]">
                <SidebarRow label="Subscribers" value={PROJECT.stats.subscribers} />
                <SidebarRow label="Eligible" value={PROJECT.stats.eligible} highlight />
                <SidebarRow label="Pending Review" value={PROJECT.stats.pending} />
                <SidebarRow label="Target" value={PROJECT.stats.target} />
              </div>
            </div>

            <Link href="/company/criteria" className="flex h-[47px] w-full items-center justify-center rounded-[10px] bg-neon-glow text-base font-medium text-gray-0 transition-colors hover:bg-neon-soft">
              Edit Criteria
            </Link>
            {canAdvance && (
              <button onClick={handleAdvance} className="flex h-[47px] w-full items-center justify-center rounded-[10px] border border-alpha-12 bg-gray-200 text-base font-medium text-alpha-60 transition-colors hover:bg-alpha-8">
                Advance to Live
              </button>
            )}
            <button onClick={handleSettle} className="flex h-[47px] w-full items-center justify-center rounded-[10px] border border-alpha-12 bg-gray-200 text-base font-medium text-alpha-60 transition-colors hover:bg-alpha-8">
              Start Settlement
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}

function KpiCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className="rounded-[14px] border border-alpha-12 bg-gray-200 p-[20px]">
      <p className="text-xs text-alpha-40">{label}</p>
      <p className={`mt-xs text-[28px] font-semibold ${highlight ? "text-neon-glow" : "text-gray-1000"}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-alpha-40">{sub}</p>}
    </div>
  );
}

function MiniStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl border border-alpha-12 bg-gray-150 p-md">
      <p className="text-xs text-alpha-40">{label}</p>
      <p className={`mt-xs text-lg font-semibold ${highlight ? "text-neon-glow" : "text-gray-1000"}`}>{value}</p>
    </div>
  );
}

function SidebarRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-alpha-40">{label}</span>
      <span className={`text-sm font-medium ${highlight ? "text-neon-glow" : "text-gray-1000"}`}>{value}</span>
    </div>
  );
}
