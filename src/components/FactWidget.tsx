'use client';

import { CSSProperties, useEffect, useState } from 'react';
import { CURIOSITIES, type Curiosity } from '@/lib/facts';

const LS_OPEN = 'pjl_fact_open';
const LS_SEEN = 'pjl_fact_seen';
const MAX_PER_DAY = 6;

/* "Dato del día": se actualiza solo. Cada día se arma una baraja pequeña
   (máx. MAX_PER_DAY) de curiosidades distintas, sacadas del pool que crece
   solo con contenido oficial del Vaticano (/api/curiosities). La baraja cambia
   cada día y nunca repite una curiosidad ya vista (vistas en días anteriores
   no vuelven a entrar). */

/** Semilla determinista según la fecha local: distinta cada día y cada año. */
function dailySeed(): number {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const doy = Math.floor((today - startOfYear) / 86400000);
  return doy + now.getFullYear() * 1000;
}

function localYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function readSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_SEEN);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((v): v is string => typeof v === 'string'));
  } catch {
    return new Set();
  }
}

/* ---- Biografía de santos (Wikipedia ES): se resuelve en el navegador. ---- */

const RE_WEEKDAY = /domingo|lunes|martes|miércoles|jueves|viernes|sábado|sabado/i;

function saintName(comm: string): string {
  if (!comm || RE_WEEKDAY.test(comm)) return '';
  let t = comm
    .replace(/^(?:Solemnidad|Fiesta|Memoria|Conmemoración|Dedicación)\s+(?:de|del|de la)?\s*/i, '')
    .trim();
  if (/^(nuestra\s+señora|virgen)/i.test(t)) return /maría/i.test(t) ? 'Virgen María' : (t.split(',')[0].trim() || '');
  t = t.replace(/^\s*(?:san|santo|santa)\s+/i, '');
  t = t.split(',')[0].trim();
  if (!t || t.length > 40 || /^\d/.test(t)) return '';
  return t;
}

const bioCache: Record<string, string> = {};

function shuffleArr<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Una "curiosidad" con sabor a ¿Sabías que?: una frase con números, fechas o
 *  datos biográficos; si no hay, una frase larga; si no, la intro completa. */
function funFact(extract: string): string {
  const sentences = extract.match(/[^.!?\n]+[.!?]+/g) ?? [];
  if (!sentences.length) return extract;
  const long = sentences.filter(s => s.trim().length > 60);
  const hits = long.filter(s => /\d|nac[íi]|mur[íi]|considerad|patr[óo]n|milagr|escrib[íi]|concilio|bas[íi]lic|canoniz/i.test(s));
  const pool = hits.length ? hits : (long.length ? long : sentences);
  const pick = pool[Math.floor(Math.random() * pool.length)] ?? sentences[0] ?? extract;
  return pick.trim().replace(/[.,;:]+\s*$/, '') + '…';
}

async function fetchSaintBio(comm: string): Promise<string> {
  const name = saintName(comm);
  if (!name) return '';
  if (bioCache[comm]) return bioCache[comm];
  const hint = (comm.match(/ap[óo]stol|evangelista|v[íi]rgen|m[áa]rtir|doctora?\b|confesor|abad[a]?\b|obispo|presb[íi]tero|fundador|reina/i) || [])[0] ?? 'santo';
  try {
    const osRes = await fetch(
      `https://es.wikipedia.org/w/api.php?action=opensearch&format=json&limit=10&namespace=0&origin=*&search=${encodeURIComponent(`${name} ${hint}`)}`,
      { cache: 'force-cache' },
    );
    if (!osRes.ok) return '';
    const list = (await osRes.json()) as { [1]?: unknown };
    const titles: string[] = Array.isArray(list?.[1]) ? list[1] as string[] : [];
    if (!titles.length) return '';

    const lower = name.toLowerCase();
    const hintL = hint.toLowerCase();
    let best = '';
    let bestScore = -1;
    titles.forEach((raw) => {
      const t = raw.replace(/_/g, ' ').trim();
      const tl = t.toLowerCase();
      let score = 0;
      if (/^san(t[oa])?\s+/.test(tl)) score += 3;
      if (/\(santo\)|\(santa\)$/.test(tl)) score += 4;
      if (tl.includes('evangelista') || tl.includes('apóstol') || (hint !== 'santo' && tl.includes(hintL))) score += 2;
      if (tl.includes(lower)) score += 1;
      if (tl === lower) score += 5;
      if (score > bestScore) { bestScore = score; best = t; }
    });
    if (!best) return '';

    const sumRes = await fetch(
      `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(best)}`,
      { cache: 'force-cache' },
    );
    if (!sumRes.ok) return '';
    const sum = (await sumRes.json()) as { extract?: unknown };
    const ex = typeof sum?.extract === 'string' ? sum.extract.trim() : '';
    if (ex.length < 60) return '';
    const out = ex.length > 420 ? ex.slice(0, 420).trimEnd().replace(/[.,;:–—-]*$/, '') + '…' : ex;
    bioCache[comm] = out;
    return out;
  } catch {
    return '';
  }
}

