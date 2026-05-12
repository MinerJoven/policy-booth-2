import { z } from "zod";

export const policyPayloadSchema = z.object({
  titleZh: z.string().min(2),
  titleDe: z.string().min(2),
  publisher: z.string().min(2),
  officialUrl: z.string().url(),
  publishedAt: z.string().min(8),
  effectiveAt: z.string().optional().or(z.literal("")),
  regionLevel: z.enum(["联邦", "州", "市", "Landkreis"]),
  regionName: z.string().min(1),
  category: z.string().min(1),
  targetGroups: z.array(z.string()).min(1),
  summaryZh: z.string().min(5),
  keyChanges: z.array(z.string().min(1)).min(1),
  userNotes: z.string().min(5),
  impactZh: z.string().min(5),
  contentZh: z.string().min(10),
  contentDeSummary: z.string().optional().or(z.literal("")),
  riskLevel: z.enum(["low", "medium", "high"]),
  status: z.enum(["draft", "published", "unpublished", "expired"])
});
