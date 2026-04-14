"use client";

import StatusBadge from "./StatusBadge";
import { useWallet } from "@/contexts/WalletContext";
import { useIdentity } from "@/contexts/IdentityContext";
import type { Phase } from "@/types";

interface SubscribingSidebarProps {
  name: string;
  ticker: string;
  status: Phase;
}

export default function SubscribingSidebar({ name, ticker, status }: SubscribingSidebarProps) {
  const { isConnected } = useWallet();
  const { nearAccountId, evmWallets, githubConnected } = useIdentity();

  return (
    <div className="sticky top-20 rounded-xl border border-border bg-surface p-lg">
      <div className="mb-lg flex items-center gap-sm">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-300 text-xs font-semibold text-gray-900">
          {ticker.charAt(0)}
        </div>
        <span className="text-sm font-medium text-gray-1000">{name}</span>
        <StatusBadge phase={status} />
      </div>

      <div className="mb-lg">
        <p className="mb-sm text-xs font-medium uppercase tracking-wider text-gray-600">
          Your Identity
        </p>
        <div className="space-y-xs">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">GitHub</span>
            <span className={`flex items-center gap-1 text-sm ${githubConnected ? "text-neon-glow" : "text-gray-600"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${githubConnected ? "bg-neon-glow" : "bg-gray-600"}`} />
              {githubConnected ? "Sealed" : "Not Connected"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Wallet</span>
            <span className={`flex items-center gap-1 text-sm ${isConnected ? "text-neon-glow" : "text-gray-600"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-neon-glow" : "bg-gray-600"}`} />
              {isConnected ? "Sealed" : "Not Connected"}
            </span>
          </div>
          {evmWallets.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">EVM Wallets</span>
              <span className="text-sm text-neon-glow">
                {evmWallets.filter((w) => w.signed).length}/{evmWallets.length} Signed
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-xs">
        <button className="w-full rounded-lg border border-gray-500 py-2.5 text-sm font-medium text-gray-1000 hover:bg-alpha-8 transition-colors">
          Edit Identity
        </button>
        <button
          disabled={!isConnected}
          className="w-full rounded-lg bg-neon-glow py-2.5 text-sm font-medium text-gray-0 transition-colors enabled:hover:bg-neon-soft disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Subscribe
        </button>
      </div>
    </div>
  );
}
