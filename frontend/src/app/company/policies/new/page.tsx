"use client";

import { useState } from "react";
import { useWallet } from "@/contexts/WalletContext";
import { useRouter } from "next/navigation";

interface FormErrors {
  natural_language?: string;
  ipfs_cid?: string;
  token_contract?: string;
  total_allocation?: string;
  price_per_token?: string;
  subscription_start?: string;
  subscription_end?: string;
  live_end?: string;
}

export default function RegisterPolicyPage() {
  const { isConnected, signIn } = useWallet();
  const router = useRouter();

  const [naturalLanguage, setNaturalLanguage] = useState("");
  const [ipfsCid, setIpfsCid] = useState("");
  const [tokenContract, setTokenContract] = useState("");
  const [totalAllocation, setTotalAllocation] = useState("");
  const [pricePerToken, setPricePerToken] = useState("");
  const [subscriptionStart, setSubscriptionStart] = useState("");
  const [subscriptionEnd, setSubscriptionEnd] = useState("");
  const [liveEnd, setLiveEnd] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate(): FormErrors {
    const errs: FormErrors = {};

    if (naturalLanguage.length < 20) errs.natural_language = "Minimum 20 characters required";
    if (naturalLanguage.length > 2000) errs.natural_language = "Maximum 2000 characters";

    if (ipfsCid && !/^ba[a-z0-9]{56,}$/.test(ipfsCid) && !/^Qm[A-Za-z0-9]{44}$/.test(ipfsCid)) {
      errs.ipfs_cid = "Invalid IPFS CID format";
    }

    if (!tokenContract.includes(".")) errs.token_contract = "Must be a valid NEAR account (e.g. token.near)";
    if (!totalAllocation || Number(totalAllocation) <= 0) errs.total_allocation = "Must be greater than 0";
    if (!pricePerToken || Number(pricePerToken) <= 0) errs.price_per_token = "Must be greater than 0";

    const start = new Date(subscriptionStart).getTime();
    const end = new Date(subscriptionEnd).getTime();
    const live = new Date(liveEnd).getTime();
    const now = Date.now();

    if (!subscriptionStart) errs.subscription_start = "Required";
    else if (start <= now) errs.subscription_start = "Must be in the future";

    if (!subscriptionEnd) errs.subscription_end = "Required";
    else if (end <= start + 3600000) errs.subscription_end = "Must be at least 1 hour after start";

    if (!liveEnd) errs.live_end = "Required";
    else if (live <= end) errs.live_end = "Must be after subscription end";

    return errs;
  }

  async function handleSubmit() {
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setIsSubmitting(true);

    // Mock: simulate contract call
    await new Promise((r) => setTimeout(r, 1500));
    const mockPolicyId = Math.floor(Math.random() * 1000);

    setIsSubmitting(false);
    router.push(`/company/policies/${mockPolicyId}`);
  }

  if (!isConnected) {
    return (
      <main className="flex-1">
        <div className="mx-auto max-w-[800px] px-lg py-3xl text-center">
          <h1 className="text-2xl font-semibold text-gray-1000">Register Policy</h1>
          <p className="mt-md text-sm text-alpha-40">Connect your NEAR wallet to register a policy.</p>
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

  return (
    <main className="flex-1">
      <div className="mx-auto max-w-[800px] px-lg py-xl">
        {/* Header */}
        <h1 className="text-2xl font-semibold text-gray-1000">Register Policy</h1>
        <p className="mt-xs text-sm text-alpha-40">Define your investor selection criteria and IDO sale conditions.</p>

        <div className="mt-xl space-y-xl">
          {/* Natural Language Policy */}
          <section className="rounded-2xl border border-alpha-12 bg-[#1a1a1a] p-lg">
            <h2 className="text-base font-medium text-gray-1000">Selection Criteria</h2>
            <p className="mt-xs text-xs text-alpha-40">Describe the type of investors you want in natural language.</p>
            <div className="mt-md">
              <textarea
                value={naturalLanguage}
                onChange={(e) => setNaturalLanguage(e.target.value)}
                placeholder="e.g. Long-term NEAR holders who have held NEAR for at least 90 days and have at least 3 on-chain transactions. Prefer holders with DAO participation."
                rows={5}
                className="w-full resize-none rounded-[10px] border border-alpha-12 bg-gray-150 px-md py-sm text-sm text-gray-1000 placeholder:text-alpha-20 focus:border-neon-glow/40 focus:outline-none"
              />
              <div className="mt-xs flex items-center justify-between text-xs">
                <span className={naturalLanguage.length < 20 ? "text-status-refund" : "text-alpha-40"}>
                  {naturalLanguage.length < 20 ? `${20 - naturalLanguage.length} more characters needed` : ""}
                </span>
                <span className={naturalLanguage.length > 2000 ? "text-status-refund" : "text-alpha-40"}>
                  {naturalLanguage.length} / 2,000
                </span>
              </div>
              {errors.natural_language && <p className="mt-xs text-xs text-status-refund">{errors.natural_language}</p>}
            </div>
          </section>

          {/* IPFS CID */}
          <section className="rounded-2xl border border-alpha-12 bg-[#1a1a1a] p-lg">
            <h2 className="text-base font-medium text-gray-1000">IPFS Reference</h2>
            <p className="mt-xs text-xs text-alpha-40">Optional. Provide a CID to your criteria document on IPFS.</p>
            <div className="mt-md">
              <input
                type="text"
                value={ipfsCid}
                onChange={(e) => setIpfsCid(e.target.value)}
                placeholder="bafybei... or Qm..."
                className="w-full rounded-[10px] border border-alpha-12 bg-gray-150 px-md py-sm text-sm text-gray-1000 placeholder:text-alpha-20 focus:border-neon-glow/40 focus:outline-none"
              />
              {errors.ipfs_cid && <p className="mt-xs text-xs text-status-refund">{errors.ipfs_cid}</p>}
            </div>
          </section>

          {/* Sale Config */}
          <section className="rounded-2xl border border-alpha-12 bg-[#1a1a1a] p-lg">
            <h2 className="text-base font-medium text-gray-1000">Sale Configuration</h2>
            <p className="mt-xs text-xs text-alpha-40">Define your IDO token sale parameters.</p>

            <div className="mt-md grid gap-md md:grid-cols-2">
              <Field
                label="Token Contract"
                value={tokenContract}
                onChange={setTokenContract}
                placeholder="token.near"
                error={errors.token_contract}
              />
              <Field
                label="Total Allocation"
                value={totalAllocation}
                onChange={setTotalAllocation}
                placeholder="1000000"
                type="number"
                suffix="tokens"
                error={errors.total_allocation}
              />
              <Field
                label="Price per Token"
                value={pricePerToken}
                onChange={setPricePerToken}
                placeholder="0.001"
                type="number"
                suffix="NEAR"
                error={errors.price_per_token}
              />
              <div /> {/* spacer */}

              <Field
                label="Subscription Start"
                value={subscriptionStart}
                onChange={setSubscriptionStart}
                type="datetime-local"
                error={errors.subscription_start}
              />
              <Field
                label="Subscription End"
                value={subscriptionEnd}
                onChange={setSubscriptionEnd}
                type="datetime-local"
                error={errors.subscription_end}
              />
              <Field
                label="Live End"
                value={liveEnd}
                onChange={setLiveEnd}
                type="datetime-local"
                error={errors.live_end}
              />
            </div>

            <p className="mt-md text-xs text-alpha-40">
              Payment token: <span className="text-gray-1000">NEAR</span> (MVP)
            </p>
          </section>

          {/* Actions */}
          <div className="flex items-center justify-end gap-sm">
            <button
              onClick={() => router.push("/company/policies")}
              className="rounded-[10px] border border-alpha-12 bg-gray-150 px-xl py-sm text-sm font-medium text-alpha-60 transition-colors hover:bg-alpha-8"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="rounded-[10px] bg-neon-glow px-xl py-sm text-sm font-medium text-gray-0 transition-colors hover:bg-neon-soft disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Registering..." : "Register Policy"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  suffix,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  suffix?: string;
  error?: string;
}) {
  return (
    <div>
      <label className="mb-xs block text-xs font-medium text-alpha-40">{label}</label>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-[10px] border border-alpha-12 bg-gray-150 px-md py-sm text-sm text-gray-1000 placeholder:text-alpha-20 focus:border-neon-glow/40 focus:outline-none"
        />
        {suffix && (
          <span className="absolute right-md top-1/2 -translate-y-1/2 text-xs text-alpha-40">{suffix}</span>
        )}
      </div>
      {error && <p className="mt-xs text-xs text-status-refund">{error}</p>}
    </div>
  );
}
