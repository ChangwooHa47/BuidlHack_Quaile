import Header from "@/components/Header";
import StatusBadge from "@/components/StatusBadge";
import SubscribingSidebar from "@/components/SubscribingSidebar";
import { getAllPolicies, getPolicyInvestorCount, getPolicyPendingTotal } from "@/lib/near/contracts";
import { notFound } from "next/navigation";

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
}

function formatNear(yocto: string): string {
  const near = Number(BigInt(yocto) / BigInt(10 ** 21)) / 1000;
  return near.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatDate(ns: number): string {
  return new Date(ns / 1_000_000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Find policy by slugified name
  const policies = await getAllPolicies();
  const policy = policies.find((p) => slugify(p.name) === slug);
  if (!policy) notFound();

  const policyId = policy.id;

  const [subscribers, pendingTotal] = await Promise.all([
    getPolicyInvestorCount(policyId),
    getPolicyPendingTotal(policyId),
  ]);

  const target = formatNear(policy.sale_config.total_allocation);
  const contributed = formatNear(pendingTotal);
  const totalAlloc = Number(BigInt(policy.sale_config.total_allocation));
  const totalPending = Number(BigInt(pendingTotal));
  const progress = totalAlloc > 0 ? Math.round((totalPending / totalAlloc) * 100) : 0;

  return (
    <>
      <Header />
      <main className="flex-1">
        <div className="mx-auto max-w-[1200px] px-lg py-xl">
          <p className="mb-lg text-sm text-gray-600">
            Projects &nbsp;/ &nbsp;
            <span className="text-gray-800">{policy.name}</span>
          </p>

          <div className="flex flex-col gap-xl lg:flex-row">
            <div className="flex-1">
              <div className="mb-xl flex items-center gap-md">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-300 text-lg font-semibold text-gray-900">
                  {policy.ticker.charAt(0)}
                </div>
                <h1 className="text-2xl font-semibold text-gray-1000">{policy.name}</h1>
                <StatusBadge phase={policy.status} />
              </div>

              <p className="mb-md text-sm leading-relaxed text-gray-700">{policy.description}</p>

              <div className="mb-xl flex gap-xs">
                <span className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-gray-800">
                  {policy.chain}
                </span>
              </div>

              {/* Fundraise bar */}
              <section className="mb-xl">
                <div className="mb-xs flex items-baseline justify-between">
                  <span className="text-3xl font-semibold text-gray-1000">{contributed} NEAR</span>
                  <span className="text-base font-medium text-neon-glow">
                    {progress}% <span className="text-sm text-gray-700">completed</span>
                  </span>
                </div>
                <div className="mb-xs h-1.5 w-full overflow-hidden rounded-full bg-gray-300">
                  <div className="h-full rounded-full bg-neon-glow" style={{ width: `${Math.min(progress, 100)}%` }} />
                </div>
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>Target <span className="text-neon-glow">{target} NEAR</span></span>
                  <span>{subscribers} subscribers</span>
                </div>
              </section>

              {/* Project Details */}
              <section className="mb-xl">
                <h2 className="mb-md text-base font-semibold text-gray-1000">Project Details</h2>
                <div className="divide-y divide-border">
                  {[
                    { label: "Policy ID", value: String(policy.id) },
                    { label: "Chain", value: policy.chain },
                    { label: "Token Contract", value: policy.sale_config.token_contract },
                    { label: "Payment", value: typeof policy.sale_config.payment_token === "string" ? policy.sale_config.payment_token : "NEP-141" },
                    { label: "Subscription Start", value: formatDate(policy.sale_config.subscription_start) },
                    { label: "Subscription End", value: formatDate(policy.sale_config.subscription_end) },
                    { label: "Live End", value: formatDate(policy.sale_config.live_end) },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between py-sm">
                      <span className="text-sm text-gray-600">{label}</span>
                      <span className="text-sm font-medium text-gray-900 truncate max-w-[60%] text-right">{value}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* Eligibility Criteria (External — visible to investors) */}
              <section className="rounded-xl border border-border bg-surface p-lg">
                <h3 className="mb-sm text-sm font-semibold text-gray-1000">Evaluation Criteria</h3>
                <ul className="space-y-xs">
                  {policy.natural_language.split("\n").filter((l) => l.trim()).map((line, i) => (
                    <li key={i} className="flex items-start gap-xs text-sm text-gray-700">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-neon-glow" />
                      {line.replace(/^\s*-\s*/, "")}
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <aside className="w-full shrink-0 lg:w-[340px]">
              <SubscribingSidebar
                name={policy.name}
                ticker={policy.ticker}
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
