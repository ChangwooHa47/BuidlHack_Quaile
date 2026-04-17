"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWallet } from "@/contexts/WalletContext";
import { getAllPolicies } from "@/lib/near/contracts";
import { registerPolicy } from "@/lib/near/transactions";
import { slugOf } from "@/lib/slug";
import { serializeCriteria, type CriteriaGroup } from "@/lib/criteria";
import AddCriteriaModal from "@/components/AddCriteriaModal";

const CHAIN_OPTIONS = ["NEAR", "ETH", "SOL", "BTC", "ARB", "BASE", "OP", "POLY", "BSC"] as const;
const DEFAULT_LOGO = "https://placehold.co/128";
const DEFAULT_IPFS_CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3ocirgf5de2yjvei";
const ONE_HOUR_MS = 60 * 60 * 1000;

function datetimeLocalToNs(value: string): number {
  // datetime-local returns a timezone-naive "YYYY-MM-DDTHH:mm" string interpreted
  // as local time. Date.parse maps it to a UTC epoch in ms; multiply for ns.
  return new Date(value).getTime() * 1_000_000;
}

export default function AdminNewPolicyPage() {
  const router = useRouter();
  const { selector, accountId, isConnected } = useWallet();

  // Project metadata
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [chain, setChain] = useState<(typeof CHAIN_OPTIONS)[number]>("NEAR");
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState(DEFAULT_LOGO);

  // Sale config
  const [tokenContract, setTokenContract] = useState("mockft.rockettheraccon.testnet");
  const [totalAllocation, setTotalAllocation] = useState("1000000000000000000000000000");
  const [pricePerToken, setPricePerToken] = useState("500000000000000000000000");
  const [subscriptionStart, setSubscriptionStart] = useState("");
  const [subscriptionEnd, setSubscriptionEnd] = useState("");
  const [liveEnd, setLiveEnd] = useState("");

  // Criteria
  const [criteria, setCriteria] = useState<CriteriaGroup[]>([]);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Pre-existing slugs — for duplicate-name guard
  const [existingSlugs, setExistingSlugs] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await getAllPolicies();
        if (cancelled) return;
        setExistingSlugs(new Set(all.map((p) => slugOf(p.name))));
      } catch { /* ignore */ }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  function validate(): string | null {
    if (!name.trim()) return "Name is required.";
    if (!ticker.trim()) return "Ticker is required.";
    if (existingSlugs.has(slugOf(name))) {
      return "Another policy already uses this name (slug collision). Pick a different name.";
    }
    if (!description.trim()) return "Description is required.";
    if (!tokenContract.trim()) return "Token contract is required.";
    if (!totalAllocation.trim() || !pricePerToken.trim()) {
      return "Total allocation and price per token are required.";
    }
    if (!subscriptionStart || !subscriptionEnd || !liveEnd) {
      return "All three timeline fields are required.";
    }
    const startMs = new Date(subscriptionStart).getTime();
    const endMs = new Date(subscriptionEnd).getTime();
    const liveMs = new Date(liveEnd).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || !Number.isFinite(liveMs)) {
      return "One of the timeline fields is invalid.";
    }
    if (startMs <= Date.now()) {
      return "Subscription start must be in the future.";
    }
    if (endMs - startMs < ONE_HOUR_MS) {
      return "Subscription end must be at least 1 hour after start.";
    }
    if (liveMs <= endMs) {
      return "Live end must be after subscription end.";
    }
    if (criteria.length === 0) {
      return "Add at least one criterion before publishing.";
    }
    return null;
  }

  async function handlePublish() {
    if (!selector || !accountId) return;
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const wallet = await selector.wallet("my-near-wallet");

      const naturalLanguage = serializeCriteria(criteria, threshold);

      await registerPolicy(
        wallet,
        name.trim(),
        ticker.trim(),
        description.trim(),
        chain,
        logoUrl.trim() || DEFAULT_LOGO,
        naturalLanguage,
        DEFAULT_IPFS_CID,
        {
          token_contract: tokenContract.trim(),
          total_allocation: totalAllocation.trim(),
          price_per_token: pricePerToken.trim(),
          payment_token: "Near",
          subscription_start: datetimeLocalToNs(subscriptionStart),
          subscription_end: datetimeLocalToNs(subscriptionEnd),
          live_end: datetimeLocalToNs(liveEnd),
        },
      );
      // MyNearWallet redirect handles the flow; on resume we land on /admin
      // and the new policy is listed. Push as a fallback for in-place signers.
      router.push(`/admin/${slugOf(name.trim())}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish policy");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = isConnected && !submitting;

  return (
    <main className="flex-1 bg-gray-50">
      <div className="mx-auto max-w-[1440px] px-[80px] py-[56px]">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm font-medium">
          <Link href="/admin" className="text-alpha-40 hover:text-alpha-60 transition-colors">Your Projects</Link>
          <span className="text-alpha-40">&rsaquo;</span>
          <span className="text-alpha-60">New Project</span>
        </div>

        <h1 className="mt-lg text-[28px] font-medium text-gray-1000">New Project</h1>
        <p className="mt-xs text-sm text-alpha-60">
          Register a new policy on the launchpad. Metadata, sale configuration, and evaluation criteria are fixed once published; only criteria can be edited while the policy is still Upcoming.
        </p>

        {/* Project metadata */}
        <section className="mt-xl">
          <h2 className="text-[20px] font-medium text-gray-1000">Project Metadata</h2>
          <div className="mt-md grid grid-cols-2 gap-md">
            <TextField label="Name" value={name} onChange={setName} required />
            <TextField label="Ticker" value={ticker} onChange={setTicker} required />
            <SelectField
              label="Chain"
              value={chain}
              onChange={(v) => setChain(v as (typeof CHAIN_OPTIONS)[number])}
              options={CHAIN_OPTIONS as unknown as string[]}
            />
            <TextField label="Logo URL" value={logoUrl} onChange={setLogoUrl} />
          </div>
          <div className="mt-md">
            <Label>Description</Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-[10px] border border-alpha-12 bg-gray-150 px-md py-sm text-sm text-gray-1000 placeholder:text-alpha-20 focus:border-neon-glow/40 focus:outline-none"
            />
          </div>
        </section>

        {/* Sale Configuration */}
        <section className="mt-xl">
          <h2 className="text-[20px] font-medium text-gray-1000">Sale Configuration</h2>
          <div className="mt-md grid grid-cols-3 gap-md">
            <TextField label="Token Contract" value={tokenContract} onChange={setTokenContract} required />
            <TextField label="Total Allocation (yocto)" value={totalAllocation} onChange={setTotalAllocation} required />
            <TextField label="Price per Token (yocto)" value={pricePerToken} onChange={setPricePerToken} required />
            <TextField label="Subscription Start" value={subscriptionStart} onChange={setSubscriptionStart} type="datetime-local" required />
            <TextField label="Subscription End" value={subscriptionEnd} onChange={setSubscriptionEnd} type="datetime-local" required />
            <TextField label="Live End" value={liveEnd} onChange={setLiveEnd} type="datetime-local" required />
          </div>
        </section>

        {/* Evaluation Criteria */}
        <section className="mt-xl">
          <div className="flex items-center justify-between gap-md">
            <h2 className="text-[20px] font-medium text-gray-1000">
              Evaluation Criteria
              <span className="ml-sm rounded-pill bg-gray-300 px-2 py-[3px] text-[11px] font-medium text-alpha-60">{criteria.length}</span>
            </h2>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 rounded-pill bg-gray-200 px-[14px] py-[10px] text-sm font-medium text-alpha-60 hover:bg-alpha-8 transition-colors"
            >
              <span className="text-base">+</span> Add Criteria
            </button>
          </div>

          {criteria.length === 0 ? (
            <p className="mt-md text-sm text-alpha-40">No criteria yet. Click &ldquo;Add Criteria&rdquo; to start.</p>
          ) : (
            <div className="mt-md grid grid-cols-1 gap-lg lg:grid-cols-2">
              {/* Internal list */}
              <div className="space-y-md">
                <p className="text-xs font-medium uppercase tracking-wider text-alpha-40">Internal</p>
                {criteria.map((group, i) => (
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
                      <p className="mt-sm text-sm font-medium text-gray-1000 leading-relaxed">{group.main}</p>
                      {group.sub.length > 0 && (
                        <ul className="mt-md space-y-xs border-t border-alpha-12 pt-md">
                          {group.sub.map((s, j) => (
                            <li key={j} className="flex items-start gap-xs text-sm text-alpha-80 leading-relaxed">
                              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-neon-glow" />
                              {s}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
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
                  </div>
                ))}
              </div>

              {/* External preview */}
              <div className="space-y-md">
                <p className="text-xs font-medium uppercase tracking-wider text-alpha-40">External preview (visible to investors)</p>
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
          )}
        </section>

        {/* Passing threshold */}
        {(() => {
          const totalSubs = criteria.reduce((n, g) => n + g.sub.length, 0);
          if (totalSubs === 0) return null;
          const effectiveThreshold = threshold ?? totalSubs;
          return (
            <section className="mt-xl">
              <div className="rounded-[14px] border border-alpha-12 bg-gray-200 p-lg">
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
            </section>
          );
        })()}

        {/* Submit */}
        {error && (
          <div className="mt-xl rounded-[10px] border border-status-refund/30 bg-status-refund/5 px-md py-sm text-sm text-status-refund">
            {error}
          </div>
        )}
        <div className="mt-xl flex justify-end">
          <button
            onClick={handlePublish}
            disabled={!canSubmit}
            className="rounded-xl bg-neon-glow px-[28px] py-[16px] text-base font-medium text-gray-0 transition-colors hover:bg-neon-soft disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-neon-glow"
          >
            {submitting ? "Publishing..." : "Publish Policy"}
          </button>
        </div>
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

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-xs block text-xs font-medium text-alpha-40">{children}</label>;
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <Label>
        {label}
        {required && <span className="ml-2xs text-status-refund">*</span>}
      </Label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-[10px] border border-alpha-12 bg-gray-150 px-md py-sm text-sm text-gray-1000 placeholder:text-alpha-20 focus:border-neon-glow/40 focus:outline-none"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div>
      <Label>{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-[10px] border border-alpha-12 bg-gray-150 px-md py-sm text-sm text-gray-1000 focus:border-neon-glow/40 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}
