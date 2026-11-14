import type { Metadata } from "next";
import { FeedbackQueuePage } from "./_components/_FeedbackQueue";

/**
 * The feedback queue.
 *
 * Not linked from anywhere, not in the sitemap, and `noindex` here as well: the
 * page is empty without the moderator code, and a crawler that found the URL
 * would index a prompt for a password. The queue itself is fetched in the
 * browser, behind `X-Admin-Code` -- see `theocompass-api/src/feedback.ts`.
 */
export const metadata: Metadata = {
  title: "Feedback queue | TheoCompass",
  description: "Moderator queue for post-quiz feedback.",
  robots: { index: false, follow: false },
};

export default function FeedbackQueueRoute() {
  return <FeedbackQueuePage />;
}
