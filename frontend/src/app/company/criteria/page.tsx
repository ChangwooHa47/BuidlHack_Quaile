"use client";

import { useState } from "react";
import Link from "next/link";
import ProjectHero from "@/components/ProjectHero";
import { useWallet } from "@/contexts/WalletContext";
import { registerPolicy, parseNearAmount } from "@/lib/near/transactions";

interface Criterion {
  id: string;
  name: string;
  description: string;
  weight: number;
  condition: string;
  enabled: boolean;
}

const DEFAULT_INTERNAL: Criterion[] = [
  { id: "token-holding", name: "Token Holding", description: "Holds project tokens", weight: 30, condition: "Balance ≥ 1,000 MMT", enabled: true },
  { id: "past-participation", name: "Past Participation", description: "Joined previous rounds", weight: 25, condition: "Round count ≥ 2", enabled: true },
  { id: "whitelist", name: "Whitelist", description: "Pre-approved address", weight: 25, condition: "On project allowlist", enabled: true },
  { id: "referral", name: "Referral", description: "Invited by existing user", weight: 20, condition: "Has referral code", enabled: false },
];

const DEFAULT_EXTERNAL: Criterion[] = [
  { id: "long-term-holder", name: "Long-term Holder", description: "Holds tokens > 6 months", weight: 30, condition: "Wallet age ≥ 180 days", enabled: false },
  { id: "active-trader", name: "Active Trader", description: "Frequent on-chain activity", weight: 20, condition: "TX count ≥ 50 / month", enabled: false },
  { id: "kol-influencer", name: "KOL / Influencer", description: "Verified social presence", weight: 15, condition: "X followers ≥ 5,000", enabled: false },
  { id: "developer-builder", name: "Developer / Builder", description: "Contributes to ecosystem", weight: 25, condition: "GitHub commits verified", enabled: false },
  { id: "community-member", name: "Community Member", description: "Active in Discord / forums", weight: 10, condition: "Discord level ≥ 5", enabled: false },
];

