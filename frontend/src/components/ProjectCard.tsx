import Link from "next/link";
import StatusBadge from "./StatusBadge";

type Status = "Upcoming" | "Open" | "Live" | "Closed";

interface ProjectCardProps {
  slug: string;
  name: string;
  ticker: string;
  description: string;
  status: Status;
  meta: Record<string, string>;
  audiences?: string[];
}

export default function ProjectCard({
  slug,
  name,
  ticker,
  description,
  status,
  meta,
  audiences,
}: ProjectCardProps) {
  const buttonLabel =
    status === "Upcoming"
      ? "Notify Me"
      : status === "Open"
        ? "Subscribe"
        : status === "Live"
          ? "View Details"
          : "View Details";

  const buttonStyle =
    status === "Open"
      ? "bg-neon-glow text-gray-0 hover:bg-neon-soft"
      : status === "Live"
        ? "border border-neon-glow text-neon-glow hover:bg-neon-glow/10"
        : "bg-gray-300 text-gray-900 hover:bg-gray-400";

  return (
    <Link
      href={`/projects/${slug}`}
      className="group flex flex-col rounded-xl border border-border bg-surface p-lg transition-colors hover:border-gray-500"
    >
      <div className="mb-md flex items-center gap-sm">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gray-300 text-sm font-semibold text-gray-900">
          {ticker.charAt(0)}
        </div>
        <h3 className="text-base font-medium text-gray-1000">{name}</h3>
        <StatusBadge status={status} />
      </div>

      <p className="mb-lg text-sm leading-relaxed text-gray-700 line-clamp-3">
        {description}
      </p>

      {audiences && audiences.length > 0 && (
        <div className="mb-lg">
          <p className="mb-xs text-xs font-medium uppercase tracking-wider text-gray-600">
            Target Audience
          </p>
          <ul className="space-y-1">
            {audiences.map((a) => (
              <li key={a} className="flex items-center gap-xs text-sm text-gray-800">
                <span className="text-gray-600">•</span>
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-auto space-y-2 border-t border-border pt-md">
        {Object.entries(meta).map(([label, value]) => (
          <div key={label} className="flex items-center justify-between text-sm">
            <span className="text-gray-600">{label}</span>
            <span className="font-medium text-gray-900">{value}</span>
          </div>
        ))}
      </div>

      <button
        className={`mt-lg w-full rounded-lg py-2.5 text-sm font-medium transition-colors ${buttonStyle}`}
      >
        {buttonLabel}
      </button>
    </Link>
  );
}
