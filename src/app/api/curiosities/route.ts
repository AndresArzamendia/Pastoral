import { NextResponse } from 'next/server';
import { CURIOSITIES, type Curiosity } from '@/lib/facts';
import { evgHoyClassify, evgHoyDecode } from '@/lib/vaticanEvangelio';

export const dynamic = 'force-dynamic';

/* Fuentes oficiales del Vaticano (mismo feed ya usado por "Evangelio del día"
   + su archivo histórico por día). El pool crece solo cada día. */
const FEED_URL = 'https://www.vaticannews.va/content/vaticannews/es/evangelio-de-hoy.rss.xml';
const SITE_URL = 'https://www.vaticannews.va/es/evangelio-de-hoy.html';
const ARCHIVE_URL = 'https://www.vaticannews.va/es/evangelio-de-hoy';
const PAST_DAYS = 40;

const CONTENT_RE = { next: { revalidate: 1800 } };
const ARCHIVE_RE = { next: { revalidate: 2592000 } };

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

const stripTags = (s: string): string => decodeEntities(s
  .replace(/<[^>]*>/g, ' ')
  .replace(/<!\[CDATA\[/g, '')
  .replace(/\]\]>/g, ''));

const BOOKS = [
  'Génesis', 'Éxodo', 'Levítico', 'Números', 'Deuteronomio',
  'Josué', 'Jueces', 'Rut', 'Reyes', 'Samuel', 'Crónicas',
  'Esdras', 'Nehemías', 'Tobías', 'Judit', 'Ester', 'Macabeos',
  'Job', 'Salmo', 'Salmos', 'Proverbios', 'Eclesiastés', 'Cantar',
  'Sabiduría', 'Eclesiástico', 'Isaías', 'Jeremías', 'Lamentaciones',
  'Baruc', 'Ezequiel', 'Daniel', 'Oseas', 'Joel', 'Amós', 'Abdías',
  'Jonás', 'Miqueas', 'Nahúm', 'Habacuc', 'Sofonías', 'Hageo',
  'Zacarías', 'Malaquías',
  'Mateo', 'Marcos', 'Lucas', 'Juan', 'Hechos', 'Romanos',
  'Corintios', 'Gálatas', 'Efesios', 'Filipenses', 'Colosenses',
  'Tesalonicenses', 'Timoteo', 'Tito', 'Filemón', 'Hebreos',
  'Santiago', 'Pedro', 'Judas', 'Apocalipsis',
];
const RE_BOOK = new RegExp(`^(?:\\d\\s*)?(?:${BOOKS.join('|')})\\s+\\d`, 'i');

const ymdOf = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const dayAgo = (days: number): Date =>
  new Date(Date.now() - days * 86400000);

/** Saca de una página de archivo de Vatican News: santo/fiesta, referencia del
 *  evangelio y un fragmento de la lectura. Devuelve todo vacío si no hay dato. */
async function parseArchivedPage(d: Date): Promise<{
  ymd: string; comm: string; evgRef: string; evgExcerpt: string; link: string;
}> {
  const ymd = ymdOf(d);
  const url = `${ARCHIVE_URL}/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}.html`;
  const out = { ymd, comm: '', evgRef: '', evgExcerpt: '', link: url };
  try {
    const res = await fetch(url, ARCHIVE_RE);
    if (!res.ok) return out;
    const html = await res.text();

    const cm = html.match(/<div class="indicazioneLiturgica">\s*<span[^>]*>([\s\S]*?)<\/span>/);
    if (cm) out.comm = stripTags(cm[1]);

    const paras = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
      .map((m) => stripTags(m[1]))
      .filter((t) => t.length > 0);

    const refIdxs: number[] = [];
    paras.forEach((t, i) => {
      if (t.length < 42 && !t.includes('http') && RE_BOOK.test(t)) refIdxs.push(i);
    });
    if (refIdxs.length > 0) {
      const last = refIdxs[refIdxs.length - 1];
      out.evgRef = paras[last];
      for (let i = last + 1; i < paras.length; i++) {
        if (paras[i].length > 60 && !RE_BOOK.test(paras[i])) {
          out.evgExcerpt = paras[i].slice(0, 220).trim() + '…';
          break;
        }
      }
    }
  } catch { /* día sin datos: se omite */ }
  return out;
}

