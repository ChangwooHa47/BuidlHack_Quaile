"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useWallet } from "@/contexts/WalletContext";
import { getPolicy, type OnChainPolicy } from "@/lib/near/contracts";
import { registerPolicy } from "@/lib/near/transactions";
import AddCriteriaModal from "@/components/AddCriteriaModal";
import StatusBadge from "@/components/StatusBadge";

interface CriteriaGroup {
  main: string;
  sub: string[];
  externalVisible: boolean;
}

export default function AdminCriteriaPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug as string;
  const policyId = Number(slug?.replace("policy-", ""));
  const { selector } = useWallet();

  const [policy, setPolicy] = useState<OnChainPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // Internal criteria (main + sub-criteria from LLM)
  const [criteria, setCriteria] = useState<CriteriaGroup[]>([]);

  // Sale config state (for new policies)
  const [tokenContract, setTokenContract] = useState("mockft.rockettheraccon.testnet");
  const [totalAllocation, setTotalAllocation] = useState("1000000000000000000000000000");
  const [pricePerToken, setPricePerToken] = useState("500000000000000000000000");
  const [subscriptionStart, setSubscriptionStart] = useState("");
  const [subscriptionEnd, setSubscriptionEnd] = useState("");
  const [liveEnd, setLiveEnd] = useState("");

  useEffect(() => {
    getPolicy(policyId)
      .then((p) => {
        setPolicy(p);
        if (p?.natural_language) {
          // Parse existing criteria from natural_language
          const lines = p.natural_language.split("\n").filter((l) => l.trim());
          setCriteria([{ main: lines[0] || "", sub: lines.slice(1), externalVisible: true }]);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [policyId]);

  function handleAddCriteria(main: string, sub: string[]) {
    setCriteria((prev) => [...prev, { main, sub, externalVisible: true }]);
    setShowModal(false);
  }

  function removeCriteria(index: number) {
    setCriteria((prev) => prev.filter((_, i) => i !== index));
  }

  function toggleExternal(index: number) {
    setCriteria((prev) =>
      prev.map((c, i) => (i === index ? { ...c, externalVisible: !c.externalVisible } : c)),
    );
  }

  async function handlePublish() {
    if (!selector || criteria.length === 0) return;
    if (!subscriptionStart || !subscriptionEnd || !liveEnd) {
      alert("Fill all date fields.");
      return;
    }

    setIsPublishing(true);
    try {
      const wallet = await selector.wallet("my-near-wallet");

      // Combine criteria into natural_language
      const naturalLanguage = criteria
        .flatMap((g) => [g.main, ...g.sub.map((s) => `  - ${s}`)])
        .join("\n");

      const startNs = new Date(subscriptionStart).getTime() * 1_000_000;
      const endNs = new Date(subscriptionEnd).getTime() * 1_000_000;
      const liveNs = new Date(liveEnd).getTime() * 1_000_000;

      await registerPolicy(
        wallet,
        policy?.name || "New Project",
        policy?.ticker || "TKN",
        policy?.description || "A new project on Qualie.",
        policy?.chain || "NEAR",
        policy?.logo_url || "https://placehold.co/128",
        naturalLanguage,
        "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3ocirgf5de2yjvei",
        {
          token_contract: tokenContract,
          total_allocation: totalAllocation,
          price_per_token: pricePerToken,
          payment_token: "Near",
          subscription_start: startNs,
          subscription_end: endNs,
          live_end: liveNs,
        },
      );
      alert("Policy published!");
      router.push("/admin");
    } catch (err) {
      alert(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsPublishing(false);
    }
  }

  const isLocked = policy && policy.status !== "Upcoming";

  if (loading) {
    return <main className="flex-1 bg-gray-50"><div className="mx-auto max-w-[1440px] px-[80px] py-[56px]"><div className="h-64 animate-pulse rounded-[14px] bg-gray-200" /></div></main>;
  }

  return (
    <main className="flex-1 bg-gray-50">
      <div className="mx-auto max-w-[1440px] px-[80px] py-[56px]">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm font-medium">
          <Link href="/admin" className="text-alpha-40 hover:text-alpha-60 transition-colors">Your Projects</Link>
          <span className="text-alpha-40">&rsaquo;</span>
          <Link href={`/admin/policy-${policyId}`} className="text-alpha-40 hover:text-alpha-60 transition-colors">
            {policy?.name || `Policy #${policyId}`}
          </Link>
          <span className="text-alpha-40">&rsaquo;</span>
          <span className="text-alpha-60">Evaluation Criteria</span>
        </div>

        <div className="mt-lg flex items-center justify-between">
          <h1 className="text-[24px] font-medium text-gray-1000">Evaluation Criteria</h1>
          {policy && <StatusBadge phase={policy.status} />}
        </div>

        {isLocked && (
          <div className="mt-md rounded-[10px] border border-status-refund/30 bg-status-refund/5 px-md py-sm text-sm text-status-refund">
            Criteria are locked — policy is {policy?.status}. Changes cannot be made.
          </div>
        )}

        {/* Criteria list */}
        <div className="mt-xl space-y-md">
          <div className="flex items-center justify-between">
            <h2 className="text-[20px] font-medium text-gray-1000">
              Internal Criteria
              <span className="ml-sm rounded-pill bg-gray-300 px-2 py-[3px] text-[11px] font-medium text-alpha-60">{criteria.length}</span>
            </h2>
            {!isLocked && (
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-2 rounded-pill bg-gray-200 px-[14px] py-[10px] text-sm font-medium text-alpha-60 hover:bg-alpha-8 transition-colors"
              >
                <span className="text-base">+</span> Add Criteria
              </button>
            )}
          </div>

          {criteria.length === 0 ? (
            <p className="text-sm text-alpha-40">No criteria yet. Click &ldquo;Add Criteria&rdquo; to start.</p>
          ) : (
            criteria.map((group, i) => (
              <div key={i} className="rounded-[14px] border border-alpha-12 bg-gray-200 p-lg">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-base font-medium text-gray-1000">{group.main}</p>
                    <ul className="mt-sm space-y-xs">
                      {group.sub.map((s, j) => (
                        <li key={j} className="flex items-start gap-xs text-sm text-alpha-60">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-alpha-40" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {!isLocked && (
                    <div className="flex items-center gap-sm">
                      <button
                        onClick={() => toggleExternal(i)}
                        className={`rounded-pill px-sm py-1 text-xs font-medium transition-colors ${group.externalVisible ? "bg-neon-glow/10 text-neon-glow" : "bg-gray-300 text-alpha-40"}`}
                      >
                        {group.externalVisible ? "Public" : "Hidden"}
                      </button>
                      <button
                        onClick={() => removeCriteria(i)}
                        className="text-sm text-alpha-40 hover:text-status-refund transition-colors"
                      >
                        &times;
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* External preview */}
        <div className="mt-xl">
          <h2 className="text-[20px] font-medium text-gray-1000">
            External Criteria
            <span className="ml-xs text-sm text-alpha-40">(visible to investors)</span>
          </h2>
          <div className="mt-md rounded-[14px] border border-alpha-12 bg-gray-200 p-lg">
            {criteria.filter((c) => c.externalVisible).length === 0 ? (
              <p className="text-sm text-alpha-40">No public criteria.</p>
            ) : (
              <ul className="space-y-xs">
                {criteria.filter((c) => c.externalVisible).map((c, i) => (
                  <li key={i} className="flex items-start gap-xs text-sm text-gray-1000">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-neon-glow" />
                    {c.main}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Sale Config (for new policies or Upcoming) */}
        {!isLocked && (
          <div className="mt-xl">
            <h2 className="text-[24px] font-medium text-gray-1000">Sale Configuration</h2>
            <div className="mt-lg grid grid-cols-3 gap-md">
              <SaleField label="Token Contract" value={tokenContract} onChange={setTokenContract} />
              <SaleField label="Total Allocation" value={totalAllocation} onChange={setTotalAllocation} />
              <SaleField label="Price per Token" value={pricePerToken} onChange={setPricePerToken} />
              <SaleField label="Subscription Start" value={subscriptionStart} onChange={setSubscriptionStart} type="datetime-local" />
              <SaleField label="Subscription End" value={subscriptionEnd} onChange={setSubscriptionEnd} type="datetime-local" />
              <SaleField label="Live End" value={liveEnd} onChange={setLiveEnd} type="datetime-local" />
            </div>
          </div>
        )}

        {/* Actions */}
        {!isLocked && (
          <div className="mt-xl flex justify-end">
            <button
              onClick={handlePublish}
              disabled={isPublishing || criteria.length === 0}
              className="rounded-xl bg-neon-glow px-[28px] py-[16px] text-base font-medium text-gray-0 transition-colors hover:bg-neon-soft disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isPublishing ? "Publishing..." : "Publish Policy"}
            </button>
          </div>
        )}
      </div>

      {showModal && (
        <AddCriteriaModal
          onAdd={handleAddCriteria}
          onClose={() => setShowModal(false)}
        />
      )}
    </main>
  );
}

function SaleField({ label, value, onChange, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <label className="mb-xs block text-xs font-medium text-alpha-40">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-[10px] border border-alpha-12 bg-gray-150 px-md py-sm text-sm text-gray-1000 placeholder:text-alpha-20 focus:border-neon-glow/40 focus:outline-none"
      />
    </div>
  );
}
