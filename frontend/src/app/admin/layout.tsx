"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useWallet } from "@/contexts/WalletContext";
import { getAllPolicies, type OnChainPolicy } from "@/lib/near/contracts";
import { slugOf } from "@/lib/slug";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { accountId, isConnected, isLoading, signIn, signOut } = useWallet();
  const pathname = usePathname();
  const [allPolicies, setAllPolicies] = useState<OnChainPolicy[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await getAllPolicies();
        if (!cancelled) setAllPolicies(all);
      } catch { /* ignore */ }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const policies = useMemo(
    () => (accountId ? allPolicies.filter((p) => p.foundation === accountId) : []),
    [allPolicies, accountId],
  );

  if (!isLoading && !isConnected) {
    return (
      <div className="flex min-h-screen w-full flex-1 items-center justify-center bg-background px-lg">
        <div className="w-full max-w-[384px] rounded-2xl border border-alpha-12 bg-gray-100 p-xl text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-alpha-40">Foundation Console</p>
          <h1 className="mt-sm text-xl font-semibold tracking-tight text-gray-1000">Connect your wallet</h1>
          <p className="mt-xs text-sm text-alpha-60">
            Only the NEAR account that owns a policy can access this page.
          </p>
          <button
            onClick={signIn}
            className="mt-lg w-full rounded-pill border border-gray-500 py-sm text-sm font-medium text-gray-1000 hover:bg-alpha-8 transition-colors"
          >
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  // Extract current policy slug from path
  const slugMatch = pathname?.match(/\/admin\/([^/]+)/);
  const currentSlug =
    slugMatch && slugMatch[1] !== "new" ? slugMatch[1] : undefined;
  const currentPolicy = policies.find((p) => slugOf(p.name) === currentSlug);

  const isProjectSubpage = !!currentSlug;
  const isCriteriaPage = pathname?.endsWith("/criteria");

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="flex w-[260px] shrink-0 flex-col border-r border-alpha-12 bg-gray-100">
        {/* Logo */}
        <div className="flex h-16 items-center px-lg border-b border-alpha-12">
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
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-sm py-md">
          <p className="px-sm text-[11px] font-medium uppercase tracking-wider text-alpha-40">
            Your Projects
          </p>
          <div className="mt-xs space-y-0.5">
            {policies.map((p) => {
              const slug = slugOf(p.name);
              const active = currentSlug === slug;
              return (
                <Link
                  key={p.id}
                  href={`/admin/${slug}`}
                  className={`flex items-center gap-sm rounded-lg px-sm py-[10px] text-sm transition-colors ${
                    active
                      ? "bg-alpha-8 font-medium text-gray-1000"
                      : "text-alpha-60 hover:bg-alpha-8 hover:text-gray-1000"
                  }`}
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-md border border-alpha-12 bg-gray-150 text-[10px] font-medium text-alpha-60">
                    {p.ticker.charAt(0)}
                  </span>
                  <span className="truncate">{p.name}</span>
                </Link>
              );
            })}
          </div>

          <Link
            href="/admin/new"
            className="mt-sm flex items-center gap-sm rounded-lg px-sm py-[10px] text-sm text-alpha-40 hover:bg-alpha-8 hover:text-gray-1000 transition-colors"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-md border border-dashed border-alpha-20 text-[10px] text-alpha-40">+</span>
            New Project
          </Link>

          {/* Project sub-nav */}
          {isProjectSubpage && currentPolicy && (
            <>
              <div className="my-md h-px bg-alpha-12" />
              <p className="px-sm text-[11px] font-medium uppercase tracking-wider text-alpha-40">
                {currentPolicy.name}
              </p>
              <div className="mt-xs space-y-0.5">
                {[
                  { label: "Dashboard", href: `/admin/${currentSlug}`, active: !isCriteriaPage },
                  { label: "Criteria", href: `/admin/${currentSlug}/criteria`, active: isCriteriaPage },
                ].map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={`block rounded-lg px-sm py-[10px] text-sm transition-colors ${
                      item.active
                        ? "bg-alpha-8 font-medium text-gray-1000"
                        : "text-alpha-60 hover:bg-alpha-8 hover:text-gray-1000"
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </>
          )}
        </nav>

        {/* Account footer */}
        <div className="border-t border-alpha-12 px-sm py-md">
          <p className="px-sm text-[11px] font-medium uppercase tracking-wider text-alpha-40">Account</p>
          {isLoading ? (
            <div className="mt-xs h-8 animate-pulse rounded-lg bg-gray-200" />
          ) : isConnected && accountId ? (
            <div className="mt-xs px-sm">
              <p className="truncate text-sm text-gray-1000">{accountId}</p>
              <button onClick={signOut} className="mt-xs text-xs text-alpha-40 hover:text-status-refund transition-colors">
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={signIn}
              className="mt-xs w-full rounded-lg border border-alpha-12 py-[10px] text-sm font-medium text-alpha-60 hover:bg-alpha-8 transition-colors"
            >
              Connect Wallet
            </button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
