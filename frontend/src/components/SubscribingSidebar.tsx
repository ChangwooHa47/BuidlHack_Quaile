"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import StatusBadge from "./StatusBadge";
import ContributeButton from "./ContributeButton";
import SubscribeButton from "./SubscribeButton";
import { useWallet } from "@/contexts/WalletContext";
import { useIdentity } from "@/contexts/IdentityContext";
import { getContribution, type OnChainContribution } from "@/lib/near/contracts";
import { claim, refund } from "@/lib/near/transactions";
import { isIneligible, loadAttestation } from "@/lib/attestation-store";
import type { Phase } from "@/types";

interface SubscribingSidebarProps {
  name: string;
  ticker: string;
  status: Phase;
  policyId?: number;
  slug?: string;
}

// See planning/INVESTOR_FLOW.md §3 for the full state-machine table.
type Flow =
  | "identity"    // no attestation, phase Subscribing → "Build Identity"
  | "rejected"    // Ineligible flag set
  | "subscribe"   // attestation ready, phase Subscribing → "Subscribe"
  | "subscribed"  // on-chain contribution w/ amount=0, phase still Subscribing
  | "contribute"  // phase Contributing, ready to deposit
  | "waiting"     // deposit made, waiting for settlement
  | "claim"
  | "refund"
  | "done";

