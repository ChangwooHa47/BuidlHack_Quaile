"use client";

import { useState } from "react";
import { useWallet } from "@/contexts/WalletContext";
import { useIdentity } from "@/contexts/IdentityContext";
import { connectEvmWallet, getEvmChainId, signEvmMessage } from "@/lib/evm/connect";
import { buildCanonicalMessage, generateNonce, nowNs, SUPPORTED_CHAINS } from "@/lib/evm/message";

interface IdentityModalProps {
  policyId: number;
  onClose: () => void;
}

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  8453: "Base",
  42161: "Arbitrum",
  10: "Optimism",
  137: "Polygon",
  56: "BSC",
};

export default function IdentityModal({ policyId, onClose }: IdentityModalProps) {
  const { accountId, isConnected } = useWallet();
  const {
    evmWallets,
    addEvmWallet,
    markEvmSigned,
    removeEvmWallet,
    selfIntro,
    setSelfIntro,
    githubConnected,
    setGithubConnected,
    isIdentityComplete,
  } = useIdentity();

  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnectEvm() {
    setConnecting(true);
    setError(null);
    try {
      const address = await connectEvmWallet();
      const chainId = await getEvmChainId();

      // Check if supported
      if (!SUPPORTED_CHAINS[chainId]) {
        setError(`Unsupported chain (ID: ${chainId}). Switch to Ethereum, Base, Arbitrum, Optimism, Polygon, or BSC.`);
        setConnecting(false);
        return;
      }

      addEvmWallet(chainId, address);

      // Sign ownership message
      const nonce = generateNonce();
      const ts = nowNs();
      const message = buildCanonicalMessage(policyId, nonce, ts, chainId, address);
      const signature = await signEvmMessage(message);
      markEvmSigned(address, signature, message);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (!msg.includes("rejected") && !msg.includes("denied")) {
        setError("Failed to connect wallet");
      }
    } finally {
      setConnecting(false);
    }
  }

  if (!isConnected) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-0/60 backdrop-blur-sm" onClick={onClose}>
        <div className="w-full max-w-[480px] rounded-2xl border border-border bg-surface p-xl" onClick={(e) => e.stopPropagation()}>
          <h2 className="text-lg font-medium text-gray-1000">Connect Wallet First</h2>
          <p className="mt-sm text-sm text-gray-600">Please connect your NEAR wallet using the button in the header.</p>
          <button onClick={onClose} className="mt-lg w-full rounded-lg border border-gray-500 py-2.5 text-sm font-medium text-gray-1000 hover:bg-alpha-8 transition-colors">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-0/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-[480px] rounded-2xl border border-border bg-surface p-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-medium text-gray-1000">Your Identity</h2>
        <p className="mt-xs text-sm text-gray-600">Complete your identity to subscribe to projects.</p>

        {/* NEAR Wallet — read only */}
        <div className="mt-xl">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-600">NEAR Wallet</p>
            <span className="flex items-center gap-1 text-xs text-neon-glow">
              <span className="h-1.5 w-1.5 rounded-full bg-neon-glow" />
              Connected
            </span>
          </div>
          <div className="mt-xs rounded-lg border border-border bg-background px-md py-sm">
            <span className="text-sm text-gray-1000">{accountId}</span>
          </div>
        </div>

        {/* EVM Wallets */}
        <div className="mt-xl">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-600">EVM Wallet</p>
            {evmWallets.some((w) => w.signed) && (
              <span className="text-xs text-neon-glow">Verified</span>
            )}
          </div>

          {evmWallets.length > 0 ? (
            <div className="mt-xs space-y-xs">
              {evmWallets.map((w) => (
                <div key={w.address} className="flex items-center justify-between rounded-lg border border-border bg-background px-md py-sm">
                  <div className="flex items-center gap-sm">
                    <span className="text-sm text-gray-1000">
                      {w.address.slice(0, 6)}...{w.address.slice(-4)}
                    </span>
                    <span className="rounded-md bg-alpha-8 px-2 py-0.5 text-[11px] text-gray-600">
                      {CHAIN_NAMES[w.chainId] || `Chain ${w.chainId}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-sm">
                    {w.signed && <span className="text-xs text-neon-glow">&#x2713;</span>}
                    <button
                      onClick={() => removeEvmWallet(w.address)}
                      className="text-sm text-gray-500 hover:text-status-refund transition-colors"
                    >
                      &times;
                    </button>
                  </div>
                </div>
              ))}
              <button
                onClick={handleConnectEvm}
                disabled={connecting}
                className="w-full rounded-lg border border-dashed border-gray-500 py-2 text-xs text-gray-600 hover:bg-alpha-8 transition-colors disabled:opacity-40"
              >
                {connecting ? "Connecting..." : "+ Add another wallet"}
              </button>
            </div>
          ) : (
            <button
              onClick={handleConnectEvm}
              disabled={connecting}
              className="mt-xs w-full rounded-lg border border-border bg-background px-md py-sm text-sm font-medium text-gray-1000 hover:bg-alpha-8 transition-colors disabled:opacity-40"
            >
              {connecting ? "Connecting..." : "Connect EVM Wallet"}
            </button>
          )}
        </div>

        {/* Self Introduction */}
        <div className="mt-xl">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-600">Self Introduction</p>
          <textarea
            value={selfIntro}
            onChange={(e) => setSelfIntro(e.target.value.slice(0, 2000))}
            placeholder="Describe your experience in the ecosystem..."
            rows={3}
            className="mt-xs w-full rounded-lg border border-border bg-background px-md py-sm text-sm text-gray-1000 placeholder:text-gray-500 focus:border-neon-glow focus:outline-none resize-none"
          />
          <p className="mt-2xs text-right text-xs text-gray-500">{selfIntro.length}/2000</p>
        </div>

        {/* GitHub */}
        <div className="mt-xl">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-600">GitHub <span className="normal-case text-gray-500">(optional)</span></p>
            {githubConnected && <span className="text-xs text-neon-glow">Connected</span>}
          </div>
          <button
            onClick={() => setGithubConnected(!githubConnected)}
            className={`mt-xs w-full rounded-lg border px-md py-sm text-sm font-medium transition-colors ${
              githubConnected
                ? "border-neon-glow/30 bg-neon-glow/5 text-neon-glow"
                : "border-border bg-background text-gray-700 hover:bg-alpha-8"
            }`}
          >
            {githubConnected ? "GitHub Connected ✓" : "Connect GitHub"}
          </button>
        </div>

        {error && (
          <p className="mt-md rounded-lg bg-status-refund/10 px-md py-sm text-sm text-status-refund">
            {error}
          </p>
        )}

        {/* Save */}
        <div className="mt-xl">
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-neon-glow py-2.5 text-sm font-medium text-gray-0 transition-colors hover:bg-neon-soft"
          >
            {isIdentityComplete ? "Save & Close" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
