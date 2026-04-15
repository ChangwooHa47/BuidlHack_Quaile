"use client";

import Link from "next/link";
import { useWallet } from "@/contexts/WalletContext";
import ConnectedWallet from "@/components/ConnectedWallet";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { accountId, isConnected, isLoading, signIn, signOut } = useWallet();

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-alpha-12 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-[80px]">
          <Link href="/" className="text-xl font-semibold tracking-tight text-gray-1000">
            Qualie.
          </Link>

          <nav className="flex items-center gap-xl">
            <Link href="/" className="text-sm font-medium text-alpha-40 transition-colors hover:text-alpha-60">
              Projects
            </Link>
            <Link href="/admin" className="text-sm font-medium text-gray-1000 transition-colors hover:text-alpha-60">
              Admin
            </Link>
          </nav>

          {isLoading ? (
            <div className="h-9 w-32 animate-pulse rounded-pill bg-gray-400" />
          ) : isConnected && accountId ? (
            <ConnectedWallet address={accountId} onDisconnect={signOut} />
          ) : (
            <button
              onClick={signIn}
              className="rounded-pill border border-alpha-12 bg-gray-150 px-md py-xs text-sm font-medium text-gray-1000 hover:bg-alpha-8 transition-colors"
            >
              Connect Wallet
            </button>
          )}
        </div>
      </header>
      {children}
    </>
  );
}
