"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { useWallet } from "@/contexts/WalletContext";
import { getAllPolicies, type OnChainPolicy } from "@/lib/near/contracts";
import { slugOf } from "@/lib/slug";

export default function AdminPage() {
  const { accountId, isConnected } = useWallet();
  const [policies, setPolicies] = useState<OnChainPolicy[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAllPolicies()
      .then((all) => {
        if (accountId) {
          setPolicies(all.filter((p) => p.foundation === accountId));
        } else {
          setPolicies(all);
        }
      })
      .catch(() => setPolicies([]))
      .finally(() => setLoading(false));
  }, [accountId]);

  return (
    <main className="flex-1 bg-gray-50">
      <div className="mx-auto max-w-[1440px] px-[80px] py-[56px]">
        <h1 className="text-[28px] font-medium text-gray-1000">Your Projects</h1>

        {!isConnected && (
          <p className="mt-lg text-sm text-alpha-40">Connect your wallet to view your projects.</p>
        )}

        {loading ? (
          <div className="mt-lg space-y-md">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-[14px] bg-gray-200" />
            ))}
          </div>
        ) : policies.length === 0 ? (
          <p className="mt-lg text-sm text-alpha-40">
            {isConnected ? "No projects found for this account." : "Connect your wallet to continue."}
          </p>
        ) : (
          <div className="mt-lg space-y-md">
            {policies.map((p) => (
              <Link
                key={p.id}
                href={`/admin/${slugOf(p.name)}`}
                className="flex items-center justify-between rounded-[14px] border border-alpha-12 bg-gray-200 p-lg transition-colors hover:border-alpha-20"
              >
                <div className="flex items-center gap-md">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-alpha-12 bg-gray-150 text-lg font-medium text-alpha-60">
                    {p.ticker.charAt(0)}
                  </div>
                  <div>
                    <p className="text-base font-medium text-gray-1000">{p.name}</p>
                    <p className="text-xs text-alpha-40">{p.ticker} · {p.chain}</p>
                  </div>
                </div>
                <StatusBadge phase={p.status} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
