import { BrowserProvider, type Eip1193Provider } from "ethers";

export type WalletId = "metamask" | "rabby" | "okx" | "phantom" | "walletconnect";

interface ConnectResult {
  address: string;
  chainId: number;
  sign: (message: string) => Promise<string>;
}

/**
 * Find a specific injected provider.
 * Handles the case where multiple wallets inject into window.ethereum.
 */
function getInjectedProvider(id: WalletId): Eip1193Provider | null {
  if (typeof window === "undefined") return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;

  if (id === "okx") {
    return w.okxwallet ?? null;
  }

  if (id === "phantom") {
    return w.phantom?.ethereum ?? null;
  }

  // MetaMask and Rabby both use window.ethereum.
  // If multiple wallets are installed, window.ethereum.providers may exist.
  const providers: Eip1193Provider[] = w.ethereum?.providers ?? [w.ethereum].filter(Boolean);

  for (const p of providers) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const provider = p as any;
    if (id === "metamask" && provider.isMetaMask && !provider.isRabby) return provider;
    if (id === "rabby" && provider.isRabby) return provider;
  }

  // Fallback: if only one provider and it matches loosely
  if (w.ethereum) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eth = w.ethereum as any;
    if (id === "metamask" && eth.isMetaMask) return eth;
    if (id === "rabby" && eth.isRabby) return eth;
  }

  return null;
}

/**
 * Connect via an injected browser wallet (MetaMask, Rabby, OKX).
 * wallet_requestPermissions forces account picker every time.
 */
async function connectInjected(id: WalletId): Promise<ConnectResult> {
  const injected = getInjectedProvider(id);
  if (!injected) {
    const names: Record<string, string> = {
      metamask: "MetaMask",
      rabby: "Rabby",
      okx: "OKX Wallet",
      phantom: "Phantom",
    };
    throw new Error(`${names[id] ?? id} not found. Please install the extension.`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = injected as any;

  // Force account picker — fall back to eth_requestAccounts if unsupported
  try {
    await raw.request({
      method: "wallet_requestPermissions",
      params: [{ eth_accounts: {} }],
    });
  } catch {
    await raw.request({ method: "eth_requestAccounts" });
  }

  const provider = new BrowserProvider(injected);
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
 * Fresh provider each time — no session reuse.
 */
async function connectWalletConnect(): Promise<ConnectResult> {
  const { EthereumProvider } = await import("@walletconnect/ethereum-provider");
  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";
  if (!projectId || projectId === "PLACEHOLDER") {
    throw new Error("WalletConnect not configured. Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID.");
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
 * Connect a wallet by ID. Returns address, chainId, and a sign function.
 */
export async function connectEvmWallet(id: WalletId): Promise<ConnectResult> {
  if (id === "walletconnect") return connectWalletConnect();
  return connectInjected(id);
}