export default function FactWidget() {
  const [open, setOpen] = useState(false);
  const [pool, setPool] = useState<Curiosity[]>(CURIOSITIES);
  const [ready, setReady] = useState(false);        /* pool resuelto */
  const [loading, setLoading] = useState(true);     /* fetch en curso */
  const [deck, setDeck] = useState<Curiosity[]>([]); /* baraja de hoy */
  const [deckIdx, setDeckIdx] = useState(0);
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);
  const [bio, setBio] = useState('');          /* biografía del santo visible */
  const [bioLoading, setBioLoading] = useState(false);
  const [variant, setVariant] = useState(0);  /* 0 mini bio · 1 curiosidad · 2 datos */

  /* Precarga el pool (contenido automático del Vaticano + selección base). */
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch(`/api/curiosities?d=${localYmd()}`, { cache: 'no-store' });
        const data = await res.json();
        if (live && Array.isArray(data?.items) && data.items.length > 0) {
          setPool(data.items as Curiosity[]);
        }
      } catch { /* fallback al pool base */ }
      if (live) {
        setLoading(false);
        setReady(true);
      }
    })();
    return () => { live = false; };
  }, []);

  /* Hidratación: preferencia abierta + registro de vistos. */
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_OPEN);
      // En el primer ingreso se muestra la curiosidad; luego respeta lo guardado.
      setOpen(stored === null ? true : stored === '1');
    } catch {
      setOpen(true);
    }
    setSeen(readSeen());
    setHydrated(true);
  }, []);

  /* Baraja de hoy: 1 por tema (sin repetir), aleatoria por dispositivo,
     nunca repite vistos. Si un tema se agotó, la baraja es más corta. */
  useEffect(() => {
    if (!hydrated || !ready) return;
    let list = readSeen();
    if (list.size >= pool.length) list = new Set();

    const byCat: Record<string, Curiosity[]> = {};
    pool.forEach((c) => {
      if (!list.has(c.id)) {
        (byCat[c.cat] ??= []).push(c);
      }
    });

    const today: Curiosity[] = [];
    for (const cat of shuffleArr(Object.keys(byCat))) {
      if (today.length >= MAX_PER_DAY) break;
      today.push(shuffleArr(byCat[cat])[0]); // uno por tema, nunca dos iguales
    }
    if (today.length === 0) today.push(pool[Math.floor(Math.random() * pool.length)]);

    setDeck(today);
    setDeckIdx(0);
    const mark = new Set([...list, ...today.map(c => c.id)]);
    setSeen(mark);
    try {
      localStorage.setItem(LS_SEEN, JSON.stringify([...mark]));
    } catch { /* sin almacenamiento local */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hydrated]);

  /* Guarda la preferencia de panel abierto/cerrado. */
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_OPEN, open ? '1' : '0');
    } catch { /* sin almacenamiento local */ }
  }, [open, hydrated]);

  /* Contenido variable del santo visible: elige al azar (por dispositivo) entre
     Mini biografía (0), Curiosidad/¿Sabías que? (1) o Datos (2). */
  useEffect(() => {
    const current = deck[deckIdx];
    const v = Math.floor(Math.random() * 3);
    setVariant(v);
    if (!current || current.cat !== 'Santos') {
      setBio('');
      setBioLoading(false);
      return;
    }
    if (!current.comm || v === 2) { // "Datos" no necesita Wikipedia
      setBio('');
      setBioLoading(false);
      return;
    }
    if (bioCache[current.comm]) {
      setBio(bioCache[current.comm]);
      setBioLoading(false);
      return;
    }
    let live = true;
    setBio('');
    setBioLoading(true);
    fetchSaintBio(current.comm).then((b) => {
      if (!live) return;
      setBio(b);
      setBioLoading(false);
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckIdx, deck, hydrated]);

  if (!hydrated) return null;

  const fact = deck[deckIdx];
  if (!fact) return null;

  const step = (dir: 1 | -1) => {
    if (deck.length < 2) return;
    setDeckIdx(i => (i + dir + deck.length) % deck.length);
  };

  const shuffle = () => {
    if (deck.length < 2) return;
    let j: number;
    do { j = Math.floor(Math.random() * deck.length); } while (j === deckIdx);
    setDeckIdx(j);
  };

  return (
    <div className={`fact-widget ${open ? 'is-open' : ''} is-hydrated`}>
      <button
        type="button"
        className="fact-chip"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label={open ? 'Ocultar dato curioso' : 'Mostrar dato curioso'}
      >
        <span className="fact-chip-halo" aria-hidden="true" />
        <span className="fact-chip-ico" aria-hidden="true">📜</span>
        <span className="fact-chip-txt">Dato del día</span>
      </button>

      <section
        className="fact-panel"
        aria-hidden={!open}
        style={{ '--fact-acc': fact.color } as CSSProperties}
      >
        <button type="button" className="fact-close" onClick={() => setOpen(false)} aria-label="Cerrar dato">
          ✕
        </button>

        <header className="fact-head">
          <span className="fact-badge" aria-hidden="true">{fact.ico} {fact.cat}</span>
          <div className="fact-ctrl">
            <button type="button" className="fact-nav" onClick={() => step(-1)} aria-label="Curiosidad anterior de hoy">‹</button>
            <button type="button" className="fact-nav fact-nav-rand" onClick={shuffle} aria-label="Otra curiosidad de hoy" title="Otra de hoy">⤮</button>
            <button type="button" className="fact-nav" onClick={() => step(1)} aria-label="Curiosidad siguiente de hoy">›</button>
          </div>
        </header>

        <div className="fact-scroll">
          {loading ? (
            <div className="fact-loading" aria-live="polite">
              <span className="fact-loading-spin" aria-hidden="true" />
              Cargando curiosidades del Vaticano…
            </div>
          ) : (
            <div className="fact-body" key={fact.id}>
              <h4 className="fact-title">{fact.title}</h4>
              {fact.cat === 'Santos' && fact.day && (
                <p className="fact-sub">{fact.day}</p>
              )}
              {fact.cat !== 'Santos' ? (
                <p className="fact-text">{fact.body}</p>
              ) : variant !== 2 && (bio || bioLoading) ? (
                <>
                  <span className="fact-vlabel">{variant === 0 ? 'Mini biografía' : '¿Sabías que?'}</span>
                  {bioLoading ? (
                    <p className="fact-bio" aria-live="polite">Cargando…</p>
                  ) : (
                    <p className="fact-bio">{variant === 0 ? bio : funFact(bio)}</p>
                  )}
                </>
              ) : (
                <>
                  <span className="fact-vlabel">Datos</span>
                  <p className="fact-text">{fact.body}</p>
                </>
              )}
            </div>
          )}
        </div>

        <footer className="fact-foot">
          <span className="fact-count">Dato {deckIdx + 1} de {deck.length}</span>
          {fact.link ? (
            <a className="fact-src" href={fact.link} target="_blank" rel="noreferrer">
              Fuente: {fact.src} <span aria-hidden="true">↗</span>
            </a>
          ) : (
            <span className="fact-src">Fuente: {fact.src}</span>
          )}
        </footer>
      </section>
    </div>
  );
}