export default function EvaluationCriteriaPage() {
  const { selector } = useWallet();
  const [internalCriteria, setInternalCriteria] = useState(DEFAULT_INTERNAL);
  const [externalCriteria] = useState(DEFAULT_EXTERNAL);

  // SaleConfig state
  const [tokenContract, setTokenContract] = useState("momentum.testnet");
  const [totalAllocation, setTotalAllocation] = useState("10000000");
  const [pricePerToken, setPricePerToken] = useState("0.001");
  const [subscriptionStart, setSubscriptionStart] = useState("");
  const [subscriptionEnd, setSubscriptionEnd] = useState("");
  const [liveEnd, setLiveEnd] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);

  async function handlePublish() {
    // Build natural_language from criteria
    const enabledInternal = internalCriteria.filter((c) => c.enabled);
    const enabledExternal = externalCriteria.filter((c) => c.enabled);
    const naturalLanguage = [
      ...(enabledInternal.length ? ["Internal Criteria:", ...enabledInternal.map((c) => `- ${c.name} (${c.weight}%): ${c.condition}`), ""] : []),
      ...(enabledExternal.length ? ["External Criteria:", ...enabledExternal.map((c) => `- ${c.name} (${c.weight}%): ${c.condition}`)] : []),
    ].join("\n");

    // Validate
    if (naturalLanguage.length < 20) return alert("Criteria too short");
    if (!subscriptionStart || !subscriptionEnd || !liveEnd) return alert("Fill all dates");
    const start = new Date(subscriptionStart).getTime();
    const end = new Date(subscriptionEnd).getTime();
    const live = new Date(liveEnd).getTime();
    if (start <= Date.now()) return alert("Subscription start must be in the future");
    if (end <= start + 3600000) return alert("Subscription end must be >1hr after start");
    if (live <= end) return alert("Live end must be after subscription end");

    if (!selector) return alert("Connect wallet first");

    setIsPublishing(true);
    try {
      const wallet = await selector.wallet("my-near-wallet");
      // Convert datetime-local to nanoseconds for NEAR
      const startNs = new Date(subscriptionStart).getTime() * 1_000_000;
      const endNs = new Date(subscriptionEnd).getTime() * 1_000_000;
      const liveNs = new Date(liveEnd).getTime() * 1_000_000;

      await registerPolicy(wallet, naturalLanguage, "bafybeibwzifw52ttrkqlikfzext5akxu7lz4xiwjgwzmqcpdzmp3n5mbdq", {
        token_contract: tokenContract,
        total_allocation: parseNearAmount(totalAllocation),
        price_per_token: parseNearAmount(pricePerToken),
        payment_token: "Near",
        subscription_start: startNs,
        subscription_end: endNs,
        live_end: liveNs,
      });
      alert("Policy registered successfully!");
    } catch (err) {
      alert(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsPublishing(false);
    }
  }

  function toggleCriterion(id: string) {
    setInternalCriteria((prev) =>
      prev.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)),
    );
  }

  return (
    <main className="flex-1 bg-gray-50">
      {/* Header */}
      <div className="mx-auto max-w-[1440px] px-[80px] pt-[56px] pb-[56px]">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Link href="/company" className="text-alpha-40 hover:text-alpha-60 transition-colors">Company</Link>
          <span className="text-alpha-40">›</span>
          <Link href="/company" className="text-alpha-40 hover:text-alpha-60 transition-colors">Momentum</Link>
          <span className="text-alpha-40">›</span>
          <span className="text-alpha-60">Evaluation Criteria</span>
        </div>
        <div className="mt-[32px]">
          <ProjectHero
            name="Momentum"
            ticker="MMT"
            phase="Subscribing"
            description="The leading concentrated liquidity DEX on Sui, delivering top APRs for liquidity providers. Powered by the ve(3,3) model."
            chains={["MMT", "SUI"]}
            socials={["X", "D", "T"]}
          />
        </div>
      </div>

      {/* Section Title: p=[80,16,80,28] */}
      <div className="mx-auto max-w-[1440px] px-[80px] pt-[16px] pb-[28px]">
        <h2 className="text-[24px] font-medium text-gray-1000">Create Evaluation Criteria</h2>
      </div>

      {/* Search + Sort: gap=12 */}
      <div className="mx-auto flex max-w-[1440px] gap-[12px] px-[80px] pb-[32px]">
        <div className="flex flex-1 items-center gap-[12px] rounded-xl bg-gray-200 px-[18px] py-[14px]">
          <span className="text-base text-alpha-40">⌕</span>
          <input
            type="text"
            placeholder="Search criteria templates, fields, or conditions…"
            className="flex-1 bg-transparent text-base text-gray-1000 placeholder:text-alpha-40 focus:outline-none"
          />
        </div>
        <button className="flex items-center gap-2 rounded-xl bg-gray-200 px-[18px] py-[14px] text-sm font-medium text-alpha-60">
          Sort: Weight <span className="text-alpha-40">↓</span>
        </button>
      </div>

      {/* Main: 2-column, gap=48 */}
      <div className="mx-auto flex max-w-[1440px] gap-[48px] px-[80px] pb-[56px]">
        {/* Internal Criteria */}
        <div className="flex-1">
          <div className="mb-[12px] flex items-center justify-between">
            <div className="flex items-center gap-[12px]">
              <h3 className="text-[20px] font-medium text-gray-1000">Internal Criteria</h3>
              <span className="rounded-pill bg-gray-300 px-2 py-[3px] text-[11px] font-medium text-alpha-60">
                {internalCriteria.length}
              </span>
            </div>
            <button className="flex items-center gap-2 rounded-pill bg-gray-200 px-[14px] py-[10px] text-sm font-medium text-alpha-60">
              <span className="text-base">+</span> Add Criteria
            </button>
          </div>

          {/* Column headers: 11px/500 */}
          <div className="mb-[12px] flex items-center gap-[12px] px-[20px] text-[11px] font-medium uppercase tracking-wider text-alpha-40">
            <span className="w-[200px]">Criteria</span>
            <span className="w-[110px]">Weight</span>
            <span className="flex-1">Condition</span>
            <span className="w-[56px] text-right">Status</span>
          </div>

          {/* Rows: r=14, p=20, gap=12 */}
          <div className="space-y-0">
            {internalCriteria.map((c) => (
              <div key={c.id} className={`flex items-center gap-[12px] rounded-[14px] px-[20px] py-[20px] ${c.enabled ? "bg-gray-200" : ""}`}>
                <div className="w-[200px]">
                  <p className={`text-base font-medium ${c.enabled ? "text-gray-1000" : "text-alpha-40"}`}>{c.name}</p>
                  <p className="mt-1 text-sm text-alpha-40">{c.description}</p>
                </div>
                <div className="flex w-[110px] items-center gap-[10px]">
                  <div className="h-1 w-[60px] rounded-pill bg-gray-300">
                    <div className={`h-full rounded-pill ${c.enabled ? "bg-alpha-60" : "bg-alpha-40"}`} style={{ width: `${c.weight}%` }} />
                  </div>
                  <span className={`text-sm font-medium ${c.enabled ? "text-gray-1000" : "text-alpha-40"}`}>{c.weight}%</span>
                </div>
                <p className={`flex-1 text-sm ${c.enabled ? "text-alpha-60" : "text-alpha-40"}`}>{c.condition}</p>
                <div className="w-[56px] flex justify-end">
                  <button onClick={() => toggleCriterion(c.id)} className={`relative h-[20px] w-[36px] rounded-pill transition-colors ${c.enabled ? "bg-alpha-60" : "bg-gray-300"}`}>
                    <div className={`absolute top-[3px] h-[14px] w-[14px] rounded-full transition-all ${c.enabled ? "left-[19px] bg-gray-0" : "left-[3px] bg-alpha-40"}`} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* External Criteria */}
        <div className="flex-1">
          <div className="mb-[12px] flex items-center gap-[12px]">
            <h3 className="text-[20px] font-medium text-gray-1000">External Criteria</h3>
            <span className="rounded-pill bg-gray-200 px-2 py-[3px] text-[11px] font-medium text-alpha-40">
              {externalCriteria.length}
            </span>
          </div>

          <div className="mb-[12px] flex items-center gap-[12px] px-[20px] text-[11px] font-medium uppercase tracking-wider text-alpha-40">
            <span className="w-[200px]">Criteria</span>
            <span className="w-[110px]">Weight</span>
            <span className="flex-1">Condition</span>
            <span className="w-[56px]" />
          </div>

          <div className="space-y-0">
            {externalCriteria.map((c) => (
              <div key={c.id} className="flex items-center gap-[12px] rounded-[14px] px-[20px] py-[20px]">
                <div className="w-[200px]">
                  <p className="text-base font-medium text-alpha-40">{c.name}</p>
                  <p className="mt-1 text-sm text-alpha-40">{c.description}</p>
                </div>
                <div className="flex w-[110px] items-center gap-[10px]">
                  <div className="h-1 w-[60px] rounded-pill bg-gray-300">
                    <div className="h-full rounded-pill bg-alpha-40" style={{ width: `${c.weight}%` }} />
                  </div>
                  <span className="text-sm font-medium text-alpha-40">{c.weight}%</span>
                </div>
                <p className="flex-1 text-sm text-alpha-40">{c.condition}</p>
                <div className="w-[56px] flex justify-end">
                  <button className="flex h-[28px] w-[28px] items-center justify-center rounded-full bg-gray-200 text-alpha-40 hover:text-alpha-60 transition-colors">
                    →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sale Configuration */}
      <div className="mx-auto max-w-[1440px] px-[80px] pb-[56px]">
        <h2 className="text-[24px] font-medium text-gray-1000">Sale Configuration</h2>
        <p className="mt-2 text-sm text-alpha-40">Define the token sale parameters for your IDO.</p>

        <div className="mt-lg grid grid-cols-3 gap-md">
          <SaleField label="Token Contract" value={tokenContract} onChange={setTokenContract} placeholder="token.testnet" />
          <SaleField label="Total Allocation" value={totalAllocation} onChange={setTotalAllocation} placeholder="10000000" suffix="tokens" />
          <SaleField label="Price per Token" value={pricePerToken} onChange={setPricePerToken} placeholder="0.001" suffix="NEAR" />
          <SaleField label="Subscription Start" value={subscriptionStart} onChange={setSubscriptionStart} type="datetime-local" />
          <SaleField label="Subscription End" value={subscriptionEnd} onChange={setSubscriptionEnd} type="datetime-local" />
          <SaleField label="Live End" value={liveEnd} onChange={setLiveEnd} type="datetime-local" />
        </div>
        <p className="mt-sm text-xs text-alpha-40">Payment token: <span className="text-gray-1000">NEAR</span> (MVP)</p>
      </div>

      {/* Actions: sticky */}
      <div className="sticky bottom-0 border-t border-alpha-12 bg-gray-50/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1440px] items-center justify-end gap-[12px] px-[80px] py-[24px] pb-[56px]">
          <button className="rounded-xl bg-gray-200 px-[28px] py-[16px] text-base font-medium text-alpha-60 transition-colors hover:bg-alpha-8">
            Save Draft
          </button>
          <button
            onClick={handlePublish}
            disabled={isPublishing}
            className="rounded-xl bg-neon-glow px-[28px] py-[16px] text-base font-medium text-gray-0 transition-colors hover:bg-neon-soft disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPublishing ? "Publishing..." : "Publish Criteria"}
          </button>
        </div>
      </div>
    </main>
  );
}

function SaleField({
  label, value, onChange, placeholder, type = "text", suffix,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; suffix?: string;
}) {
  return (
    <div>
      <label className="mb-xs block text-xs font-medium text-alpha-40">{label}</label>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-[10px] border border-alpha-12 bg-gray-150 px-md py-sm text-sm text-gray-1000 placeholder:text-alpha-20 focus:border-neon-glow/40 focus:outline-none"
        />
        {suffix && <span className="absolute right-md top-1/2 -translate-y-1/2 text-xs text-alpha-40">{suffix}</span>}
      </div>
    </div>
  );
}
