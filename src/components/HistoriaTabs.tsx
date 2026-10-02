'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import PdfViewerModal from './PdfViewerModal';
import type { TimelineEvent } from '@/lib/pjlStore';

/**
 * «Nuestra Historia» como pestañas.
 *
 * Antes eran tarjetas sueltas en una línea de tiempo y cada una abría un
 * modal. Ahora son tres píldoras navegables y, al elegir una, la vista se
 * despliega en el mismo lugar: resumen, ficha técnica del documento y las
 * acciones para verlo o bajarlo.
 *
 * Decisiones que pesan en el peso de la página:
 *
 * - Se dibuja **una sola** vista desplegada a la vez. Antes se montaban los
 *   tres hitos completos con su imagen; ahora lo que no está abierto no
 *   existe en el DOM, así que el navegador no descarga ni decodifica las
 *   imágenes que el visitante no está mirando.
 * - La animación de entrada es CSS puro sobre `opacity`/`transform`, que es
 *   lo único que la GPU compone sin repintar. Sin librería de animación: el
 *   sitio no tiene ninguna y agregar una solo por esto serían decenas de KB
 *   de JavaScript para un efecto de 300 ms.
 * - Las imágenes van con `loading="lazy"` y `decoding="async"`, y el contenedor
 *   reserva el espacio con `aspect-ratio` para que no haya salto de layout.
 * - `content-visibility: auto` (en CSS) deja que el navegador se salte el
 *   pintado de la sección si el visitante nunca llega hasta abajo.
 */

const FALLBACK_ICONS = ['🏛️', '✝️', '🔥', '📜', '⛪', '🕊️'];

type MetaRow = { label: string; value: string };

/** Solo `http(s)` y rutas del propio sitio. Bloquea `javascript:` y `data:`,
 *  que es lo único peligroso que podría colarse desde el panel. */
function safeUrl(raw?: string): string {
  const url = (raw || '').trim();
  if (!url) return '';
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return '';
}

/** `/api/files/…` sirve el PDF desde R2: con `?dl=1` responde
 *  `Content-Disposition: attachment` y el navegador guarda el archivo en vez de
 *  abrir una pestaña. Es el mismo truco que usa el Estatuto. */
function downloadUrlOf(url: string): string {
  if (!url) return '';
  return url.startsWith('/api/files/') ? `${url}${url.includes('?') ? '&' : '?'}dl=1` : url;
}

function fileNameOf(item: TimelineEvent): string {
  const name = (item.docFileName || '').trim();
  if (name) return name;
  const url = safeUrl(item.docUrl);
  const last = url.split('/').pop()?.split('?')[0];
  return last && last.includes('.') ? decodeURIComponent(last) : `${(item.title || 'documento').trim() || 'documento'}.pdf`;
}

/** La ficha técnica solo lista las filas que el panel realmente completó:
 *  una tabla vacía se ve como un error, no como un dato faltante. */
function metaRows(item: TimelineEvent): MetaRow[] {
  const put = (label: string, value?: string): MetaRow[] =>
    (value || '').trim() ? [{ label, value: value!.trim() }] : [];
  return [
    ...put('Tipo', item.docType),
    ...put('Páginas', item.docPages),
    ...put('Tamaño', item.docSize),
    ...put('Archivo', item.docArchive),
    ...put('Actualizado', item.docUpdated),
  ];
}

