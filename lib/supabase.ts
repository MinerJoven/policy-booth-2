import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getPolicyTableName,
  getPolicyReviewTableName,
  getSupabasePublishableKey,
  getSupabaseSecretKey,
  getSupabaseUrl
} from "@/lib/supabase-config";

let publicClient: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;

export function getPoliciesTable() {
  return getPolicyTableName();
}

export function getPolicyReviewsTable() {
  return getPolicyReviewTableName();
}

export function getSupabasePublicClient() {
  const url = getSupabaseUrl();
  const key = getSupabasePublishableKey();

  if (!url || !key) {
    return null;
  }

  if (!publicClient) {
    publicClient = createClient(url, key);
  }

  return publicClient;
}

export function getSupabaseAdminClient() {
  const url = getSupabaseUrl();
  const key = getSupabaseSecretKey();

  if (!url || !key) {
    return null;
  }

  if (!adminClient) {
    adminClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }

  return adminClient;
}
