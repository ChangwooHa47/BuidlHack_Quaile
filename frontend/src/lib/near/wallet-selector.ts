import { setupWalletSelector, type WalletSelector } from "@near-wallet-selector/core";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { NEAR_CONFIG } from "./config";

let pending: Promise<WalletSelector> | null = null;

export function getWalletSelector(): Promise<WalletSelector> {
  if (!pending) {
    pending = setupWalletSelector({
      network: NEAR_CONFIG.networkId,
      modules: [setupMyNearWallet()],
    });
  }
  return pending;
}
