"use client";

import { useState } from "react";
import Link from "next/link";
import { useWallet } from "@/contexts/WalletContext";
import CompanyPolicyCard from "@/components/CompanyPolicyCard";
import { MOCK_POLICIES } from "@/lib/mock/policies";
import type { Phase } from "@/types";

const FILTERS: Array<{ label: string; phase: Phase | null }> = [
  { label: "All", phase: null },
  { label: "Upcoming", phase: "Upcoming" },
  { label: "Subscribing", phase: "Subscribing" },
  { label: "Live", phase: "Live" },
  { label: "Closed", phase: "Closed" },
];

export default function MyPoliciesPage() {
  const { isConnected, signIn } = useWallet();
  const [active, setActive] = useState("All");

  // Mock: use all policies as if they belong to the connected foundation
  const policies = MOCK_POLICIES;
  const targetPhase = FILTERS.find((f) => f.label === active)?.phase ?? null;
  const filtered = targetPhase === null ? policies : policies.filter((p) => p.status === targetPhase);

  if (!isConnected) {
    return (
      <main className="flex-1">
        <div className="mx-auto max-w-[1200px] px-lg py-3xl text-center">
          <h1 className="text-2xl font-semibold text-gray-1000">My Policies</h1>
          <p className="mt-md text-sm text-alpha-40">Connect your NEAR wallet to view your policies.</p>
          <button
            onClick={signIn}
            className="mt-lg rounded-[10px] bg-neon-glow px-xl py-sm text-base font-medium text-gray-0"
          >
            Connect Wallet
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1">
      <div className="mx-auto max-w-[1200px] px-lg py-xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-1000">My Policies</h1>
          <Link
            href="/company/policies/new"
            className="rounded-[10px] bg-neon-glow px-md py-xs text-sm font-medium text-gray-0 transition-colors hover:bg-neon-soft"
          >
            + Register Policy
          </Link>
        </div>

        {/* Filters */}
        <div className="mt-lg flex w-fit items-center gap-1 rounded-pill border border-alpha-12 bg-[#1a1a1a] p-1">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              onClick={() => setActive(f.label)}
              className={`rounded-pill px-[18px] py-[9px] text-sm font-medium transition-colors ${
                f.label === active
                  ? "border border-[#ffffd6]/20 bg-[#070707] py-[10px] text-gray-1000"
                  : "text-alpha-40 hover:text-alpha-60"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Policy Grid */}
        <div className="mt-xl grid gap-lg md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <CompanyPolicyCard key={p.id} policy={p} />
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="py-3xl text-center">
            <p className="text-sm text-alpha-40">
              {active === "All"
                ? "No policies yet. Register your first policy to get started."
                : `No ${active} policies.`}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
