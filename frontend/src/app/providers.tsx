"use client";

import type { ReactNode } from "react";
import { WalletProvider } from "@/contexts/WalletContext";
import { IdentityProvider } from "@/contexts/IdentityContext";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <WalletProvider>
      <IdentityProvider>{children}</IdentityProvider>
    </WalletProvider>
  );
}
