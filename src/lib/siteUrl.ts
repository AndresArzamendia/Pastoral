function toHttps(value: string): string {
  const cleaned = value.trim().replace(/\/+$/, '');
  if (!cleaned) return '';
  return /^https?:\/\//i.test(cleaned) ? cleaned.replace(/^http:\/\//i, 'https://') : `https://${cleaned}`;
}

const SITE_URL = toHttps(process.env.NEXT_PUBLIC_SITE_URL || '');
const VERCEL_PRODUCTION_URL = toHttps(process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL || '');

export function getSiteUrl(): string {
  if (SITE_URL) return SITE_URL;
  if (VERCEL_PRODUCTION_URL) return VERCEL_PRODUCTION_URL;
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

export function siteUrlOf(path = ''): string {
  const base = getSiteUrl();
  const p = path.startsWith('/') ? path : `/${path}`;
  if (!base) return p;
  return `${base}${p}`;
}