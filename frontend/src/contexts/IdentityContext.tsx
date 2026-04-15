"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { useWallet } from "./WalletContext";

export interface EvmWalletEntry {
  chainId: number;
  address: string;
  signature: string | null;
  message: string | null;
  signed: boolean;
}

interface IdentityContextValue {
  nearAccountId: string | null;
  evmWallets: EvmWalletEntry[];
  githubConnected: boolean;
  selfIntro: string;
  addEvmWallet: (chainId: number, address: string) => void;
  markEvmSigned: (address: string, signature: string, message: string) => void;
  removeEvmWallet: (address: string) => void;
  setGithubConnected: (v: boolean) => void;
  setSelfIntro: (v: string) => void;
  reset: () => void;
  isIdentityComplete: boolean;
}

const IdentityContext = createContext<IdentityContextValue>({
  nearAccountId: null,
  evmWallets: [],
  githubConnected: false,
  selfIntro: "",
  addEvmWallet: () => {},
  markEvmSigned: () => {},
  removeEvmWallet: () => {},
  setGithubConnected: () => {},
  setSelfIntro: () => {},
  reset: () => {},
  isIdentityComplete: false,
});

export function IdentityProvider({ children }: { children: ReactNode }) {
  const { accountId } = useWallet();
  const [evmWallets, setEvmWallets] = useState<EvmWalletEntry[]>([]);
  const [githubConnected, setGithubConnected] = useState(false);
  const [selfIntro, setSelfIntro] = useState("");

  const addEvmWallet = useCallback((chainId: number, address: string) => {
    setEvmWallets((prev) => {
      if (prev.some((w) => w.address.toLowerCase() === address.toLowerCase())) return prev;
      return [...prev, { chainId, address, signature: null, message: null, signed: false }];
    });
  }, []);

  const markEvmSigned = useCallback((address: string, signature: string, message: string) => {
    setEvmWallets((prev) =>
      prev.map((w) =>
        w.address.toLowerCase() === address.toLowerCase()
          ? { ...w, signature, message, signed: true }
          : w,
      ),
    );
  }, []);

  const removeEvmWallet = useCallback((address: string) => {
    setEvmWallets((prev) =>
      prev.filter((w) => w.address.toLowerCase() !== address.toLowerCase()),
    );
  }, []);

  const reset = useCallback(() => {
    setEvmWallets([]);
    setGithubConnected(false);
    setSelfIntro("");
  }, []);

  const hasSignedEvmWallet = evmWallets.some((w) => w.signed);
  const isIdentityComplete = !!accountId && hasSignedEvmWallet && selfIntro.trim().length > 0;

  return (
    <IdentityContext.Provider
      value={{
        nearAccountId: accountId,
        evmWallets,
        githubConnected,
        selfIntro,
        addEvmWallet,
        markEvmSigned,
        removeEvmWallet,
        setGithubConnected,
        setSelfIntro,
        reset,
        isIdentityComplete,
      }}
    >
      {children}
    </IdentityContext.Provider>
  );
}

export function useIdentity() {
  return useContext(IdentityContext);
}
