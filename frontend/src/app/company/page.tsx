"use client";

import { useWallet } from "@/contexts/WalletContext";
import { MOCK_POLICIES } from "@/lib/mock/policies";
import { redirect } from "next/navigation";
import { useEffect } from "react";

export default function CompanyHome() {
  const { isConnected, accountId, isLoading, signIn } = useWallet();

  // Mock: find policy belonging to this foundation
  const myPolicy = MOCK_POLICIES.find((p) => p.foundation === "foundation.testnet");

  useEffect(() => {
    if (!isLoading && isConnected && myPolicy) {
      redirect(`/company/policies/${myPolicy.id}`);
    }
  }, [isLoading, isConnected, myPolicy]);

  if (isLoading) {
    return (
      <main className="flex-1">
        <div className="mx-auto max-w-[800px] px-lg py-3xl text-center">
          <div className="h-6 w-48 mx-auto animate-pulse rounded bg-gray-400" />
        </div>
      </main>
    );
  }

  if (!isConnected) {
    return (
      <main className="flex-1">
        <div className="mx-auto max-w-[800px] px-lg py-3xl text-center">
          <h1 className="text-2xl font-semibold text-gray-1000">Company Dashboard</h1>
          <p className="mt-md text-sm text-alpha-40">Connect your NEAR wallet to manage your project.</p>
          <button
            onClick={signIn}
            className="mt-lg rounded-[10px] bg-neon-glow px-xl py-sm text-base font-medium text-gray-0"
          >
            Connect Wallet
          </button>
        </div>
      </main>
    );
  }

  // No policy yet → redirect to registration
  if (!myPolicy) {
    redirect("/company/policies/new");
  }

  return null;
}
