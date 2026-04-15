import Header from "@/components/Header";
import FilterTabs from "@/components/FilterTabs";
import type { ProjectMeta, Status } from "@/types";
import { getAllPolicies, getPolicyInvestorCount, getPolicyPendingTotal, type OnChainPolicy } from "@/lib/near/contracts";
import { MOCK_POLICIES } from "@/lib/mock/policies";

function policyToStatus(policy: OnChainPolicy): Status {
  switch (policy.status) {
    case "Upcoming": return "Upcoming";
    case "Subscribing": return "Subscription";
    case "Live": return "Settlement";
    case "Closed": return "Closed";
  }
}

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
    name: policy.natural_language.slice(0, 40) + (policy.natural_language.length > 40 ? "..." : ""),
    ticker: `P${policy.id}`,
    chain: "NEAR",
    description: policy.natural_language,
    status: policyToStatus(policy),
    saleInfo: {
      target: `${target} NEAR`,
      totalSubscription: `${contributed} NEAR`,
      progress,
      subscribers: subscribers.toString(),
    },
  };
}

function mockToProject(mock: typeof MOCK_POLICIES[number]): ProjectMeta {
  return {
    slug: `policy-${mock.id}`,
    name: mock.natural_language.slice(0, 40) + "...",
    ticker: `P${mock.id}`,
    chain: "NEAR",
    description: mock.natural_language,
    status: mock.status === "Upcoming" ? "Upcoming" : mock.status === "Subscribing" ? "Subscription" : mock.status === "Live" ? "Settlement" : "Closed",
    saleInfo: {
      target: mock.sale_config.total_allocation,
      subscribers: mock.subscribers?.toString(),
      totalSubscription: mock.total_contributed,
      progress: mock.progress,
    },
  };
}

export default async function HomePage() {
  let projects: ProjectMeta[];

  try {
    const policies = await getAllPolicies();
    if (policies.length > 0) {
      const enriched = await Promise.all(
        policies.map(async (p) => {
          const [subscribers, pending] = await Promise.all([
            getPolicyInvestorCount(p.id),
            getPolicyPendingTotal(p.id),
          ]);
          return policyToProject(p, subscribers, pending);
        }),
      );
      projects = enriched;
    } else {
      projects = MOCK_POLICIES.map(mockToProject);
    }
  } catch {
    projects = MOCK_POLICIES.map(mockToProject);
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
