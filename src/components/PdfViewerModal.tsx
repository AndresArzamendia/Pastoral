'use client';

import { useEffect, useState } from 'react';

/**
 * Visor del PDF del Estatuto dentro de la misma página.
 *
 * Se usa el visor PDF del propio navegador (iframe) porque pesa cero, funciona
 * en celular y computadora sin instalar nada, y ya trae zoom, páginas
 * anterior/siguiente y búsqueda dentro del texto.
 *
 * El botón de descarga apunta a /api/files/<clave>?dl=1, que responde con
 * Content-Disposition: attachment: el archivo se guarda directo, sin abrir una
 * pestaña nueva.
 */

export default function PdfViewerModal({
  url,
  title,
  fileName,
  onClose,
}: {
  url: string;
  title: string;
  fileName: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [fallback, setFallback] = useState(false);

  const isSameOriginFile = url.startsWith('/api/files/');
  const downloadUrl = isSameOriginFile
    ? `${url}${url.includes('?') ? '&' : '?'}dl=1`
    : url;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Si el visor del navegador tarda (o no existe), no se queda el esqueleto
    // girando para siempre: a los 6 s se muestra el aviso con la descarga.
    const timer = window.setTimeout(() => setFallback(true), 6000);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timer);
    };
  }, [onClose]);

  return (
    <div
      className="est-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Vista previa: ${title}`}
    >
      <div className="est-modal" onClick={(e) => e.stopPropagation()}>
        <div className="est-modal-head">
          <span className="est-modal-ico" aria-hidden="true">📄</span>
          <div>
            <h3>{title}</h3>
            <small>Podés desplazarte, hacer zoom y buscar texto dentro del documento.</small>
          </div>
          <div className="est-modal-actions">
            <a
              className="est-btn est-btn-ghost"
              href={downloadUrl}
              download={fileName || undefined}
              target="_blank"
              rel="noopener noreferrer"
            >
              📥 Descargar
            </a>
            <a className="est-btn est-btn-ghost" href={url} target="_blank" rel="noopener noreferrer">
              ↗ Abrir aparte
            </a>
            <button type="button" className="est-modal-close" onClick={onClose} aria-label="Cerrar vista previa">
              ✕
            </button>
          </div>
        </div>

        <div className="est-modal-body">
          {loading && (
            <div className="est-modal-loading">
              <div className="est-modal-spinner" aria-hidden="true"></div>
              <span>{fallback ? 'Cargando el documento… si no aparece, usá «Descargar».' : 'Preparando el documento…'}</span>
            </div>
          )}
          <iframe
            src={`${url}#view=FitH&toolbar=1`}
            title={title}
            onLoad={() => setLoading(false)}
            onError={() => setLoading(false)}
          />
        </div>
      </div>
    </div>
  );
}