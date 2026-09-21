'use client';

import { CSSProperties, useCallback, useEffect, useState } from 'react';
import { CURIOSITIES, type Curiosity } from '@/lib/facts';

const LS_OPEN = 'pjl_fact_open';
const LS_SEEN = 'pjl_fact_seen';

/* "Dato del día": se actualiza solo. Cada día cambia (rotación por fecha) y
   se alimenta en parte con contenido automático de fuentes oficiales del
   Vaticano (santo del día, evangelio y palabra del Papa vía /api/curiosities).
   Nunca repite uno ya visto hasta completar el conjunto. */

/** Índice determinista según la fecha local: distinto cada día y año. */
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
  const [ready, setReady] = useState(false);      /* pool resuelto (fetch o fallback) */
  const [loading, setLoading] = useState(true);   /* fetch en curso */
  const [idx, setIdx] = useState(0);
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);

  const markSeen = useCallback((id: string) => {
    setSeen(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

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

  /* Elige el dato de hoy una vez que el pool está listo. */
  useEffect(() => {
    if (!ready) return;
    let list = readSeen();
    if (list.size >= pool.length) list = new Set();

    let pick = dailySeed() % pool.length;
    if (list.has(pool[pick].id)) {
      const unseenIdxs = pool.map((_, i) => i).filter(i => !list.has(pool[i].id));
      if (unseenIdxs.length > 0) pick = unseenIdxs[Math.floor(Math.random() * unseenIdxs.length)];
    }
    setIdx(pick);
    setSeen(prev => {
      const next = new Set(prev.size >= pool.length ? [] : prev);
      next.add(pool[pick].id);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_OPEN, open ? '1' : '0');
      localStorage.setItem(LS_SEEN, JSON.stringify([...seen]));
    } catch { /* sin almacenamiento local */ }
  }, [open, seen, hydrated]);

  if (!hydrated) return null;

  const step = (dir: 1 | -1) => {
    for (let k = 1; k < pool.length; k++) {
      const j = (idx + dir * k + pool.length * 2) % pool.length;
      if (!seen.has(pool[j].id)) {
        setIdx(j);
        markSeen(pool[j].id);
        return;
      }
    }
    // Todas vistas: nuevo ciclo, sin mostrar la misma actual.
    let fresh = dailySeed() % pool.length;
    if (pool[fresh].id === pool[idx].id) fresh = (idx + 1) % pool.length;
    setIdx(fresh);
    setSeen(new Set([pool[fresh].id]));
  };

  const shuffle = () => {
    const unseen = pool.map((_, i) => i).filter(i => !seen.has(pool[i].id) && i !== idx);
    if (unseen.length > 0) {
      const j = unseen[Math.floor(Math.random() * unseen.length)];
      setIdx(j);
      markSeen(pool[j].id);
      return;
    }
    let fresh = dailySeed() % pool.length;
    if (pool[fresh].id === pool[idx].id) fresh = (idx + 1) % pool.length;
    setIdx(fresh);
    setSeen(new Set([pool[fresh].id]));
  };

  const fact = pool[idx];
  if (!fact) return null;

  const remaining = pool.length - seen.size;

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
            <button type="button" className="fact-nav" onClick={() => step(-1)} aria-label="Curiosidad previa sin ver">‹</button>
            <button type="button" className="fact-nav fact-nav-rand" onClick={shuffle} aria-label="Otra curiosidad sin ver" title="Otra sin ver">⤮</button>
            <button type="button" className="fact-nav" onClick={() => step(1)} aria-label="Curiosidad siguiente sin ver">›</button>
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
          <span className="fact-count" title={remaining > 0 ? 'Curiosidades aún sin ver' : 'Colección completada: mañana vuelve a empezar'}>
            {remaining > 0 ? `${remaining} sin ver` : `¡Completaste las ${pool.length}! 🔄`}
          </span>
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