'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import PdfViewerModal from './PdfViewerModal';
import type { TimelineEvent } from '@/lib/pjlStore';

/**
 * «Nuestra Historia» como acordeón vertical.
 *
 * Antes eran tarjetas sueltas en una línea de tiempo y cada una abría un
 * modal. Ahora son tres píldoras apiladas, una debajo de otra, y al elegir una
 * la vista se despliega justo debajo de esa misma píldora.
 *
 * Apilado y no en fila por una razón concreta: en el teléfono las píldoras
 * ocupan todo el ancho y quedan en la zona que el pulgar alcanza sin tener que
 * arrastrar un carrusel horizontal. Ese era el problema real del diseño
 * anterior, que en móvil obligaba a deslizar para ver los tres hitos.
 *
 * Patrón de accesibilidad: acordeón (`aria-expanded` / `aria-controls`), no
 * pestañas. Se cambió a propósito. Las pestañas son para paneles que se
 * cambian en el mismo espacio sin mover el control que los abre; aquí el panel
 * aparece DEBAJO de la píldora que lo abrió, que es un acordeón. Con
 * `role="tab"` un lector de pantalla anunciaría "pestaña" cuando en realidad lo
 * que cambió fue "sección desplegada".
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

/** Ficha del documento en una sola línea con puntos separadores:
 *  `📄 Documento oficial • 8 págs. • 2.8 MB`.
 *
 *  Se listan solo los datos que el panel completó. Una línea vacía se vería
 *  como un error, no como un dato faltante. */
function docMetaParts(item: TimelineEvent): string[] {
  const out: string[] = [];
  const push = (v?: string) => {
    const t = (v || '').trim();
    if (t) out.push(t);
  };
  push(item.docType);
  /* `push` ya descarta lo vacío, así que el sufijo «págs.» solo se agrega si
     el administrador cargó un número. */
  if (item.docPages) push(`${item.docPages.trim()} págs.`);
  push(item.docSize);
  push(item.docArchive);
  push(item.docUpdated);
  return out;
}

/** Si el título ya empieza con su número («01. Nuestra Parroquia»), no se
 *  vuelve a imprimir el índice: se vería «01 01. Nuestra Parroquia». */
function hasOwnNumber(title?: string): boolean {
  return /^\s*\d/.test(title || '');
}

