import { BrowserProvider } from "ethers";
import { getWeb3Modal } from "./web3modal";

/**
 * Get the EVM provider — from Web3Modal if connected, otherwise window.ethereum.
 */
function getProvider(): BrowserProvider {
  const modal = getWeb3Modal();
  const walletProvider = modal?.getWalletProvider?.();
  if (walletProvider) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new BrowserProvider(walletProvider as any);
  }
  if (typeof window !== "undefined" && window.ethereum) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new BrowserProvider(window.ethereum as any);
  }
  throw new Error("No EVM wallet found. Install MetaMask or use WalletConnect.");
}

export async function connectEvmWallet(): Promise<string> {
  // Open Web3Modal to let user choose wallet
  const modal = getWeb3Modal();
  if (modal) {
    await modal.open();
    // Wait for connection
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (modal.getWalletProvider?.()) {
          clearInterval(check);
          resolve();
        }
      }, 500);
      // Timeout after 60s
      setTimeout(() => { clearInterval(check); resolve(); }, 60000);
    });
  }

  const provider = getProvider();
  const accounts = await provider.send("eth_requestAccounts", []);
  if (!accounts[0]) throw new Error("No account returned");
  return (accounts[0] as string).toLowerCase();
}

export async function getEvmChainId(): Promise<number> {
  const provider = getProvider();
  const network = await provider.getNetwork();
  return Number(network.chainId);
}

export async function signEvmMessage(message: string): Promise<string> {
  const provider = getProvider();
  const signer = await provider.getSigner();
  return signer.signMessage(message);
}
