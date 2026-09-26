/**
 * Component: NewsEventForm
 * Formulario para crear y editar eventos
 */

'use client';

import { useEffect, useState } from 'react';
import { NewsEvent } from '@/lib/newsTypes';
import { adminFetch } from '@/lib/adminAuth';

interface NewsEventFormProps {
  articleId: string;
  event?: NewsEvent;
  onSave?: (event: NewsEvent) => void;
  onCancel?: () => void;
}

export function NewsEventForm({ articleId, event, onSave, onCancel }: NewsEventFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    start_date: '',
    start_time: '',
    end_date: '',
    end_time: '',
    location_name: '',
    location_address: '',
    google_maps_url: '',
    location_lat: '',
    location_lng: '',
    allow_inscription: false,
    max_participants: '',
    inscription_deadline: '',
    contact_person_name: '',
    contact_email: '',
    contact_phone: '',
  });

  useEffect(() => {
    if (event) {
      setFormData({
        start_date: event.start_date || '',
        start_time: event.start_time || '',
        end_date: event.end_date || '',
        end_time: event.end_time || '',
        location_name: event.location_name || '',
        location_address: event.location_address || '',
        google_maps_url: event.google_maps_url || '',
        location_lat: event.location_lat?.toString() || '',
        location_lng: event.location_lng?.toString() || '',
        allow_inscription: event.allow_inscription,
        max_participants: event.max_participants?.toString() || '',
        inscription_deadline: event.inscription_deadline || '',
        contact_person_name: event.contact_person_name || '',
        contact_email: event.contact_email || '',
        contact_phone: event.contact_phone || '',
      });
    }
  }, [event]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const method = event ? 'PATCH' : 'POST';
      const endpoint = event ? `/api/news/events/${event.id}` : '/api/news/events';

      const payload = {
        ...formData,
        article_id: articleId,
        location_lat: formData.location_lat ? parseFloat(formData.location_lat) : null,
        location_lng: formData.location_lng ? parseFloat(formData.location_lng) : null,
        max_participants: formData.max_participants ? parseInt(formData.max_participants) : null,
      };

      const response = await adminFetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.success) {
        onSave?.(data.data);
      } else {
        setError(data.error || 'Error saving event');
      }
    } catch (err) {
      setError('Error saving event');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', background: 'white', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
      <style jsx>{`
        .form-group {
          margin-bottom: 20px;
        }
        label {
          display: block;
          margin-bottom: 8px;
          font-weight: 500;
          color: #333;
        }
        input[type='text'],
        input[type='date'],
        input[type='time'],
        input[type='email'],
        input[type='number'],
        input[type='url'],
        textarea,
        select {
          width: 100%;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 1rem;
          font-family: inherit;
        }
        input:focus,
        textarea:focus,
        select:focus {
          outline: none;
          border-color: #C8973A;
          box-shadow: 0 0 0 3px rgba(200, 151, 58, 0.1);
        }
        .checkbox-group {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        input[type='checkbox'] {
          width: 18px;
          height: 18px;
          cursor: pointer;
        }
        .button-group {
          display: flex;
          gap: 10px;
          margin-top: 30px;
        }
        button {
          padding: 10px 20px;
          border: none;
          border-radius: 4px;
          font-size: 1rem;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s;
        }
        .btn-save {
          background: #C8973A;
          color: white;
        }
        .btn-save:hover:not(:disabled) {
          background: #b07d2e;
        }
        .btn-cancel {
          background: #eee;
          color: #333;
          border: 1px solid #ddd;
        }
        .btn-cancel:hover {
          background: #ddd;
        }
        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .error {
          background: #fee;
          color: #c33;
          padding: 12px;
          border-radius: 4px;
          margin-bottom: 20px;
        }
        .help-text {
          font-size: 0.85rem;
          color: #666;
          margin-top: 4px;
        }
        .row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }
        .row.full {
          grid-template-columns: 1fr;
        }
        .section-title {
          font-size: 1.1rem;
          font-weight: 600;
          margin-top: 25px;
          margin-bottom: 15px;
          color: #333;
          border-bottom: 2px solid #eee;
          padding-bottom: 10px;
        }
        @media (max-width: 768px) {
          .row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <h2 style={{ marginBottom: '20px', color: '#333' }}>
        {event ? 'Editar Evento' : 'Crear Nuevo Evento'}
      </h2>

      {error && <div className="error">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="section-title">📅 Fechas y Horarios</div>

        <div className="row">
          <div className="form-group">
            <label htmlFor="start_date">Fecha de Inicio *</label>
            <input
              id="start_date"
              type="date"
              name="start_date"
              value={formData.start_date}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="start_time">Hora de Inicio</label>
            <input
              id="start_time"
              type="time"
              name="start_time"
              value={formData.start_time}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label htmlFor="end_date">Fecha de Fin</label>
            <input
              id="end_date"
              type="date"
              name="end_date"
              value={formData.end_date}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label htmlFor="end_time">Hora de Fin</label>
            <input
              id="end_time"
              type="time"
              name="end_time"
              value={formData.end_time}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="section-title">📍 Ubicación</div>

        <div className="form-group">
          <label htmlFor="location_name">Nombre del Lugar</label>
          <input
            id="location_name"
            type="text"
            name="location_name"
            value={formData.location_name}
            onChange={handleChange}
            placeholder="Ej: Santuario Virgen del Rosario"
          />
        </div>

        <div className="form-group">
          <label htmlFor="location_address">Dirección</label>
          <input
            id="location_address"
            type="text"
            name="location_address"
            value={formData.location_address}
            onChange={handleChange}
            placeholder="Calle, número, ciudad"
          />
        </div>

        <div className="form-group">
          <label htmlFor="google_maps_url">Enlace Google Maps</label>
          <input
            id="google_maps_url"
            type="url"
            name="google_maps_url"
            value={formData.google_maps_url}
            onChange={handleChange}
            placeholder="https://maps.google.com/maps?q=..."
          />
          <div className="help-text">Enlace compartible de Google Maps del evento</div>
        </div>

        <div className="row">
          <div className="form-group">
            <label htmlFor="location_lat">Latitud</label>
            <input
              id="location_lat"
              type="number"
              name="location_lat"
              value={formData.location_lat}
              onChange={handleChange}
              placeholder="-25.3025"
              min="-90"
              max="90"
              step="0.0001"
            />
          </div>

          <div className="form-group">
            <label htmlFor="location_lng">Longitud</label>
            <input
              id="location_lng"
              type="number"
              name="location_lng"
              value={formData.location_lng}
              onChange={handleChange}
              placeholder="-57.6157"
              min="-180"
              max="180"
              step="0.0001"
            />
          </div>
        </div>

        <div className="section-title">✍️ Inscripción</div>

        <div className="form-group">
          <div className="checkbox-group">
            <input
              id="allow_inscription"
              type="checkbox"
              name="allow_inscription"
              checked={formData.allow_inscription}
              onChange={handleChange}
            />
            <label htmlFor="allow_inscription" style={{ margin: 0 }}>
              Permitir inscripción
            </label>
          </div>
        </div>

        {formData.allow_inscription && (
          <>
            <div className="row">
              <div className="form-group">
                <label htmlFor="max_participants">Máx. Participantes</label>
                <input
                  id="max_participants"
                  type="number"
                  name="max_participants"
                  value={formData.max_participants}
                  onChange={handleChange}
                  placeholder="Ej: 200"
                  min="1"
                />
              </div>

              <div className="form-group">
                <label htmlFor="inscription_deadline">Fecha Límite Inscripción</label>
                <input
                  id="inscription_deadline"
                  type="date"
                  name="inscription_deadline"
                  value={formData.inscription_deadline}
                  onChange={handleChange}
                />
              </div>
            </div>
          </>
        )}

        <div className="section-title">📞 Contacto</div>

        <div className="row">
          <div className="form-group">
            <label htmlFor="contact_person_name">Nombre de Contacto</label>
            <input
              id="contact_person_name"
              type="text"
              name="contact_person_name"
              value={formData.contact_person_name}
              onChange={handleChange}
              placeholder="Ej: Juan García"
            />
          </div>

          <div className="form-group">
            <label htmlFor="contact_email">Email de Contacto</label>
            <input
              id="contact_email"
              type="email"
              name="contact_email"
              value={formData.contact_email}
              onChange={handleChange}
              placeholder="contacto@ejemplo.com"
            />
          </div>

          <div className="form-group">
            <label htmlFor="contact_phone">Teléfono de Contacto</label>
            <input
              id="contact_phone"
              type="text"
              name="contact_phone"
              value={formData.contact_phone}
              onChange={handleChange}
              placeholder="+595 981 123456"
            />
          </div>
        </div>

        <div className="button-group">
          <button type="submit" className="btn-save" disabled={loading}>
            {loading ? 'Guardando...' : event ? 'Actualizar' : 'Crear'}
          </button>
          <button type="button" className="btn-cancel" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

export default NewsEventForm;
