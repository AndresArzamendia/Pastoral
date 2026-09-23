'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface NewsArticle {
  id: string;
  title: string;
  subtitle: string | null;
  body: string;
  featured_image_url: string | null;
  slug: string;
  published_at: string;
  views_count: number;
  pinned: boolean;
  event_date?: string | null;
  inscription_url?: string | null;
  external_link?: string | null;
  google_drive_url?: string | null;
  event_location?: string | null;
  category?: {
    name: string;
    icon_emoji: string;
    color_hex: string;
  };
  news_events?: {
    start_date?: string;
    location_name?: string;
  } | null;
}

/** Convierte URLs en texto plano a elementos <a> clicables */
function TextWithLinks({ text, maxLength }: { text: string; maxLength?: number }) {
  const display = maxLength ? text.slice(0, maxLength) + (text.length > maxLength ? '...' : '') : text;
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  const isUrl = (value: string) => /^https?:\/\/[^\s]+$/i.test(value);
  const parts = display.split(urlRegex);
  return (
    <>
      {parts.map((part, i) =>
        isUrl(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{
              color: '#C8973A',
              textDecoration: 'underline',
              wordBreak: 'break-all',
              fontWeight: 500,
            }}
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function formatDate(dateStr: string | null | undefined, options?: Intl.DateTimeFormatOptions) {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString('es-PY', options || {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return null;
  }
}

export function NewsSection() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(null);

  useEffect(() => {
    fetchHomepageArticles();
  }, []);

  // Bloquear scroll cuando el modal está abierto
  useEffect(() => {
    if (selectedArticle) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedArticle]);

  const fetchHomepageArticles = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/news/feed/homepage');
      if (!response.ok) throw new Error('Error al cargar noticias');
      const data = await response.json();
      setArticles(data.data || []);
      setError(null);
    } catch (err) {
      console.error('Error:', err);
      setError('No se pudieron cargar las noticias');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <section className="section-pjl" style={{ background: 'var(--cream)' }}>
        <div className="container">
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
            Cargando noticias...
          </div>
        </div>
      </section>
    );
  }

  if (error || articles.length === 0) {
    return null;
  }

  return (
    <>
      <style>{`
        .news-card {
          border-radius: 16px;
          overflow: hidden;
          background: white;
          box-shadow: 0 4px 16px rgba(0,0,0,0.06);
          transition: all 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          cursor: pointer;
          display: flex;
          flex-direction: column;
          height: 100%;
          border: 1px solid rgba(0,0,0,0.04);
          text-decoration: none;
          color: inherit;
        }
        .news-card:hover {
          box-shadow: 0 16px 40px rgba(0,0,0,0.14);
          transform: translateY(-8px);
        }
        .news-card-img {
          height: 210px;
          overflow: hidden;
          background: linear-gradient(135deg, var(--navy-mid) 0%, var(--navy-dark) 60%, #C8973A 100%);
          position: relative;
        }
        .news-card-img img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.5s ease;
        }
        .news-card:hover .news-card-img img {
          transform: scale(1.06);
        }
        .news-card-img-placeholder {
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 56px;
          background: linear-gradient(135deg, var(--navy-mid) 0%, #C8973A 100%);
        }
        .news-card-pinned-badge {
          position: absolute;
          top: 12px;
          right: 12px;
          background: linear-gradient(135deg, #C8973A, #f0c060);
          color: white;
          font-size: 11px;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 20px;
          letter-spacing: 0.5px;
          box-shadow: 0 2px 8px rgba(200, 151, 58, 0.5);
        }
        .news-card-body {
          padding: 20px;
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .news-cat-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 20px;
          margin-bottom: 10px;
          letter-spacing: 0.3px;
        }
        .news-event-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 20px;
          background: rgba(59, 130, 246, 0.1);
          color: #1d4ed8;
          margin-bottom: 10px;
          margin-left: 6px;
        }
        .news-card-title {
          font-size: 1.05rem;
          font-weight: 700;
          color: var(--navy-mid);
          line-height: 1.4;
          margin-bottom: 8px;
          flex: 1;
        }
        .news-card-subtitle {
          font-size: 0.87rem;
          color: #6b7280;
          line-height: 1.5;
          margin-bottom: 12px;
        }
        .news-card-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 12px;
          border-top: 1px solid #f0f0f0;
          font-size: 0.8rem;
          color: #9ca3af;
        }
        .news-card-cta {
          display: flex;
          gap: 8px;
          margin-top: 12px;
          flex-wrap: wrap;
        }
        .news-cta-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          font-weight: 700;
          padding: 5px 12px;
          border-radius: 8px;
          text-decoration: none;
          transition: all 0.2s;
          letter-spacing: 0.3px;
          cursor: pointer;
          border: none;
        }
        .news-cta-inscription {
          background: linear-gradient(135deg, #C8973A, #e8b84a);
          color: white;
          box-shadow: 0 2px 8px rgba(200, 151, 58, 0.35);
        }
        .news-cta-inscription:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(200, 151, 58, 0.5);
        }
        .news-cta-drive {
          background: rgba(59, 130, 246, 0.1);
          color: #1d4ed8;
          border: 1px solid rgba(59, 130, 246, 0.2);
        }
        .news-cta-drive:hover {
          background: rgba(59, 130, 246, 0.18);
        }
        .news-cta-external {
          background: rgba(107, 114, 128, 0.1);
          color: #374151;
          border: 1px solid rgba(107, 114, 128, 0.2);
        }
        .news-cta-external:hover {
          background: rgba(107, 114, 128, 0.18);
        }
        /* Modal */
        .news-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(10, 10, 30, 0.75);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          backdrop-filter: blur(4px);
          animation: fadeInOverlay 0.25s ease;
        }
        @keyframes fadeInOverlay {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .news-modal {
          background: white;
          border-radius: 20px;
          max-width: 720px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 30px 80px rgba(0,0,0,0.3);
          animation: slideUpModal 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }
        @keyframes slideUpModal {
          from { transform: translateY(30px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .news-modal-hero {
          height: 260px;
          position: relative;
          overflow: hidden;
          border-radius: 20px 20px 0 0;
          background: linear-gradient(135deg, var(--navy-mid) 0%, #C8973A 100%);
        }
        .news-modal-hero img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .news-modal-hero-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(to top, rgba(10,10,30,0.85) 0%, transparent 50%);
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          padding: 24px;
        }
        .news-modal-close {
          position: absolute;
          top: 16px;
          right: 16px;
          width: 36px;
          height: 36px;
          background: rgba(255,255,255,0.15);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,0.25);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: white;
          font-size: 18px;
          transition: all 0.2s;
        }
        .news-modal-close:hover {
          background: rgba(255,255,255,0.3);
          transform: scale(1.1);
        }
        .news-modal-body {
          padding: 28px 32px 32px;
        }
        @media (max-width: 640px) {
          .news-modal-body { padding: 20px; }
          .news-modal-hero { height: 200px; }
        }
        .news-modal-dates {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 16px;
        }
        .news-date-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 0.82rem;
          font-weight: 600;
        }
        .news-date-chip.published {
          background: rgba(107, 114, 128, 0.1);
          color: #4b5563;
        }
        .news-date-chip.event {
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(37, 99, 235, 0.1));
          color: #1d4ed8;
          border: 1px solid rgba(59, 130, 246, 0.25);
          font-size: 0.85rem;
        }
        .news-modal-title {
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--navy-mid);
          line-height: 1.3;
          margin-bottom: 8px;
          letter-spacing: -0.5px;
        }
        .news-modal-subtitle {
          font-size: 1rem;
          color: #6b7280;
          font-style: italic;
          margin-bottom: 20px;
          line-height: 1.5;
          padding-bottom: 20px;
          border-bottom: 2px solid #f0f0f0;
        }
        .news-modal-text {
          font-size: 0.97rem;
          color: #374151;
          line-height: 1.75;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .news-modal-links {
          margin-top: 24px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .news-modal-link-btn {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 20px;
          border-radius: 12px;
          text-decoration: none;
          font-weight: 600;
          font-size: 0.95rem;
          transition: all 0.25s;
          border: none;
          cursor: pointer;
        }
        .news-modal-link-btn.inscription {
          background: linear-gradient(135deg, #C8973A 0%, #e8b84a 100%);
          color: white;
          box-shadow: 0 4px 16px rgba(200, 151, 58, 0.4);
        }
        .news-modal-link-btn.inscription:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(200, 151, 58, 0.55);
        }
        .news-modal-link-btn.drive {
          background: linear-gradient(135deg, #4285F4 0%, #1967D2 100%);
          color: white;
          box-shadow: 0 4px 16px rgba(66, 133, 244, 0.35);
        }
        .news-modal-link-btn.drive:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(66, 133, 244, 0.5);
        }
        .news-modal-link-btn.external {
          background: #f9fafb;
          color: var(--navy-mid);
          border: 2px solid #e5e7eb;
        }
        .news-modal-link-btn.external:hover {
          background: #f3f4f6;
          border-color: #d1d5db;
          transform: translateY(-1px);
        }
        .news-modal-link-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: rgba(255,255,255,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          flex-shrink: 0;
        }
        .news-modal-link-icon.dark {
          background: rgba(26, 26, 46, 0.08);
        }
        .news-modal-link-text strong {
          display: block;
          font-weight: 700;
        }
        .news-modal-link-text span {
          font-size: 0.8rem;
          opacity: 0.8;
        }
        .news-modal-location {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.87rem;
          color: #6b7280;
          padding: 10px 16px;
          background: #f9fafb;
          border-radius: 10px;
          margin-top: 16px;
        }
      `}</style>

      <section className="section-pjl" style={{ background: 'var(--cream)' }} id="noticias-homepage">
        <div className="container">
          <div className="section-head reveal">
            <span style={{
              display: 'block',
              marginBottom: '4px',
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '2px',
              color: 'var(--gold)',
              textTransform: 'uppercase'
            }}>
              ÚLTIMAS NOTICIAS
            </span>
            <h3 style={{ margin: '10px 0' }}>📰 Noticias y Eventos</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>
              Mantente informado sobre las actividades de la Pastoral Juvenil
            </p>
            <div className="line" style={{ margin: '0 auto' }}></div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '28px',
            marginTop: '40px'
          }}>
            {articles.slice(0, 6).map((article, index) => (
              <div
                key={article.id}
                className="news-card reveal"
                style={{ animationDelay: `${index * 0.08}s` }}
                onClick={() => setSelectedArticle(article)}
              >
                {/* Imagen */}
                <div className="news-card-img">
                  {article.featured_image_url ? (
                    <img src={article.featured_image_url} alt={article.title} />
                  ) : (
                    <div className="news-card-img-placeholder">📰</div>
                  )}
                  {article.pinned && (
                    <div className="news-card-pinned-badge">📌 Destacado</div>
                  )}
                </div>

                {/* Contenido */}
                <div className="news-card-body">
                  {/* Badges */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', marginBottom: '8px' }}>
                    {article.category && (
                      <span className="news-cat-badge" style={{
                        background: `${article.category.color_hex}18`,
                        color: article.category.color_hex,
                        marginBottom: 0,
                      }}>
                        {article.category.icon_emoji} {article.category.name}
                      </span>
                    )}
                    {article.event_date && (
                      <span className="news-event-pill">
                        📅 {formatDate(article.event_date, { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </div>

                  {/* Título */}
                  <h4 className="news-card-title">{article.title}</h4>

                  {/* Subtítulo */}
                  {article.subtitle && (
                    <p className="news-card-subtitle">{article.subtitle}</p>
                  )}

                  {/* CTAs en la tarjeta */}
                  {(article.inscription_url || article.google_drive_url) && (
                    <div className="news-card-cta">
                      {article.inscription_url && (
                        <a
                          className="news-cta-btn news-cta-inscription"
                          href={article.inscription_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          ✍️ Inscribirse
                        </a>
                      )}
                      {article.google_drive_url && (
                        <a
                          className="news-cta-btn news-cta-drive"
                          href={article.google_drive_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          📂 Ver fotos
                        </a>
                      )}
                    </div>
                  )}

                  {/* Meta */}
                  <div className="news-card-meta">
                    <span>📅 {formatDate(article.published_at)}</span>
                    <span>👁️ {article.views_count}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Ver todas */}
          <div style={{ textAlign: 'center', marginTop: '50px' }}>
            <Link
              href="/noticias"
              style={{
                display: 'inline-block',
                padding: '14px 36px',
                background: 'linear-gradient(135deg, #C8973A, #e8b84a)',
                color: 'white',
                borderRadius: '10px',
                fontWeight: 700,
                textDecoration: 'none',
                transition: 'all 0.3s ease',
                boxShadow: '0 4px 16px rgba(200, 151, 58, 0.4)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(200, 151, 58, 0.55)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(200, 151, 58, 0.4)';
              }}
            >
              Ver todas las noticias →
            </Link>
          </div>
        </div>
      </section>

      {/* Modal de Artículo */}
      {selectedArticle && (
        <div className="news-modal-overlay" onClick={() => setSelectedArticle(null)}>
          <div className="news-modal" onClick={(e) => e.stopPropagation()}>
            {/* Hero image */}
            <div className="news-modal-hero">
              {selectedArticle.featured_image_url ? (
                <>
                  <img src={selectedArticle.featured_image_url} alt={selectedArticle.title} />
                  <div className="news-modal-hero-overlay">
                    {selectedArticle.category && (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        background: selectedArticle.category.color_hex,
                        color: 'white',
                        padding: '4px 12px',
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: 700,
                        marginBottom: '8px',
                        alignSelf: 'flex-start',
                      }}>
                        {selectedArticle.category.icon_emoji} {selectedArticle.category.name}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <div style={{
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '72px',
                  background: 'linear-gradient(135deg, var(--navy-mid) 0%, #C8973A 100%)',
                }}>
                  📰
                </div>
              )}
              <button className="news-modal-close" onClick={() => setSelectedArticle(null)}>✕</button>
            </div>

            {/* Body */}
            <div className="news-modal-body">
              {/* Fechas */}
              <div className="news-modal-dates">
                <span className="news-date-chip published">
                  📰 Publicado: {formatDate(selectedArticle.published_at, { year: 'numeric', month: 'long', day: 'numeric' })}
                </span>
                {selectedArticle.event_date && (
                  <span className="news-date-chip event">
                    📅 Evento: {formatDate(selectedArticle.event_date, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </span>
                )}
              </div>

              {/* Título */}
              <h2 className="news-modal-title">{selectedArticle.title}</h2>

              {/* Subtítulo */}
              {selectedArticle.subtitle && (
                <p className="news-modal-subtitle">{selectedArticle.subtitle}</p>
              )}

              {/* Ubicación */}
              {selectedArticle.event_location && (
                <div className="news-modal-location">
                  <span>📍</span>
                  <span>{selectedArticle.event_location}</span>
                </div>
              )}

              {/* Cuerpo */}
              <div className="news-modal-text" style={{ marginTop: '20px' }}>
                <TextWithLinks text={selectedArticle.body} />
              </div>

              {/* Links / CTAs */}
              {(selectedArticle.inscription_url || selectedArticle.google_drive_url || selectedArticle.external_link) && (
                <div className="news-modal-links">
                  {selectedArticle.inscription_url && (
                    <a
                      className="news-modal-link-btn inscription"
                      href={selectedArticle.inscription_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <div className="news-modal-link-icon">✍️</div>
                      <div className="news-modal-link-text">
                        <strong>Inscribirse / Registrarse</strong>
                        <span>Completar formulario de inscripción</span>
                      </div>
                      <span style={{ marginLeft: 'auto', fontSize: '20px' }}>→</span>
                    </a>
                  )}
                  {selectedArticle.google_drive_url && (
                    <a
                      className="news-modal-link-btn drive"
                      href={selectedArticle.google_drive_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <div className="news-modal-link-icon">📂</div>
                      <div className="news-modal-link-text">
                        <strong>Ver álbum de fotos</strong>
                        <span>Google Drive — Imágenes del evento</span>
                      </div>
                      <span style={{ marginLeft: 'auto', fontSize: '20px' }}>→</span>
                    </a>
                  )}
                  {selectedArticle.external_link && (
                    <a
                      className="news-modal-link-btn external"
                      href={selectedArticle.external_link}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <div className="news-modal-link-icon dark">🌐</div>
                      <div className="news-modal-link-text">
                        <strong>Más información</strong>
                        <span>Ver sitio externo</span>
                      </div>
                      <span style={{ marginLeft: 'auto', fontSize: '20px', color: '#9ca3af' }}>→</span>
                    </a>
                  )}
                </div>
              )}

              {/* Footer del modal */}
              <div style={{
                marginTop: '28px',
                paddingTop: '16px',
                borderTop: '1px solid #f0f0f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                color: '#9ca3af',
                fontSize: '0.82rem',
              }}>
                <span>👁️ {selectedArticle.views_count} visualizaciones</span>
                <button
                  onClick={() => setSelectedArticle(null)}
                  style={{
                    background: '#f3f4f6',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    cursor: 'pointer',
                    color: '#4b5563',
                    fontWeight: 600,
                    fontSize: '0.87rem',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#e5e7eb')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#f3f4f6')}
                >
                  Cerrar ✕
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
