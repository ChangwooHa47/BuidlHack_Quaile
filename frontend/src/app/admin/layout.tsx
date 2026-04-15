"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@/contexts/WalletContext";
import ConnectedWallet from "@/components/ConnectedWallet";
import StatusBadge from "@/components/StatusBadge";
import { getAllPolicies, type OnChainPolicy } from "@/lib/near/contracts";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { accountId, isConnected, isLoading, signIn, signOut } = useWallet();
  const pathname = usePathname();
  const [policies, setPolicies] = useState<OnChainPolicy[]>([]);

  useEffect(() => {
    getAllPolicies()
      .then((all) => {
        if (accountId) {
          setPolicies(all.filter((p) => p.foundation === accountId));
        } else {
          setPolicies(all);
        }
      })
      .catch(() => {});
  }, [accountId]);

  // Extract current policy slug from path
  const slugMatch = pathname?.match(/\/admin\/(policy-\d+)/);
  const currentSlug = slugMatch?.[1];
  const currentPolicy = policies.find(
    (p) => `policy-${p.id}` === currentSlug,
  );

  const isProjectSubpage = !!currentSlug;
  const isCriteriaPage = pathname?.endsWith("/criteria");

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="flex w-[260px] shrink-0 flex-col border-r border-alpha-12 bg-gray-100">
        {/* Logo */}
        <div className="flex h-16 items-center px-lg border-b border-alpha-12">
          <Link href="/" className="text-xl font-semibold tracking-tight text-gray-1000">
            Qualie.
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-sm py-md">
          <p className="px-sm text-[11px] font-medium uppercase tracking-wider text-alpha-40">
            Your Projects
          </p>
          <div className="mt-xs space-y-0.5">
            {policies.map((p) => {
              const slug = `policy-${p.id}`;
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
