import type { ZkCircuitInput } from "@/lib/tee/attest";

export interface ZkProofResult {
  proof: object;
  publicSignals: string[];
}

const WASM_URL = "/zk/eligibility.wasm";
const ZKEY_URL = "/zk/eligibility_final.zkey";

/**
 * Generate a groth16 proof for eligibility in the browser.
 * Uses snarkjs loaded dynamically to avoid SSR issues.
 */
export async function generateEligibilityProof(
  input: ZkCircuitInput,
): Promise<ZkProofResult> {
  // Dynamic import — snarkjs must only run in browser
  const snarkjs = await import("snarkjs");

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input as unknown as Record<string, unknown>,
    WASM_URL,
    ZKEY_URL,
  );

  // Last public signal is `eligible` (1 = all criteria pass)
  const eligible = publicSignals[publicSignals.length - 1];
  if (eligible !== "1") {
    throw new Error("ZK proof: not eligible (criteria not all passed)");
  }

  return { proof, publicSignals };
}
