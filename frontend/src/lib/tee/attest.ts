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
}

export interface AttestationResponse {
  bundle: AttestationBundle;
  tee_report: string;
  zk_input: ZkCircuitInput;
}

export interface PersonaSubmission {
  near_account: string;
  policy_id: number;
  wallets: {
    near: Array<{
      account_id: string;
      public_key: string;
      signature: string;
      message: string;
      timestamp: number;
    }>;
    evm: Array<{
      chain_id: number;
      address: string;
      signature: string;
      message: string;
      timestamp: number;
    }>;
  };
  self_intro: string;
  github_oauth_token: string | null;
  nonce: string;
  client_timestamp: number;
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
