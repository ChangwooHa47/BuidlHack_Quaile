"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useWallet } from "@/contexts/WalletContext";
import { getAllPolicies, type OnChainPolicy } from "@/lib/near/contracts";
import { slugOf } from "@/lib/slug";
import { updatePolicy } from "@/lib/near/transactions";
import { parseCriteria, serializeCriteria, type CriteriaGroup } from "@/lib/criteria";
import AddCriteriaModal from "@/components/AddCriteriaModal";
import StatusBadge from "@/components/StatusBadge";

export default function AdminCriteriaPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug as string;
  const { selector } = useWallet();

  const [policy, setPolicy] = useState<OnChainPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [criteria, setCriteria] = useState<CriteriaGroup[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await getAllPolicies();
        const p = all.find((x) => slugOf(x.name) === slug) ?? null;
        if (cancelled) return;
        setPolicy(p);
        if (p?.natural_language) {
          setCriteria(parseCriteria(p.natural_language));
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

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

  function updateMain(groupIndex: number, newMain: string) {
    setCriteria((prev) =>
      prev.map((c, i) => (i === groupIndex ? { ...c, main: newMain } : c)),
    );
  }

  function updateSub(groupIndex: number, subIndex: number, newText: string) {
    setCriteria((prev) =>
      prev.map((c, i) =>
        i === groupIndex
          ? { ...c, sub: c.sub.map((s, j) => (j === subIndex ? newText : s)) }
          : c,
      ),
    );
  }

  function removeSub(groupIndex: number, subIndex: number) {
    setCriteria((prev) =>
      prev.map((c, i) =>
        i === groupIndex ? { ...c, sub: c.sub.filter((_, j) => j !== subIndex) } : c,
      ),
    );
  }

  function addSub(groupIndex: number, text: string) {
    if (!text.trim()) return;
    setCriteria((prev) =>
      prev.map((c, i) =>
        i === groupIndex ? { ...c, sub: [...c.sub, text.trim()] } : c,
      ),
    );
  }

  async function handleSave() {
    if (!selector || !policy || criteria.length === 0) return;

    setIsSaving(true);
    try {
      const wallet = await selector.wallet("my-near-wallet");

      const naturalLanguage = serializeCriteria(criteria);

      await updatePolicy(
        wallet,
        policy.id,
        policy.name,
        policy.ticker,
        policy.description,
        policy.chain,
        policy.logo_url,
        naturalLanguage,
        policy.ipfs_cid,
        {
          token_contract: policy.sale_config.token_contract,
          total_allocation: policy.sale_config.total_allocation,
          price_per_token: policy.sale_config.price_per_token,
          payment_token: policy.sale_config.payment_token,
          subscription_start: policy.sale_config.subscription_start,
          subscription_end: policy.sale_config.subscription_end,
          live_end: policy.sale_config.live_end,
        },
      );
      alert("Criteria updated!");
      router.push(`/admin/${slug}`);
    } catch (err) {
      alert(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSaving(false);
    }
  }

  const isLocked = policy && policy.status !== "Upcoming";

  if (loading) {
    return <main className="flex-1 bg-gray-50"><div className="mx-auto max-w-[1440px] px-[80px] py-[56px]"><div className="h-64 animate-pulse rounded-[14px] bg-gray-200" /></div></main>;
  }

  if (!policy) {
    return <main className="flex-1 bg-gray-50"><div className="mx-auto max-w-[1440px] px-[80px] py-[56px]"><p className="text-alpha-40">Policy not found.</p></div></main>;
  }

  return (
    <main className="flex-1 bg-gray-50">
      <div className="mx-auto max-w-[1440px] px-[80px] py-[56px]">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm font-medium">
          <Link href="/admin" className="text-alpha-40 hover:text-alpha-60 transition-colors">Your Projects</Link>
          <span className="text-alpha-40">&rsaquo;</span>
          <Link href={`/admin/${slug}`} className="text-alpha-40 hover:text-alpha-60 transition-colors">
            {policy.name}
          </Link>
          <span className="text-alpha-40">&rsaquo;</span>
          <span className="text-alpha-60">Evaluation Criteria</span>
        </div>

        <div className="mt-lg flex items-center justify-between gap-md">
          <div className="flex items-center gap-md">
            <h1 className="text-[24px] font-medium text-gray-1000">Evaluation Criteria</h1>
            <StatusBadge phase={policy.status} />
          </div>
          {!isLocked && (
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 rounded-pill bg-gray-200 px-[14px] py-[10px] text-sm font-medium text-alpha-60 hover:bg-alpha-8 transition-colors"
            >
              <span className="text-base">+</span> Add Criteria
            </button>
          )}
        </div>

        {isLocked && (
          <div className="mt-md rounded-[10px] border border-status-refund/30 bg-status-refund/5 px-md py-sm text-sm text-status-refund">
            Criteria are locked — policy is {policy.status}. Changes cannot be made.
          </div>
        )}

        {/* Criteria: Internal (editable) ↔ External (preview) */}
        <div className="mt-xl grid grid-cols-1 gap-lg lg:grid-cols-2">
          {/* Internal */}
          <div className="space-y-md">
            <h2 className="text-[20px] font-medium text-gray-1000">
              Internal Criteria
              <span className="ml-sm rounded-pill bg-gray-300 px-2 py-[3px] text-[11px] font-medium text-alpha-60">{criteria.length}</span>
            </h2>

            {criteria.length === 0 ? (
              <p className="text-sm text-alpha-40">No criteria yet. Click &ldquo;Add Criteria&rdquo; to start.</p>
            ) : (
              criteria.map((group, i) => (
                <div key={i} className="overflow-hidden rounded-[14px] border border-alpha-12 bg-gray-200">
                  <div className="p-lg">
                    <div className="flex items-center justify-between gap-sm">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-alpha-40">
                        Criteria {i + 1}
                      </p>
                      <span
                        className={`rounded-pill px-sm py-[2px] text-[10px] font-medium uppercase tracking-wider ${
                          group.externalVisible
                            ? "bg-neon-glow/10 text-neon-glow"
                            : "bg-gray-300 text-alpha-40"
                        }`}
                      >
                        {group.externalVisible ? "Public" : "Private"}
                      </span>
                    </div>
                    {!isLocked ? (
                      <input
                        type="text"
                        value={group.main}
                        onChange={(e) => updateMain(i, e.target.value)}
                        className="mt-sm w-full bg-transparent text-sm font-medium text-gray-1000 leading-relaxed border-b border-transparent focus:border-alpha-20 outline-none transition-colors"
                      />
                    ) : (
                      <p className="mt-sm text-sm font-medium text-gray-1000 leading-relaxed">{group.main}</p>
                    )}
                    <div className="mt-md space-y-xs border-t border-alpha-12 pt-md">
                      {group.sub.map((s, j) => (
                        <div key={j} className="flex items-start gap-xs">
                          <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-neon-glow" />
                          {!isLocked ? (
                            <input
                              type="text"
                              value={s}
                              onChange={(e) => updateSub(i, j, e.target.value)}
                              className="flex-1 bg-transparent text-sm text-alpha-80 leading-relaxed border-b border-transparent focus:border-alpha-20 outline-none transition-colors"
                            />
                          ) : (
                            <span className="text-sm text-alpha-80 leading-relaxed">{s}</span>
                          )}
                          {!isLocked && (
                            <button
                              onClick={() => removeSub(i, j)}
                              className="shrink-0 text-xs text-alpha-40 hover:text-status-refund transition-colors"
                            >
                              &times;
                            </button>
                          )}
                        </div>
                      ))}
                      {!isLocked && (
                        <button
                          onClick={() => {
                            const text = prompt("New sub-criterion:");
                            if (text) addSub(i, text);
                          }}
                          className="mt-xs flex items-center gap-xs text-xs text-alpha-40 hover:text-alpha-60 transition-colors"
                        >
                          <span>+</span> Add sub-criterion
                        </button>
                      )}
                    </div>
                  </div>
                  {!isLocked && (
                    <div className="flex items-center justify-end gap-xs border-t border-alpha-12 bg-gray-150 px-lg py-sm">
                      <button
                        onClick={() => toggleExternal(i)}
                        className="rounded-lg px-sm py-1 text-xs font-medium text-alpha-60 hover:bg-alpha-8 hover:text-gray-1000 transition-colors"
                      >
                        {group.externalVisible ? "Make Private" : "Make Public"}
                      </button>
                      <button
                        onClick={() => removeCriteria(i)}
                        className="rounded-lg px-sm py-1 text-xs font-medium text-alpha-60 hover:bg-alpha-8 hover:text-status-refund transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* External */}
          <div className="space-y-md">
            <h2 className="text-[20px] font-medium text-gray-1000">
              External Criteria
              <span className="ml-xs text-sm text-alpha-40">(visible to investors)</span>
            </h2>
            <div className="rounded-[14px] border border-alpha-12 bg-gray-200 p-lg">
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
        </div>

        {/* Actions */}
        {!isLocked && (
          <div className="mt-xl flex justify-end">
            <button
              onClick={handleSave}
              disabled={isSaving || criteria.length === 0}
              className="rounded-xl bg-neon-glow px-[28px] py-[16px] text-base font-medium text-gray-0 transition-colors hover:bg-neon-soft disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSaving ? "Saving..." : "Save Changes"}
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
