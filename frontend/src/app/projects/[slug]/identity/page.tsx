"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import { useWallet } from "@/contexts/WalletContext";
import { useIdentity } from "@/contexts/IdentityContext";
import { connectEvmWallet, signEvmMessage, type WalletType } from "@/lib/evm/connect";
import { buildCanonicalMessage, generateNonce, nowNs, SUPPORTED_CHAINS } from "@/lib/evm/message";

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum", 8453: "Base", 42161: "Arbitrum",
  10: "Optimism", 137: "Polygon", 56: "BSC",
};

const WALLET_OPTIONS: { type: WalletType; name: string; icon: string; desc: string }[] = [
  { type: "metamask", name: "MetaMask", icon: "🦊", desc: "Browser extension" },
  { type: "walletconnect", name: "WalletConnect", icon: "🔗", desc: "QR code / mobile" },
  { type: "coinbase", name: "Coinbase Wallet", icon: "🔵", desc: "Coinbase app or extension" },
];

type Step = "wallets" | "intro" | "review";

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

  const [step, setStep] = useState<Step>("wallets");
  const [connecting, setConnecting] = useState<WalletType | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Dummy policyId from slug — will be resolved properly when subscribing
  const policyIdMatch = slug?.match(/policy-(\d+)/);
  const policyId = policyIdMatch ? Number(policyIdMatch[1]) : 0;

  async function handleConnect(type: WalletType) {
    setConnecting(type);
    setError(null);
    try {
      const { address, chainId } = await connectEvmWallet(type);
      if (!SUPPORTED_CHAINS[chainId]) {
        setError(`Chain ${chainId} not supported. Switch to Ethereum, Base, Arbitrum, Optimism, Polygon, or BSC.`);
        setConnecting(null);
        return;
      }
      addEvmWallet(chainId, address);
      const nonce = generateNonce();
      const ts = nowNs();
      const message = buildCanonicalMessage(policyId, nonce, ts, chainId, address);
      const signature = await signEvmMessage(message);
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

          {/* Breadcrumb */}
          <p className="mb-lg text-sm text-gray-600">
            <Link href={`/projects/${slug}`} className="hover:text-gray-800 transition-colors">
              &larr; Back to project
            </Link>
          </p>

          {/* Title */}
          <h1 className="text-2xl font-semibold text-gray-1000">Build Your Persona</h1>
          <p className="mt-xs text-sm text-gray-600">
            Connect your wallets and tell us about yourself. This information is sent to a TEE for private evaluation — the project foundation never sees your raw data.
          </p>

          {/* Stepper */}
          <div className="mt-xl flex items-center gap-xs">
            {(["wallets", "intro", "review"] as const).map((s, i) => (
              <button
                key={s}
                onClick={() => setStep(s)}
                className={`flex items-center gap-xs rounded-lg px-md py-sm text-sm font-medium transition-colors ${
                  step === s ? "bg-neon-glow text-gray-0" : "text-gray-600 hover:bg-alpha-8"
                }`}
              >
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                  step === s ? "bg-gray-0/20 text-gray-0" : "bg-alpha-12 text-gray-600"
                }`}>
                  {i + 1}
                </span>
                {s === "wallets" ? "Wallets" : s === "intro" ? "Introduction" : "Review"}
              </button>
            ))}
          </div>

          {/* ── Step 1: Wallets ── */}
          {step === "wallets" && (
            <div className="mt-xl space-y-xl">

              {/* NEAR */}
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

              {/* EVM */}
              <section className="rounded-2xl border border-border bg-surface p-xl">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-medium text-gray-1000">EVM Wallets</h2>
                  <span className="text-xs text-gray-500">{evmWallets.filter((w) => w.signed).length} verified</span>
                </div>
                <p className="mt-xs text-xs text-gray-500">
                  Connect wallets from different chains to prove your on-chain history. More wallets = better evaluation.
                </p>

                {/* Connected list */}
                {evmWallets.length > 0 && (
                  <div className="mt-md space-y-xs">
                    {evmWallets.map((w) => (
                      <div key={w.address} className="flex items-center justify-between rounded-xl border border-border bg-background px-lg py-md">
                        <div className="flex items-center gap-md">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-alpha-8 text-lg">🦊</div>
                          <div>
                            <p className="text-sm text-gray-1000">{w.address.slice(0, 6)}...{w.address.slice(-4)}</p>
                            <p className="text-xs text-gray-500">
                              {CHAIN_NAMES[w.chainId] || `Chain ${w.chainId}`}
                              {w.signed && <span className="ml-sm text-neon-glow">Signed ✓</span>}
                            </p>
                          </div>
                        </div>
                        <button onClick={() => removeEvmWallet(w.address)} className="rounded-lg p-2 text-gray-500 hover:bg-alpha-8 hover:text-status-refund transition-colors">
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Wallet picker */}
                <div className="mt-md space-y-xs">
                  {WALLET_OPTIONS.map((opt) => (
                    <button
                      key={opt.type}
                      onClick={() => handleConnect(opt.type)}
                      disabled={connecting !== null}
                      className="flex w-full items-center gap-md rounded-xl border border-border bg-background px-lg py-md text-left transition-colors hover:bg-alpha-8 disabled:opacity-40"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-alpha-8 text-xl">{opt.icon}</span>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-1000">{opt.name}</p>
                        <p className="text-xs text-gray-500">{opt.desc}</p>
                      </div>
                      {connecting === opt.type && <span className="text-xs text-neon-glow animate-pulse">Connecting...</span>}
                    </button>
                  ))}
                </div>

                {error && <p className="mt-md rounded-xl bg-status-refund/10 px-lg py-md text-sm text-status-refund">{error}</p>}
              </section>

              {/* Next */}
              <button
                onClick={() => setStep("intro")}
                disabled={!evmWallets.some((w) => w.signed)}
                className="w-full rounded-xl bg-neon-glow py-md text-sm font-medium text-gray-0 transition-colors hover:bg-neon-soft disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {evmWallets.some((w) => w.signed) ? "Next: Introduction" : "Connect at least 1 EVM wallet to continue"}
              </button>
            </div>
          )}

          {/* ── Step 2: Introduction ── */}
          {step === "intro" && (
            <div className="mt-xl space-y-xl">
              <section className="rounded-2xl border border-border bg-surface p-xl">
                <h2 className="text-base font-medium text-gray-1000">Self Introduction</h2>
                <p className="mt-xs text-xs text-gray-500">
                  Tell us about your experience. This is evaluated privately by AI inside a TEE — the project foundation only sees a pass/fail result.
                </p>
                <textarea
                  value={selfIntro}
                  onChange={(e) => setSelfIntro(e.target.value.slice(0, 2000))}
                  placeholder="I've been active in DeFi since 2021, providing liquidity on Uniswap and Curve. I hold governance tokens for multiple DAOs and have participated in over 50 on-chain votes..."
                  rows={8}
                  className="mt-md w-full rounded-xl border border-border bg-background px-lg py-md text-sm text-gray-1000 placeholder:text-gray-500 focus:border-neon-glow focus:outline-none resize-none"
                />
                <div className="mt-xs flex items-center justify-between text-xs text-gray-500">
                  <span>Be specific about on-chain activities, holding periods, and governance participation.</span>
                  <span>{selfIntro.length}/2000</span>
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-surface p-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-medium text-gray-1000">GitHub <span className="font-normal text-gray-500">(optional)</span></h2>
                    <p className="mt-xs text-xs text-gray-500">Connect GitHub to include open-source contributions in your evaluation.</p>
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

              <div className="flex gap-md">
                <button onClick={() => setStep("wallets")} className="flex-1 rounded-xl border border-border py-md text-sm font-medium text-gray-700 hover:bg-alpha-8 transition-colors">
                  Back
                </button>
                <button
                  onClick={() => setStep("review")}
                  disabled={!selfIntro.trim()}
                  className="flex-1 rounded-xl bg-neon-glow py-md text-sm font-medium text-gray-0 transition-colors hover:bg-neon-soft disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next: Review
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Review ── */}
          {step === "review" && (
            <div className="mt-xl space-y-xl">
              <section className="rounded-2xl border border-border bg-surface p-xl">
                <h2 className="text-base font-medium text-gray-1000">Review Your Persona</h2>
                <p className="mt-xs text-xs text-gray-500">Confirm everything looks correct before saving.</p>

                <div className="mt-lg space-y-md">
                  {/* NEAR */}
                  <div className="flex items-center justify-between rounded-xl border border-border bg-background px-lg py-md">
                    <div>
                      <p className="text-xs text-gray-500">NEAR Wallet</p>
                      <p className="text-sm text-gray-1000">{accountId}</p>
                    </div>
                    <span className="text-xs text-neon-glow">✓</span>
                  </div>

                  {/* EVM */}
                  {evmWallets.map((w) => (
                    <div key={w.address} className="flex items-center justify-between rounded-xl border border-border bg-background px-lg py-md">
                      <div>
                        <p className="text-xs text-gray-500">{CHAIN_NAMES[w.chainId] || `Chain ${w.chainId}`}</p>
                        <p className="text-sm text-gray-1000">{w.address.slice(0, 6)}...{w.address.slice(-4)}</p>
                      </div>
                      <span className="text-xs text-neon-glow">{w.signed ? "Signed ✓" : "Pending"}</span>
                    </div>
                  ))}

                  {/* Intro preview */}
                  <div className="rounded-xl border border-border bg-background px-lg py-md">
                    <p className="text-xs text-gray-500">Self Introduction</p>
                    <p className="mt-xs text-sm text-gray-1000 line-clamp-3">{selfIntro}</p>
                  </div>

                  {/* GitHub */}
                  <div className="flex items-center justify-between rounded-xl border border-border bg-background px-lg py-md">
                    <p className="text-xs text-gray-500">GitHub</p>
                    <span className={`text-xs ${githubConnected ? "text-neon-glow" : "text-gray-500"}`}>
                      {githubConnected ? "Connected ✓" : "Not connected"}
                    </span>
                  </div>
                </div>
              </section>

              <div className="rounded-2xl border border-neon-glow/20 bg-neon-glow/5 px-xl py-md">
                <p className="text-sm text-neon-glow font-medium">Privacy Guarantee</p>
                <p className="mt-xs text-xs text-gray-600">
                  Your wallet addresses, self-introduction, and GitHub data are sent to a Trusted Execution Environment (TEE) for private evaluation. The project foundation only receives a pass/fail result — never your raw data.
                </p>
              </div>

              <div className="flex gap-md">
                <button onClick={() => setStep("intro")} className="flex-1 rounded-xl border border-border py-md text-sm font-medium text-gray-700 hover:bg-alpha-8 transition-colors">
                  Back
                </button>
                <button
                  onClick={handleSave}
                  className="flex-1 rounded-xl bg-neon-glow py-md text-sm font-medium text-gray-0 transition-colors hover:bg-neon-soft"
                >
                  Save & Return to Project
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
