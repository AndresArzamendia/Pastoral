import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const FEED_URL = 'https://www.vaticannews.va/content/vaticannews/es/evangelio-de-hoy.rss.xml';
const SITE_URL = 'https://www.vaticannews.va/es/evangelio-de-hoy.html';

type FeedItem = {
  title: string;
  link: string;
  pubDate: string;
  commemoration?: string;
  paragraphs: string[];
};

const decodeEntities = (s: string): string => s
  .replace(/&nbsp;/gi, ' ')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/&laquo;/g, '«')
  .replace(/&raquo;/g, '»')
  .replace(/&aacute;/g, 'á').replace(/&Aacute;/g, 'Á')
  .replace(/&eacute;/g, 'é').replace(/&Eacute;/g, 'É')
  .replace(/&iacute;/g, 'í').replace(/&Iacute;/g, 'Í')
  .replace(/&oacute;/g, 'ó').replace(/&Oacute;/g, 'Ó')
  .replace(/&uacute;/g, 'ú').replace(/&Uacute;/g, 'Ú')
  .replace(/&ntilde;/g, 'ñ').replace(/&Ntilde;/g, 'Ñ')
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim();

const CONTENT_RE = { next: { revalidate: 1800 } };

export async function GET() {
  try {
    const res = await fetch(FEED_URL, CONTENT_RE);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();

    const itemSeg = (xml.match(/<item>([\s\S]*?)<\/item>/) || [])[1] ?? '';
    if (!itemSeg) throw new Error('feed sin items');

    const title = (itemSeg.match(/^\s*<title>(.*?)<\/title>/m)?.[1] ?? '').trim();
    const guid = (itemSeg.match(/^\s*<guid>(.*?)<\/guid>/m)?.[1] ?? '').trim();
    const pubDate = (itemSeg.match(/^\s*<pubDate>(.*?)<\/pubDate>/m)?.[1] ?? '').trim();
    const desc = (itemSeg.match(/^\s*<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/m)?.[1] ?? '')
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');

    const paragraphs = [...desc.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
      .map((m) => m[1].trim())
      .filter(Boolean);

    let commemoration = '';
    if (guid) {
      try {
        const pageRes = await fetch(guid, CONTENT_RE);
        if (pageRes.ok) {
          const html = await pageRes.text();
          // La conmemoración/fiesta del día aparece en el bloque "indicazioneLiturgica".
          const m = html.match(/<div class="indicazioneLiturgica">\s*<span[^>]*>([\s\S]*?)<\/span>/);
          if (m) commemoration = decodeEntities(m[1]);
        }
      } catch { /* la conmemoración es opcional */ }
    }

    const item: FeedItem = {
      title,
      link: guid || SITE_URL,
      pubDate,
      ...(commemoration ? { commemoration } : {}),
      paragraphs,
    };

    return NextResponse.json({ ok: true, ...item }, {
      headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=86400' },
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}