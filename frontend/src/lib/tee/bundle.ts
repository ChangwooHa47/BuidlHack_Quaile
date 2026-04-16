import type { AttestationBundle } from "./attest";

/**
 * Wire-level representation of an `AttestationBundle` that the on-chain
 * `ido-escrow.contribute` method actually accepts.
 *
 * The Rust `tee_shared::AttestationBundle` serializes byte arrays as
 * sequences of `u8` values, not `"0x..."` hex strings. The TEE's FastAPI
 * service emits them as hex strings. The two shapes are not directly
 * interchangeable — sending the raw TEE JSON makes the contract panic
 * with `Failed to deserialize input from JSON.`.
 */
export interface ContractAttestationBundle {
  payload: {
    subject: string;
    policy_id: number;
    verdict: "Eligible" | "Ineligible";
    issued_at: number;
    expires_at: number;
    nonce: number[]; // [u8; 32]
    criteria_results: { results: boolean[]; count: number };
    payload_version: number;
  };
  payload_hash: number[]; // [u8; 32]
  signature_rs: number[]; // [u8; 64]
  signature_v: number;
  signing_key_id: number;
}

function hexToBytes(hex: string, expected: number): number[] {
  const trimmed = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (trimmed.length !== expected * 2) {
    throw new Error(
      `hexToBytes: expected ${expected} bytes, got ${trimmed.length / 2}`,
    );
  }
  const out: number[] = new Array(expected);
  for (let i = 0; i < expected; i++) {
    out[i] = parseInt(trimmed.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Convert the hex-string payload the TEE returns into the byte-array shape
 * the contract's serde expects.
 */
export function toContractBundle(
  bundle: AttestationBundle,
): ContractAttestationBundle {
  return {
    payload: {
      subject: bundle.payload.subject,
      policy_id: bundle.payload.policy_id,
      verdict: bundle.payload.verdict,
      issued_at: bundle.payload.issued_at,
      expires_at: bundle.payload.expires_at,
      // Rust `Nonce = [u8; 32]`. TEE emits 0x-prefixed 64 hex chars.
      nonce:
        Array.isArray(bundle.payload.nonce)
          ? (bundle.payload.nonce as unknown as number[])
          : hexToBytes(bundle.payload.nonce as unknown as string, 32),
      criteria_results: bundle.payload.criteria_results,
      payload_version: bundle.payload.payload_version,
    },
    payload_hash: hexToBytes(bundle.payload_hash, 32),
    signature_rs: hexToBytes(bundle.signature_rs, 64),
    signature_v: bundle.signature_v,
    signing_key_id: bundle.signing_key_id,
  };
}
