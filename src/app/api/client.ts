import { projectId, publicAnonKey } from "/utils/supabase/info";

export const BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-4f0446c0`;

export async function apiCall(
  endpoint: string,
  options: RequestInit = {},
  token?: string | null
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${publicAnonKey}`,
    ...(token ? { "X-Auth-Token": token } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  return fetch(`${BASE_URL}${endpoint}`, { ...options, headers });
}

export async function apiJson<T = any>(
  endpoint: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const res = await apiCall(endpoint, options, token);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data as T;
}

export async function downloadBlob(
  endpoint: string,
  token?: string | null
): Promise<{ blob: Blob; filename: string }> {
  const res = await apiCall(endpoint, {}, token);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Download failed" }));
    throw new Error(err.error || "Download failed");
  }
  const contentDisposition = res.headers.get("Content-Disposition") || "";
  const match = contentDisposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : "download.zip";
  const blob = await res.blob();
  return { blob, filename };
}
