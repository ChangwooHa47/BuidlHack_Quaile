import type { Phase } from "@/types";

const phaseConfig: Record<Phase, { dot: string; text: string; glow: string }> = {
  Upcoming: { dot: "bg-status-upcoming", text: "text-status-upcoming", glow: "shadow-[0_0_16px_rgba(107,163,255,0.6)]" },
  Subscribing: { dot: "bg-neon-glow", text: "text-neon-glow", glow: "shadow-[0_0_16px_rgba(200,255,0,0.6)]" },
  Contributing: { dot: "bg-neon-glow", text: "text-neon-glow", glow: "shadow-[0_0_16px_rgba(200,255,0,0.6)]" },
  Refunding: { dot: "bg-status-settlement", text: "text-status-settlement", glow: "shadow-[0_0_16px_rgba(178,166,41,0.6)]" },
  Distributing: { dot: "bg-status-live", text: "text-status-live", glow: "shadow-[0_0_16px_rgba(200,255,0,0.6)]" },
  Closed: { dot: "bg-gray-600", text: "text-gray-700", glow: "" },
};

export default function StatusBadge({ phase }: { phase: Phase }) {
  const config = phaseConfig[phase];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill border border-alpha-12 bg-gray-150 px-2.5 py-[5px]">
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot} ${config.glow}`} />
      <span className={`text-xs font-medium ${config.text}`}>{phase}</span>
    </span>
  );
}