export default function HistoriaTabs({ items }: { items?: TimelineEvent[] }) {
  /* Hitos que no están vacíos. Se recalcula solo cuando cambia la lista, así
     que recorrer el array no pasa en cada render. */
  const lista = useMemo(
    () => (items || []).filter((it) => it && (it.title?.trim() || it.text?.trim() || it.summary?.trim())),
    [items],
  );

  const [idx, setIdx] = useState(0);
  const [pdfItem, setPdfItem] = useState<TimelineEvent | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  /* Si el panel borra o reordena hitos y el que estaba abierto ya no existe,
     caemos en el primero sin dejar la vista en blanco. */
  const active = Math.min(idx, Math.max(lista.length - 1, 0));
  const item = lista[active];

  const move = useCallback(
    (delta: number) => {
      if (!lista.length) return;
      const next = (active + delta + lista.length) % lista.length;
      setIdx(next);
      tabRefs.current[next]?.focus();
    },
    [active, lista.length],
  );

  /* Flechas / Inicio / Fin, como manda el patrón ARIA de pestañas. */
  const onTabKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      switch (e.key) {
        case 'ArrowRight': e.preventDefault(); move(1); break;
        case 'ArrowLeft': e.preventDefault(); move(-1); break;
        case 'Home': e.preventDefault(); move(-active); break;
        case 'End': e.preventDefault(); move(lista.length - 1 - active); break;
        default: return;
      }
    },
    [move, active, lista.length],
  );

  /* Al cambiar de hito se cierra el PDF: si no, el visor queda flotando sobre
     el contenido que acaba de cambiar. */
  useEffect(() => { setPdfItem(null); }, [active]);

  if (!lista.length || !item) {
    return (
      <div className="pjl-empty-state" style={{ maxWidth: '560px', margin: '0 auto' }}>
        <div className="empty-icon">📜</div>
        <h4 className="empty-title">Nuestra historia se está escribiendo</h4>
        <p className="empty-desc">
          Muy pronto vas a conocer los hitos que marcaron el camino de la Pastoral Juvenil Luqueña.
        </p>
      </div>
    );
  }

  const accent = item.accentColor || 'var(--gold)';
  const kicker = (item.kicker || '').trim() || 'Memoria pastoral';
  const period = (item.period || '').trim();
  const summary = (item.summary || '').trim() || item.text;
  const docUrl = safeUrl(item.docUrl);
  const onlineUrl = safeUrl(item.onlineUrl);
  const rows = metaRows(item);
  const downloadUrl = downloadUrlOf(docUrl);
  const fileName = fileNameOf(item);

  return (
    <div className="hs">
      <div className="hs-tablist" role="tablist" aria-label="Hitos de la historia">
        {lista.map((it, i) => {
          const sel = i === active;
          return (
            <button
              key={it.id}
              id={`hs-tab-${it.id}`}
              ref={sel ? (el) => { tabRefs.current[i] = el; } : undefined}
              type="button"
              role="tab"
              aria-selected={sel}
              aria-controls={`hs-panel-${it.id}`}
              tabIndex={sel ? 0 : -1}
              className={`hs-tab${sel ? ' is-active' : ''}`}
              style={{ '--hs-accent': it.accentColor || 'var(--gold)' } as CSSProperties}
              onClick={() => setIdx(i)}
              onKeyDown={onTabKeyDown}
            >
              <span className="hs-tab-ico" aria-hidden="true">{it.icon || FALLBACK_ICONS[i % FALLBACK_ICONS.length]}</span>
              <span className="hs-tab-text">
                <span className="hs-tab-num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                <span className="hs-tab-label">{it.title || `Hito ${i + 1}`}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* `key` reinicia la animación de entrada en cada cambio de píldora. */}
      <div
        key={item.id}
        id={`hs-panel-${item.id}`}
        role="tabpanel"
        aria-labelledby={`hs-tab-${item.id}`}
        className="hs-panel"
        style={{ '--hs-accent': accent } as CSSProperties}
      >
        <div className="hs-panel-head">
          <span className="hs-kicker">{kicker}</span>
          <h3 className="serif hs-title">{item.title || `Hito ${active + 1}`}</h3>
          {period && <span className="hs-period">{period}</span>}
          <span className="hs-rule" aria-hidden="true" />
        </div>

        <div className="hs-panel-body">
          <div className="hs-narrative">
            {item.image && (
              <figure className="hs-figure">
                <img
                  src={item.image}
                  alt={item.title || 'Imagen del hito'}
                  loading="lazy"
                  decoding="async"
                />
              </figure>
            )}
            <p className="hs-summary">{summary}</p>
            {item.text && item.text !== summary && (
              <p className="hs-text">{item.text}</p>
            )}
          </div>

          <aside className="hs-aside" aria-label="Ficha del documento">
            {rows.length > 0 && (
              <dl className="hs-ficha">
                {rows.map((r) => (
                  <div className="hs-ficha-row" key={r.label}>
                    <dt>{r.label}</dt>
                    <dd>{r.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {docUrl || onlineUrl ? (
              <div className="hs-actions">
                {onlineUrl ? (
                  <a className="hs-btn hs-btn-ghost" href={onlineUrl} target="_blank" rel="noopener noreferrer">
                    <span aria-hidden="true">👁️</span> Ver documento online
                  </a>
                ) : (
                  <button type="button" className="hs-btn hs-btn-ghost" onClick={() => setPdfItem(item)}>
                    <span aria-hidden="true">👁️</span> Ver documento online
                  </button>
                )}
                {downloadUrl && (
                  <a
                    className="hs-btn hs-btn-primary"
                    href={downloadUrl}
                    download={fileName}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span aria-hidden="true">📥</span> Descargar PDF
                  </a>
                )}
              </div>
            ) : (
              <p className="hs-note">
                Todavía no hay un documento asociado a este hito. Cargalo desde{' '}
                <strong>Panel de administración → Contenido → Historia</strong>.
              </p>
            )}
          </aside>
        </div>
      </div>

      {pdfItem && docUrl && (
        <PdfViewerModal
          url={docUrl}
          title={pdfItem.docFileName?.trim() || pdfItem.title || 'Documento'}
          fileName={fileName}
          onClose={() => setPdfItem(null)}
        />
      )}
    </div>
  );
}