export default function HistoriaTabs({ items }: { items?: TimelineEvent[] }) {
  /* Hitos que no están vacíos. Se recalcula solo cuando cambia la lista, así
     que recorrer el array no pasa en cada render. */
  const lista = useMemo(
    () => (items || []).filter((it) => it && (it.title?.trim() || it.text?.trim() || it.summary?.trim())),
    [items],
  );

  /* `-1` significa «todo cerrado». El valor arranca en 0 para que el visitante
     vea la historia desplegada sin tener que tocar nada. */
  const [idx, setIdx] = useState(0);
  const [pdfItem, setPdfItem] = useState<TimelineEvent | null>(null);
  const pillRefs = useRef<Array<HTMLButtonElement | null>>([]);

  /* Si el panel borra o reordena hitos y el que estaba abierto ya no existe,
     caemos en el primero sin dejar la vista en blanco. */
  const active = idx >= 0 && idx < lista.length ? idx : lista.length ? -1 : -1;
  const item = active >= 0 ? lista[active] : undefined;

  const move = useCallback(
    (delta: number) => {
      if (!lista.length) return;
      const from = active >= 0 ? active : 0;
      const next = (from + delta + lista.length) % lista.length;
      setIdx(next);
      pillRefs.current[next]?.focus();
    },
    [active, lista.length],
  );

  /* Flechas / Inicio / Fin, el recorrido estándar de un acordeón: se mueve el
     foco de control en control y la sección queda abierta en el destino. */
  const onPillKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      switch (e.key) {
        case 'ArrowDown': e.preventDefault(); move(1); break;
        case 'ArrowUp': e.preventDefault(); move(-1); break;
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
  /* `heading` es el título corto de la vista desplegada («Santuario Virgen del
     Rosario») frente al largo de la píldora. Si el panel no lo tiene, se usa el
     título de la píldora: nunca queda una vista sin encabezado. */
  const heading = (item.heading || '').trim() || item.title || `Hito ${active + 1}`;
  const summary = (item.summary || '').trim() || item.text;
  const docUrl = safeUrl(item.docUrl);
  const onlineUrl = safeUrl(item.onlineUrl);
  const meta = docMetaParts(item);
  const downloadUrl = downloadUrlOf(docUrl);
  const fileName = fileNameOf(item);
  const showNumber = !hasOwnNumber(item.title);

  return (
    <div className="hs">
      <div className="hs-list">
        {lista.map((it, i) => {
          const open = i === active;
          const panelId = `hs-panel-${it.id}`;
          return (
            <div className="hs-item" key={it.id}>
              <button
                id={`hs-btn-${it.id}`}
                ref={open ? (el) => { pillRefs.current[i] = el; } : undefined}
                type="button"
                className={`hs-pill${open ? ' is-open' : ''}`}
                style={{ '--hs-accent': it.accentColor || 'var(--gold)' } as CSSProperties}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setIdx(open ? -1 : i)}
                onKeyDown={onPillKeyDown}
              >
                <span className="hs-pill-ico" aria-hidden="true">
                  {it.icon || FALLBACK_ICONS[i % FALLBACK_ICONS.length]}
                </span>

                <span className="hs-pill-main">
                  {showNumber && (
                    <span className="hs-pill-num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                  )}
                  <span className="hs-pill-label">{it.title || `Hito ${i + 1}`}</span>
                </span>

                {/* Estado de la píldora. `aria-hidden` porque para un lector de
                    pantalla lo que importa ya lo dice `aria-expanded`; esto es
                    una ayuda visual. */}
                <span className="hs-pill-state" aria-hidden="true">
                  {open ? 'Seleccionado' : 'Ver detalle'}
                </span>

                <span className="hs-pill-chev" aria-hidden="true" />
              </button>

              {/* La vista se dibuja acá, entre esta píldora y la siguiente, que
                  es justo donde el ojo ya está: no hay que volver arriba. */}
              {open && (
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={`hs-btn-${it.id}`}
                  className="hs-panel"
                  style={{ '--hs-accent': accent } as CSSProperties}
                >
                  <div className="hs-panel-head">
                    <span className="hs-kicker">✦ {kicker}</span>
                    <h3 className="serif hs-title">{heading}</h3>
                    {item.period && <span className="hs-period">{item.period}</span>}
                  </div>

                  {item.image && (
                    <figure className="hs-figure">
                      <img src={item.image} alt={heading} loading="lazy" decoding="async" />
                    </figure>
                  )}

                  <div className="hs-resume">
                    <span className="hs-resume-label">Resumen</span>
                    <p className="hs-summary">{summary}</p>
                    {item.text && item.text !== summary && (
                      <p className="hs-text">{item.text}</p>
                    )}
                  </div>

                  {meta.length > 0 && (
                    <p className="hs-docmeta">
                      <span className="hs-docmeta-ico" aria-hidden="true">📄</span>
                      {meta.map((m, mi) => (
                        <span className="hs-docmeta-part" key={m}>
                          {mi > 0 && <span className="hs-dot" aria-hidden="true">•</span>}
                          {m}
                        </span>
                      ))}
                    </p>
                  )}

                  {docUrl || onlineUrl ? (
                    <div className="hs-actions">
                      {onlineUrl ? (
                        <a className="hs-btn hs-btn-ghost" href={onlineUrl} target="_blank" rel="noopener noreferrer">
                          <span aria-hidden="true">👁️</span> Ver Online
                        </a>
                      ) : (
                        <button type="button" className="hs-btn hs-btn-ghost" onClick={() => setPdfItem(it)}>
                          <span aria-hidden="true">👁️</span> Ver Online
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
                </div>
              )}
            </div>
          );
        })}
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