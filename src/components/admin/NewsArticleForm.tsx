/**
 * Component: NewsArticleForm
 * Formulario para crear y editar artículos de noticias
 */

'use client';

import { useEffect, useState, useRef } from 'react';
import { NewsArticleWithDetails, NewsCategory } from '@/lib/newsTypes';
import { uploadFile } from '@/lib/uploadFile';

interface NewsArticleFormProps {
  article?: NewsArticleWithDetails;
  onSave?: (article: NewsArticleWithDetails) => void;
  onCancel?: () => void;
}

export function NewsArticleForm({ article, onSave, onCancel }: NewsArticleFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<NewsCategory[]>([]);
  const [formData, setFormData] = useState({
    title: '',
    subtitle: '',
    body: '',
    category_id: '',
    featured_image_url: '',
    google_drive_url: '',
    inscription_url: '',
    external_link: '',
    event_date: '',
    event_location: '',
    published: false,
  });

  useEffect(() => {
    fetchCategories();
    if (article) {
      setFormData({
        title: article.title,
        subtitle: article.subtitle || '',
        body: article.body,
        category_id: article.category_id || '',
        featured_image_url: article.featured_image_url || '',
        google_drive_url: (article as any).google_drive_url || '',
        inscription_url: (article as any).inscription_url || '',
        external_link: (article as any).external_link || '',
        event_date: (article as any).event_date || '',
        event_location: (article as any).event_location || '',
        published: article.published,
      });
    }
  }, [article]);

  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/news/categories');
      const data = await response.json();
      if (data.success) {
        setCategories(data.data);
      }
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    });
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!file.type.startsWith('image/')) {
      setError('El archivo seleccionado debe ser una imagen.');
      return;
    }

    const res = await uploadFile(file);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setFormData(prev => ({
      ...prev,
      featured_image_url: res.url,
    }));
    setError(res.inDatabase
      ? 'Aviso: la imagen quedó guardada dentro de la base de datos porque el almacenamiento de archivos no está activo.'
      : null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const method = article ? 'PATCH' : 'POST';
      const endpoint = article ? `/api/news/articles/${article.id}` : '/api/news/articles';

      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.success) {
        onSave?.(data.data);
      } else {
        setError(data.error || (data.details ? data.details.join(', ') : 'Error al guardar el artículo'));
      }
    } catch (err) {
      setError('Error al conectar con el servidor');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="naf-wrapper">
      <style>{`
        .naf-wrapper {
          font-family: 'Inter', 'Segoe UI', sans-serif;
          color: var(--navy-mid);
        }
        .naf-topbar {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 20px;
        }
        .naf-back-btn {
          border: 1px solid rgba(200, 151, 58, 0.7);
          background: white;
          color: #C8973A;
          border-radius: 12px;
          padding: 11px 18px;
          font-size: 0.9rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .naf-back-btn:hover {
          background: #fffaf0;
          transform: translateY(-1px);
        }
        .naf-header {
          background: linear-gradient(135deg, var(--navy-mid) 0%, var(--navy-dark) 50%, #0f3460 100%);
          padding: 28px 32px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          gap: 16px;
          min-width: 0;
        }
        .naf-header-icon {
          width: 48px;
          height: 48px;
          background: linear-gradient(135deg, #C8973A, #f0c060);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          flex-shrink: 0;
        }
        .naf-header h2 {
          margin: 0;
          font-size: 1.4rem;
          font-weight: 700;
          color: white;
          letter-spacing: -0.3px;
        }
        .naf-header p {
          margin: 2px 0 0;
          font-size: 0.85rem;
          color: rgba(255,255,255,0.6);
        }
        .naf-body {
          padding: 28px 0 0;
        }
        .naf-section {
          background: #f8f9fc;
          border: 1px solid #e8eaf0;
          border-radius: 12px;
          margin-bottom: 20px;
          overflow: hidden;
        }
        .naf-section-header {
          background: linear-gradient(90deg, var(--navy-mid), var(--navy-dark));
          padding: 14px 20px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .naf-section-header span.icon {
          font-size: 18px;
        }
        .naf-section-header h3 {
          margin: 0;
          font-size: 0.9rem;
          font-weight: 700;
          color: white;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }
        .naf-section-body {
          padding: 20px;
        }
        .naf-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        @media (max-width: 600px) {
          .naf-row { grid-template-columns: 1fr; }
          .naf-topbar { align-items: stretch; flex-direction: column; }
          .naf-back-btn { width: 100%; justify-content: center; }
          .naf-header { padding: 20px 16px; }
        }
        .naf-field {
          margin-bottom: 16px;
        }
        .naf-field:last-child {
          margin-bottom: 0;
        }
        .naf-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.82rem;
          font-weight: 600;
          color: #374151;
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .naf-label .req {
          color: #ef4444;
          font-size: 0.75rem;
        }
        .naf-label .opt {
          color: #9ca3af;
          font-size: 0.72rem;
          font-weight: 400;
          text-transform: none;
          letter-spacing: 0;
        }
        .naf-input,
        .naf-select,
        .naf-textarea {
          width: 100%;
          padding: 10px 14px;
          border: 1.5px solid #e0e4ef;
          border-radius: 8px;
          font-size: 0.95rem;
          font-family: inherit;
          color: var(--navy-mid);
          background: white;
          transition: all 0.2s;
          box-sizing: border-box;
        }
        .naf-input:focus,
        .naf-select:focus,
        .naf-textarea:focus {
          outline: none;
          border-color: #C8973A;
          box-shadow: 0 0 0 3px rgba(200, 151, 58, 0.12);
          background: #fffdf8;
        }
        .naf-input::placeholder,
        .naf-textarea::placeholder {
          color: #c0c4d0;
        }
        .naf-textarea {
          min-height: 160px;
          resize: vertical;
          line-height: 1.6;
        }
        .naf-hint {
          font-size: 0.78rem;
          color: #9ca3af;
          margin-top: 5px;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .naf-char-count {
          font-size: 0.78rem;
          color: #9ca3af;
          text-align: right;
          margin-top: 4px;
        }
        .naf-toggle-row {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 16px;
          background: white;
          border-radius: 10px;
          border: 1.5px solid #e0e4ef;
          cursor: pointer;
          transition: all 0.2s;
        }
        .naf-toggle-row:hover {
          border-color: #C8973A;
          background: #fffdf8;
        }
        .naf-toggle {
          position: relative;
          width: 48px;
          height: 26px;
          flex-shrink: 0;
        }
        .naf-toggle input {
          opacity: 0;
          width: 0;
          height: 0;
          position: absolute;
        }
        .naf-slider {
          position: absolute;
          inset: 0;
          background: #d1d5db;
          border-radius: 13px;
          transition: 0.3s;
          cursor: pointer;
        }
        .naf-slider::before {
          content: '';
          position: absolute;
          height: 20px;
          width: 20px;
          left: 3px;
          bottom: 3px;
          background: white;
          border-radius: 50%;
          transition: 0.3s;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .naf-toggle input:checked + .naf-slider {
          background: linear-gradient(135deg, #C8973A, #e8b84a);
        }
        .naf-toggle input:checked + .naf-slider::before {
          transform: translateX(22px);
        }
        .naf-toggle-label {
          flex: 1;
        }
        .naf-toggle-label strong {
          display: block;
          font-size: 0.95rem;
          color: var(--navy-mid);
        }
        .naf-toggle-label span {
          font-size: 0.82rem;
          color: #9ca3af;
        }
        .naf-error {
          background: linear-gradient(135deg, #fee2e2, #fecaca);
          border: 1px solid #fca5a5;
          color: #991b1b;
          padding: 14px 18px;
          border-radius: 10px;
          margin-bottom: 20px;
          display: flex;
          align-items: flex-start;
          gap: 10px;
          font-size: 0.9rem;
        }
        .naf-actions {
          display: flex;
          gap: 12px;
          padding-top: 8px;
          margin-top: 4px;
        }
        .naf-btn-save {
          flex: 1;
          padding: 13px 24px;
          background: linear-gradient(135deg, #C8973A 0%, #e8b84a 100%);
          color: white;
          border: none;
          border-radius: 10px;
          font-size: 0.95rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.25s;
          letter-spacing: 0.3px;
          box-shadow: 0 4px 12px rgba(200, 151, 58, 0.35);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .naf-btn-save:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(200, 151, 58, 0.45);
        }
        .naf-btn-save:disabled {
          opacity: 0.65;
          cursor: not-allowed;
          transform: none;
        }
        .naf-btn-cancel {
          padding: 13px 24px;
          background: white;
          color: #4b5563;
          border: 1.5px solid #e0e4ef;
          border-radius: 10px;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .naf-btn-cancel:hover {
          background: #f3f4f6;
          border-color: #9ca3af;
        }
        .naf-link-input-wrap {
          position: relative;
        }
        .naf-link-input-wrap .link-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 14px;
          pointer-events: none;
          opacity: 0.6;
        }
        .naf-link-input-wrap .naf-input {
          padding-left: 36px;
        }
        .naf-image-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 10px;
        }
        .naf-image-upload-btn,
        .naf-image-clear-btn {
          border-radius: 10px;
          padding: 9px 14px;
          font-size: 0.82rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .naf-image-upload-btn {
          background: #fffaf0;
          color: #92630a;
          border: 1px solid rgba(200, 151, 58, 0.35);
        }
        .naf-image-clear-btn {
          background: #fff;
          color: #6b7280;
          border: 1px solid #e5e7eb;
        }
        .naf-image-preview {
          margin-top: 14px;
          border-radius: 14px;
          overflow: hidden;
          border: 1px solid #e8eaf0;
          background: #fff;
          max-width: 360px;
        }
        .naf-image-preview img {
          display: block;
          width: 100%;
          aspect-ratio: 16 / 9;
          object-fit: cover;
        }
        .naf-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 10px;
          border-radius: 20px;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.5px;
        }
        .naf-badge-gold {
          background: rgba(200, 151, 58, 0.15);
          color: #92630a;
        }
        .naf-badge-blue {
          background: rgba(59, 130, 246, 0.12);
          color: #1d4ed8;
        }
      `}</style>

      <div className="naf-topbar">
        {onCancel && (
          <button type="button" className="naf-back-btn" onClick={onCancel}>
            ← Volver a la lista
          </button>
        )}
        <div className="naf-header" style={{ flex: '1 1 420px' }}>
          <div className="naf-header-icon">
            {article ? '✏️' : '✨'}
          </div>
          <div>
            <h2>{article ? 'Editar Artículo' : 'Crear Nueva Noticia'}</h2>
            <p>{article ? `Modificando: ${article.title.slice(0, 50)}...` : 'Completa los campos para publicar una nueva noticia'}</p>
          </div>
        </div>
      </div>

      <div className="naf-body">
        {error && (
          <div className="naf-error">
            <span>⚠️</span>
            <div>{error}</div>
          </div>
        )}

        <form ref={formRef} onSubmit={handleSubmit}>
          {/* Sección 1: Contenido Principal */}
          <div className="naf-section">
            <div className="naf-section-header">
              <span className="icon">📝</span>
              <h3>Contenido Principal</h3>
            </div>
            <div className="naf-section-body">
              <div className="naf-row">
                <div className="naf-field" style={{ gridColumn: '1 / -1' }}>
                  <div className="naf-label">
                    Título <span className="req">*</span>
                  </div>
                  <input
                    className="naf-input"
                    id="title"
                    type="text"
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                    placeholder="Ej: Retiro Cuaresmal Juvenil 2025"
                    required
                    minLength={5}
                    maxLength={200}
                  />
                  <div className="naf-char-count">{formData.title.length}/200</div>
                </div>

                <div className="naf-field">
                  <div className="naf-label">
                    Categoría <span className="opt">· opcional</span>
                  </div>
                  <select
                    className="naf-select"
                    id="category"
                    name="category_id"
                    value={formData.category_id}
                    onChange={handleChange}
                  >
                    <option value="">-- Sin categoría --</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.icon_emoji} {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="naf-field">
                  <div className="naf-label">
                    Copete / Subtítulo <span className="opt">· opcional</span>
                  </div>
                  <input
                    className="naf-input"
                    id="subtitle"
                    type="text"
                    name="subtitle"
                    value={formData.subtitle}
                    onChange={handleChange}
                    placeholder="Resumen breve que aparece en la tarjeta"
                    maxLength={300}
                  />
                  <div className="naf-char-count">{formData.subtitle.length}/300</div>
                </div>
              </div>

              <div className="naf-field">
                <div className="naf-label">
                  Cuerpo del Artículo <span className="req">*</span>
                </div>
                <textarea
                  className="naf-textarea"
                  id="body"
                  name="body"
                  value={formData.body}
                  onChange={handleChange}
                  placeholder="Escribe aquí el contenido completo de la noticia. Puedes incluir URLs directamente en el texto, se convertirán en links automáticamente."
                  required
                  minLength={20}
                  maxLength={10000}
                />
                <div className="naf-char-count">{formData.body.length}/10000</div>
                <div className="naf-hint">💡 Las URLs que escribas en el texto se mostrarán como links clicables al publicar</div>
              </div>
            </div>
          </div>

          {/* Sección 2: Imágenes y Recursos */}
          <div className="naf-section">
            <div className="naf-section-header">
              <span className="icon">🖼️</span>
              <h3>Imágenes y Recursos</h3>
            </div>
            <div className="naf-section-body">
              <div className="naf-row">
                <div className="naf-field">
                  <div className="naf-label">
                    URL de Imagen Destacada <span className="opt">· opcional</span>
                  </div>
                  <div className="naf-link-input-wrap">
                    <span className="link-icon">🌐</span>
                    <input
                      className="naf-input"
                      id="featured_image_url"
                      type="text"
                      name="featured_image_url"
                      value={formData.featured_image_url}
                      onChange={handleChange}
                      placeholder="https://ejemplo.com/imagen.jpg o sube una imagen"
                    />
                  </div>
                  <div className="naf-image-actions">
                    <label className="naf-image-upload-btn">
                      Subir desde la computadora
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageFileChange}
                        style={{ display: 'none' }}
                      />
                    </label>
                    {formData.featured_image_url && (
                      <button
                        type="button"
                        className="naf-image-clear-btn"
                        onClick={() => setFormData(prev => ({ ...prev, featured_image_url: '' }))}
                      >
                        Quitar imagen
                      </button>
                    )}
                  </div>
                  <div className="naf-hint">📸 Imagen principal que aparece en la tarjeta y al abrir la noticia</div>
                  {formData.featured_image_url && (
                    <div className="naf-image-preview">
                      <img src={formData.featured_image_url} alt="Previsualización de imagen destacada" />
                    </div>
                  )}
                </div>

                <div className="naf-field">
                  <div className="naf-label">
                    Google Drive — Álbum de Fotos <span className="opt">· opcional</span>
                  </div>
                  <div className="naf-link-input-wrap">
                    <span className="link-icon">📂</span>
                    <input
                      className="naf-input"
                      id="google_drive_url"
                      type="url"
                      name="google_drive_url"
                      value={formData.google_drive_url}
                      onChange={handleChange}
                      placeholder="https://drive.google.com/drive/folders/..."
                    />
                  </div>
                  <div className="naf-hint">📁 Link a carpeta de Google Drive con fotos del evento</div>
                </div>
              </div>
            </div>
          </div>

          {/* Sección 3: Detalles del Evento */}
          <div className="naf-section">
            <div className="naf-section-header">
              <span className="icon">📅</span>
              <h3>Detalles del Evento</h3>
              <span className="naf-badge naf-badge-blue" style={{ marginLeft: 'auto' }}>Opcional</span>
            </div>
            <div className="naf-section-body">
              <div className="naf-row">
                <div className="naf-field">
                  <div className="naf-label">
                    📅 Fecha del Evento / Actividad
                  </div>
                  <input
                    className="naf-input"
                    id="event_date"
                    type="date"
                    name="event_date"
                    value={formData.event_date}
                    onChange={handleChange}
                  />
                  <div className="naf-hint">Diferente a la fecha de publicación. Cuándo se realizará el evento</div>
                </div>

                <div className="naf-field">
                  <div className="naf-label">
                    📍 Lugar del Evento
                  </div>
                  <input
                    className="naf-input"
                    id="event_location"
                    type="text"
                    name="event_location"
                    value={formData.event_location}
                    onChange={handleChange}
                    placeholder="Ej: Parroquia San Francisco, Asunción"
                    maxLength={200}
                  />
                </div>
              </div>

              <div className="naf-row">
                <div className="naf-field">
                  <div className="naf-label">
                    🔗 Link de Inscripción / Registro
                  </div>
                  <div className="naf-link-input-wrap">
                    <span className="link-icon">✍️</span>
                    <input
                      className="naf-input"
                      id="inscription_url"
                      type="url"
                      name="inscription_url"
                      value={formData.inscription_url}
                      onChange={handleChange}
                      placeholder="https://forms.gle/... o cualquier link"
                    />
                  </div>
                  <div className="naf-hint">Link a formulario de Google Forms, Eventbrite, etc.</div>
                </div>

                <div className="naf-field">
                  <div className="naf-label">
                    🌐 Link Externo / Más Información
                  </div>
                  <div className="naf-link-input-wrap">
                    <span className="link-icon">🔗</span>
                    <input
                      className="naf-input"
                      id="external_link"
                      type="url"
                      name="external_link"
                      value={formData.external_link}
                      onChange={handleChange}
                      placeholder="https://ejemplo.com/mas-informacion"
                    />
                  </div>
                  <div className="naf-hint">Página oficial, blog, o cualquier recurso adicional</div>
                </div>
              </div>
            </div>
          </div>

          {/* Sección 4: Publicación */}
          <div className="naf-section">
            <div className="naf-section-header">
              <span className="icon">🚀</span>
              <h3>Publicación</h3>
            </div>
            <div className="naf-section-body">
              <label className="naf-toggle-row" htmlFor="published">
                <div className="naf-toggle">
                  <input
                    id="published"
                    type="checkbox"
                    name="published"
                    checked={formData.published}
                    onChange={handleChange}
                  />
                  <span className="naf-slider"></span>
                </div>
                <div className="naf-toggle-label">
                  <strong>{formData.published ? '✅ Publicar inmediatamente' : '📝 Guardar como borrador'}</strong>
                  <span>
                    {formData.published
                      ? 'La noticia será visible en la página principal al guardar'
                      : 'La noticia no será visible públicamente hasta que la publiques'}
                  </span>
                </div>
                {formData.published && (
                  <span className="naf-badge naf-badge-gold">🟢 Activo</span>
                )}
              </label>
            </div>
          </div>

          {/* Acciones */}
          <div className="naf-actions">
            <button type="submit" className="naf-btn-save" disabled={loading}>
              {loading ? (
                <>
                  <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span>
                  Guardando...
                </>
              ) : (
                <>
                  {article ? '💾 Actualizar Artículo' : '✨ Crear y Publicar'}
                </>
              )}
            </button>
            <button type="button" className="naf-btn-cancel" onClick={onCancel}>
              Cancelar
            </button>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default NewsArticleForm;
