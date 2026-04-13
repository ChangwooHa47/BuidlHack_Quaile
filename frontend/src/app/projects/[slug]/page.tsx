import Header from "@/components/Header";
import StatusBadge from "@/components/StatusBadge";
import StatusStepper from "@/components/StatusStepper";

const PROJECT = {
  name: "Momentum",
  ticker: "MMT",
  chains: ["BNB", "SUI"],
  status: "Subscribing" as const,
  description:
    "The leading concentrated liquidity DEX on Sui, delivering top APRs for liquidity providers. Powered by the ve(3,3) model.",
  totalRaised: "$81,190,980",
  completedPct: "1,805%",
  target: "$4,500,000",
  overTarget: "1705% over initial target",
  currentStep: 2,
  details: [
    { label: "Token Name", value: "MMT" },
    { label: "Token Chain", value: "Sui" },
    { label: "Subscription Assets", value: "BNB · SUI · USDT" },
    { label: "Fully Diluted Valuation", value: "$250M — $350M" },
    { label: "Community Offering Amount", value: "$4,500,000" },
    { label: "Vesting", value: "6 month linear" },
  ],
  sidebar: {
    identity: {
      GitHub: "Sealed",
      Wallet: "Sealed",
    },
  },
  summary:
    "Momentum is the leading concentrated liquidity DEX (CLMM) on Sui, delivering some of the highest APRs for liquidity providers. Powered by the ve(3,3) model at TGE, Momentum is designed to be the core liquidity engine of the Sui ecosystem, aligning long-term incentives between protocols, LPs, and traders.\n\nMomentum also runs an innovative gamified program, which has rapidly accelerated adoption and positioned Momentum as the default liquidity venue for new launches on Sui.",
  highlights: [
    "Momentum DEX — concentrated liquidity AMM optimized for Sui",
    "MSafe — multi-signature treasury tool with vesting and dApp integrations",
    "Token Generation Lab (TGL) — launchpad for high quality projects",
    "Momentum X — compliance-focused platform for tokenized real world assets",
  ],
};

export default function ProjectDetailPage() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <div className="mx-auto max-w-[1200px] px-lg py-xl">
          {/* Breadcrumb */}
          <p className="mb-lg text-sm text-gray-600">
            Projects &nbsp;/ &nbsp;
            <span className="text-gray-800">{PROJECT.name}</span>
          </p>

          <div className="flex flex-col gap-xl lg:flex-row">
            {/* Left content */}
            <div className="flex-1">
              {/* Project header */}
              <div className="mb-xl flex items-center gap-md">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-300 text-lg font-semibold text-gray-900">
                  {PROJECT.ticker.charAt(0)}
                </div>
                <h1 className="text-2xl font-semibold text-gray-1000">{PROJECT.name}</h1>
                <StatusBadge status={PROJECT.status} />
              </div>

              <p className="mb-md text-sm leading-relaxed text-gray-700">
                {PROJECT.description}
              </p>

              {/* Chain tags */}
              <div className="mb-xl flex gap-xs">
                {PROJECT.chains.map((c) => (
                  <span
                    key={c}
                    className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-gray-800"
                  >
                    {c}
                  </span>
                ))}
                {[1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-xs text-gray-600"
                  >
                    {i}
                  </span>
                ))}
              </div>

              {/* Status section */}
              <section className="mb-xl">
                <h2 className="mb-md text-base font-semibold text-gray-1000">Status</h2>
                <StatusStepper
                  currentStep={PROJECT.currentStep}
                  dates={{
                    0: { label: "23 Jul", sub: "Completed" },
                    1: { label: "30 Jul", sub: "Completed" },
                    2: { label: "06 Oct", sub: "09 Oct UTC" },
                    3: { label: "Nov 2025" },
                    4: { label: "Nov 2025" },
                    5: { label: "Dec 2025" },
                  }}
                />
              </section>

              {/* Fundraise bar */}
              <section className="mb-xl">
                <div className="mb-xs flex items-baseline justify-between">
                  <span className="text-3xl font-semibold text-gray-1000">
                    {PROJECT.totalRaised}
                  </span>
                  <span className="text-base font-medium text-neon-glow">
                    {PROJECT.completedPct}{" "}
                    <span className="text-sm text-gray-700">completed</span>
                  </span>
                </div>
                <div className="mb-xs h-1.5 w-full overflow-hidden rounded-full bg-gray-300">
                  <div className="h-full rounded-full bg-neon-glow" style={{ width: "100%" }} />
                </div>
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>
                    Target <span className="text-neon-glow">{PROJECT.target}</span>
                  </span>
                  <span>{PROJECT.overTarget}</span>
                </div>
              </section>

              {/* Project Details table */}
              <section className="mb-xl">
                <h2 className="mb-md text-base font-semibold text-gray-1000">
                  Project Details
                </h2>
                <div className="divide-y divide-border">
                  {PROJECT.details.map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between py-sm">
                      <span className="text-sm text-gray-600">{label}</span>
                      <span className="text-sm font-medium text-gray-900">{value}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* Project Summary */}
              <section className="mb-xl rounded-xl border border-border bg-surface p-lg">
                <h3 className="mb-sm text-sm font-semibold text-gray-1000">
                  // Project Summary
                </h3>
                <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">
                  {PROJECT.summary}
                </p>
              </section>

              {/* Key Highlights */}
              <section className="rounded-xl border border-border bg-surface p-lg">
                <h3 className="mb-sm text-sm font-semibold text-gray-1000">
                  // Key Project Highlights
                </h3>
                <ul className="space-y-1.5">
                  {PROJECT.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-xs text-sm text-gray-700">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gray-600" />
                      {h}
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            {/* Right sidebar */}
            <aside className="w-full shrink-0 lg:w-[340px]">
              <div className="sticky top-20 rounded-xl border border-border bg-surface p-lg">
                {/* Mini card header */}
                <div className="mb-lg flex items-center gap-sm">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-300 text-xs font-semibold text-gray-900">
                    M
                  </div>
                  <span className="text-sm font-medium text-gray-1000">{PROJECT.name}</span>
                  <StatusBadge status="Open" />
                </div>

                {/* Identity */}
                <div className="mb-lg">
                  <p className="mb-sm text-xs font-medium uppercase tracking-wider text-gray-600">
                    Your Identity
                  </p>
                  <div className="space-y-xs">
                    {Object.entries(PROJECT.sidebar.identity).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">{k}</span>
                        <span className="flex items-center gap-1 text-sm text-neon-glow">
                          <span className="h-1.5 w-1.5 rounded-full bg-neon-glow" />
                          {v}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-xs">
                  <button className="w-full rounded-lg border border-gray-500 py-2.5 text-sm font-medium text-gray-1000 hover:bg-alpha-8 transition-colors">
                    Edit Identity
                  </button>
                  <button className="w-full rounded-lg bg-neon-glow py-2.5 text-sm font-medium text-gray-0 hover:bg-neon-soft transition-colors">
                    Subscribe
                  </button>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>
    </>
  );
}
