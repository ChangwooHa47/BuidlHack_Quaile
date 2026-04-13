import Header from "@/components/Header";
import ProjectCard from "@/components/ProjectCard";
import type { ProjectMeta } from "@/types";

const FILTERS = ["All", "Upcoming", "Open", "Live", "Closed"] as const;

const PROJECTS: ProjectMeta[] = [
  {
    slug: "walrus",
    name: "Walrus",
    ticker: "W",
    description:
      "A decentralized storage and data availability protocol designed for large binary files on Sui.",
    status: "Upcoming" ,
    meta: {
      "Subscription Opens": "Apr 22, 2026",
      "TGE Date": "May 10, 2026",
    },
  },
  {
    slug: "momentum",
    name: "Momentum",
    ticker: "M",
    description:
      "The leading DEX on Sui, offering top APRs for LPs. Powered by the ve(3,3) model.",
    status: "Open" ,
    audiences: ["Long-term Conviction Holder", "Crypto KOL / Influencer", "Ecosystem Builder / Dev"],
    meta: {},
  },
  {
    slug: "navi-protocol",
    name: "NAVI Protocol",
    ticker: "N",
    description:
      "Native one-stop liquidity protocol on Sui. Lend, borrow, and earn with deep capital efficiency.",
    status: "Live" ,
    meta: {
      "Current Price": "$0.124",
      "24h Volume": "$8.4M",
      Subscribers: "12,483",
    },
  },
];

export default function HomePage() {
  return (
    <>
      <Header />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden py-3xl text-center">
          <div className="absolute inset-0 bg-gradient-to-br from-neon-dim/20 via-transparent to-transparent" />
          <div className="relative mx-auto max-w-[1200px] px-lg">
            <h1 className="text-4xl font-semibold tracking-tight text-gray-1000 md:text-5xl">
              Discover. Subscribe. Ride the wave.
            </h1>
            <p className="mx-auto mt-md max-w-lg text-center text-base text-gray-700">
              A curated marketplace where conviction meets opportunity.
            </p>
          </div>
        </section>

        {/* Filter tabs */}
        <section className="mx-auto max-w-[1200px] px-lg">
          <div className="mb-xl flex items-center justify-center gap-1 rounded-pill border border-border bg-surface p-1">
            {FILTERS.map((f) => (
              <button
                key={f}
                className={`rounded-pill px-md py-xs text-sm font-medium transition-colors ${
                  f === "All"
                    ? "bg-gray-300 text-gray-1000"
                    : "text-gray-600 hover:text-gray-800"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </section>

        {/* Project cards */}
        <section className="mx-auto max-w-[1200px] px-lg pb-3xl">
          <div className="grid gap-lg md:grid-cols-2 lg:grid-cols-3">
            {PROJECTS.map((p) => (
              <ProjectCard key={p.slug} {...p} />
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
