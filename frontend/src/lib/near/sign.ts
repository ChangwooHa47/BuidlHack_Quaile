import { generateNonce, nowNs } from "@/lib/evm/message";
import { NEAR_NETWORK } from "./config";

export interface NearWalletProof {
  account_id: string;
  public_key: string;
  signature: string;
  message: string;
  timestamp: number;
}

/**
 * Build canonical message for NEAR wallet signing (NEP-413).
 * Format: buidl-near-ai|v1|{policyId}|{nonce}|{ts}|near:{network}|{accountId}
 */
export function buildCanonicalMessageNear(
  policyId: number,
  nonceHex: string,
  timestampNs: bigint,
  accountId: string,
): string {
  return `buidl-near-ai|v1|${policyId}|${nonceHex}|${timestampNs}|near:${NEAR_NETWORK}|${accountId}`;
}

/**
 * Sign a message with the NEAR wallet (NEP-413 signMessage).
 */
export async function signNearProof(
  wallet: { signMessage: (params: { message: string; recipient: string; nonce: Buffer }) => Promise<{ publicKey: string; signature: string }> },
  accountId: string,
  policyId: number,
  nonceHex: string,
): Promise<NearWalletProof> {
  const ts = nowNs();
  const message = buildCanonicalMessageNear(policyId, nonceHex, ts, accountId);
  const nonceBuffer = Buffer.from(nonceHex, "hex");
  const signed = await wallet.signMessage({
    message,
    recipient: accountId,
    nonce: nonceBuffer,
  });
  return {
    account_id: accountId,
    public_key: signed.publicKey,
    signature: signed.signature,
    message,
    timestamp: Number(ts),
  };
}

export { generateNonce, nowNs };
