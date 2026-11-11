import type { MetadataRoute } from "next";

/**
 * What search engines should index.
 *
 * Three pages: the landing page, the quiz, and the roadmap. The quiz's result
 * views are client-rendered and personal (they live in a permalink param), so
 * listing them here would hand a crawler thousands of near-duplicate URLs for
 * data it cannot attribute anyway. The Museum pages, once phase 3 lands, belong
 * here — that is the whole point of that phase.
 *
 * The base URL is hard-coded like the other absolute links in the app
 * (`theocompass.com` in the export frame and the quiz footer); a sitemap has to
 * be absolute, and this is the single deployment.
 */
const BASE_URL = "https://theocompass.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    { url: `${BASE_URL}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    {
      url: `${BASE_URL}/christian-denominations`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/roadmap`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.6,
    },
  ];
}
