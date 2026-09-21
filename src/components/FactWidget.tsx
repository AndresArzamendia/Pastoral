'use client';

import { CSSProperties, useCallback, useEffect, useState } from 'react';
import { CURIOSITIES } from '@/lib/facts';

const LS_OPEN = 'pjl_fact_open';
const LS_SEEN = 'pjl_fact_seen';

/* Dato de cada día: cambia por día (rotación determinista por fecha) y
   nunca repite uno ya visto, hasta completar la colección (reinicia ciclo). */

/** Índice determinista según la fecha local: distinto cada día y año. */
function dailyFactIndex(): number {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const doy = Math.floor((today - startOfYear) / 86400000);
  const seed = doy + now.getFullYear() * 1000;
  return ((seed % CURIOSITIES.length) + CURIOSITIES.length) % CURIOSITIES.length;
}

function readSeen(): Set<number> {
  try {
    const raw = localStorage.getItem(LS_SEEN);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((n): n is number => Number.isInteger(n)).map(n => n % CURIOSITIES.length));
  } catch {
    return new Set();
  }
}

export default function FactWidget() {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState<number>(() => dailyFactIndex());
  const [seen, setSeen] = useState<Set<number>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);

  const show = useCallback((target: number) => {
    setSeen(prev => {
      const next = new Set(prev);
      next.add(target);
      return next;
    });
    setIdx(target);
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_OPEN);
      // En el primer ingreso se muestra la curiosidad; luego respeta lo guardado.
      setOpen(stored === null ? true : stored === '1');
    } catch {
      setOpen(true);
    }

    let list = readSeen();
    // Ciclo completado: se reinicia para poder descubrir de nuevo.
    if (list.size >= CURIOSITIES.length) list = new Set();

    // Dato de hoy; si ya se vio, se ofrece otro sin ver.
    let pick = dailyFactIndex();
    const unseen = CURIOSITIES.map((_, i) => i).filter(i => !list.has(i));
    if (list.has(pick) && unseen.length > 0) {
      pick = unseen[Math.floor(Math.random() * unseen.length)];
    }
    if (!list.has(pick)) list = new Set([...list, pick]);
    setSeen(list);
    setIdx(pick);
    try {
      localStorage.setItem(LS_SEEN, JSON.stringify([...list]));
    } catch {
      /* sin almacenamiento local */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_OPEN, open ? '1' : '0');
      localStorage.setItem(LS_SEEN, JSON.stringify([...seen]));
    } catch {
      /* sin almacenamiento local */
    }
  }, [open, seen, hydrated]);

  if (!hydrated) return null;

  /** Índice no visto más cercano en la dirección pedida; null si ya se vio todo. */
  const nearestUnseen = (current: number, dir: 1 | -1): number | null => {
    for (let k = 1; k <= CURIOSITIES.length; k++) {
      const j = (current + dir * k + CURIOSITIES.length * 2) % CURIOSITIES.length;
      if (!seen.has(j)) return j;
    }
    return null;
  };

  const step = (dir: 1 | -1) => {
    const target = nearestUnseen(idx, dir);
    if (target !== null) {
      show(target);
      return;
    }
    // Todas vistas: nuevo ciclo, sin mostrar la misma actual.
    let fresh = dailyFactIndex();
    if (fresh === idx) fresh = (idx + 1) % CURIOSITIES.length;
    setSeen(new Set([fresh]));
    setIdx(fresh);
  };

  const shuffle = () => {
    const unseen = CURIOSITIES.map((_, i) => i).filter(i => !seen.has(i) && i !== idx);
    if (unseen.length > 0) {
      show(unseen[Math.floor(Math.random() * unseen.length)]);
      return;
    }
    let fresh = dailyFactIndex();
    if (fresh === idx) fresh = (idx + 1) % CURIOSITIES.length;
    setSeen(new Set([fresh]));
    setIdx(fresh);
  };

  const fact = CURIOSITIES[idx];
  if (!fact) return null;

  const remaining = CURIOSITIES.length - seen.size;

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
          <div className="fact-body" key={idx}>
            <h4 className="fact-title">{fact.title}</h4>
            <p className="fact-text">{fact.body}</p>
          </div>
        </div>

        <footer className="fact-foot">
          <span className="fact-count" title={remaining > 0 ? 'Curiosidades aún sin ver' : 'Colección completada: mañana vuelve a empezar'}>
            {remaining > 0 ? `${remaining} sin ver` : '¡Completaste las 23! 🔄'}
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