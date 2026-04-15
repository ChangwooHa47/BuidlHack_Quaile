"use client";

import { createWeb3Modal, defaultConfig } from "@web3modal/ethers";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "PLACEHOLDER";

const chains = [
  { chainId: 1, name: "Ethereum", currency: "ETH", explorerUrl: "https://etherscan.io", rpcUrl: "https://eth.drpc.org" },
  { chainId: 8453, name: "Base", currency: "ETH", explorerUrl: "https://basescan.org", rpcUrl: "https://mainnet.base.org" },
  { chainId: 42161, name: "Arbitrum", currency: "ETH", explorerUrl: "https://arbiscan.io", rpcUrl: "https://arb1.arbitrum.io/rpc" },
  { chainId: 10, name: "Optimism", currency: "ETH", explorerUrl: "https://optimistic.etherscan.io", rpcUrl: "https://mainnet.optimism.io" },
  { chainId: 137, name: "Polygon", currency: "MATIC", explorerUrl: "https://polygonscan.com", rpcUrl: "https://polygon-rpc.com" },
  { chainId: 56, name: "BSC", currency: "BNB", explorerUrl: "https://bscscan.com", rpcUrl: "https://bsc-dataseed.binance.org" },
];

const ethersConfig = defaultConfig({
  metadata: {
    name: "Qualie",
    description: "TEE-based AI IDO Launchpad",
    url: typeof window !== "undefined" ? window.location.origin : "https://qualie.xyz",
    icons: [],
  },
});

let modal: ReturnType<typeof createWeb3Modal> | null = null;

export function getWeb3Modal() {
  if (!modal && typeof window !== "undefined") {
    modal = createWeb3Modal({
      ethersConfig,
      chains,
      projectId,
      themeMode: "dark",
      themeVariables: {
        "--w3m-accent": "#c8ff00",
      },
    });
  }
  return modal;
}
