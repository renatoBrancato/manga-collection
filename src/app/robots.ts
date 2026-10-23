import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

/**
 * L'app è per lo più privata (dashboard dietro login): ai crawler lasciamo
 * indicizzare solo la landing e le collezioni condivise pubblicamente,
 * bloccando dashboard/settings/API, che richiedono comunque autenticazione.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/c/"],
      disallow: ["/dashboard", "/settings", "/api/"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
