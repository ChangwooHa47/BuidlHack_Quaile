"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import StatusBadge from "@/components/StatusBadge";
import { useWallet } from "@/contexts/WalletContext";
import { getPolicy, getPolicyInvestorCount, getPolicyPendingTotal, type OnChainPolicy } from "@/lib/near/contracts";
import { advanceStatus, settle, forceStatus } from "@/lib/near/transactions";

function formatNear(yocto: string): string {
  const near = Number(BigInt(yocto) / BigInt(10 ** 21)) / 1000;
  return near.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatDate(ns: number): string {
  return new Date(ns / 1_000_000).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function AdminProjectPage() {
  const params = useParams();
  const slug = params?.slug as string;
  const policyId = Number(slug?.replace("policy-", ""));
  const { selector } = useWallet();

  const [policy, setPolicy] = useState<OnChainPolicy | null>(null);
  const [subscribers, setSubscribers] = useState(0);
  const [pendingTotal, setPendingTotal] = useState("0");
  const [loading, setLoading] = useState(true);

  async function reload() {
    try {
      const [p, subs, pending] = await Promise.all([
        getPolicy(policyId),
        getPolicyInvestorCount(policyId),
        getPolicyPendingTotal(policyId),
      ]);
      setPolicy(p);
      setSubscribers(subs);
      setPendingTotal(pending);
    } catch { /* ignore */ }
    setLoading(false);
  }

  useEffect(() => { reload(); }, [policyId]);

  async function handleAdvance() {
    if (!selector) return;
    const wallet = await selector.wallet("my-near-wallet");
    await advanceStatus(wallet, policyId);
    reload();
  }

  async function handleSettle() {
    if (!selector) return;
    const wallet = await selector.wallet("my-near-wallet");
    await settle(wallet, policyId);
    reload();
  }

  async function handleForce(status: "Upcoming" | "Subscribing" | "Live" | "Closed") {
    if (!selector) return;
    const wallet = await selector.wallet("my-near-wallet");
    await forceStatus(wallet, policyId, status);
    reload();
  }

  if (loading) {
    return <main className="flex-1 bg-gray-50"><div className="mx-auto max-w-[1440px] px-[80px] py-[56px]"><div className="h-64 animate-pulse rounded-[14px] bg-gray-200" /></div></main>;
  }

  if (!policy) {
    return <main className="flex-1 bg-gray-50"><div className="mx-auto max-w-[1440px] px-[80px] py-[56px]"><p className="text-alpha-40">Policy not found.</p></div></main>;
  }

  const isUpcoming = policy.status === "Upcoming";
  const isSubscribing = policy.status === "Subscribing";
  const isLive = policy.status === "Live";
  const isClosed = policy.status === "Closed";
  const contributed = formatNear(pendingTotal);
  const target = formatNear(policy.sale_config.total_allocation);

  return (
    <main className="flex-1 bg-gray-50">
      <div className="mx-auto max-w-[1440px] px-[80px] py-[56px]">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm font-medium">
          <Link href="/admin" className="text-alpha-40 hover:text-alpha-60 transition-colors">Your Projects</Link>
          <span className="text-alpha-40">&rsaquo;</span>
          <span className="text-alpha-60">{policy.name}</span>
        </div>

        {/* Header */}
        <div className="mt-lg flex items-center justify-between">
          <div className="flex items-center gap-md">
            <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-alpha-12 bg-gray-150 text-xl font-medium text-alpha-60">
              {policy.ticker.charAt(0)}
            </div>
            <div>
              <h1 className="text-[28px] font-medium text-gray-1000">{policy.name}</h1>
              <p className="text-sm text-alpha-40">{policy.ticker} · {policy.chain} · Policy #{policy.id}</p>
            </div>
          </div>
          <StatusBadge phase={policy.status} />
        </div>

        <p className="mt-md text-sm text-alpha-60">{policy.description}</p>

        {/* Phase indicator bar */}
        <div className="mt-xl rounded-[14px] border border-alpha-12 bg-gray-200 p-lg">
          <div className="flex items-center gap-md">
            {(["Upcoming", "Subscribing", "Live", "Closed"] as const).map((phase) => (
              <div key={phase} className={`flex-1 rounded-lg px-md py-sm text-center text-sm font-medium transition-colors ${policy.status === phase ? "bg-neon-glow text-gray-0" : "text-alpha-40"}`}>
                {phase}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-xl flex gap-[48px]">
          {/* Left: Dashboard */}
          <div className="flex-1 space-y-lg">
            {/* KPIs */}
            <div className="grid grid-cols-3 gap-md">
              <KpiCard label="Subscribers" value={subscribers.toString()} />
              <KpiCard label="Total Contributed" value={`${contributed} NEAR`} highlight />
              <KpiCard label="Target" value={`${target} NEAR`} />
            </div>

            {/* Timeline */}
            <div className="rounded-[14px] border border-alpha-12 bg-gray-200 p-lg">
              <h3 className="text-base font-medium text-gray-1000">Timeline</h3>
              <div className="mt-md space-y-[10px]">
                <TimeRow label="Subscription Start" value={formatDate(policy.sale_config.subscription_start)} />
                <TimeRow label="Subscription End" value={formatDate(policy.sale_config.subscription_end)} />
                <TimeRow label="Live End" value={formatDate(policy.sale_config.live_end)} />
              </div>
            </div>

            {/* Eligibility Criteria */}
            <div className="rounded-[14px] border border-alpha-12 bg-gray-200 p-lg">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-medium text-gray-1000">Eligibility Criteria</h3>
                {isUpcoming && (
                  <Link
                    href={`/admin/policy-${policyId}/criteria`}
                    className="text-sm font-medium text-neon-glow hover:text-neon-soft transition-colors"
                  >
                    Edit
                  </Link>
                )}
              </div>
              <p className="mt-md whitespace-pre-line text-sm text-alpha-60">{policy.natural_language}</p>
              {!isUpcoming && (
                <p className="mt-sm text-xs text-alpha-40">Criteria locked — policy is {policy.status}.</p>
              )}
            </div>
          </div>

          {/* Right: Actions */}
          <aside className="w-[340px] shrink-0">
            <div className="sticky top-[88px] space-y-md">
              <div className="rounded-[14px] border border-alpha-12 bg-gray-200 p-lg space-y-[10px]">
                <h3 className="text-sm font-medium text-gray-1000">Actions</h3>

                {isUpcoming && (
                  <Link
                    href={`/admin/policy-${policyId}/criteria`}
                    className="flex h-[47px] w-full items-center justify-center rounded-[10px] bg-neon-glow text-base font-medium text-gray-0 transition-colors hover:bg-neon-soft"
                  >
                    Edit Criteria
                  </Link>
                )}

                {(isUpcoming || isSubscribing) && (
                  <button
                    onClick={handleAdvance}
                    className="flex h-[47px] w-full items-center justify-center rounded-[10px] border border-alpha-12 bg-gray-200 text-base font-medium text-alpha-60 transition-colors hover:bg-alpha-8"
                  >
                    Advance Status
                  </button>
                )}

                {isLive && (
                  <button
                    onClick={handleSettle}
                    className="flex h-[47px] w-full items-center justify-center rounded-[10px] bg-neon-glow text-base font-medium text-gray-0 transition-colors hover:bg-neon-soft"
                  >
                    Start Settlement
                  </button>
                )}

                {isClosed && (
                  <p className="text-sm text-alpha-40 text-center">Policy is closed. No actions available.</p>
                )}
              </div>

              {/* Force Status (testnet only) */}
              <div className="rounded-[14px] border border-alpha-12 bg-gray-200 p-lg">
                <h3 className="text-xs font-medium text-alpha-40 uppercase tracking-wider">Testnet: Force Status</h3>
                <div className="mt-sm grid grid-cols-2 gap-xs">
                  {(["Upcoming", "Subscribing", "Live", "Closed"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => handleForce(s)}
                      disabled={policy.status === s}
                      className="rounded-lg border border-alpha-12 py-1.5 text-xs font-medium text-alpha-60 transition-colors hover:bg-alpha-8 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function KpiCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-[14px] border border-alpha-12 bg-gray-200 p-[20px]">
      <p className="text-xs text-alpha-40">{label}</p>
      <p className={`mt-xs text-[28px] font-semibold ${highlight ? "text-neon-glow" : "text-gray-1000"}`}>{value}</p>
    </div>
  );
}

function TimeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-alpha-40">{label}</span>
      <span className="text-sm font-medium text-gray-1000">{value}</span>
    </div>
  );
}
