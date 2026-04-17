"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useWallet } from "@/contexts/WalletContext";
import { getAllPolicies, type OnChainPolicy } from "@/lib/near/contracts";
import { slugOf } from "@/lib/slug";
import { updatePolicy } from "@/lib/near/transactions";
import { parseCriteriaWithThreshold, serializeCriteria, type CriteriaGroup } from "@/lib/criteria";
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
  const [threshold, setThreshold] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await getAllPolicies();
        const p = all.find((x) => slugOf(x.name) === slug) ?? null;
        if (cancelled) return;
        setPolicy(p);
        if (p?.natural_language) {
          const parsed = parseCriteriaWithThreshold(p.natural_language);
          setCriteria(parsed.groups);
          setThreshold(parsed.threshold);
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // ── State helpers ──

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
      const naturalLanguage = serializeCriteria(criteria, threshold);
      await updatePolicy(
        wallet, policy.id, policy.name, policy.ticker, policy.description,
        policy.chain, policy.logo_url, naturalLanguage, policy.ipfs_cid,
        {
          token_contract: policy.sale_config.token_contract,
          total_allocation: policy.sale_config.total_allocation,
          price_per_token: policy.sale_config.price_per_token,
          payment_token: policy.sale_config.payment_token,
          subscription_start: policy.sale_config.subscription_start,
          subscription_end: policy.sale_config.subscription_end,
          contribution_end: policy.sale_config.contribution_end,
          refunding_end: policy.sale_config.refunding_end,
          distributing_end: policy.sale_config.distributing_end,
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
                <CriteriaCard
                  key={i}
                  index={i}
                  group={group}
                  locked={!!isLocked}
                  onUpdateMain={(v) => updateMain(i, v)}
                  onUpdateSub={(j, v) => updateSub(i, j, v)}
                  onRemoveSub={(j) => removeSub(i, j)}
                  onAddSub={(v) => addSub(i, v)}
                  onToggleExternal={() => toggleExternal(i)}
                  onDelete={() => removeCriteria(i)}
                />
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
                <ul className="space-y-sm">
                  {criteria.filter((c) => c.externalVisible).map((c, i) => (
                    <li key={i} className="flex items-start gap-xs text-sm text-gray-1000">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-neon-glow" />
                      {c.main}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Passing threshold */}
        {!isLocked && (() => {
          const totalSubs = criteria.reduce((n, g) => n + g.sub.length, 0);
          if (totalSubs === 0) return null;
          const effectiveThreshold = threshold ?? totalSubs;
          return (
            <div className="mt-xl rounded-[14px] border border-alpha-12 bg-gray-200 p-lg">
              <div className="flex items-center justify-between gap-lg">
                <div>
                  <h3 className="text-base font-medium text-gray-1000">Passing Threshold</h3>
                  <p className="mt-xs text-xs text-alpha-60">
                    Minimum sub-criteria an applicant must pass to be deemed eligible.
                    {threshold === null && (
                      <span className="ml-xs text-alpha-40">(Default: all {totalSubs} must pass)</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-sm">
                  <input
                    type="number"
                    min={1}
                    max={totalSubs}
                    value={effectiveThreshold}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!Number.isFinite(v)) return;
                      const clamped = Math.max(1, Math.min(v, totalSubs));
                      setThreshold(clamped === totalSubs ? null : clamped);
                    }}
                    className="w-16 rounded-lg border border-alpha-12 bg-gray-150 px-sm py-xs text-center text-sm text-gray-1000 focus:border-neon-glow/40 outline-none transition-colors"
                  />
                  <span className="text-sm text-alpha-60">/ {totalSubs}</span>
                </div>
              </div>
            </div>
          );
        })()}

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

// ── CriteriaCard ──────────────────────────────────────────────────────────

interface CriteriaCardProps {
  index: number;
  group: CriteriaGroup;
  locked: boolean;
  onUpdateMain: (v: string) => void;
  onUpdateSub: (subIndex: number, v: string) => void;
  onRemoveSub: (subIndex: number) => void;
  onAddSub: (v: string) => void;
  onToggleExternal: () => void;
  onDelete: () => void;
}

function CriteriaCard({
  index,
  group,
  locked,
  onUpdateMain,
  onUpdateSub,
  onRemoveSub,
  onAddSub,
  onToggleExternal,
  onDelete,
}: CriteriaCardProps) {
  const [newSubText, setNewSubText] = useState("");
  const newSubRef = useRef<HTMLInputElement>(null);

  function handleAddSub() {
    if (!newSubText.trim()) return;
    onAddSub(newSubText);
    setNewSubText("");
    setTimeout(() => newSubRef.current?.focus(), 0);
  }

  return (
    <div className="overflow-hidden rounded-[14px] border border-alpha-12 bg-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between gap-sm px-lg pt-lg pb-sm">
        <p className="text-[11px] font-medium uppercase tracking-wider text-alpha-40">
          Criteria {index + 1}
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

      {/* Main statement */}
      <div className="px-lg pb-md">
        {!locked ? (
          <AutoTextarea
            value={group.main}
            onChange={onUpdateMain}
            placeholder="Main criterion statement…"
            className="w-full rounded-lg border border-alpha-12 bg-gray-150 px-md py-sm text-sm font-medium text-gray-1000 leading-relaxed placeholder:text-alpha-20 focus:border-neon-glow/40 outline-none transition-colors"
          />
        ) : (
          <p className="text-sm font-medium text-gray-1000 leading-relaxed">{group.main}</p>
        )}
      </div>

      {/* Sub-criteria */}
      {(group.sub.length > 0 || !locked) && (
        <div className="border-t border-alpha-12 px-lg py-md">
          <p className="mb-sm text-[11px] font-medium uppercase tracking-wider text-alpha-40">
            Sub-criteria
            <span className="ml-xs font-normal normal-case tracking-normal text-alpha-40">
              — yes/no evaluation items
            </span>
          </p>

          <div className="space-y-sm">
            {group.sub.map((s, j) => (
              <div key={j} className="flex items-start gap-sm">
                <span className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-neon-glow" />
                {!locked ? (
                  <>
                    <AutoTextarea
                      value={s}
                      onChange={(v) => onUpdateSub(j, v)}
                      placeholder="Sub-criterion…"
                      className="flex-1 rounded-lg border border-alpha-12 bg-gray-150 px-md py-sm text-sm text-gray-1000 leading-relaxed placeholder:text-alpha-20 focus:border-neon-glow/40 outline-none transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => onRemoveSub(j)}
                      className="mt-[6px] flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-alpha-40 hover:bg-status-refund/10 hover:text-status-refund transition-colors"
                      title="Remove this sub-criterion"
                    >
                      <TrashIcon />
                    </button>
                  </>
                ) : (
                  <span className="text-sm text-alpha-80 leading-relaxed">{s}</span>
                )}
              </div>
            ))}
          </div>

          {/* Inline add sub-criterion */}
          {!locked && (
            <div className="mt-sm flex items-center gap-sm">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full border border-dashed border-alpha-20" />
              <input
                ref={newSubRef}
                type="text"
                value={newSubText}
                onChange={(e) => setNewSubText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddSub();
                  }
                }}
                placeholder="Type a new sub-criterion and press Enter…"
                className="flex-1 rounded-lg border border-dashed border-alpha-12 bg-transparent px-md py-sm text-sm text-gray-1000 placeholder:text-alpha-20 focus:border-neon-glow/40 focus:bg-gray-150 outline-none transition-colors"
              />
              <button
                type="button"
                onClick={handleAddSub}
                disabled={!newSubText.trim()}
                className="flex h-8 items-center rounded-lg border border-alpha-12 px-sm text-xs font-medium text-alpha-60 hover:bg-alpha-8 hover:text-gray-1000 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Add
              </button>
            </div>
          )}
        </div>
      )}

      {/* Footer actions */}
      {!locked && (
        <div className="flex items-center justify-between border-t border-alpha-12 bg-gray-150 px-lg py-sm">
          <button
            onClick={onToggleExternal}
            className="flex items-center gap-xs rounded-lg px-sm py-1.5 text-xs font-medium text-alpha-60 hover:bg-alpha-8 hover:text-gray-1000 transition-colors"
          >
            {group.externalVisible ? <EyeIcon /> : <EyeOffIcon />}
            {group.externalVisible ? "Make Private" : "Make Public"}
          </button>
          <button
            onClick={onDelete}
            className="flex items-center gap-xs rounded-lg px-sm py-1.5 text-xs font-medium text-alpha-60 hover:bg-status-refund/10 hover:text-status-refund transition-colors"
          >
            <TrashIcon />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ── Icons (Lucide, MIT license) ───────────────────────────────────────────

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575a1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
      <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
      <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
      <path d="m2 2 20 20" />
    </svg>
  );
}

// ── AutoTextarea ──────────────────────────────────────────────────────────

function AutoTextarea({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function resize() {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }

  useEffect(() => {
    resize();
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        resize();
      }}
      onFocus={resize}
      placeholder={placeholder}
      rows={1}
      className={`resize-none overflow-hidden ${className ?? ""}`}
    />
  );
}
