import type { Metadata } from "next";
import { RoadmapExplorer } from "./_components/_RoadmapExplorer";

/**
 * The detailed roadmap.
 *
 * The landing page keeps three curated milestones - Beta, Official launch and
 * Extensions - and both pages read them from `lib/roadmap.ts`; this page is the
 * whole build plan, phase by phase, task by task, with the real statuses. It is
 * a client component below this shell because the list is fetched from the
 * worker and can be edited in place by a moderator.
 */

export const metadata: Metadata = {
  title: "Roadmap | TheoCompass",
  description:
    "The full TheoCompass build plan: every phase and task, what is live today, and what is next.",
  openGraph: {
    title: "Roadmap | TheoCompass",
    description:
      "The full TheoCompass build plan: every phase and task, what is live today, and what is next.",
    siteName: "TheoCompass",
    type: "website",
  },
};

export default function RoadmapPage() {
  return <RoadmapExplorer />;
}
