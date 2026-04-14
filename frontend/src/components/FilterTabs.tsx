"use client";

import { useState } from "react";
import ProjectCard from "./ProjectCard";
import type { ProjectMeta, Phase } from "@/types";
import { phaseOf } from "@/types";

const FILTERS: Array<{ label: string; phase: Phase | null }> = [
  { label: "All", phase: null },
  { label: "Upcoming", phase: "Upcoming" },
  { label: "Subscribing", phase: "Subscribing" },
  { label: "Live", phase: "Live" },
  { label: "Closed", phase: "Closed" },
];

export default function FilterTabs({ projects }: { projects: ProjectMeta[] }) {
  const [active, setActive] = useState("All");

  const targetPhase = FILTERS.find((f) => f.label === active)?.phase ?? null;
  const filtered = targetPhase === null
    ? projects
    : projects.filter((p) => phaseOf(p.status) === targetPhase);

  return (
    <>
      <section className="mx-auto max-w-[1200px] px-lg">
        <div className="mx-auto mb-xl flex w-fit items-center gap-1 rounded-pill border border-alpha-12 bg-[#1a1a1a] p-1">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              onClick={() => setActive(f.label)}
              className={`rounded-pill px-[18px] py-[9px] text-sm font-medium transition-colors ${
                f.label === active
                  ? "border border-[#ffffd6]/20 bg-[#070707] py-[10px] text-gray-1000"
                  : "text-alpha-40 hover:text-alpha-60"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-lg pb-3xl">
        <div className="grid gap-lg md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <ProjectCard key={p.slug} {...p} />
          ))}
        </div>
        {filtered.length === 0 && (
          <p className="py-xl text-center text-sm text-gray-600">No projects in this category.</p>
        )}
      </section>
    </>
  );
}
