import Link from "next/link";
import StatusBadge from "./StatusBadge";
import type { ProjectMeta, Status } from "@/types";
import { phaseOf } from "@/types";

export default function ProjectCard({
  slug,
  name,
  ticker,
  chain,
  description,
  status,
  saleInfo,
  opens,
  closes,
  audiences,
}: ProjectMeta) {
  const phase = phaseOf(status);

  return (
    <Link
      href={`/projects/${slug}`}
      className="group relative flex min-h-[480px] flex-col overflow-hidden rounded-2xl border border-alpha-12 bg-[#1a1a1a] transition-colors hover:border-alpha-20"
    >
      {/* gradient overlay */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-gray-200 from-[16%] to-gray-0 opacity-60" />

      {/* ── Header ── */}
      <div className="relative z-10 flex items-center gap-sm px-lg pt-lg">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-alpha-12 bg-gray-150 text-base font-medium text-alpha-60">
          {ticker.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-medium text-gray-1000">{name}</p>
          <p className="text-[11px] text-alpha-40">{ticker}{chain ? ` · ${chain}` : ""}</p>
        </div>
        <StatusBadge phase={phase} />
      </div>

      {/* ── Description ── */}
      <div className="relative z-10 px-lg pt-md pb-[20px]">
        <p className="line-clamp-2 text-sm leading-relaxed text-alpha-60">
          {description}
        </p>
      </div>

      {/* ── Divider ── */}
      <div className="relative z-10 mx-lg h-px bg-alpha-12" />

      {/* ── Body ── */}
      <div className="relative z-10 flex-1 px-lg pt-[20px] pb-[20px]">
        {phase === "Upcoming" && (
          <UpcomingBody target={saleInfo.target} opens={opens} closes={closes} audiences={audiences} />
        )}
        {phase === "Subscribing" && (
          <SubscribingBody saleInfo={saleInfo} />
        )}
        {phase === "Contributing" && (
          <SubscribingBody saleInfo={saleInfo} />
        )}
        {(phase === "Refunding" || phase === "Distributing") && (
          <LiveBody saleInfo={saleInfo} />
        )}
        {phase === "Closed" && (
          <ClosedBody saleInfo={saleInfo} />
        )}
      </div>

      {/* ── Divider ── */}
      <div className="relative z-10 mx-lg h-px bg-alpha-12" />

      {/* ── CTA ── */}
      <div className="relative z-10 px-lg pt-[20px] pb-lg">
        <CardCTA status={status} />
      </div>
    </Link>
  );
}

/* ── Upcoming ── */
function UpcomingBody({
  target, opens, closes, audiences,
}: { target: string; opens?: string; closes?: string; audiences?: string[] }) {
  return (
    <div className="space-y-[14px]">
      <InfoRow label="Token Sale Target" value={target} />
      {opens && <InfoRow label="Opens" value={fmtDate(opens)} />}
      {closes && <InfoRow label="Closes" value={fmtDate(closes)} />}
      {audiences && audiences.length > 0 && (
        <div className="pt-1">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-alpha-40">Target Audience</p>
          <ul className="space-y-0.5">
            {audiences.map((a) => (
              <li key={a} className="flex items-center gap-xs text-sm text-alpha-60">
                <span className="text-alpha-40">•</span>{a}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ── Subscribing (Subscription / Pending / Contribution) ── */
function SubscribingBody({ saleInfo }: { saleInfo: ProjectMeta["saleInfo"] }) {
  return (
    <div className="space-y-[14px]">
      <InfoRow label="Target" value={saleInfo.target} />
      {saleInfo.totalSubscription && <InfoRow label="Total Subscription" value={saleInfo.totalSubscription} />}
      {saleInfo.progress != null && <ProgressBar progress={saleInfo.progress} />}
      {saleInfo.subscribers && <InfoRow label="Subscribers" value={saleInfo.subscribers} />}
    </div>
  );
}

/* ── Live (Settlement / Refund / Claim) ── */
function LiveBody({ saleInfo }: { saleInfo: ProjectMeta["saleInfo"] }) {
  return (
    <div className="space-y-[14px]">
      {saleInfo.currentPrice && <InfoRow label="Current Price" value={saleInfo.currentPrice} highlight />}
      {saleInfo.volume24h && <InfoRow label="24h Volume" value={saleInfo.volume24h} />}
      {saleInfo.subscribers && <InfoRow label="Subscribers" value={saleInfo.subscribers} />}
    </div>
  );
}

/* ── Closed ── */
function ClosedBody({ saleInfo }: { saleInfo: ProjectMeta["saleInfo"] }) {
  return (
    <div className="space-y-[14px]">
      {saleInfo.totalRaised && (
        <div>
          <p className="text-xs text-alpha-40">Total raised</p>
          <p className="text-2xl font-semibold text-gray-1000">{saleInfo.totalRaised}</p>
        </div>
      )}
      {saleInfo.subscribers && <InfoRow label="Subscribers" value={saleInfo.subscribers} />}
      {saleInfo.finalPrice && <InfoRow label="Final price" value={saleInfo.finalPrice} />}
    </div>
  );
}

/* ── CTA: 1개 버튼, Status 기반 ── */
function CardCTA({ status }: { status: Status }) {
  const config: Record<Status, { label: string; style: string }> = {
    Upcoming:      { label: "Notify Me",      style: "bg-neon-glow text-gray-0" },
    Subscribing:   { label: "Subscribe",     style: "bg-neon-glow text-gray-0" },
    Contributing:  { label: "Contribute",    style: "bg-neon-glow text-gray-0" },
    Refunding:     { label: "Processing...", style: "bg-gray-150 text-alpha-40 cursor-default" },
    Distributing:  { label: "Claim",         style: "bg-neon-glow text-gray-0" },
    Closed:        { label: "Sale Ended",    style: "bg-gray-150 text-alpha-40 cursor-default" },
  };
  const { label, style } = config[status];
  return (
    <span className={`flex h-[47px] w-full items-center justify-center rounded-[10px] text-base font-medium transition-colors ${style}`}>
      {label}
    </span>
  );
}

/* ── Shared ── */
function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-alpha-40">{label}</span>
      <span className={`text-base font-medium ${highlight ? "text-neon-glow" : "text-gray-1000"}`}>{value}</span>
    </div>
  );
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-alpha-12">
        <div className="h-full rounded-full bg-neon-glow transition-all" style={{ width: `${Math.min(progress, 100)}%` }} />
      </div>
      <p className="mt-1 text-right text-xs font-medium text-neon-glow">{progress.toLocaleString()}%</p>
    </div>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
