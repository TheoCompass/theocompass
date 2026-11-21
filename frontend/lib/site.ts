/**
 * The build's identity, in one place.
 *
 * The version was spelled twice and differently - "v2.0 open beta" on the
 * landing page, "Open beta" in the quiz header - and the downloadable cards
 * carried neither, so a file saved in March and one saved in June looked
 * identical. One constant, four surfaces.
 *
 * `APP_VERSION` changes when the quiz changes; `APP_STAGE` when the project
 * does. The images print both, because a PNG outlives the tab it came from and
 * there is no other way to tell which build produced it.
 */
export const APP_VERSION = "v2.0";
export const APP_STAGE = "Open beta";

/**
 * The day this build shipped, ISO `YYYY-MM-DD`. Bump it with `APP_VERSION`.
 *
 * The landing page and the downloadable cards both print it, so a reader can
 * see the correction cadence the project claims instead of trusting a slogan
 * ("updated weekly"), and no two surfaces can date the same build differently.
 * It is deliberately a fact in the source, not a fetch: the changelog
 * (`app/changelog`) dates commits, not this constant, so the two cannot
 * disagree — and a date that goes stale shows up in review rather than hiding
 * inside prose. A bump of the quiz without a bump here is the bug this
 * constant makes visible.
 */
export const APP_UPDATED = "2026-11-21";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * "21 Nov 2026", formatted by hand rather than through `Intl`.
 *
 * These strings are rendered during the static build and again on hydration; a
 * locale- or ICU-dependent formatter can disagree between the two and trigger a
 * hydration mismatch. Three lookups cannot.
 */
export function formatBuildDate(iso: string = APP_UPDATED): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const [, year, month, day] = match;
  const label = MONTHS[Number(month) - 1];
  if (!label) return iso;
  return `${Number(day)} ${label} ${year}`;
}

/**
 * "November 2026" — the changelog's month headings.
 *
 * Same reason as `formatBuildDate`: a heading built with `toLocaleDateString`
 * would differ between the build and the client and re-render on hydration.
 * It reads the first seven characters of the ISO date, so it never constructs
 * a `Date` and never sees a timezone at all.
 */
export function formatMonthYear(iso: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const [, year, month] = match;
  const label = MONTHS_LONG[Number(month) - 1];
  if (!label) return iso;
  return `${label} ${year}`;
}
