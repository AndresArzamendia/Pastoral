function toHttps(value: string): string {
  const cleaned = (value || '').trim().replace(/\/+$/, '');
  if (!cleaned) return '';
  return /^https?:\/\//i.test(cleaned) ? cleaned.replace(/^http:\/\//i, 'https://') : `https://${cleaned}`;
}

const DEFAULT_SITE_URL = toHttps('pastoral-henna.vercel.app');

export function siteOrigin(requestUrl?: string): string {
  const custom = toHttps(process.env.NEXT_PUBLIC_SITE_URL || '');
  if (custom) return custom;
  const vercel = toHttps(process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL || '');
  if (vercel) return vercel;
  if (DEFAULT_SITE_URL) return DEFAULT_SITE_URL;
  if (requestUrl) return new URL(requestUrl).origin;
  return '';
}