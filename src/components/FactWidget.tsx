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

export default function FactWidget() {
  const [open, setOpen] = useState(false);
  const [pool, setPool] = useState<Curiosity[]>(CURIOSITIES);
  const [ready, setReady] = useState(false);        /* pool resuelto */
  const [loading, setLoading] = useState(true);     /* fetch en curso */
  const [deck, setDeck] = useState<Curiosity[]>([]); /* baraja de hoy */
  const [deckIdx, setDeckIdx] = useState(0);
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);

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

  /* Baraja de hoy: máx. MAX_PER_DAY curiosidades distintas, sin repetir vistas. */
  useEffect(() => {
    if (!hydrated || !ready) return;
    let list = readSeen();
    if (list.size >= pool.length) list = new Set();

    const seed = dailySeed();
    const stride = 5 + (seed % 3);                 // 5, 6 o 7; cambia cada día
    const start = seed % pool.length;

    const today: Curiosity[] = [];
    for (let k = 0; today.length < MAX_PER_DAY && k <= pool.length * stride; k += stride) {
      const item = pool[(start + k) % pool.length];
      if (!list.has(item.id) && !today.some(c => c.id === item.id)) today.push(item);
    }
    if (today.length === 0) today.push(pool[start % pool.length]); // todo visto: ciclo nuevo

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

  if (!hydrated) return null;

  const fact = deck[deckIdx];
  if (!fact) return null;

  const remaining = Math.max(0, pool.length - seen.size);

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
              <p className="fact-text">{fact.body}</p>
            </div>
          )}
        </div>

        <footer className="fact-foot">
          {remaining > 0 ? (
            <span className="fact-count">
              Hoy {deckIdx + 1}/{deck.length} · {remaining} sin ver
            </span>
          ) : (
            <span className="fact-count">¡Completaste las {pool.length}! 🔄 Vuelvo a empezar</span>
          )}
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