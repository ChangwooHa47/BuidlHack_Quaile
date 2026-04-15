import { BrowserProvider } from "ethers";

export type WalletType = "metamask" | "walletconnect" | "coinbase";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let activeProvider: any = null;

/**
 * Connect via MetaMask (window.ethereum).
 */
async function connectMetaMask(): Promise<{ address: string; chainId: number }> {
  if (!window.ethereum) throw new Error("MetaMask not installed");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  activeProvider = window.ethereum as any;
  const provider = new BrowserProvider(activeProvider);
  const accounts = await provider.send("eth_requestAccounts", []);
  if (!accounts[0]) throw new Error("No account");
  const network = await provider.getNetwork();
  return { address: (accounts[0] as string).toLowerCase(), chainId: Number(network.chainId) };
}

/**
 * Connect via WalletConnect QR.
 */
async function connectWalletConnect(): Promise<{ address: string; chainId: number }> {
  const { EthereumProvider } = await import("@walletconnect/ethereum-provider");
  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "PLACEHOLDER";
  const wc = await EthereumProvider.init({
    projectId,
    chains: [1],
    optionalChains: [8453, 42161, 10, 137, 56],
    showQrModal: true,
  });
  await wc.connect();
  activeProvider = wc;
  const provider = new BrowserProvider(wc);
  const signer = await provider.getSigner();
  const address = (await signer.getAddress()).toLowerCase();
  const network = await provider.getNetwork();
  return { address, chainId: Number(network.chainId) };
}

/**
 * Connect via Coinbase Wallet.
 */
async function connectCoinbase(): Promise<{ address: string; chainId: number }> {
  const { CoinbaseWalletSDK } = await import("@coinbase/wallet-sdk");
  const sdk = new CoinbaseWalletSDK({ appName: "Qualie" });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  activeProvider = (sdk as any).makeWeb3Provider?.() ?? sdk;
  const provider = new BrowserProvider(activeProvider);
  const accounts = await provider.send("eth_requestAccounts", []);
  if (!accounts[0]) throw new Error("No account");
  const network = await provider.getNetwork();
  return { address: (accounts[0] as string).toLowerCase(), chainId: Number(network.chainId) };
}

/**
 * Connect an EVM wallet by type.
 */
export async function connectEvmWallet(type: WalletType): Promise<{ address: string; chainId: number }> {
  switch (type) {
    case "metamask": return connectMetaMask();
    case "walletconnect": return connectWalletConnect();
    case "coinbase": return connectCoinbase();
  }
}

/**
 * Sign a message with the currently active provider.
 */
export async function signEvmMessage(message: string): Promise<string> {
  if (!activeProvider) throw new Error("No wallet connected");
  const provider = new BrowserProvider(activeProvider);
  const signer = await provider.getSigner();
  return signer.signMessage(message);
}
