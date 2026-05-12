export type RegionLevel = "联邦" | "州" | "市" | "Landkreis";

export type RiskLevel = "low" | "medium" | "high";

export type PolicyStatus =
  | "draft"
  | "published"
  | "unpublished"
  | "expired";

export interface Policy {
  id: string;
  slug: string;
  titleZh: string;
  titleDe: string;
  publisher: string;
  officialUrl: string;
  publishedAt: string;
  effectiveAt?: string;
  regionLevel: RegionLevel;
  regionName: string;
  category: string;
  targetGroups: string[];
  summaryZh: string;
  keyChanges: string[];
  userNotes: string;
  impactZh: string;
  contentZh: string;
  contentDeSummary?: string;
  riskLevel: RiskLevel;
  status: PolicyStatus;
  supersededBy?: string;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyFilters {
  regionLevel?: string;
  regionName?: string;
  category?: string;
  targetGroup?: string;
  days?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: "published_at" | "effective_at" | "risk_level" | "view_count";
  page?: number;
  pageSize?: number;
  query?: string;
  status?: string;
}

export interface PolicyListResult {
  data: Policy[];
  total: number;
  page: number;
  pageSize: number;
}
