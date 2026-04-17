"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useWallet } from "./WalletContext";

export interface EvmWalletEntry {
  chainId: number;
  address: string;
  signature: string | null;
  message: string | null;
  timestamp: string | null;
  signed: boolean;
}

interface IdentityContextValue {
  nearAccountId: string | null;
  evmWallets: EvmWalletEntry[];
  githubConnected: boolean;
  githubToken: string | null;
  selfIntro: string;
  addEvmWallet: (chainId: number, address: string) => void;
  markEvmSigned: (address: string, signature: string, message: string, timestamp: string) => void;
  removeEvmWallet: (address: string) => void;
  setGithubConnected: (v: boolean) => void;
  setGithubToken: (token: string | null) => void;
  setSelfIntro: (v: string) => void;
  reset: () => void;
  isIdentityComplete: boolean;
}

const IdentityContext = createContext<IdentityContextValue>({
  nearAccountId: null,
  evmWallets: [],
  githubConnected: false,
  githubToken: null,
  selfIntro: "",
  addEvmWallet: () => {},
  markEvmSigned: () => {},
  removeEvmWallet: () => {},
  setGithubConnected: () => {},
  setGithubToken: () => {},
  setSelfIntro: () => {},
  reset: () => {},
  isIdentityComplete: false,
});

export function IdentityProvider({ children }: { children: ReactNode }) {
  const { accountId } = useWallet();
  const [evmWallets, setEvmWallets] = useState<EvmWalletEntry[]>([]);
  const [githubConnected, setGithubConnected] = useState(false);
  const [githubToken, setGithubToken] = useState<string | null>(null);
  const [selfIntro, setSelfIntro] = useState("");

  const addEvmWallet = useCallback((chainId: number, address: string) => {
    setEvmWallets((prev) => {
      if (prev.some((w) => w.address.toLowerCase() === address.toLowerCase())) return prev;
      return [...prev, { chainId, address, signature: null, message: null, timestamp: null, signed: false }];
    });
  }, []);

  const markEvmSigned = useCallback((address: string, signature: string, message: string, timestamp: string) => {
    setEvmWallets((prev) =>
      prev.map((w) =>
        w.address.toLowerCase() === address.toLowerCase()
          ? { ...w, signature, message, timestamp, signed: true }
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
    setGithubToken(null);
    setSelfIntro("");
  }, []);

  // Wipe persona state when the connected NEAR account changes (sign-out or
  // wallet switch). INVESTOR_FLOW §10-3. Defer the reset to a microtask so
  // we don't call setState synchronously inside the effect body (lint rule
  // react-hooks/set-state-in-effect) and we still land on the next tick.
  const lastAccountIdRef = useRef<string | null>(accountId);
  useEffect(() => {
    if (lastAccountIdRef.current === accountId) return;
    const hadPrevious = lastAccountIdRef.current !== null;
    lastAccountIdRef.current = accountId;
    if (!hadPrevious) return;
    queueMicrotask(reset);
  }, [accountId, reset]);

  const hasSignedEvmWallet = evmWallets.some((w) => w.signed);
  const isIdentityComplete = !!accountId && hasSignedEvmWallet && selfIntro.trim().length > 0;

  return (
    <IdentityContext.Provider
      value={{
        nearAccountId: accountId,
        evmWallets,
        githubConnected,
        githubToken,
        selfIntro,
        addEvmWallet,
        markEvmSigned,
        removeEvmWallet,
        setGithubConnected,
        setGithubToken,
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
