import type { MetadataRoute } from "next";

// Private internal tool: nothing should be indexed.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
