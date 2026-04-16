"use client";

import { useState } from "react";
import { useWallet } from "@/contexts/WalletContext";
import { generateEligibilityProof } from "@/lib/zk/prove";
import { contribute } from "@/lib/near/transactions";
import { clearAttestation, loadAttestation } from "@/lib/attestation-store";
import { toContractBundle } from "@/lib/tee/bundle";

interface ContributeButtonProps {
  policyId: number;
}

type Step = "idle" | "proving" | "contributing" | "done" | "error";

// Error messages that indicate the attestation the contract got was too old
// or otherwise rejected by the verifier — we treat these as "need to re-run
// identity", per INVESTOR_FLOW §6.
const VERIFIER_REJECT_PATTERNS = [
  "AttestationExpired",
  "InvalidSignature",
  "AttestationInvalid",
  "WrongSubject",
];

export default function ContributeButton({ policyId }: ContributeButtonProps) {
  const { selector, isConnected, accountId } = useWallet();
  const [step, setStep] = useState<Step>("idle");
  const [amount, setAmount] = useState("10");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  async function handleContribute() {
    if (!selector || !isConnected) return;

    const attestation = loadAttestation(policyId, accountId);
    if (!attestation) {
      setError("No attestation found. Please subscribe first.");
      return;
    }

    setError(null);

    try {
      // Step 1: Generate ZK proof
      setStep("proving");
      const { proof, publicSignals } = await generateEligibilityProof(
        attestation.zk_input,
      );

      // Step 2: Call contribute
      setStep("contributing");
      const wallet = await selector.wallet("my-near-wallet");
      const result = await contribute(
        wallet,
        policyId,
        toContractBundle(attestation.bundle),
        JSON.stringify(proof),
        JSON.stringify(publicSignals),
        amount,
      );

      setTxHash(result?.transaction?.hash ?? null);
      setStep("done");

      // Contribution is on-chain now; drop the attestation so the next visit
      // reconstructs state from the contract, not from local storage.
      clearAttestation(policyId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Contribute failed";
      const rejected = VERIFIER_REJECT_PATTERNS.some((p) => msg.includes(p));
      if (rejected) {
        // Attestation is no longer valid — wipe it so the sidebar rerenders
        // back to the "Build Identity" flow after the next contribution fetch.
        clearAttestation(policyId);
      }
      setError(msg);
      setStep("error");
    }
  }

  if (step === "done") {
    return (
      <div className="space-y-xs">
        <p className="text-sm text-neon-glow">Contribution successful!</p>
        {txHash && (
          <a
            href={`https://explorer.testnet.near.org/transactions/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-600 underline hover:text-gray-800"
          >
            View transaction
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-xs">
      <div>
        <label className="mb-2xs block text-xs text-gray-600">
          Amount (NEAR)
        </label>
        <input
          type="number"
          min="0.1"
          step="0.1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-md py-sm text-sm text-gray-1000 focus:border-neon-glow focus:outline-none"
        />
      </div>

      {error && (
        <p className="text-xs text-status-refund">{error}</p>
      )}

      <button
        onClick={handleContribute}
        disabled={!isConnected || step === "proving" || step === "contributing"}
        className="w-full rounded-lg bg-neon-glow py-2.5 text-sm font-medium text-gray-0 transition-colors enabled:hover:bg-neon-soft disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {step === "proving"
          ? "Generating ZK Proof..."
          : step === "contributing"
            ? "Confirming Transaction..."
            : "Contribute"}
      </button>
    </div>
  );
}
