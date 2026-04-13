"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { WalletSelector, AccountState } from "@near-wallet-selector/core";
import { getWalletSelector } from "@/lib/near/wallet-selector";

interface WalletContextValue {
  selector: WalletSelector | null;
  accountId: string | null;
  isConnected: boolean;
  isLoading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue>({
  selector: null,
  accountId: null,
  isConnected: false,
  isLoading: true,
  signIn: async () => {},
  signOut: async () => {},
});

export function WalletProvider({ children }: { children: ReactNode }) {
  const [selector, setSelector] = useState<WalletSelector | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getWalletSelector().then((sel) => {
      setSelector(sel);

      const state = sel.store.getState();
      const account = state.accounts.find((a: AccountState) => a.active);
      if (account) setAccountId(account.accountId);
      setIsLoading(false);

      const sub = sel.store.observable.subscribe((nextState) => {
        const active = nextState.accounts.find((a: AccountState) => a.active);
        setAccountId(active?.accountId ?? null);
      });

      return () => sub.unsubscribe();
    });
  }, []);

  const signIn = useCallback(async () => {
    if (!selector) return;
    const wallet = await selector.wallet("my-near-wallet");
    // @ts-expect-error -- wallet selector types require accounts for hardware wallets, but BrowserWallet doesn't need it
    await wallet.signIn({ contractId: "" });
  }, [selector]);

  const signOut = useCallback(async () => {
    if (!selector) return;
    const wallet = await selector.wallet("my-near-wallet");
    await wallet.signOut();
    setAccountId(null);
  }, [selector]);

  return (
    <WalletContext.Provider
      value={{
        selector,
        accountId,
        isConnected: !!accountId,
        isLoading,
        signIn,
        signOut,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}
