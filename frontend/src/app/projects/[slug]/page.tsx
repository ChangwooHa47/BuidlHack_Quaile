import Header from "@/components/Header";
import StatusBadge from "@/components/StatusBadge";
import SubscribingSidebar from "@/components/SubscribingSidebar";
import { getPolicy, getPolicyInvestorCount, getPolicyPendingTotal, type OnChainPolicy } from "@/lib/near/contracts";
import { notFound } from "next/navigation";

function formatNear(yocto: string): string {
  const near = Number(BigInt(yocto) / BigInt(10 ** 21)) / 1000;
  return near.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatDate(ns: number): string {
  return new Date(ns / 1_000_000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const match = slug.match(/^policy-(\d+)$/);
  if (!match) notFound();

  const policyId = Number(match[1]);
  const policy = await getPolicy(policyId);
  if (!policy) notFound();

  const [subscribers, pendingTotal] = await Promise.all([
    getPolicyInvestorCount(policyId),
    getPolicyPendingTotal(policyId),
  ]);

  const target = formatNear(policy.sale_config.total_allocation);
  const contributed = formatNear(pendingTotal);
  const totalAlloc = Number(BigInt(policy.sale_config.total_allocation));
  const totalPending = Number(BigInt(pendingTotal));
  const progress = totalAlloc > 0 ? Math.round((totalPending / totalAlloc) * 100) : 0;

  const ticker = `P${policy.id}`;
  const name = policy.natural_language.slice(0, 50) + (policy.natural_language.length > 50 ? "..." : "");

  return (
    <>
      <Header />
      <main className="flex-1">
        <div className="mx-auto max-w-[1200px] px-lg py-xl">
          <p className="mb-lg text-sm text-gray-600">
            Projects &nbsp;/ &nbsp;
            <span className="text-gray-800">{name}</span>
          </p>

          <div className="flex flex-col gap-xl lg:flex-row">
            {/* Left content */}
            <div className="flex-1">
              <div className="mb-xl flex items-center gap-md">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-300 text-lg font-semibold text-gray-900">
                  {ticker.charAt(0)}
                </div>
                <h1 className="text-2xl font-semibold text-gray-1000">{name}</h1>
                <StatusBadge phase={policy.status} />
              </div>

              <p className="mb-md text-sm leading-relaxed text-gray-700">
                {policy.natural_language}
              </p>

              <div className="mb-xl flex gap-xs">
                <span className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-gray-800">
                  NEAR
                </span>
              </div>

              {/* Fundraise bar */}
              <section className="mb-xl">
                <div className="mb-xs flex items-baseline justify-between">
                  <span className="text-3xl font-semibold text-gray-1000">
                    {contributed} NEAR
                  </span>
                  <span className="text-base font-medium text-neon-glow">
                    {progress}%{" "}
                    <span className="text-sm text-gray-700">completed</span>
                  </span>
                </div>
                <div className="mb-xs h-1.5 w-full overflow-hidden rounded-full bg-gray-300">
                  <div
                    className="h-full rounded-full bg-neon-glow"
                    style={{ width: `${Math.min(progress, 100)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>
                    Target <span className="text-neon-glow">{target} NEAR</span>
                  </span>
                  <span>{subscribers} subscribers</span>
                </div>
              </section>

              {/* Project Details table */}
              <section className="mb-xl">
                <h2 className="mb-md text-base font-semibold text-gray-1000">
                  Project Details
                </h2>
                <div className="divide-y divide-border">
                  {[
                    { label: "Policy ID", value: String(policy.id) },
                    { label: "Foundation", value: policy.foundation },
                    { label: "Token Contract", value: policy.sale_config.token_contract },
                    { label: "Payment", value: typeof policy.sale_config.payment_token === "string" ? policy.sale_config.payment_token : "NEP-141" },
                    { label: "Subscription Start", value: formatDate(policy.sale_config.subscription_start) },
                    { label: "Subscription End", value: formatDate(policy.sale_config.subscription_end) },
                    { label: "Live End", value: formatDate(policy.sale_config.live_end) },
                    { label: "IPFS CID", value: policy.ipfs_cid },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between py-sm">
                      <span className="text-sm text-gray-600">{label}</span>
                      <span className="text-sm font-medium text-gray-900 truncate max-w-[60%] text-right">{value}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* Eligibility Criteria */}
              <section className="rounded-xl border border-border bg-surface p-lg">
                <h3 className="mb-sm text-sm font-semibold text-gray-1000">
                  Eligibility Criteria
                </h3>
                <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">
                  {policy.natural_language}
                </p>
              </section>
            </div>

            {/* Right sidebar */}
            <aside className="w-full shrink-0 lg:w-[340px]">
              <SubscribingSidebar
                name={name}
                ticker={ticker}
                status={policy.status}
                policyId={policy.id}
              />
            </aside>
          </div>
        </div>
      </main>
    </>
  );
}
