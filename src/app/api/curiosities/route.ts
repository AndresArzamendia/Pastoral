import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseRouteConfig } from '@/lib/supabaseRoute';
import { CURIOSITIES, type Curiosity } from '@/lib/facts';
import { evgHoyClassify, evgHoyDecode } from '@/lib/vaticanEvangelio';

export const dynamic = 'force-dynamic';

/* ============================================================
   ROTACIÓN GLOBAL "sin repetir en NINGÚN dispositivo"
   ============================================================
   Antes, cada navegador armaba su baraja con un historial LOCAL (localStorage
   de 3 días) → el mismo dato curioso se repetía: entre días y entre aparatos.
   Ahora la API marca en Supabase (tabla pjl_store, patrón de pushServer) los
   ids que YA se sirvieron GLOBALMENTE. El primer origen del día elige un lote
   de exactamente MAX_DAILY (6) datos que ningún dispositivo ha visto, los
   marca como servidos y los devuelve; la caché edge (s-maxage 43200 + ?d=)
   hace que durante ese día TODOS los dispositivos reciban el MISMO lote de 6.
   Al agotarse el catálogo, el ciclo se reinicia. El santo del día (id
   "auto-santo-<ymd>") entra siempre y es único por fecha. */

const STORE_TABLE = 'pjl_store';
const ROTATION_KEY = 'curiosities_rotation';
const MAX_DAILY = 6;
const MAX_CACHE_SECONDS = 43200; /* 12 h: el lote y la liturgia no cambian en el día */

/* Caché del runtime de Cloudflare Workers (caches.default). No existe en Node,
   por eso se accede de forma tipada y con guarda. */
type WorkerCache = {
  match: (req: Request) => Promise<Response | undefined>;
  put: (req: Request, res: Response) => Promise<void>;
};

function workerCache(): WorkerCache | null {
  const c = (globalThis as { caches?: { default?: WorkerCache } }).caches;
  return c?.default ?? null;
}

type RotationState = { ymd: string; servedIds: string[]; batchIds: string[] };

async function readRotation(): Promise<RotationState | null> {
  const cfg = getSupabaseRouteConfig();
  if (!cfg) return null;
  const supabase = createClient(cfg.url, cfg.key);
  try {
    const { data, error } = await supabase
      .from(STORE_TABLE)
      .select('value')
      .eq('key', ROTATION_KEY)
      .maybeSingle();
    if (error || !data?.value) return null;
    const v = data.value as RotationState;
    return (v && typeof v.ymd === 'string' && Array.isArray(v.servedIds))
      ? { ymd: v.ymd, servedIds: v.servedIds, batchIds: Array.isArray(v.batchIds) ? v.batchIds : [] }
      : null;
  } catch {
    return null;
  }
}

async function writeRotation(state: RotationState): Promise<boolean> {
  const cfg = getSupabaseRouteConfig();
  if (!cfg) return false;
  const supabase = createClient(cfg.url, cfg.key);
  try {
    const { error } = await supabase
      .from(STORE_TABLE)
      .upsert({ key: ROTATION_KEY, value: state }, { onConflict: 'key' });
    return !error;
  } catch {
    return false; /* sin Supabase: se usa el lote determinista de la fecha */
  }
}

function shuffleArr<T>(arr: T[]): T[] {
  return shuffleWith(arr, Math.random);
}

