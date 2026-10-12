import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://clothing-store-sky-codein.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/account", "/admin", "/lister", "/checkout", "/orders"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
