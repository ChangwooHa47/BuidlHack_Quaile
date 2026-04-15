"use client";

import { useState } from "react";
import { useWallet } from "@/contexts/WalletContext";
import { useIdentity } from "@/contexts/IdentityContext";
import { connectEvmWallet, signEvmMessage, type WalletType } from "@/lib/evm/connect";
import { buildCanonicalMessage, generateNonce, nowNs, SUPPORTED_CHAINS } from "@/lib/evm/message";

interface IdentityModalProps {
  policyId: number;
  onClose: () => void;
}

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum", 8453: "Base", 42161: "Arbitrum",
  10: "Optimism", 137: "Polygon", 56: "BSC",
};

const WALLET_OPTIONS: { type: WalletType; name: string; icon: string; desc: string }[] = [
  { type: "metamask", name: "MetaMask", icon: "🦊", desc: "Browser extension" },
  { type: "walletconnect", name: "WalletConnect", icon: "🔗", desc: "QR code / mobile" },
  { type: "coinbase", name: "Coinbase Wallet", icon: "🔵", desc: "Coinbase app or extension" },
];

export default function IdentityModal({ policyId, onClose }: IdentityModalProps) {
  const { accountId, isConnected } = useWallet();
  const {
    evmWallets, addEvmWallet, markEvmSigned, removeEvmWallet,
    selfIntro, setSelfIntro,
    githubConnected, setGithubConnected,
    isIdentityComplete,
  } = useIdentity();

  const [connecting, setConnecting] = useState<WalletType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showWalletPicker, setShowWalletPicker] = useState(evmWallets.length === 0);

  async function handleConnect(type: WalletType) {
    setConnecting(type);
    setError(null);
    try {
      const { address, chainId } = await connectEvmWallet(type);

      if (!SUPPORTED_CHAINS[chainId]) {
        setError(`Chain ${chainId} not supported. Use Ethereum, Base, Arbitrum, Optimism, Polygon, or BSC.`);
        setConnecting(null);
        return;
      }

      addEvmWallet(chainId, address);

      const nonce = generateNonce();
      const ts = nowNs();
      const message = buildCanonicalMessage(policyId, nonce, ts, chainId, address);
      const signature = await signEvmMessage(message);
      markEvmSigned(address, signature, message);
      setShowWalletPicker(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (!msg.includes("rejected") && !msg.includes("denied")) {
        setError(msg || "Failed to connect");
      }
    } finally {
      setConnecting(null);
    }
  }

  if (!isConnected) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-0/60 backdrop-blur-sm" onClick={onClose}>
        <div className="w-full max-w-[560px] rounded-2xl border border-border bg-surface p-xl" onClick={(e) => e.stopPropagation()}>
          <h2 className="text-lg font-medium text-gray-1000">Connect Wallet First</h2>
          <p className="mt-sm text-sm text-gray-600">Connect your NEAR wallet using the header button.</p>
          <button onClick={onClose} className="mt-lg w-full rounded-lg border border-gray-500 py-2.5 text-sm font-medium text-gray-1000 hover:bg-alpha-8 transition-colors">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-0/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-[640px] rounded-2xl border border-border bg-surface max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="border-b border-border px-xl pt-xl pb-lg">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-medium text-gray-1000">Your Identity</h2>
              <p className="mt-xs text-sm text-gray-600">Connect wallets and provide information for eligibility evaluation.</p>
            </div>
            <button onClick={onClose} className="text-xl text-gray-500 hover:text-gray-1000 transition-colors">&times;</button>
          </div>
        </div>

        <div className="px-xl py-lg space-y-xl">

          {/* ── NEAR Wallet ── */}
          <section>
            <div className="flex items-center justify-between mb-sm">
              <h3 className="text-sm font-medium text-gray-1000">NEAR Wallet</h3>
              <span className="flex items-center gap-1.5 text-xs text-neon-glow">
                <span className="h-1.5 w-1.5 rounded-full bg-neon-glow" />
                Connected
              </span>
            </div>
            <div className="rounded-xl border border-border bg-background px-lg py-md">
              <p className="text-sm text-gray-1000">{accountId}</p>
              <p className="mt-2xs text-xs text-gray-500">Ownership signature will be collected when you subscribe.</p>
            </div>
          </section>

          {/* ── EVM Wallets ── */}
          <section>
            <div className="flex items-center justify-between mb-sm">
              <h3 className="text-sm font-medium text-gray-1000">EVM Wallets</h3>
              <span className="text-xs text-gray-500">{evmWallets.filter((w) => w.signed).length} verified</span>
            </div>

            {/* Connected wallets list */}
            {evmWallets.length > 0 && (
              <div className="space-y-xs mb-md">
                {evmWallets.map((w) => (
                  <div key={w.address} className="flex items-center justify-between rounded-xl border border-border bg-background px-lg py-md">
                    <div className="flex items-center gap-md">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-alpha-8 text-sm">
                        🦊
                      </div>
                      <div>
                        <p className="text-sm text-gray-1000">
                          {w.address.slice(0, 6)}...{w.address.slice(-4)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {CHAIN_NAMES[w.chainId] || `Chain ${w.chainId}`}
                          {w.signed && <span className="ml-sm text-neon-glow">Signed ✓</span>}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => removeEvmWallet(w.address)}
                      className="rounded-lg p-1.5 text-gray-500 hover:bg-alpha-8 hover:text-status-refund transition-colors"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Wallet picker */}
            {showWalletPicker ? (
              <div className="rounded-xl border border-border bg-background p-md">
                <p className="mb-md text-xs text-gray-500">Choose a wallet to connect</p>
                <div className="space-y-xs">
                  {WALLET_OPTIONS.map((opt) => (
                    <button
                      key={opt.type}
                      onClick={() => handleConnect(opt.type)}
                      disabled={connecting !== null}
                      className="flex w-full items-center gap-md rounded-xl border border-border px-lg py-md text-left transition-colors hover:bg-alpha-8 disabled:opacity-40"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-alpha-8 text-xl">
                        {opt.icon}
                      </span>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-1000">{opt.name}</p>
                        <p className="text-xs text-gray-500">{opt.desc}</p>
                      </div>
                      {connecting === opt.type && (
                        <span className="text-xs text-neon-glow animate-pulse">Connecting...</span>
                      )}
                    </button>
                  ))}
                </div>
                {evmWallets.length > 0 && (
                  <button onClick={() => setShowWalletPicker(false)} className="mt-md w-full text-center text-xs text-gray-500 hover:text-gray-700 transition-colors">
                    Cancel
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={() => setShowWalletPicker(true)}
                className="w-full rounded-xl border border-dashed border-gray-500 py-md text-sm text-gray-600 hover:bg-alpha-8 transition-colors"
              >
                + Add another wallet
              </button>
            )}
          </section>

          {/* ── Self Introduction ── */}
          <section>
            <div className="flex items-center justify-between mb-sm">
              <h3 className="text-sm font-medium text-gray-1000">Self Introduction</h3>
              <span className="text-xs text-gray-500">{selfIntro.length}/2000</span>
            </div>
            <textarea
              value={selfIntro}
              onChange={(e) => setSelfIntro(e.target.value.slice(0, 2000))}
              placeholder="Describe your on-chain experience, investment history, and ecosystem contributions..."
              rows={5}
              className="w-full rounded-xl border border-border bg-background px-lg py-md text-sm text-gray-1000 placeholder:text-gray-500 focus:border-neon-glow focus:outline-none resize-none"
            />
            <p className="mt-2xs text-xs text-gray-500">This will be sent to TEE for evaluation. Never shared with the project foundation.</p>
          </section>

          {/* ── GitHub ── */}
          <section>
            <div className="flex items-center justify-between mb-sm">
              <h3 className="text-sm font-medium text-gray-1000">GitHub <span className="font-normal text-gray-500">(optional)</span></h3>
              {githubConnected && <span className="text-xs text-neon-glow">Connected</span>}
            </div>
            <button
              onClick={() => setGithubConnected(!githubConnected)}
              className={`w-full rounded-xl border px-lg py-md text-sm font-medium transition-colors ${
                githubConnected
                  ? "border-neon-glow/30 bg-neon-glow/5 text-neon-glow"
                  : "border-border bg-background text-gray-700 hover:bg-alpha-8"
              }`}
            >
              {githubConnected ? "GitHub Connected ✓" : "Connect GitHub"}
            </button>
          </section>

          {/* Error */}
          {error && (
            <p className="rounded-xl bg-status-refund/10 px-lg py-md text-sm text-status-refund">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-xl py-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-md text-xs">
              <span className={evmWallets.some((w) => w.signed) ? "text-neon-glow" : "text-gray-500"}>
                {evmWallets.some((w) => w.signed) ? "✓" : "○"} EVM Wallet
              </span>
              <span className={selfIntro.trim() ? "text-neon-glow" : "text-gray-500"}>
                {selfIntro.trim() ? "✓" : "○"} Self Intro
              </span>
              <span className={githubConnected ? "text-neon-glow" : "text-gray-500"}>
                {githubConnected ? "✓" : "○"} GitHub
              </span>
            </div>
            <button
              onClick={onClose}
              className="rounded-xl bg-neon-glow px-xl py-sm text-sm font-medium text-gray-0 transition-colors hover:bg-neon-soft"
            >
              {isIdentityComplete ? "Save & Close" : "Close"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
