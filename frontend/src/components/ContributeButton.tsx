"use client";

import { useState } from "react";
import { useWallet } from "@/contexts/WalletContext";
import { contribute } from "@/lib/near/transactions";
import { clearAttestation } from "@/lib/attestation-store";

interface ContributeButtonProps {
  policyId: number;
}

type Step = "idle" | "contributing" | "done" | "error";

export default function ContributeButton({ policyId }: ContributeButtonProps) {
  const { selector, isConnected } = useWallet();
  const [step, setStep] = useState<Step>("idle");
  const [amount, setAmount] = useState("10");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  async function handleContribute() {
    if (!selector || !isConnected) return;
    setError(null);

    try {
      setStep("contributing");
      const wallet = await selector.wallet("my-near-wallet");
      const result = await contribute(wallet, policyId, amount);

      setTxHash(result?.transaction?.hash ?? null);
      setStep("done");
      // Contribution is on-chain now; drop local attestation so subsequent
      // renders reconstruct sidebar state from the contract.
      clearAttestation(policyId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Contribute failed";
      setError(msg);
      setStep("error");
    }
  }

  if (step === "done") {
    return (
      <div className="space-y-xs">
        <p className="text-sm text-neon-glow text-center">Contribution successful!</p>
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
      </div>
    );
  }

  return (
    <div className="space-y-xs">
      <div>
        <label className="mb-2xs block text-xs text-gray-600">Amount (NEAR)</label>
        <input
          type="number"
          min="0.1"
          step="0.1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-md py-sm text-sm text-gray-1000 focus:border-neon-glow focus:outline-none"
        />
      </div>

      {error && <p className="text-xs text-status-refund">{error}</p>}

      <button
        onClick={handleContribute}
        disabled={!isConnected || step === "contributing"}
        className="w-full rounded-lg bg-neon-glow py-2.5 text-sm font-medium text-gray-0 transition-colors enabled:hover:bg-neon-soft disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {step === "contributing" ? "Confirming Transaction..." : "Contribute"}
      </button>
    </div>
  );
}