function shuffleWith<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** PRNG determinista: mismo seed → misma secuencia. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFrom(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Elige hasta n candidatos, un dato por tema (variedad) y, si no alcanzan
 *  temas, completa con los que falten. */
function fillByCategory(candidates: Curiosity[], n: number, rand: () => number): Curiosity[] {
  const out: Curiosity[] = [];
  const byCat = new Map<string, Curiosity[]>();
  candidates.forEach((c) => {
    const arr = byCat.get(c.cat) ?? [];
    arr.push(c);
    byCat.set(c.cat, arr);
  });
  for (const cat of shuffleWith([...byCat.keys()], rand)) {
    if (out.length >= n) break;
    const arr = byCat.get(cat)!;
    out.push(arr[Math.floor(rand() * arr.length)]);
  }
  for (const c of candidates) {
    if (out.length >= n) break;
    if (!out.some((o) => o.id === c.id)) out.push(c);
  }
  return out.slice(0, n);
}

/** Lote GLOBAL del día: EXACTAMENTE MAX_DAILY (6) datos, el mismo para todos
 *  los dispositivos. El santo/liturgia del día del Vaticano entra siempre; los
 *  demás se eligen del catálogo (bloc de notas) y del archivo del Vaticano, sin
 *  repetir ninguno hasta agotar el catálogo (entonces el ciclo se reinicia). */
async function globalDeck(items: Curiosity[], todayYmd: string): Promise<Curiosity[]> {
  const byId = new Map(items.map((c) => [c.id, c]));
  const todaySaintId = `auto-santo-${todayYmd}`;

  /* Lote determinista por fecha: sin memoria global sigue siendo el MISMO en
     todos los dispositivos. Se usa si Supabase no está o no se puede guardar. */
  const deterministic = (): Curiosity[] => {
    const rand = mulberry32(seedFrom(todayYmd));
    const saint = byId.get(todaySaintId);
    const pool = items.filter((c) => c.id !== todaySaintId);
    return saint
      ? [saint, ...fillByCategory(pool, MAX_DAILY - 1, rand)]
      : fillByCategory(pool, MAX_DAILY, rand);
  };

  if (!getSupabaseRouteConfig()) return deterministic();

  const rot = await readRotation();
  const served = new Set<string>(rot ? rot.servedIds : []);
  const save = async (batch: Curiosity[]) => {
    const ok = await writeRotation({
      ymd: todayYmd,
      servedIds: [...new Set([...served, ...batch.map((c) => c.id)])],
      batchIds: batch.map((c) => c.id),
    });
    if (!ok) return deterministic();
    return batch;
  };

  /* Mismo día: se reutiliza el lote ya elegido (idempotente para todos). */
  if (rot && rot.ymd === todayYmd && rot.batchIds.length > 0) {
    const batch = rot.batchIds
      .map((id) => byId.get(id))
      .filter((c): c is Curiosity => !!c);
    if (batch.length >= MAX_DAILY) return batch;
    const chosen = new Set(batch.map((c) => c.id));
    const full = [
      ...batch,
      ...fillByCategory(items.filter((c) => !chosen.has(c.id)), MAX_DAILY - batch.length, Math.random),
    ];
    if (full.length >= MAX_DAILY) return save(full);
  }

  /* Día nuevo: santo de hoy + los no servidos todavía. */
  const saint = byId.get(todaySaintId);
  let pool = items.filter((c) => !served.has(c.id) && c.id !== todaySaintId);
  if (pool.length < MAX_DAILY - 1) {
    served.clear();
    pool = items.filter((c) => c.id !== todaySaintId);
  }
  const batch = saint
    ? [saint, ...fillByCategory(pool, MAX_DAILY - 1, Math.random)]
    : fillByCategory(pool, MAX_DAILY, Math.random);
  return save(batch);
}

const FEED_URL = 'https://www.vaticannews.va/content/vaticannews/es/evangelio-de-hoy.rss.xml';
const SITE_URL = 'https://www.vaticannews.va/es/evangelio-de-hoy.html';
const ARCHIVE_URL = 'https://www.vaticannews.va/es/evangelio-de-hoy';
const PAST_DAYS = 30;

const CONTENT_RE = { next: { revalidate: 1800 } };
const ARCHIVE_RE = { next: { revalidate: 2592000 } };

const decodeEntities = (s: string): string => s
  .replace(/&nbsp;/gi, ' ')
  .replace(/&not;|&shy;|&Enot;/gi, '')
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

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const dayLabel = (d: Date): string =>
  `Se recuerda el ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;

const dayLabelFromYmd = (ymd: string): string => {
  const [y, m, dd] = ymd.split('-').map(Number);
  return `Se recuerda el ${dd} de ${MESES[m - 1]} de ${y}`;
};

/** Título del santo a partir de la conmemoración ("Fiesta de san Mateo, Apóstol
 *  y evangelista" → "San Mateo"; "XXV Domingo Ordinario" → "XXV Domingo Ordinario"). */
const saintTitle = (comm: string): string => {
  if (/^(nuestra\s+señora|virgen)/i.test(comm)) return comm.split(',')[0].trim();
  const t = comm
    .replace(/^(?:Solemnidad|Fiesta|Memoria|Conmemoración|Dedicación)\s+(?:de|del|de la)?\s*/i, '')
    .replace(/^(?:la\s+)?(?:Martirio|Pasión|Conversión|Exaltación|Natividad|Tránsito)\s+(?:de|del|de la)?\s*/i, '')
    .replace(/^(san|santo|santa)\s+/i, (w) => w.charAt(0).toUpperCase() + w.slice(1))
    .split(',')[0]
    .trim();
  return t;
};

/** ¿Ese día se recuerda a un santo con nombre? (ferias, domingos y fiestas del
 *  Señor no cuentan). */
const isSaint = (comm: string): boolean => {
  if (!comm) return false;
  if (/\b(cruz|sant[íi]simo|sagrad|coraz[óo]n|sangre|cristo|eucarist[íi]a|pentecost[ée]s|navidad|epifan[íi]a|c[ée]na del? señor|resurrecci[óo]n)\b/i.test(comm)) return false;
  const t = saintTitle(comm);
  if (!t || /^[1-9]|^\w+\s+de la\s+semana/i.test(t)) return false;
  return /^(san(t[oa])?|nuestra\s+señora|virgen)\s+/i.test(t);
};

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

/* Extra: "Palabras del Papa" del día (cuando el texto viene atribuido). */
type TodayInfo = {
  comm: string; ref: string; excerpt: string; pensamiento: string; link: string;
};

async function readToday(): Promise<TodayInfo> {
  const info: TodayInfo = { comm: '', ref: '', excerpt: '', pensamiento: '', link: SITE_URL };
  try {
    const res = await fetch(FEED_URL, CONTENT_RE);
    if (!res.ok) return info;
    const xml = await res.text();
    const itemSeg = (xml.match(/<item>([\s\S]*?)<\/item>/) || [])[1] ?? '';
    if (!itemSeg) return info;

    const guid = (itemSeg.match(/^\s*<guid>(.*?)<\/guid>/m)?.[1] ?? '').trim();
    info.link = (guid && guid.startsWith('http')) ? guid : SITE_URL;
    const desc = (itemSeg.match(/^\s*<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/m)?.[1] ?? '')
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
    const paragraphs = [...desc.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
      .map((m) => decodeEntities(m[1]))
      .filter((t) => t.length > 0);

    try {
      const pageRes = await fetch(guid, CONTENT_RE);
      if (pageRes.ok) {
        const html = await pageRes.text();
        const m = html.match(/<div class="indicazioneLiturgica">\s*<span[^>]*>([\s\S]*?)<\/span>/);
        if (m) info.comm = stripTags(m[1]);
      }
    } catch { /* opcional */ }

    const sections = evgHoyClassify(paragraphs.map(evgHoyDecode));

    const thoughtSec = sections.find((s) => s.label === 'Pensamiento del día');
    if (thoughtSec && thoughtSec.body.length) info.pensamiento = thoughtSec.body.join(' ');
    if (!info.pensamiento) {
      const evgSec = [...sections].reverse().find((s) => s.label === 'Evangelio');
      if (evgSec && evgSec.body.length) {
        const lastP = evgHoyDecode(evgSec.body[evgSec.body.length - 1]);
        if (lastP.length > 120 && /^[«"“]/.test(lastP)) info.pensamiento = lastP;
      }
    }

    const evgSec = [...sections].reverse().find((s) => s.label === 'Evangelio');
    info.ref = evgSec?.reference ?? '';
    if (evgSec && evgSec.body.length) {
      info.excerpt = evgHoyDecode(evgSec.body[0]).slice(0, 220).trim() + '…';
    }
  } catch { /* si la fuente falla, solo base */ }
  return info;
}

export async function GET(request: Request) {
  /* En workers.dev la respuesta del Worker no pasa por un CDN, así que sin esto
     cada visita repetía los ~32 fetchs al Vaticano y la lectura a Supabase.
     Se cachea en el propio Worker: mismo JSON, mismos headers, mismos 6 datos,
     pero el cálculo se hace una vez cada MAX_CACHE_SECONDS en vez de una vez
     por visitante. La clave incluye ?d= (día), que es lo que ya usa el widget. */
  const cache = workerCache();
  const cacheKey = cache ? new Request(request.url, { method: 'GET' }) : null;
  if (cache && cacheKey) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) return hit;
    } catch { /* sin caché: se sigue el camino normal */ }
  }

  const items: Curiosity[] = [...CURIOSITIES];
  const now = new Date();
  const todayYmd = ymdOf(now);

  const today = await readToday();

  const past = (await Promise.all(
    Array.from({ length: PAST_DAYS }, (_, k) => parseArchivedPage(dayAgo(k + 1))),
  )).filter((p) => isSaint(p.comm));

  if (isSaint(today.comm)) {
    const b = [`Hoy la Iglesia celebra ${today.comm}.`];
    items.push({
      id: `auto-santo-${todayYmd}`,
      cat: 'Santos',
      ico: '🙏',
      color: '#7B5CD6',
      title: saintTitle(today.comm) || 'Santo del día',
      day: dayLabel(now),
      body: b.join('\n\n'),
      comm: today.comm,
      src: 'vatican.va · Liturgia del día',
      link: today.link,
    });
  }

  past.forEach((p) => {
    const body = `Ese día la Iglesia celebra ${p.comm}.`;
    items.push({
      id: `auto-santo-${p.ymd}`,
      cat: 'Santos',
      ico: '🙏',
      color: '#7B5CD6',
      title: saintTitle(p.comm) || 'Santo del día',
      day: dayLabelFromYmd(p.ymd),
      body,
      comm: p.comm,
      src: 'vatican.va · Liturgia del día',
      link: p.link,
    });
  });

  /* Rotación GLOBAL: el mismo lote de 6 para todos los dispositivos, sin
     repetir ninguno hasta agotar el catálogo. El santo del día entra siempre. */
  const rotated = await globalDeck(items, todayYmd);

  const res = NextResponse.json({ ok: true, dateKey: todayYmd, items: rotated }, {
    headers: { 'Cache-Control': `public, s-maxage=${MAX_CACHE_SECONDS}, stale-while-revalidate=604800` },
  });

  if (cache && cacheKey) {
    try {
      await cache.put(cacheKey, res.clone());
    } catch { /* si la caché rechaza la entrada, se devuelve igual */ }
  }
  return res;
}