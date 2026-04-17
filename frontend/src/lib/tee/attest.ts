import { TEE_API_URL } from "@/lib/near/config";

export interface AttestationBundle {
  payload: {
    subject: string;
    policy_id: number;
    verdict: "Eligible" | "Ineligible";
    issued_at: number;
    expires_at: number;
    nonce: number[];
    criteria_results: {
      results: boolean[];
      count: number;
    };
    payload_version: number;
  };
  payload_hash: string;
  signature_rs: string;
  signature_v: number;
  signing_key_id: number;
}

export interface ZkCircuitInput {
  payload_hash_limbs: string[];
  criteria: number[];
  criteria_count: string;
  /**
   * Minimum number of passing criteria required for eligibility. Set by the
   * TEE based on `[THRESHOLD:N]` in the policy's natural_language; falls back
   * to `criteria_count` (all must pass) when the policy omits the marker.
   * Private input to the circuit — never leaves the proof.
   */
  threshold: string;
}

export interface AttestationResponse {
  bundle: AttestationBundle;
  tee_report: string;
  zk_input: ZkCircuitInput;
}

// Nanosecond timestamps exceed JS Number's 2^53 safe range, so they travel
// as decimal strings over the wire. Pydantic on the TEE side coerces str → int.
export interface PersonaSubmission {
  near_account: string;
  policy_id: number;
  wallets: {
    near: Array<{
      account_id: string;
      public_key: string;
      signature: string;
      message: string;
      timestamp: string;
    }>;
    evm: Array<{
      chain_id: number;
      address: string;
      signature: string;
      message: string;
      timestamp: string;
    }>;
  };
  self_intro: string;
  github_oauth_token: string | null;
  nonce: string;
  client_timestamp: string;
}

export async function submitPersona(
  persona: PersonaSubmission,
): Promise<AttestationResponse> {
  const res = await fetch(`${TEE_API_URL}/v1/attest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(persona),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TEE error ${res.status}: ${text}`);
  }
  return res.json();
}
