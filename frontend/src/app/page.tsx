import Header from "@/components/Header";
import FilterTabs from "@/components/FilterTabs";
import type { ProjectMeta } from "@/types";
import { getAllPolicies, getPolicyInvestorCount, getPolicyPendingTotal, type OnChainPolicy } from "@/lib/near/contracts";

function formatNear(yocto: string): string {
  const near = Number(BigInt(yocto) / BigInt(10 ** 21)) / 1000;
  return near.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function policyToProject(policy: OnChainPolicy, subscribers: number, pendingTotal: string): ProjectMeta {
  const target = formatNear(policy.sale_config.total_allocation);
  const contributed = formatNear(pendingTotal);
  const totalAlloc = Number(BigInt(policy.sale_config.total_allocation));
  const totalPending = Number(BigInt(pendingTotal));
  const progress = totalAlloc > 0 ? Math.round((totalPending / totalAlloc) * 100) : 0;

  return {
    slug: `policy-${policy.id}`,
    name: policy.name,
    ticker: policy.ticker,
    chain: policy.chain,
    description: policy.description,
    status: policy.status === "Upcoming" ? "Upcoming" : policy.status === "Subscribing" ? "Subscription" : policy.status === "Live" ? "Settlement" : "Closed",
    saleInfo: {
      target: `${target} NEAR`,
      totalSubscription: `${contributed} NEAR`,
      progress,
      subscribers: subscribers.toString(),
    },
  };
}

export default async function HomePage() {
  let projects: ProjectMeta[] = [];

  try {
    const policies = await getAllPolicies();
    const results = await Promise.all(
      policies.map(async (p) => {
        try {
          const [subscribers, pending] = await Promise.all([
            getPolicyInvestorCount(p.id),
            getPolicyPendingTotal(p.id),
          ]);
          return policyToProject(p, subscribers, pending);
        } catch {
          return null;
        }
      }),
    );
    projects = results.filter((p): p is ProjectMeta => p !== null);
  } catch {
    // testnet not deployed — empty list
  }

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
        <FilterTabs projects={projects} />
      </main>
    </>
  );
}
