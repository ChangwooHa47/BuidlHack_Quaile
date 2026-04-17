"use client";

import { useState } from "react";
import { useWallet } from "@/contexts/WalletContext";
import { generateEligibilityProof } from "@/lib/zk/prove";
import { subscribe } from "@/lib/near/transactions";
import { clearAttestation, loadAttestation } from "@/lib/attestation-store";
import { toContractBundle } from "@/lib/tee/bundle";

interface SubscribeButtonProps {
  policyId: number;
  onSubscribed?: () => void;
}

type Step = "idle" | "proving" | "subscribing" | "done" | "error";

// Errors that indicate the stored attestation is no longer usable (expired,
// signature invalid, etc.). We wipe it so the sidebar falls back to the
// identity flow.
const VERIFIER_REJECT_PATTERNS = [
  "AttestationExpired",
  "InvalidSignature",
  "AttestationInvalid",
  "WrongSubject",
  "SubjectMismatch",
];

export default function SubscribeButton({ policyId, onSubscribed }: SubscribeButtonProps) {
  const { selector, isConnected, accountId } = useWallet();
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  async function handleSubscribe() {
    if (!selector || !isConnected) return;

    const attestation = loadAttestation(policyId, accountId);
    if (!attestation) {
      setError("No attestation found. Please rebuild your identity.");
      return;
    }

    setError(null);
    try {
      setStep("proving");
      const { proof, publicSignals } = await generateEligibilityProof(attestation.zk_input);

      setStep("subscribing");
      const wallet = await selector.wallet("my-near-wallet");
      const result = await subscribe(
        wallet,
        policyId,
        toContractBundle(attestation.bundle),
        JSON.stringify(proof),
        JSON.stringify(publicSignals),
      );

      setTxHash(result?.transaction?.hash ?? null);
      setStep("done");
      // Keep the attestation in localStorage — it's still useful for the sidebar
      // to recognize "this investor has an eligible review". Cleanup happens
      // once contribute() succeeds (on-chain record is then authoritative).
      onSubscribed?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Subscribe failed";
      if (VERIFIER_REJECT_PATTERNS.some((p) => msg.includes(p))) {
        clearAttestation(policyId);
      }
      setError(msg);
      setStep("error");
    }
  }

  if (step === "done") {
    return (
      <div className="space-y-xs">
        <p className="text-sm text-neon-glow text-center">Subscription sealed on-chain</p>
        {txHash && (
          <a
            href={`https://explorer.testnet.near.org/transactions/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-xs text-gray-600 underline hover:text-gray-800"
          >
            View transaction
          </a>
        )}
        <p className="text-center text-xs text-alpha-60">
          Waiting for the Contributing phase to fund your allocation.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-xs">
      {error && <p className="text-xs text-status-refund">{error}</p>}
      <button
        onClick={handleSubscribe}
        disabled={!isConnected || step === "proving" || step === "subscribing"}
        className="w-full rounded-lg bg-neon-glow py-2.5 text-sm font-medium text-gray-0 transition-colors enabled:hover:bg-neon-soft disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {step === "proving"
          ? "Generating ZK Proof..."
          : step === "subscribing"
            ? "Confirming Transaction..."
            : "Subscribe"}
      </button>
      <p className="text-center text-xs text-alpha-60">
        Seals your ZK-verified eligibility on-chain. No deposit yet.
      </p>
    </div>
  );
}
