import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

/**
 * Sitemap minima: l'app è per lo più privata (dashboard dietro login), quindi
 * includiamo solo le pagine pubbliche indicizzabili indicate in robots.ts.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return [
    {
      url: base,
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
