import type { MetadataRoute } from "next";

import { appUrl } from "@/lib/email";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/help/"], disallow: ["/api/", "/products/", "/dashboard", "/admin"] }],
    sitemap: appUrl("/sitemap.xml"),
  };
}
