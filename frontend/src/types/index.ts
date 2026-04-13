export type ProjectStatus = "Upcoming" | "Subscribing" | "Open" | "Live" | "Closed";

export interface ProjectMeta {
  slug: string;
  name: string;
  ticker: string;
  description: string;
  status: ProjectStatus;
  meta: Record<string, string>;
  audiences?: string[];
}
