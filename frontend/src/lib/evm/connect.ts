import { BrowserProvider } from "ethers";
import { getWeb3Modal } from "./web3modal";

/**
 * Open Web3Modal, let user pick any wallet, connect, return address + chainId.
 * After capturing address, the caller should immediately sign and then
 * the connection can be released for the next wallet.
 */
export async function connectEvmWallet(): Promise<{ address: string; chainId: number }> {
  const modal = getWeb3Modal();

  // Open the wallet picker
  await modal.open();

  // Wait until a provider is available (user picked a wallet)
  const provider = await new Promise<BrowserProvider>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Connection timeout")), 120000);
    const check = setInterval(() => {
      const wp = modal.getWalletProvider?.();
      if (wp) {
        clearInterval(check);
        clearTimeout(timeout);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolve(new BrowserProvider(wp as any));
      }
    }, 300);

    // Also listen for modal close without connecting
    modal.subscribeEvents?.((event: { data: { event: string } }) => {
      if (event.data.event === "MODAL_CLOSE") {
        const wp = modal.getWalletProvider?.();
        if (!wp) {
          clearInterval(check);
          clearTimeout(timeout);
          reject(new Error("User closed wallet picker"));
        }
      }
    });
  });

  const accounts = await provider.send("eth_requestAccounts", []);
  if (!accounts[0]) throw new Error("No account returned");
  const network = await provider.getNetwork();
  return {
    address: (accounts[0] as string).toLowerCase(),
    chainId: Number(network.chainId),
  };
}

/**
 * Sign a message using the currently connected Web3Modal provider.
 * Must be called while the wallet is still connected (before disconnect).
 */
export async function signEvmMessage(message: string): Promise<string> {
  const modal = getWeb3Modal();
  const wp = modal.getWalletProvider?.();
  if (!wp) throw new Error("No wallet connected");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const provider = new BrowserProvider(wp as any);
  const signer = await provider.getSigner();
  return signer.signMessage(message);
}

/**
 * Disconnect the current Web3Modal session so a new wallet can be added.
 */
export async function disconnectEvmWallet(): Promise<void> {
  const modal = getWeb3Modal();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = modal as any;
  if (typeof m.disconnect === "function") {
    await m.disconnect();
  }
}
