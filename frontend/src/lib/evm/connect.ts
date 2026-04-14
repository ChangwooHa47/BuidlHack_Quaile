import { BrowserProvider } from "ethers";

export async function connectEvmWallet(): Promise<string> {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("MetaMask or compatible wallet not found");
  }

  const provider = new BrowserProvider(window.ethereum);
  const accounts = await provider.send("eth_requestAccounts", []);
  if (!accounts[0]) throw new Error("No account returned");
  return (accounts[0] as string).toLowerCase();
}

export async function signEvmMessage(message: string): Promise<string> {
  if (!window.ethereum) throw new Error("No wallet");
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  return signer.signMessage(message);
}
