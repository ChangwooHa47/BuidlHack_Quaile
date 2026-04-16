import type { AttestationResponse } from "@/lib/tee/attest";

// localStorage keys. One entry per policy so multiple tabs / sessions reuse them.
const attestationKey = (policyId: number) => `attestation_${policyId}`;
const ineligibleKey = (policyId: number) => `ineligible_${policyId}`;

/**
 * Load a previously issued attestation for this policy.
 *
 * Returns `null` if:
 * - nothing was stored
 * - the stored payload is unparseable (treated as corrupt)
 * - the stored attestation belongs to a different NEAR account than
 *   the currently connected wallet (wallet-switch guard from INVESTOR_FLOW §10-3)
 *
 * When a mismatch is detected the stale entry is removed so subsequent calls
 * return `null` without re-checking.
 */
export function loadAttestation(
  policyId: number,
  currentAccountId: string | null,
): AttestationResponse | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(attestationKey(policyId));
  if (!raw) return null;
  let parsed: AttestationResponse;
  try {
    parsed = JSON.parse(raw) as AttestationResponse;
  } catch {
    localStorage.removeItem(attestationKey(policyId));
    return null;
  }
  const subject = parsed?.bundle?.payload?.subject;
  if (currentAccountId && subject && subject !== currentAccountId) {
    // Wallet switched — the old attestation is useless to this account.
    localStorage.removeItem(attestationKey(policyId));
    return null;
  }
  return parsed;
}

export function saveAttestation(
  policyId: number,
  response: AttestationResponse,
) {
  if (typeof window === "undefined") return;
  localStorage.setItem(attestationKey(policyId), JSON.stringify(response));
}

export function clearAttestation(policyId: number) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(attestationKey(policyId));
}

export function isIneligible(policyId: number): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(ineligibleKey(policyId)) === "true";
}

export function markIneligible(policyId: number) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ineligibleKey(policyId), "true");
}
