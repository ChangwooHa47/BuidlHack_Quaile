"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@/contexts/WalletContext";
import ConnectedWallet from "./ConnectedWallet";

const NAV_ITEMS = [
  { label: "My Policies", href: "/company/policies" },
  { label: "Register Policy", href: "/company/policies/new" },
];

export default function CompanyHeader() {
  const pathname = usePathname();
  const { accountId, isConnected, isLoading, signIn, signOut } = useWallet();

  return (
    <header className="sticky top-0 z-50 border-b border-alpha-12 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-lg">
        <Link href="/company/policies" className="text-xl font-semibold tracking-tight text-gray-1000">
          Qualie.
        </Link>

        <nav className="flex items-center gap-xl">
          {NAV_ITEMS.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className={`text-sm font-medium transition-colors ${
                pathname === href || (href === "/company/policies" && pathname.startsWith("/company/policies/") && href === "/company/policies" && !pathname.includes("/new"))
                  ? "text-gray-1000"
                  : "text-alpha-40 hover:text-alpha-60"
              }`}
            >
              {label}
            </Link>
          ))}
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
  );
}
