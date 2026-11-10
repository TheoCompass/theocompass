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
