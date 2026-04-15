"use client";

import { useState } from "react";
import { useWallet } from "@/contexts/WalletContext";
import { useIdentity } from "@/contexts/IdentityContext";
import { connectEvmWallet, signEvmMessage } from "@/lib/evm/connect";
import { buildCanonicalMessage, generateNonce, nowNs, SUPPORTED_CHAINS } from "@/lib/evm/message";

interface IdentityModalProps {
  policyId: number;
  onClose: () => void;
}

const CHAIN_OPTIONS = [
  { id: 1, name: "Ethereum" },
  { id: 8453, name: "Base" },
  { id: 42161, name: "Arbitrum" },
  { id: 10, name: "Optimism" },
  { id: 137, name: "Polygon" },
  { id: 56, name: "BSC" },
];

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

  async function handleConnectEvm(chainId: number) {
    setConnecting(true);
    setError(null);
    try {
      // Switch chain if needed
      if (window.ethereum) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: `0x${chainId.toString(16)}` }],
          });
        } catch {
          // Chain not added or user rejected — continue anyway
        }
      }

      const address = await connectEvmWallet();
      addEvmWallet(chainId, address);

      // Sign ownership message
      const nonce = generateNonce();
      const ts = nowNs();
      const message = buildCanonicalMessage(policyId, nonce, ts, chainId, address);
      const signature = await signEvmMessage(message);
      markEvmSigned(address, signature, message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setConnecting(false);
    }
  }

  if (!isConnected) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-0/60 backdrop-blur-sm">
        <div className="w-full max-w-[480px] rounded-2xl border border-border bg-surface p-xl">
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-0/60 backdrop-blur-sm">
      <div className="w-full max-w-[480px] rounded-2xl border border-border bg-surface p-xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-medium text-gray-1000">Your Identity</h2>

        {/* NEAR Wallet — read only */}
        <div className="mt-lg">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-600">NEAR Wallet</p>
          <div className="mt-xs flex items-center justify-between rounded-lg border border-border bg-background px-md py-sm">
            <span className="text-sm text-gray-1000">{accountId}</span>
            <span className="flex items-center gap-1 text-xs text-neon-glow">
              <span className="h-1.5 w-1.5 rounded-full bg-neon-glow" />
              Connected
            </span>
          </div>
        </div>

        {/* EVM Wallets */}
        <div className="mt-lg">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-600">EVM Wallets</p>

          {evmWallets.length > 0 && (
            <div className="mt-xs space-y-xs">
              {evmWallets.map((w) => (
                <div key={w.address} className="flex items-center justify-between rounded-lg border border-border bg-background px-md py-sm">
                  <div>
                    <span className="text-sm text-gray-1000">
                      {w.address.slice(0, 6)}...{w.address.slice(-4)}
                    </span>
                    <span className="ml-sm text-xs text-gray-600">
                      {CHAIN_OPTIONS.find((c) => c.id === w.chainId)?.name || `Chain ${w.chainId}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-sm">
                    {w.signed ? (
                      <span className="text-xs text-neon-glow">Signed &#x2713;</span>
                    ) : (
                      <span className="text-xs text-gray-600">Pending</span>
                    )}
                    <button
                      onClick={() => removeEvmWallet(w.address)}
                      className="text-xs text-gray-500 hover:text-status-refund transition-colors"
                    >
                      &times;
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-sm flex flex-wrap gap-xs">
            {CHAIN_OPTIONS.map((chain) => {
              const already = evmWallets.some((w) => w.chainId === chain.id);
              return (
                <button
                  key={chain.id}
                  onClick={() => handleConnectEvm(chain.id)}
                  disabled={connecting || already}
                  className="rounded-lg border border-border px-sm py-1.5 text-xs font-medium text-gray-700 hover:bg-alpha-8 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {already ? `${chain.name} ✓` : `+ ${chain.name}`}
                </button>
              );
            })}
          </div>
        </div>

        {/* Self Introduction */}
        <div className="mt-lg">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-600">Self Introduction</p>
          <textarea
            value={selfIntro}
            onChange={(e) => setSelfIntro(e.target.value.slice(0, 2000))}
            placeholder="Describe your experience in the ecosystem..."
            rows={4}
            className="mt-xs w-full rounded-lg border border-border bg-background px-md py-sm text-sm text-gray-1000 placeholder:text-gray-500 focus:border-neon-glow focus:outline-none"
          />
          <p className="mt-2xs text-right text-xs text-gray-500">{selfIntro.length}/2000</p>
        </div>

        {/* GitHub */}
        <div className="mt-lg">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-600">GitHub (optional)</p>
          <button
            onClick={() => setGithubConnected(!githubConnected)}
            className={`mt-xs rounded-lg border px-md py-sm text-sm font-medium transition-colors ${
              githubConnected
                ? "border-neon-glow/30 text-neon-glow"
                : "border-border text-gray-700 hover:bg-alpha-8"
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

        {/* Status summary */}
        <div className="mt-lg rounded-lg border border-border bg-background px-md py-sm">
          <p className="text-xs font-medium text-gray-600">Identity Status</p>
          <div className="mt-xs space-y-xs text-sm">
            <div className="flex justify-between">
              <span className="text-gray-700">NEAR Wallet</span>
              <span className="text-neon-glow">&#x2713;</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700">EVM Wallet (signed)</span>
              <span className={evmWallets.some((w) => w.signed) ? "text-neon-glow" : "text-gray-500"}>
                {evmWallets.some((w) => w.signed) ? "✓" : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700">Self Introduction</span>
              <span className={selfIntro.trim() ? "text-neon-glow" : "text-gray-500"}>
                {selfIntro.trim() ? "✓" : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700">GitHub</span>
              <span className={githubConnected ? "text-neon-glow" : "text-gray-500"}>
                {githubConnected ? "✓" : "optional"}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-lg space-y-xs">
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
