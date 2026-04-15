"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import { useWallet } from "@/contexts/WalletContext";
import { useIdentity } from "@/contexts/IdentityContext";
import { connectEvmWallet, type WalletMethod } from "@/lib/evm/connect";
import { buildCanonicalMessage, generateNonce, nowNs, SUPPORTED_CHAINS } from "@/lib/evm/message";
import { getAllPolicies } from "@/lib/near/contracts";

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum", 8453: "Base", 42161: "Arbitrum",
  10: "Optimism", 137: "Polygon", 56: "BSC",
};

export default function IdentityPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug as string;
  const { accountId, isConnected } = useWallet();
  const {
    evmWallets, addEvmWallet, markEvmSigned, removeEvmWallet,
    selfIntro, setSelfIntro,
    githubConnected, setGithubConnected,
    isIdentityComplete,
  } = useIdentity();

  const [connecting, setConnecting] = useState<WalletMethod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [policyId, setPolicyId] = useState<number>(0);

  useEffect(() => {
    getAllPolicies().then((policies) => {
      const match = policies.find(
        (p) => p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "") === slug,
      );
      if (match) setPolicyId(match.id);
    }).catch(() => {});
  }, [slug]);

  async function handleAddWallet(method: WalletMethod) {
    setConnecting(method);
    setError(null);
    try {
      const { address, chainId, sign } = await connectEvmWallet(method);

      if (!SUPPORTED_CHAINS[chainId]) {
        setError(`Chain ${chainId} not supported. Switch to Ethereum, Base, Arbitrum, Optimism, Polygon, or BSC.`);
        setConnecting(null);
        return;
      }

      // Sign ownership message
      const nonce = generateNonce();
      const ts = nowNs();
      const message = buildCanonicalMessage(policyId, nonce, ts, chainId, address);
      const signature = await sign(message);

      // Store
      addEvmWallet(chainId, address);
      markEvmSigned(address, signature, message);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (!msg.includes("rejected") && !msg.includes("denied")) {
        setError(msg || "Failed to connect");
      }
    } finally {
      setConnecting(null);
    }
  }

  function handleSave() {
    router.push(`/projects/${slug}`);
  }

  const hasSignedWallet = evmWallets.some((w) => w.signed);
  const hasIntro = selfIntro.trim().length > 0;

  if (!isConnected) {
    return (
      <>
        <Header />
        <main className="flex-1">
          <div className="mx-auto max-w-[720px] px-lg py-3xl text-center">
            <h1 className="text-2xl font-semibold text-gray-1000">Connect Your Wallet</h1>
            <p className="mt-md text-sm text-gray-600">Connect your NEAR wallet first using the button in the header.</p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="flex-1">
        <div className="mx-auto max-w-[720px] px-lg py-xl">

          <p className="mb-lg text-sm text-gray-600">
            <Link href={`/projects/${slug}`} className="hover:text-gray-800 transition-colors">
              &larr; Back to project
            </Link>
          </p>

          <h1 className="text-2xl font-semibold text-gray-1000">Build Your Persona</h1>

          {/* Privacy */}
          <div className="mt-md rounded-2xl border border-neon-glow/20 bg-neon-glow/5 px-xl py-md">
            <p className="text-sm text-neon-glow font-medium">Privacy Guarantee</p>
            <p className="mt-xs text-xs text-gray-600">
              Your wallet addresses, self-introduction, and GitHub data are sent to a Trusted Execution Environment (TEE) for private evaluation. The project foundation only receives a pass/fail result — never your raw data.
            </p>
          </div>

          {/* Progress */}
          <div className="mt-lg flex items-center gap-md text-xs">
            <span className="text-neon-glow">✓ NEAR</span>
            <span className={hasSignedWallet ? "text-neon-glow" : "text-gray-500"}>
              {hasSignedWallet ? "✓" : "○"} EVM Wallet
            </span>
            <span className={hasIntro ? "text-neon-glow" : "text-gray-500"}>
              {hasIntro ? "✓" : "○"} Introduction
            </span>
            <span className={githubConnected ? "text-neon-glow" : "text-gray-500"}>
              {githubConnected ? "✓" : "○"} GitHub
            </span>
          </div>

          <div className="mt-xl space-y-xl">

            {/* ── NEAR Wallet ── */}
            <section className="rounded-2xl border border-border bg-surface p-xl">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-medium text-gray-1000">NEAR Wallet</h2>
                <span className="flex items-center gap-1.5 text-xs text-neon-glow">
                  <span className="h-1.5 w-1.5 rounded-full bg-neon-glow" />
                  Connected
                </span>
              </div>
              <div className="mt-md rounded-xl border border-border bg-background px-lg py-md">
                <p className="text-sm text-gray-1000">{accountId}</p>
                <p className="mt-2xs text-xs text-gray-500">Ownership verified via wallet connection.</p>
              </div>
            </section>

            {/* ── EVM Wallets ── */}
            <section className="rounded-2xl border border-border bg-surface p-xl">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-medium text-gray-1000">EVM Wallets</h2>
                <span className="text-xs text-gray-500">{evmWallets.filter((w) => w.signed).length} verified</span>
              </div>
              <p className="mt-xs text-xs text-gray-500">
                Connect wallets to prove your on-chain history. More wallets = better evaluation.
              </p>

              {/* Connected wallets */}
              {evmWallets.length > 0 && (
                <div className="mt-md space-y-xs">
                  {evmWallets.map((w) => (
                    <div key={w.address} className="flex items-center justify-between rounded-xl border border-border bg-background px-lg py-md">
                      <div>
                        <p className="text-sm text-gray-1000">{w.address.slice(0, 6)}...{w.address.slice(-4)}</p>
                        <p className="text-xs text-gray-500">
                          {CHAIN_NAMES[w.chainId] || `Chain ${w.chainId}`}
                          {w.signed && <span className="ml-sm text-neon-glow">Signed ✓</span>}
                        </p>
                      </div>
                      <button onClick={() => removeEvmWallet(w.address)} className="rounded-lg p-2 text-gray-500 hover:bg-alpha-8 hover:text-status-refund transition-colors">
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Connect buttons */}
              <div className="mt-md flex gap-sm">
                <button
                  onClick={() => handleAddWallet("injected")}
                  disabled={connecting !== null}
                  className="flex-1 rounded-xl border border-border bg-background px-md py-md text-center transition-colors hover:bg-alpha-8 disabled:opacity-40"
                >
                  <p className="text-sm font-medium text-gray-1000">Browser Wallet</p>
                  <p className="mt-2xs text-[11px] text-gray-500">MetaMask, Rabby, etc.</p>
                  {connecting === "injected" && <p className="mt-xs text-[11px] text-neon-glow animate-pulse">Connecting...</p>}
                </button>
                <button
                  onClick={() => handleAddWallet("walletconnect")}
                  disabled={connecting !== null}
                  className="flex-1 rounded-xl border border-border bg-background px-md py-md text-center transition-colors hover:bg-alpha-8 disabled:opacity-40"
                >
                  <p className="text-sm font-medium text-gray-1000">WalletConnect</p>
                  <p className="mt-2xs text-[11px] text-gray-500">QR code / mobile</p>
                  {connecting === "walletconnect" && <p className="mt-xs text-[11px] text-neon-glow animate-pulse">Connecting...</p>}
                </button>
              </div>

              {error && <p className="mt-md rounded-xl bg-status-refund/10 px-lg py-md text-sm text-status-refund">{error}</p>}
            </section>

            {/* ── Self Introduction ── */}
            <section className="rounded-2xl border border-border bg-surface p-xl">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-medium text-gray-1000">Self Introduction</h2>
                <span className="text-xs text-gray-500">{selfIntro.length}/2000</span>
              </div>
              <p className="mt-xs text-xs text-gray-500">
                Tell us about your experience. Evaluated privately by AI inside a TEE.
              </p>
              <textarea
                value={selfIntro}
                onChange={(e) => setSelfIntro(e.target.value.slice(0, 2000))}
                placeholder="I've been active in DeFi since 2021, providing liquidity on Uniswap and Curve..."
                rows={6}
                className="mt-md w-full rounded-xl border border-border bg-background px-lg py-md text-sm text-gray-1000 placeholder:text-gray-500 focus:border-neon-glow focus:outline-none resize-none"
              />
            </section>

            {/* ── GitHub ── */}
            <section className="rounded-2xl border border-border bg-surface p-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-medium text-gray-1000">GitHub <span className="font-normal text-gray-500">(optional)</span></h2>
                  <p className="mt-xs text-xs text-gray-500">Include open-source contributions in your evaluation.</p>
                </div>
                <button
                  onClick={() => setGithubConnected(!githubConnected)}
                  className={`rounded-xl border px-lg py-sm text-sm font-medium transition-colors ${
                    githubConnected
                      ? "border-neon-glow/30 bg-neon-glow/5 text-neon-glow"
                      : "border-border text-gray-700 hover:bg-alpha-8"
                  }`}
                >
                  {githubConnected ? "Connected ✓" : "Connect"}
                </button>
              </div>
            </section>

            {/* ── Save ── */}
            <button
              onClick={handleSave}
              className="w-full rounded-xl bg-neon-glow py-md text-sm font-medium text-gray-0 transition-colors hover:bg-neon-soft"
            >
              Save
            </button>
          </div>
        </div>
      </main>
    </>
  );
}