export async function GET() {
  /* Pool base: selección de siempre + contenido automático que crece cada día. */
  const items: Curiosity[] = [...CURIOSITIES];
  const now = new Date();
  const todayYmd = ymdOf(now);

  try {
    const res = await fetch(FEED_URL, CONTENT_RE);
    if (res.ok) {
      const xml = await res.text();
      const itemSeg = (xml.match(/<item>([\s\S]*?)<\/item>/) || [])[1] ?? '';
      if (itemSeg) {
        const guid = (itemSeg.match(/^\s*<guid>(.*?)<\/guid>/m)?.[1] ?? '').trim();
        const desc = (itemSeg.match(/^\s*<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/m)?.[1] ?? '')
          .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
        const paragraphs = [...desc.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
          .map((m) => decodeEntities(m[1]))
          .filter((t) => t.length > 0);

        /* Santo / fiesta de hoy (bloque litúrgico de la página oficial). */
        let commemoration = '';
        if (guid) {
          try {
            const pageRes = await fetch(guid, CONTENT_RE);
            if (pageRes.ok) {
              const html = await pageRes.text();
              const m = html.match(/<div class="indicazioneLiturgica">\s*<span[^>]*>([\s\S]*?)<\/span>/);
              if (m) commemoration = stripTags(m[1]);
            }
          } catch { /* opcional */ }
        }

        const sections = evgHoyClassify(paragraphs.map(evgHoyDecode));

        /* Pensamiento del día (palabras del Papa cuando vienen atribuidas). */
        let pensamiento = '';
        const thoughtSec = sections.find((s) => s.label === 'Pensamiento del día');
        if (thoughtSec && thoughtSec.body.length) pensamiento = thoughtSec.body.join(' ');
        if (!pensamiento) {
          const evgSec = [...sections].reverse().find((s) => s.label === 'Evangelio');
          if (evgSec && evgSec.body.length) {
            const lastP = evgHoyDecode(evgSec.body[evgSec.body.length - 1]);
            if (lastP.length > 120 && /^[«"“]/.test(lastP)) pensamiento = lastP;
          }
        }

        /* Evangelio del día: referencia + breve párrafo de la lectura. */
        const evgSec = [...sections].reverse().find((s) => s.label === 'Evangelio');
        const evgRef = evgSec?.reference ?? '';
        let evgExcerpt = '';
        if (evgSec && evgSec.body.length) {
          evgExcerpt = evgHoyDecode(evgSec.body[0]).slice(0, 220).trim() + '…';
        }
        const evgLink = (guid || SITE_URL).startsWith('http') ? (guid || SITE_URL) : SITE_URL;

        if (commemoration.trim().length > 2) {
          items.push({
            id: `auto-santo-${todayYmd}`,
            cat: 'Santos',
            ico: '🙏',
            color: '#7B5CD6',
            title: 'Santo del día',
            body: `Hoy la Iglesia celebra ${commemoration}.\n\nDato tomado automáticamente de la liturgia del día de Vatican News.`,
            src: 'vaticannews.va · Liturgia del día',
            link: evgLink,
          });
        }
        if (evgRef || evgExcerpt) {
          items.push({
            id: `auto-evangelio-${todayYmd}`,
            cat: 'Evangelio del día',
            ico: '📖',
            color: '#2E8B57',
            title: `Evangelio del día · ${evgRef || 'lectura de hoy'}`,
            body: [evgRef && `Lectura del día: ${evgRef}`, evgExcerpt || ''].filter(Boolean).join('\n\n'),
            src: 'vaticannews.va · Lectura del día',
            link: evgLink,
          });
        }
        if (pensamiento) {
          items.push({
            id: `auto-papa-${todayYmd}`,
            cat: 'Palabras del Papa',
            ico: '🗣️',
            color: '#C2443E',
            title: 'Pensamiento del día',
            body: pensamiento.slice(0, 420) + '…',
            src: 'vaticannews.va · Palabra del Papa',
            link: evgLink,
          });
        }
      }
    }
  } catch {
    /* Si la fuente falla, el pool queda solo con la selección base. */
  }

  /* Archivo: santos y evangelios de días anteriores (pool grande y creciente). */
  const past = (await Promise.all(
    Array.from({ length: PAST_DAYS }, (_, k) => parseArchivedPage(dayAgo(k + 1))),
  )).filter((p) => p.comm.trim().length > 2);

  for (const p of past) {
    if (p.comm.trim().length > 2) {
      items.push({
        id: `auto-santo-${p.ymd}`,
        cat: 'Santos',
        ico: '🙏',
        color: '#7B5CD6',
        title: `Santo del día · ${p.ymd.split('-').reverse().join('-')}`,
        body: `Ese día la Iglesia celebra ${p.comm}.\n\nDato tomado automáticamente de la liturgia oficial de ese día (Vatican News).`,
        src: 'vaticannews.va · Liturgia del día',
        link: p.link,
      });
    }
    if (p.evgRef) {
      items.push({
        id: `auto-evangelio-${p.ymd}`,
        cat: 'Evangelio del día',
        ico: '📖',
        color: '#2E8B57',
        title: `Evangelio · ${p.evgRef}`,
        body: [`Lectura de ese día: ${p.evgRef}`, p.evgExcerpt || ''].filter(Boolean).join('\n\n'),
        src: 'vaticannews.va · Lectura del día',
        link: p.link,
      });
    }
  }

  return NextResponse.json({ ok: true, dateKey: todayYmd, items }, {
    headers: { 'Cache-Control': 'public, s-maxage=43200, stale-while-revalidate=604800' },
  });
}