/**
 * Resolve API base URL dynamically for any hosting environment or domain.
 * Supports:
 * - Same-domain deployments (Vercel, Netlify, Cloud Run, Render, Railway, Docker, Apache, Nginx)
 * - Decoupled/Cross-domain deployments via VITE_API_URL / VITE_API_BASE_URL / VITE_BACKEND_URL
 */
export function getApiBaseUrl(): string {
  try {
    const env = (import.meta as any)?.env;
    const customUrl = env?.VITE_API_BASE_URL || env?.VITE_API_URL || env?.VITE_BACKEND_URL;
    if (customUrl && typeof customUrl === 'string' && customUrl.trim()) {
      return customUrl.trim().replace(/\/+$/, '');
    }
  } catch {}
  return '';
}

export async function safeJson<T = any>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    const isHtml = text.trim().startsWith('<') || text.includes('<!DOCTYPE') || text.includes('<html');
    let errorMessage = `Server response error (${res.status})`;
    if (isHtml) {
      if (res.status === 404 || res.status === 200) {
        errorMessage = 'Unable to reach backend API. If deployed on a static CDN or custom domain, ensure serverless functions or proxy redirects (/api/*) are active.';
      } else {
        errorMessage = `Server temporary error (${res.status}). Please try again in a moment.`;
      }
    } else if (text && text.trim().length > 0) {
      errorMessage = text.slice(0, 150);
    }
    return {
      success: false,
      error: errorMessage,
    } as unknown as T;
  }
}

export async function apiFetch<T = any>(url: string, options?: RequestInit): Promise<{ ok: boolean; status: number; data: T }> {
  try {
    let resolvedUrl = url;
    if (url.startsWith('/api') || (url.startsWith('/') && !url.startsWith('//'))) {
      const baseUrl = getApiBaseUrl();
      if (baseUrl) {
        resolvedUrl = `${baseUrl}${url}`;
      }
    }

    const res = await fetch(resolvedUrl, options);
    const data = await safeJson<T>(res);
    return { ok: res.ok && (data as any)?.success !== false, status: res.status, data };
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      data: {
        success: false,
        error: err?.message || 'Network connection failed',
      } as unknown as T,
    };
  }
}
