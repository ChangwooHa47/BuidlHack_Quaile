import { NEAR_CONFIG } from "./config";

/**
 * Execute a NEAR RPC view call (no gas, read-only).
 * Works in both Server Components and Client Components.
 */
export async function viewCall<T>(
  contractId: string,
  method: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(NEAR_CONFIG.nodeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "view",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: contractId,
        method_name: method,
        args_base64: btoa(JSON.stringify(args)),
      },
    }),
    next: { revalidate: 30 },
  });

  const data = await res.json();

  if (data.error) {
    throw new Error(`RPC error: ${JSON.stringify(data.error)}`);
  }
  if (!data.result?.result) {
    throw new Error(`RPC: no result for ${contractId}.${method}`);
  }

  const bytes = new Uint8Array(data.result.result);
  return JSON.parse(new TextDecoder().decode(bytes));
}
