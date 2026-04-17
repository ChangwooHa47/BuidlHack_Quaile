"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import Header from "@/components/Header";
import { useWallet } from "@/contexts/WalletContext";
import { useIdentity } from "@/contexts/IdentityContext";
import { connectEvmWallet, type WalletId } from "@/lib/evm/connect";
import { buildCanonicalMessage, generateNonce, nowNs, SUPPORTED_CHAINS } from "@/lib/evm/message";
import { getAllPolicies } from "@/lib/near/contracts";
import { submitPersona } from "@/lib/tee/attest";
import { slugOf } from "@/lib/slug";
import {
  isIneligible,
  markIneligible,
  saveAttestation,
} from "@/lib/attestation-store";

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum", 8453: "Base", 42161: "Arbitrum",
  10: "Optimism", 137: "Polygon", 56: "BSC",
};

const INJECTED_WALLETS: { id: WalletId; name: string; icon: string }[] = [
  { id: "metamask", name: "MetaMask", icon: "/wallets/metamask.svg" },
  { id: "rabby", name: "Rabby", icon: "/wallets/rabby.svg" },
  { id: "okx", name: "OKX Wallet", icon: "/wallets/okx.svg" },
  { id: "phantom", name: "Phantom", icon: "/wallets/phantom.svg" },
];

