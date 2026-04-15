import { BrowserProvider } from "ethers";

export type WalletMethod = "injected" | "walletconnect";

interface ConnectResult {
  address: string;
  chainId: number;
  sign: (message: string) => Promise<string>;
}

/**
 * Connect via injected provider (MetaMask, Rabby, Rainbow, etc.)
 * Uses wallet_requestPermissions to force account picker every time.
 */
async function connectInjected(): Promise<ConnectResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("No browser wallet found. Install MetaMask or similar.");

  // Force account picker — revokes cached permission and re-prompts
  await eth.request({
    method: "wallet_requestPermissions",
    params: [{ eth_accounts: {} }],
  });

  const provider = new BrowserProvider(eth);
  const signer = await provider.getSigner();
  const address = (await signer.getAddress()).toLowerCase();
  const network = await provider.getNetwork();

  return {
    address,
    chainId: Number(network.chainId),
    sign: (msg: string) => signer.signMessage(msg),
  };
}

/**
 * Connect via WalletConnect QR code.
 * Creates a fresh provider each time — no session reuse.
 */
async function connectWalletConnect(): Promise<ConnectResult> {
  const { EthereumProvider } = await import("@walletconnect/ethereum-provider");
  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";
  if (!projectId || projectId === "PLACEHOLDER") {
    throw new Error("WalletConnect project ID not configured");
  }

  const wc = await EthereumProvider.init({
    projectId,
    chains: [1],
    optionalChains: [8453, 42161, 10, 137, 56],
    showQrModal: true,
  });

  await wc.connect();

  const provider = new BrowserProvider(wc);
  const signer = await provider.getSigner();
  const address = (await signer.getAddress()).toLowerCase();
  const network = await provider.getNetwork();

  return {
    address,
    chainId: Number(network.chainId),
    sign: async (msg: string) => {
      const sig = await signer.signMessage(msg);
      try { await wc.disconnect(); } catch { /* cleanup */ }
      return sig;
    },
  };
}

/**
 * Connect a wallet and return address + chainId + sign function.
 */
export async function connectEvmWallet(method: WalletMethod): Promise<ConnectResult> {
  switch (method) {
    case "injected": return connectInjected();
    case "walletconnect": return connectWalletConnect();
  }
}
