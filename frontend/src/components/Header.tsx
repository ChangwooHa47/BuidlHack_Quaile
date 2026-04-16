"use client";

import Link from "next/link";
import Image from "next/image";
import { useWallet } from "@/contexts/WalletContext";
import ConnectedWallet from "./ConnectedWallet";

export default function Header() {
  const { accountId, isConnected, isLoading, signIn, signOut } = useWallet();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-lg">
        <Link href="/" className="flex items-center">
          <Image
            src="/logo.png"
            alt="Qualie"
            width={128}
            height={28}
            priority
            className="h-7 w-auto"
          />
        </Link>

        {isLoading ? (
          <div className="h-9 w-32 animate-pulse rounded-pill bg-gray-400" />
        ) : isConnected && accountId ? (
          <ConnectedWallet address={accountId} onDisconnect={signOut} />
        ) : (
          <button
            onClick={signIn}
            className="rounded-pill border border-gray-500 px-md py-xs text-sm font-medium text-gray-1000 hover:bg-alpha-8 transition-colors"
          >
            Connect Wallet
          </button>
        )}
      </div>
    </header>
  );
}
