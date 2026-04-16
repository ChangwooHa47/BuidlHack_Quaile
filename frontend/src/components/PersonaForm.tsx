"use client";

import { useState } from "react";
import { useWallet } from "@/contexts/WalletContext";
import { useIdentity } from "@/contexts/IdentityContext";
import { generateNonce, nowNs } from "@/lib/evm/message";
import { submitPersona, type AttestationResponse } from "@/lib/tee/attest";

interface PersonaFormProps {
  policyId: number;
  onAttestationComplete: (response: AttestationResponse) => void;
}

export default function PersonaForm({ policyId, onAttestationComplete }: PersonaFormProps) {
  const { accountId } = useWallet();
  const { evmWallets, selfIntro, githubToken } = useIdentity();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signedEvmWallets = evmWallets.filter((w) => w.signed);

  async function handleSubmit() {
    if (!accountId) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const nonce = generateNonce();
      const clientTs = nowNs().toString();

      const persona = {
        near_account: accountId,
        policy_id: policyId,
        wallets: {
          near: [],
          evm: signedEvmWallets.map((w) => ({
            chain_id: w.chainId,
            address: w.address,
            signature: w.signature!,
            message: w.message || "",
            timestamp: clientTs,
          })),
        },
        self_intro: selfIntro,
        github_oauth_token: githubToken,
        nonce: "0x" + nonce,
        client_timestamp: clientTs,
      };

      const response = await submitPersona(persona);
      sessionStorage.setItem(`attestation_${policyId}`, JSON.stringify(response));
      onAttestationComplete(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Attestation failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-md">
      <div className="rounded-lg border border-border bg-background px-md py-sm">
        <p className="text-xs text-gray-600">Submitting with {signedEvmWallets.length} EVM wallet(s)</p>
        <p className="mt-xs text-xs text-gray-500 truncate">Intro: {selfIntro.slice(0, 60)}...</p>
      </div>

      {error && (
        <p className="rounded-lg bg-status-refund/10 px-md py-sm text-sm text-status-refund">
          {error}
        </p>
      )}

      <button
        onClick={handleSubmit}
        disabled={isSubmitting || !accountId}
        className="w-full rounded-lg bg-neon-glow py-2.5 text-sm font-medium text-gray-0 transition-colors enabled:hover:bg-neon-soft disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isSubmitting ? "Submitting to TEE..." : "Submit for Evaluation"}
      </button>
    </div>
  );
}
