import type { Phase } from "@/types";

interface ProjectHeroProps {
  name: string;
  ticker: string;
  phase: Phase;
  description: string;
  chains: string[];
  socials: string[];
  extraLink?: { label: string; href: string };
}

export default function ProjectHero({ name, ticker, phase, description, chains, socials, extraLink }: ProjectHeroProps) {
  const dotColor: Record<Phase, string> = {
    Upcoming: "bg-status-upcoming shadow-[0_0_16px_rgba(107,163,255,0.6)]",
    Subscribing: "bg-neon-glow shadow-[0_0_16px_rgba(200,255,0,0.6)]",
    Live: "bg-status-refund shadow-[0_0_16px_rgba(255,77,109,0.6)]",
    Closed: "bg-gray-600",
  };
  const textColor: Record<Phase, string> = {
    Upcoming: "text-status-upcoming",
    Subscribing: "text-neon-glow",
    Live: "text-status-refund",
    Closed: "text-gray-700",
  };

  return (
    <div className="flex items-start gap-lg">
      <div className="flex h-[80px] w-[80px] shrink-0 items-center justify-center rounded-[18px] border border-alpha-20 bg-gray-300 text-[36px] font-medium text-gray-1000">
        {ticker.charAt(0)}
      </div>
      <div className="flex flex-1 flex-col gap-[14px]">
        <div className="flex items-center gap-md">
          <h1 className="text-[40px] font-medium leading-[56px] text-gray-1000">{name}</h1>
          <span className="inline-flex items-center gap-2 rounded-pill border border-alpha-20 bg-gray-200 px-[14px] py-[8px]">
            <span className={`h-2 w-2 rounded-full ${dotColor[phase]}`} />
            <span className={`text-sm font-medium ${textColor[phase]}`}>{phase}</span>
          </span>
        </div>
        <p className="max-w-[760px] text-[18px] leading-[1.6] text-alpha-60">{description}</p>
        <div className="flex items-center gap-md">
          <div className="flex items-center gap-2">
            {chains.map((tag) => (
              <span key={tag} className="rounded-pill border border-alpha-20 bg-gray-200 px-[10px] py-[5px] text-xs font-medium text-alpha-60">{tag}</span>
            ))}
          </div>
          <span className="text-sm text-alpha-40">·</span>
          <div className="flex items-center gap-2">
            {socials.map((s) => (
              <span key={s} className="flex h-7 w-7 items-center justify-center rounded-full border border-alpha-20 bg-gray-200 text-xs text-alpha-40">{s}</span>
            ))}
          </div>
          {extraLink && (
            <>
              <span className="text-sm text-alpha-40">·</span>
              <a href={extraLink.href} className="text-sm font-medium text-neon-glow transition-colors hover:text-neon-soft">
                {extraLink.label} →
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
