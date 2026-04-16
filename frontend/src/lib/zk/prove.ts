import type { ZkCircuitInput } from "@/lib/tee/attest";

export interface ZkProofResult {
  proof: object;
  /**
   * Public signals **reordered to match the on-chain verifier's expectation**:
   * `[payload_hash_limbs[0..3], eligible]`.
   *
   * snarkjs's native output for this circuit is `[eligible, limb0..limb3]`
   * (outputs before public inputs, ordered by wire index). The zk-verifier
   * contract reads `public_inputs[4]` as the eligible flag, so we shift it
   * to the tail before returning.
   */
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

  // snarkjs emits `[eligible, payload_hash_limbs[0..3]]`. Bail early if the
  // witness says not eligible so we don't round-trip through the contract
  // only to get rejected there.
  const [eligibleSignal, ...limbs] = publicSignals;
  if (eligibleSignal !== "1") {
    throw new Error("ZK proof: not eligible (criteria not all passed)");
  }

  // The on-chain verifier expects eligible at index 4 (end of the array),
  // not index 0. Reorder before returning.
  return { proof, publicSignals: [...limbs, eligibleSignal] };
}