export default function IdentityPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug as string;
  const { accountId, isConnected } = useWallet();
  const {
    evmWallets, addEvmWallet, markEvmSigned, removeEvmWallet,
    selfIntro, setSelfIntro,
    githubConnected, githubToken, setGithubConnected, setGithubToken,
  } = useIdentity();

  const [connecting, setConnecting] = useState<WalletId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [policyId, setPolicyId] = useState<number>(0);
  const [policyStatus, setPolicyStatus] = useState<
    "Upcoming" | "Subscribing" | "Live" | "Closed" | null
  >(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAllPolicies().then((policies) => {
      const match = policies.find((p) => slugOf(p.name) === slug);
      if (cancelled || !match) return;
      setPolicyId(match.id);
      setPolicyStatus(match.status);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Check GitHub connection status via HttpOnly cookie
  useEffect(() => {
    fetch("/api/auth/github/token")
      .then((res) => res.json())
      .then((data) => {
        if (data.connected && data.token) {
          setGithubToken(data.token);
          setGithubConnected(true);
        }
      })
      .catch(() => {});
  }, [setGithubToken, setGithubConnected]);

  async function handleConnect(id: WalletId) {
    setConnecting(id);
    setError(null);
    try {
      const { address, chainId, sign } = await connectEvmWallet(id);

      if (!SUPPORTED_CHAINS[chainId]) {
        setError(`Chain ${chainId} not supported. Switch to Ethereum, Base, Arbitrum, Optimism, Polygon, or BSC.`);
        setConnecting(null);
        return;
      }

      const nonce = generateNonce();
      const ts = nowNs();
      const message = buildCanonicalMessage(policyId, nonce, ts, chainId, address);
      const signature = await sign(message);

      addEvmWallet(chainId, address);
      markEvmSigned(address, signature, message, ts.toString());
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (!msg.includes("rejected") && !msg.includes("denied")) {
        setError(msg || "Failed to connect");
      }
    } finally {
      setConnecting(null);
    }
  }

  const hasSignedWallet = evmWallets.some((w) => w.signed);
  const hasIntro = selfIntro.trim().length > 0;
  const isSubscribing = policyStatus === "Subscribing";
  const alreadyIneligible = isIneligible(policyId);
  const canSubmit =
    isSubscribing &&
    hasSignedWallet &&
    hasIntro &&
    !!accountId &&
    !submitting &&
    !alreadyIneligible;
  // Ineligible verdict we just received in this submit. Locks the form.
  const [localIneligible, setLocalIneligible] = useState(false);

  async function handleSubmit() {
    if (!canSubmit || !accountId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const signedEvm = evmWallets
        .filter((w) => w.signed && w.signature && w.message && w.timestamp)
        .map((w) => ({
          chain_id: w.chainId,
          address: w.address,
          signature: w.signature!,
          message: w.message!,
          timestamp: w.timestamp!,
        }));
      const nonce = generateNonce();
      const response = await submitPersona({
        near_account: accountId,
        policy_id: policyId,
        wallets: { near: [], evm: signedEvm },
        self_intro: selfIntro,
        github_oauth_token: githubToken,
        nonce,
        client_timestamp: nowNs().toString(),
      });
      const verdict = response.bundle.payload.verdict;
      if (verdict === "Eligible") {
        saveAttestation(policyId, response);
        router.push(`/projects/${slug}`);
      } else {
        // INVESTOR_FLOW §10-2: one shot per policy. Never auto-redirect —
        // the user should see the verdict in place.
        markIneligible(policyId);
        setLocalIneligible(true);
      }
    } catch (err) {
      // TEE / network failure — no storage side-effects, user can retry.
      setSubmitError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  const showIneligibleNotice = alreadyIneligible || localIneligible;

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

          <div className="mt-md rounded-2xl border border-neon-glow/20 bg-neon-glow/5 px-xl py-md">
            <p className="text-sm text-neon-glow font-medium">Privacy Guarantee</p>
            <p className="mt-xs text-xs text-gray-600">
              Your wallet addresses, self-introduction, and GitHub data are sent to a Trusted Execution Environment (TEE) for private evaluation. The project foundation only receives a pass/fail result — never your raw data.
            </p>
          </div>

          <div className="mt-lg flex items-center gap-md text-xs">
            <span className="text-neon-glow">✓ NEAR</span>
            <span className={hasSignedWallet ? "text-neon-glow" : "text-gray-500"}>
              {hasSignedWallet ? "✓" : "○"} Wallet
            </span>
            <span className={hasIntro ? "text-neon-glow" : "text-gray-500"}>
              {hasIntro ? "✓" : "○"} Introduction
            </span>
            <span className={githubConnected ? "text-neon-glow" : "text-gray-500"}>
              {githubConnected ? "✓" : "○"} GitHub
            </span>
          </div>

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

            {/* Connect Wallets */}
            <section className="rounded-2xl border border-border bg-surface p-xl">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-medium text-gray-1000">Connect Wallets</h2>
                {evmWallets.length > 0 && (
                  <span className="text-xs text-gray-500">{evmWallets.filter((w) => w.signed).length} verified</span>
                )}
              </div>
              <p className="mt-xs text-xs text-gray-500">
                Connect wallets to prove your on-chain history. More wallets = better evaluation.
              </p>

              {/* Connected list */}
              {evmWallets.length > 0 && (
                <div className="mt-md space-y-xs">
                  {evmWallets.map((w) => (
                    <div key={w.address} className="flex items-center justify-between rounded-xl border border-border bg-background px-lg py-md">
                      <div>
                        <p className="text-sm text-gray-1000">{w.address.slice(0, 6)}...{w.address.slice(-4)}</p>
                        {w.signed && <p className="text-xs text-neon-glow">Verified ✓</p>}
                      </div>
                      <button onClick={() => removeEvmWallet(w.address)} className="rounded-lg border border-border px-sm py-1 text-xs text-gray-600 hover:bg-status-refund/10 hover:text-status-refund hover:border-status-refund/30 transition-colors">
                        Remove
                      </button>
                    </div>
                  ))}
                  <div className="h-px bg-border" />
                </div>
              )}
              <div className="mt-md grid grid-cols-2 gap-sm">
                {INJECTED_WALLETS.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => handleConnect(w.id)}
                    disabled={connecting !== null}
                    className="flex items-center gap-sm rounded-xl border border-border bg-background px-md py-md transition-colors hover:bg-alpha-8 disabled:opacity-40"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-alpha-8 text-[10px] font-medium text-gray-600">{w.name.charAt(0)}</span>
                    <span className="text-sm font-medium text-gray-1000">
                      {connecting === w.id ? "Connecting..." : w.name}
                    </span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => handleConnect("walletconnect")}
                disabled={connecting !== null}
                className="mt-sm flex w-full items-center justify-center gap-sm rounded-xl border border-border bg-background px-md py-md transition-colors hover:bg-alpha-8 disabled:opacity-40"
              >
                <Image src="/wallets/walletconnect.svg" alt="WalletConnect" width={24} height={24} className="rounded-md" />
                <span className="text-sm font-medium text-gray-1000">
                  {connecting === "walletconnect" ? "Connecting..." : "WalletConnect"}
                </span>
              </button>
              {error && <p className="mt-md rounded-xl bg-status-refund/10 px-lg py-md text-sm text-status-refund">{error}</p>}
            </section>

            {/* Self Introduction */}
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

            {/* GitHub */}
            <section className="rounded-2xl border border-border bg-surface p-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-medium text-gray-1000">GitHub <span className="font-normal text-gray-500">(optional)</span></h2>
                  <p className="mt-xs text-xs text-gray-500">Include open-source contributions in your evaluation.</p>
                </div>
                {githubConnected ? (
                  <span className="text-xs text-neon-glow">Connected ✓</span>
                ) : (
                  <a
                    href={`/api/auth/github?return=/projects/${slug}/identity`}
                    className="rounded-xl border border-border px-lg py-sm text-sm font-medium text-gray-700 hover:bg-alpha-8 transition-colors"
                  >
                    Connect
                  </a>
                )}
              </div>
            </section>

            {/* Submit */}
            {!isSubscribing && policyStatus && (
              <p className="text-center text-xs text-alpha-60">
                Submissions open during the Subscribing phase. Current phase: {policyStatus}.
              </p>
            )}
            {showIneligibleNotice && (
              <div className="rounded-xl border border-status-refund/30 bg-status-refund/5 px-lg py-md text-sm text-status-refund">
                Review declined — your persona did not meet this policy&apos;s criteria. Re-submission is not available.
                <Link href={`/projects/${slug}`} className="ml-xs underline hover:text-status-refund/80">
                  Return to project
                </Link>
              </div>
            )}
            {submitError && !showIneligibleNotice && (
              <p className="rounded-xl bg-status-refund/10 px-lg py-md text-sm text-status-refund">{submitError}</p>
            )}
            {!showIneligibleNotice && (
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="w-full rounded-xl bg-neon-glow py-md text-sm font-medium text-gray-0 transition-colors hover:bg-neon-soft disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-neon-glow"
              >
                {submitting ? "Submitting..." : "Submit for Review"}
              </button>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
