type Status = "Upcoming" | "Open" | "Live" | "Closed";

const statusConfig: Record<Status, { dot: string; text: string; bg: string }> = {
  Upcoming: { dot: "bg-status-upcoming", text: "text-status-upcoming", bg: "bg-status-upcoming/10" },
  Open: { dot: "bg-neon-glow", text: "text-neon-glow", bg: "bg-neon-glow/10" },
  Live: { dot: "bg-status-refund", text: "text-status-refund", bg: "bg-status-refund/10" },
  Closed: { dot: "bg-gray-600", text: "text-gray-700", bg: "bg-alpha-8" },
};

export default function StatusBadge({ status }: { status: Status }) {
  const config = statusConfig[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-medium ${config.bg} ${config.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {status}
    </span>
  );
}
