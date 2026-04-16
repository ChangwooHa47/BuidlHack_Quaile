"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import StatusBadge from "./StatusBadge";
import PersonaForm from "./PersonaForm";
import ContributeButton from "./ContributeButton";
import { useWallet } from "@/contexts/WalletContext";
import { useIdentity } from "@/contexts/IdentityContext";
import { getContribution, type OnChainContribution } from "@/lib/near/contracts";
import { claim, refund } from "@/lib/near/transactions";
import type { Phase } from "@/types";

interface SubscribingSidebarProps {
  name: string;
  ticker: string;
  status: Phase;
  policyId?: number;
  slug?: string;
}

type Flow = "identity" | "persona" | "contribute" | "waiting" | "claim" | "refund" | "done";

export default function SubscribingSidebar({ name, ticker, status, policyId, slug }: SubscribingSidebarProps) {
  const { selector, isConnected, accountId } = useWallet();
  const { evmWallets, githubConnected, isIdentityComplete } = useIdentity();
  const [flow, setFlow] = useState<Flow>("identity");
  const [contribution, setContribution] = useState<OnChainContribution | null>(null);
  const [txPending, setTxPending] = useState(false);

  useEffect(() => {
    if (!accountId || policyId === undefined) return;
    getContribution(accountId, policyId).then((c) => {
      setContribution(c);
      if (!c) {
        setFlow("identity");
      } else if (c.outcome === "NotSettled") {
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
    });
  }, [accountId, policyId]);

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
              className="flex w-full items-center justify-center rounded-lg border border-gray-500 py-2.5 text-sm font-medium text-gray-1000 hover:bg-alpha-8 transition-colors"
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
          {isSubscribing && policyId !== undefined && (
            <button
              disabled={!isIdentityComplete}
              onClick={() => setFlow("persona")}
              className="w-full rounded-lg bg-neon-glow py-2.5 text-sm font-medium text-gray-0 transition-colors enabled:hover:bg-neon-soft disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isIdentityComplete ? "Subscribe" : "Complete Identity First"}
            </button>
          )}
          {!isSubscribing && (
            <p className="text-center text-xs text-alpha-60">
              Identity setup opens during the Subscribing phase.
            </p>
          )}
        </div>
      )}

      {flow === "persona" && policyId !== undefined && (
        <PersonaForm
          policyId={policyId}
          onAttestationComplete={() => setFlow("contribute")}
        />
      )}

      {flow === "contribute" && policyId !== undefined && (
        <ContributeButton policyId={policyId} />
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
