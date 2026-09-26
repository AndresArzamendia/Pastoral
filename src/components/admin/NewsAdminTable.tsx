/**
 * Component: NewsAdminTable
 * Panel premium de gestión de noticias: tarjetas animadas,
 * búsqueda en vivo, filtros, estadísticas y acciones rápidas.
 */

'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { NewsArticleWithDetails } from '@/lib/newsTypes';
import { adminFetch } from '@/lib/adminAuth';

interface NewsAdminTableProps {
  onEdit?: (article: NewsArticleWithDetails) => void;
  onDelete?: (id: string) => void;
  onEvent?: (article: NewsArticleWithDetails) => void;
}

export function NewsAdminTable({ onEdit, onDelete, onEvent }: NewsAdminTableProps) {
  const [articles, setArticles] = useState<NewsArticleWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    published: 'all',
    archived: 'false',
    sort: 'published_at',
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [spinRefresh, setSpinRefresh] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    fetchArticles();
  }, [filters]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2400);
  };

  const fetchArticles = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();

      if (filters.published !== 'all') {
        params.append('published', filters.published === 'true' ? 'true' : 'false');
      }
      if (filters.archived !== 'all') {
        params.append('archived', filters.archived);
      }
      params.append('limit', '50');

      const response = await fetch(`/api/news/articles?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        setArticles(data.data);
        setError(null);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Error fetching articles');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const refresh = () => {
    setSpinRefresh(true);
    window.setTimeout(() => setSpinRefresh(false), 600);
    fetchArticles();
  };

  const handlePin = async (id: string) => {
    try {
      const response = await adminFetch(`/api/news/articles/${id}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pin', pin_order: 0 }),
      });

      if (response.ok) {
        fetchArticles();
        showToast('📌 Noticia fijada arriba');
      }
    } catch (err) {
      console.error('Error pinning article:', err);
    }
  };

  const handlePublish = async (id: string) => {
    try {
      const response = await adminFetch(`/api/news/articles/${id}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'publish' }),
      });

      if (response.ok) {
        fetchArticles();
        showToast('✓ Noticia publicada');
      }
    } catch (err) {
      console.error('Error publishing article:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este artículo?')) return;

    try {
      const response = await adminFetch(`/api/news/articles/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchArticles();
        showToast('🗑️ Noticia eliminada');
        onDelete?.(id);
      }
    } catch (err) {
      console.error('Error deleting article:', err);
    }
  };

  // ─── Datos derivados ───
  const totalViews = articles.reduce((acc, a) => acc + (a.views_count || 0), 0);
  const publishedCount = articles.filter(a => a.published && !a.archived).length;
  const draftCount = articles.filter(a => !a.published && !a.archived).length;

  const q = searchTerm.trim().toLowerCase();
  const visible = q
    ? articles.filter(a =>
        a.title.toLowerCase().includes(q) ||
        (a.subtitle || '').toLowerCase().includes(q) ||
        (a.category?.name || '').toLowerCase().includes(q)
      )
    : articles;

  const fmtDate = (iso?: string) =>
    iso
      ? new Date(iso).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' })
      : '—';

  const statusOf = (a: NewsArticleWithDetails) =>
    a.archived ? 'archivado' : a.published ? 'publicado' : 'borrador';

  // ─── Estados de carga y error ───
  if (error) {
    return (
      <div className="na-error" role="alert">
        <span className="na-error-ico">⚠️</span>
        <div>
          <strong>No se pudieron cargar las noticias</strong>
          <p>{error}</p>
          <button className="na-btn na-btn-gold" onClick={fetchArticles}>↻ REINTENTAR</button>
        </div>
      </div>
    );
  }

  return (
    <div className="na-wrap">
      {/* ESTADÍSTICAS */}
      {!loading || articles.length > 0 ? (
        <div className="na-stats">
          <div className="na-stat na-s-total"><b>{articles.length}</b><span>Total noticias</span></div>
          <div className="na-stat na-s-pub"><b>{publishedCount}</b><span>Publicadas</span></div>
          <div className="na-stat na-s-draft"><b>{draftCount}</b><span>Borradores</span></div>
          <div className="na-stat na-s-views"><b>{totalViews.toLocaleString('es-PY')}</b><span>Vistas totales</span></div>
        </div>
      ) : null}

      {/* TOOLBAR */}
      <div className="na-toolbar">
        <div className="na-search">
          <span>🔍</span>
          <input
            type="text"
            placeholder="Buscar por título, bajada o categoría…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            aria-label="Buscar noticias"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} title="Limpiar" aria-label="Limpiar búsqueda">✕</button>
          )}
        </div>

        <div className="na-pills" role="group" aria-label="Filtrar por estado">
          {([
            ['all', 'Todas'],
            ['true', 'Publicadas'],
            ['false', 'Borradores'],
          ] as const).map(([val, label]) => (
            <button
              key={val}
              className={`na-pill ${filters.published === val ? 'on' : ''}`}
              onClick={() => setFilters({ ...filters, published: val })}
            >
              {val === 'true' && <i className="np-dot np-green" />}
              {val === 'false' && <i className="np-dot np-amber" />}
              {label}
            </button>
          ))}
          <button
            className={`na-pill ${filters.archived !== 'false' ? 'on on-gray' : ''}`}
            onClick={() => setFilters({ ...filters, archived: filters.archived === 'false' ? 'all' : 'false' })}
            title={filters.archived === 'false' ? 'Mostrar también archivadas' : 'Ocultar archivadas'}
          >
            🗄️ Archivadas
          </button>
        </div>

        <button className="na-refresh" onClick={refresh} title="Actualizar lista" aria-label="Actualizar">
          <i className={spinRefresh ? 'spinning' : ''}>↻</i>
        </button>
      </div>

      <p className="na-count">
        {visible.length} de {articles.length} noticias
        {q && <> · filtro «{searchTerm}»</>}
      </p>

      {/* CONTENIDO */}
      {loading && articles.length === 0 ? (
        <div className="na-grid" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} className="na-skel">
              <div className="ns-img" />
              <div className="ns-body">
                <div className="ns-line w40" />
                <div className="ns-line w90" />
                <div className="ns-line w70" />
                <div className="ns-line w55" />
                <div className="ns-foot"><div className="ns-chip" /><div className="ns-chip" /></div>
              </div>
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="na-empty">
          <span className="ne-ico">{q ? '🔍' : '📰'}</span>
          <h4>{q ? 'Sin coincidencias' : 'Aún no hay noticias aquí'}</h4>
          <p>
            {q
              ? `Ninguna noticia coincide con «${searchTerm}».`
              : 'Publicá la primera noticia para verla reflejada al instante en el sitio.'}
          </p>
        </div>
      ) : (
        <div className={`na-grid ${loading ? 'na-dim' : ''}`}>
          {visible.map((article, idx) => {
            const st = statusOf(article);
            const catName = article.category?.name || 'General';
            return (
              <article
                key={article.id}
                className={`na-card na-st-${st}`}
                style={{ '--d': `${Math.min(idx, 11) * 55}ms` } as CSSProperties}
              >
                {article.pinned && <span className="na-pinflag">📌 FIJADA</span>}

                <div className="na-thumb">
                  {article.featured_image_url ? (
                    <img src={article.featured_image_url} alt="" loading="lazy" />
                  ) : (
                    <span className="na-thumb-ph">{st === 'borrador' ? '📝' : '📰'}</span>
                  )}
                  <span className={`na-status st-${st}`}>
                    {st === 'publicado' ? '● Publicada' : st === 'borrador' ? '○ Borrador' : '🗄 Archivada'}
                  </span>
                </div>

                <div className="na-body">
                  <div className="na-meta">
                    <span className="na-cat">{catName}</span>
                    <span className="na-date">{fmtDate(article.published_at)}</span>
                  </div>
                  <h4 title={article.title}>{article.title}</h4>
                  {article.subtitle && <p className="na-sub">{article.subtitle}</p>}
                  <div className="na-views">👁 {article.views_count.toLocaleString('es-PY')} vistas</div>

                  <div className="na-actions">
                    <button className="na-btn na-edit" onClick={() => onEdit?.(article)} title="Editar noticia">
                      ✏️<em>Editar</em>
                    </button>
                    <button className="na-btn na-event" onClick={() => onEvent?.(article)} title="Programar evento">
                      📅<em>Evento</em>
                    </button>
                    {!article.published && (
                      <button className="na-btn na-pub" onClick={() => handlePublish(article.id)} title="Publicar ahora">
                        ✓<em>Publicar</em>
                      </button>
                    )}
                    {!article.pinned && (
                      <button className="na-btn na-pin" onClick={() => handlePin(article.id)} title="Fijar arriba">
                        📌<em>Fijar</em>
                      </button>
                    )}
                    <button className="na-btn na-del" onClick={() => handleDelete(article.id)} title="Eliminar">
                      🗑️
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* TOAST LOCAL */}
      {toast && (
        <div className="na-toast" role="status">{toast}</div>
      )}
    </div>
  );
}

export default NewsAdminTable;
