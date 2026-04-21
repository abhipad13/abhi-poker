const RAW_API_BASE = (import.meta as any).env.VITE_API_BASE ?? "";
export const API_BASE = String(RAW_API_BASE).replace(/\/$/, "");
export const WS_HTTP_BASE = API_BASE || "";

export async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function httpText(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(`${API_BASE}${url}`, init);
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  return text;
}
