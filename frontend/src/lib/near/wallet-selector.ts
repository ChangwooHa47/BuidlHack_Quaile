import { setupWalletSelector, type WalletSelector } from "@near-wallet-selector/core";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { NEAR_CONFIG } from "./config";

let selectorInstance: WalletSelector | null = null;

export async function getWalletSelector(): Promise<WalletSelector> {
  if (selectorInstance) return selectorInstance;

  selectorInstance = await setupWalletSelector({
    network: NEAR_CONFIG.networkId,
    modules: [setupMyNearWallet()],
  });

  return selectorInstance;
}