export default function SubscribingSidebar({ name, ticker, status, policyId, slug }: SubscribingSidebarProps) {
  const { selector, isConnected, accountId } = useWallet();
  const { evmWallets, githubConnected } = useIdentity();
  const [flow, setFlow] = useState<Flow>("identity");
  const [contribution, setContribution] = useState<OnChainContribution | null>(null);
  const [txPending, setTxPending] = useState(false);

  useEffect(() => {
    if (!accountId || policyId === undefined) return;
    let cancelled = false;
    (async () => {
      const c = await getContribution(accountId, policyId);
      if (cancelled) return;
      setContribution(c);
      if (c) {
        // On-chain record exists. Two sub-cases:
        //  - amount == "0"  → subscribed only, waiting for Contributing phase
        //  - amount >  "0"  → already contributed, follow outcome path
        const amountIsZero = BigInt(c.amount) === 0n;
        if (amountIsZero) {
          // Subscribed, not yet funded. Flow depends on the current phase.
          setFlow(status === "Contributing" ? "contribute" : "subscribed");
          return;
        }
        if (c.outcome === "NotSettled") {
          setFlow("waiting");
        } else if (
          (c.outcome === "FullMatch" && !c.claim_done) ||
          (c.outcome === "PartialMatch" && !c.claim_done)
        ) {
          setFlow("claim");
        } else if (
          (c.outcome === "NoMatch" && !c.refund_done) ||
          (c.outcome === "PartialMatch" && !c.refund_done && c.claim_done)
        ) {
          setFlow("refund");
        } else {
          setFlow("done");
        }
        return;
      }
      // No on-chain record — consult localStorage (INVESTOR_FLOW §5).
      if (isIneligible(policyId)) {
        setFlow("rejected");
        return;
      }
      if (loadAttestation(policyId, accountId)) {
        setFlow("subscribe");
        return;
      }
      setFlow("identity");
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, policyId, status]);

  async function handleClaim() {
    if (!selector || policyId === undefined) return;
    setTxPending(true);
    try {
      const wallet = await selector.wallet("my-near-wallet");
      await claim(wallet, policyId);
      // PartialMatch: still need to refund after claiming
      if (contribution?.outcome === "PartialMatch") {
        setFlow("refund");
      } else {
        setFlow("done");
      }
    } catch { /* ignore */ }
    setTxPending(false);
  }

  async function handleRefund() {
    if (!selector || policyId === undefined) return;
    setTxPending(true);
    try {
      const wallet = await selector.wallet("my-near-wallet");
      await refund(wallet, policyId);
      setFlow("done");
    } catch { /* ignore */ }
    setTxPending(false);
  }

  const isSubscribing = status === "Subscribing";

  return (
    <div className="sticky top-20 rounded-xl border border-border bg-surface p-lg">
      <div className="mb-lg flex items-center gap-sm">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-300 text-xs font-semibold text-gray-900">
          {ticker.charAt(0)}
        </div>
        <span className="text-sm font-medium text-gray-1000">{name}</span>
        <StatusBadge phase={status} />
      </div>

      {/* Identity section */}
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

      {/* Flow-based CTA */}
      {flow === "identity" && (
        <div className="space-y-xs">
          {isSubscribing ? (
            <Link
              href={`/projects/${slug || "unknown"}/identity`}
              className="flex w-full items-center justify-center rounded-lg bg-neon-glow py-2.5 text-sm font-medium text-gray-0 hover:bg-neon-soft transition-colors"
            >
              Build Identity
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="w-full rounded-lg border border-alpha-12 py-2.5 text-sm font-medium text-alpha-40 cursor-not-allowed"
            >
              Build Identity
            </button>
          )}
          {!isSubscribing && (
            <p className="text-center text-xs text-alpha-60">
              Identity setup opens during the Subscribing phase.
            </p>
          )}
        </div>
      )}

      {flow === "rejected" && (
        <div className="rounded-lg border border-status-refund/30 bg-status-refund/5 px-md py-sm">
          <p className="text-sm font-medium text-status-refund">Review declined</p>
          <p className="mt-xs text-xs text-alpha-60">
            Your persona did not meet this policy&apos;s criteria. Re-submission is not available for this policy.
          </p>
        </div>
      )}

      {flow === "subscribe" && policyId !== undefined && status === "Subscribing" && (
        <SubscribeButton policyId={policyId} />
      )}

      {flow === "subscribe" && policyId !== undefined && status !== "Subscribing" && (
        <div className="space-y-xs">
          <button
            type="button"
            disabled
            className="w-full rounded-lg border border-alpha-12 py-2.5 text-sm font-medium text-alpha-40 cursor-not-allowed"
          >
            Subscribe
          </button>
          <p className="text-center text-xs text-alpha-60">
            The Subscribing window has closed for this policy.
          </p>
        </div>
      )}

      {flow === "subscribed" && (
        <div className="space-y-xs">
          <div className="rounded-lg border border-neon-glow/30 bg-neon-glow/5 px-md py-sm">
            <p className="text-sm font-medium text-neon-glow">Subscription sealed</p>
            <p className="mt-xs text-xs text-alpha-60">
              Your ZK-verified eligibility is on-chain. Contribute opens when the
              Contributing phase begins.
            </p>
          </div>
          <button
            type="button"
            disabled
            className="w-full rounded-lg border border-alpha-12 py-2.5 text-sm font-medium text-alpha-40 cursor-not-allowed"
          >
            Contribute
          </button>
        </div>
      )}

      {flow === "contribute" && policyId !== undefined && status === "Contributing" && (
        <ContributeButton policyId={policyId} />
      )}

      {flow === "contribute" && policyId !== undefined && status !== "Contributing" && (
        <div className="space-y-xs">
          <button
            type="button"
            disabled
            className="w-full rounded-lg border border-alpha-12 py-2.5 text-sm font-medium text-alpha-40 cursor-not-allowed"
          >
            Contribute
          </button>
          <p className="text-center text-xs text-alpha-60">
            The Contributing window has closed for this policy.
          </p>
        </div>
      )}

      {flow === "waiting" && (
        <div className="rounded-lg border border-alpha-12 bg-gray-200 px-md py-sm text-center">
          <p className="text-sm text-alpha-60">Waiting for Settlement</p>
          <p className="mt-xs text-xs text-alpha-40">Your contribution is recorded. Settlement will happen after the subscription window closes.</p>
        </div>
      )}

      {flow === "claim" && (
        <div className="space-y-xs">
          <p className="text-sm text-neon-glow text-center">
            {contribution?.outcome === "FullMatch" ? "Full Match" : "Partial Match"} — tokens available!
          </p>
          <button
            onClick={handleClaim}
            disabled={txPending}
            className="w-full rounded-lg bg-neon-glow py-2.5 text-sm font-medium text-gray-0 transition-colors enabled:hover:bg-neon-soft disabled:opacity-40"
          >
            {txPending ? "Claiming..." : "Claim Tokens"}
          </button>
          {contribution?.outcome === "PartialMatch" && !contribution.refund_done && (
            <button
              onClick={handleRefund}
              disabled={txPending}
              className="w-full rounded-lg border border-gray-500 py-2.5 text-sm font-medium text-gray-1000 hover:bg-alpha-8 transition-colors disabled:opacity-40"
            >
              {txPending ? "Refunding..." : "Refund Excess"}
            </button>
          )}
        </div>
      )}

      {flow === "refund" && (
        <div className="space-y-xs">
          <p className="text-sm text-status-refund text-center">No Match — refund available</p>
          <button
            onClick={handleRefund}
            disabled={txPending}
            className="w-full rounded-lg bg-status-refund py-2.5 text-sm font-medium text-gray-0 transition-colors disabled:opacity-40"
          >
            {txPending ? "Refunding..." : "Refund"}
          </button>
        </div>
      )}

      {flow === "done" && (
        <p className="text-sm text-neon-glow text-center">Done &#x2713;</p>
      )}

    </div>
  );
}
