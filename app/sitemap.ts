import type { MetadataRoute } from "next";
import { CATEGORIES } from "@/lib/constants";
import { mockPolicies } from "@/lib/mock-policies";
import { getSiteUrl } from "@/lib/site-url";
import { encodeSegment } from "@/lib/utils";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getSiteUrl();
  const regions = [...new Set(mockPolicies.map((policy) => policy.regionName))];

  return [
    "",
    "/policies",
    "/search",
    "/about",
    ...mockPolicies.map((policy) => `/policies/${policy.slug}`),
    ...CATEGORIES.map((category) => `/categories/${encodeSegment(category.value)}`),
    ...regions.map((region) => `/regions/${encodeSegment(region)}`)
  ].map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: new Date()
  }));
}
