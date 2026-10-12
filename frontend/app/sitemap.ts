import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://clothing-store-sky-codein.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPaths = ["", "/shop", "/about", "/contact", "/policies"];
  return staticPaths.map((path) => ({
    url: `${BASE_URL}${path}`,
    lastModified: new Date(),
  }));
}
