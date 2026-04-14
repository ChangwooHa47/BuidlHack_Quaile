import Header from "@/components/Header";
import FilterTabs from "@/components/FilterTabs";
import type { ProjectMeta } from "@/types";

const PROJECTS: ProjectMeta[] = [
  // ── Status: Upcoming ──
  {
    slug: "walrus",
    name: "Walrus",
    ticker: "W",
    chain: "SUI",
    description: "A decentralized storage and data availability protocol designed for large binary files on Sui.",
    status: "Upcoming",
    saleInfo: { target: "$4,500,000" },
    opens: "2026-04-22T00:00:00Z",
    closes: "2026-04-28T00:00:00Z",
    audiences: ["Long-term Conviction Holder", "Ecosystem Builder / Dev"],
  },
  // ── Status: Subscription ──
  {
    slug: "momentum",
    name: "Momentum",
    ticker: "MMT",
    chain: "SUI",
    description: "The leading concentrated liquidity DEX on Sui, delivering top APRs for liquidity providers.",
    status: "Subscription",
    saleInfo: { target: "$4,500,000", totalSubscription: "$2,340,000", progress: 52, subscribers: "3,841" },
    audiences: ["Long-term Conviction Holder", "Crypto KOL / Influencer"],
  },
  // ── Status: Review ──
  {
    slug: "cetus",
    name: "Cetus Protocol",
    ticker: "CETUS",
    chain: "SUI",
    description: "A pioneer DEX and concentrated liquidity protocol on Sui and Aptos with advanced market making.",
    status: "Review",
    saleInfo: { target: "$3,200,000", totalSubscription: "$5,100,000", progress: 159, subscribers: "6,720" },
  },
  // ── Status: Contribution ──
  {
    slug: "bucket",
    name: "Bucket Protocol",
    ticker: "BUCK",
    chain: "SUI",
    description: "A CDP protocol on Sui providing stablecoin BUCK and yield strategies for DeFi composability.",
    status: "Contribution",
    saleInfo: { target: "$2,800,000", totalSubscription: "$12,600,000", progress: 450, subscribers: "9,150" },
  },
  // ── Status: Settlement ──
  {
    slug: "navi-protocol",
    name: "NAVI Protocol",
    ticker: "NAVX",
    chain: "SUI",
    description: "Native one-stop liquidity protocol on Sui. Lend, borrow, and earn with deep capital efficiency.",
    status: "Settlement",
    saleInfo: { target: "$3,000,000", totalSubscription: "$45,000,000", progress: 1500, currentPrice: "$0.124", volume24h: "$8.4M", subscribers: "12,483" },
  },
  // ── Status: Refund ──
  {
    slug: "scallop",
    name: "Scallop",
    ticker: "SCA",
    chain: "SUI",
    description: "The next-gen money market on Sui with institutional-grade lending and borrowing infrastructure.",
    status: "Refund",
    saleInfo: { target: "$2,500,000", totalSubscription: "$38,000,000", progress: 1520, currentPrice: "$0.089", volume24h: "$5.2M", subscribers: "10,340" },
  },
  // ── Status: Claim ──
  {
    slug: "turbos",
    name: "Turbos Finance",
    ticker: "TURBOS",
    chain: "SUI",
    description: "A next-gen DEX on Sui offering perpetuals, spot trading, and concentrated liquidity pools.",
    status: "Claim",
    saleInfo: { target: "$1,500,000", totalSubscription: "$22,000,000", progress: 1467, currentPrice: "$0.042", volume24h: "$3.1M", subscribers: "7,890" },
  },
  // ── Status: Closed ──
  {
    slug: "aurora",
    name: "Aurora",
    ticker: "AURORA",
    chain: "NEAR",
    description: "EVM-compatible layer on NEAR Protocol enabling seamless Ethereum dApp deployment.",
    status: "Closed",
    saleInfo: { target: "$2,000,000", totalRaised: "$81.1M", subscribers: "8,920", finalPrice: "$0.087" },
  },
];

export default function HomePage() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <section className="relative overflow-hidden py-3xl text-center">
          <div className="absolute inset-0 bg-gradient-to-br from-neon-dim/20 via-transparent to-transparent" />
          <div className="relative mx-auto max-w-[1200px] px-lg">
            <h1 className="text-4xl font-semibold tracking-tight text-gray-1000 md:text-5xl">
              Discover. Subscribe. Ride the wave.
            </h1>
            <p className="mt-md text-center text-base text-gray-700">
              A curated marketplace where conviction meets opportunity.
            </p>
          </div>
        </section>
        <FilterTabs projects={PROJECTS} />
      </main>
    </>
  );
}
