import Link from "next/link";
import StatusBadge from "./StatusBadge";
import type { PolicyData } from "@/lib/mock/policies";

export default function CompanyPolicyCard({ policy }: { policy: PolicyData }) {
  const title = policy.natural_language.length > 60
    ? policy.natural_language.slice(0, 60) + "..."
    : policy.natural_language;

  const alloc = Number(policy.sale_config.total_allocation).toLocaleString();
  const startDate = new Date(policy.sale_config.subscription_start).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const endDate = new Date(policy.sale_config.subscription_end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <Link
      href={`/company/policies/${policy.id}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-alpha-12 bg-[#1a1a1a] p-lg transition-colors hover:border-alpha-20"
    >
      {/* gradient overlay */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-gray-200 from-[16%] to-gray-0 opacity-60" />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-alpha-12 bg-gray-150 text-base font-medium text-alpha-60">
            {policy.sale_config.token_contract.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-base font-medium text-gray-1000">{policy.sale_config.token_contract.split(".")[0]}</p>
            <p className="text-[11px] text-alpha-40">Policy #{policy.id}</p>
          </div>
        </div>
        <StatusBadge phase={policy.status} />
      </div>

      {/* Description */}
      <p className="relative z-10 mt-sm text-sm leading-relaxed text-alpha-60" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
        {title}
      </p>

      {/* Divider */}
      <div className="relative z-10 my-md h-px bg-alpha-12" />

      {/* Stats */}
      <div className="relative z-10 space-y-[10px]">
        <Row label="Allocation" value={`${alloc} tokens`} />
        <Row label="Period" value={`${startDate} — ${endDate}`} />
        {policy.subscribers != null && <Row label="Subscribers" value={policy.subscribers.toLocaleString()} />}
        {policy.progress != null && (
          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-alpha-40">Progress</span>
              <span className="font-medium text-neon-glow">{policy.progress.toLocaleString()}%</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-alpha-12">
              <div
                className="h-full rounded-full bg-neon-glow transition-all"
                style={{ width: `${Math.min(policy.progress, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-alpha-40">{label}</span>
      <span className="font-medium text-gray-1000">{value}</span>
    </div>
  );
}
