'use client';

import { useState, useEffect } from 'react';
import { siteUrlOf } from '@/lib/siteUrl';

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [cooldown, setCooldown] = useState<number>(0);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (cooldown > 0) return;
    setStatus('sending');
    setMessage('');

    try {
      const response = await fetch('/api/supabase/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          redirectTo: siteUrlOf('/reset-password/recover'),
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        setStatus('error');
        // Detect rate-limit style messages and show friendly message with cooldown
        const lower = String(result.message || '').toLowerCase();
        if (lower.includes('rate') || lower.includes('limit') || lower.includes('too many requests')) {
          setMessage('Se han enviado demasiadas solicitudes. Intenta nuevamente en unos minutos.');
          // start client-side cooldown to discourage immediate retries
          setCooldown(60);
        } else {
          setMessage(result.message || 'No se pudo enviar el correo. Intenta de nuevo.');
        }
        return;
      }

      setStatus('success');
      setMessage('Correo enviado. Revisa tu bandeja de entrada (y spam).');
      setCooldown(60);
    } catch (error) {
      setStatus('error');
      setMessage('Ocurrió un error. Intenta nuevamente más tarde.');
    }
  };

  // Cooldown ticker
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  return (
    <main style={mainStyle}>
      <div style={cardStyle}>
        <div style={headerStyle}>
          <div style={logoStyle}>Pastoral</div>
          <p style={subtitleStyle}>Recupera tu contraseña de forma segura</p>
        </div>

        <div style={contentStyle}>
          <h1 style={titleStyle}>¿Olvidaste tu contraseña?</h1>
          <p style={textStyle}>
            Ingresa el correo con el que te registraste y te enviaremos un enlace seguro para restablecer tu contraseña.
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '18px', marginTop: '28px' }}>
            <label style={labelStyle}>Correo electrónico</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="correo@dominio.com"
              required
              style={inputStyle}
            />

            <button type="submit" style={buttonStyle} disabled={status === 'sending' || cooldown > 0}>
              {status === 'sending' ? 'Enviando enlace...' : cooldown > 0 ? `Reintentar en ${cooldown}s` : 'Enviar enlace de recuperación'}
            </button>
          </form>

          {status !== 'idle' && (
            <div style={status === 'success' ? successBoxStyle : errorBoxStyle}>
              {status === 'success' ? '✅' : '⚠️'} {message}
            </div>
          )}

          <div style={stepsCardStyle}>
            <h2 style={stepsTitle}>Pasos a seguir</h2>
            <ol style={stepsList}>
              <li>Escribe tu correo y envía el formulario.</li>
              <li>Abre el mensaje que recibirás en tu bandeja de entrada.</li>
              <li>Sigue el enlace seguro para crear tu nueva contraseña.</li>
              <li>Regresa al panel y accede con tu contraseña renovada.</li>
            </ol>
          </div>

          <p style={verseStyle}>
            “Yo sé los planes que tengo para ustedes: planes de bienestar y no de mal, para darles un futuro y una esperanza.”
            <br />
            <span style={verseCiteStyle}>Jeremías 29, 11</span>
          </p>
        </div>
      </div>
    </main>
  );
}

const mainStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '24px',
  background: 'radial-gradient(circle at top left, rgba(248, 209, 98, 0.18), transparent 25%), linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)',
};

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '620px',
  borderRadius: '28px',
  background: 'rgba(255, 255, 255, 0.98)',
  border: '1px solid rgba(226, 232, 240, 0.8)',
  boxShadow: '0 32px 80px rgba(15, 23, 42, 0.08)',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #7c3aed 0%, #f59e0b 100%)',
  color: '#ffffff',
  padding: '34px 28px',
  textAlign: 'center',
};

const logoStyle: React.CSSProperties = {
  fontSize: '2.2rem',
  fontWeight: 800,
  letterSpacing: '0.08em',
};

const subtitleStyle: React.CSSProperties = {
  margin: '12px 0 0',
  color: '#f8e3a0',
  fontSize: '0.95rem',
};

const contentStyle: React.CSSProperties = {
  padding: '34px 32px 40px',
};

const titleStyle: React.CSSProperties = {
  fontSize: '2rem',
  margin: 0,
  color: '#0f172a',
  lineHeight: 1.05,
};

const textStyle: React.CSSProperties = {
  marginTop: '16px',
  color: '#475569',
  lineHeight: 1.75,
  fontSize: '1rem',
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.95rem',
  fontWeight: 700,
  color: '#334155',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '16px 18px',
  borderRadius: '16px',
  border: '1px solid rgba(148, 163, 184, 0.32)',
  background: 'rgba(248, 250, 252, 0.98)',
  color: '#0f172a',
  fontSize: '1rem',
  outline: 'none',
};

const buttonStyle: React.CSSProperties = {
  width: '100%',
  padding: '16px 20px',
  borderRadius: '16px',
  border: 'none',
  background: 'linear-gradient(135deg, #c2410c 0%, #f59e0b 100%)',
  color: '#fff',
  fontWeight: 700,
  fontSize: '1rem',
  cursor: 'pointer',
  transition: 'transform 0.2s ease',
};

const statusBoxBase: React.CSSProperties = {
  marginTop: '22px',
  padding: '18px 20px',
  borderRadius: '16px',
  fontSize: '0.95rem',
};

const successBoxStyle: React.CSSProperties = {
  ...statusBoxBase,
  background: 'rgba(220, 252, 231, 0.9)',
  color: '#166534',
  border: '1px solid rgba(34, 197, 94, 0.18)',
};

const errorBoxStyle: React.CSSProperties = {
  ...statusBoxBase,
  background: 'rgba(254, 226, 226, 0.9)',
  color: '#991b1b',
  border: '1px solid rgba(239, 68, 68, 0.18)',
};

const stepsCardStyle: React.CSSProperties = {
  marginTop: '28px',
  padding: '24px',
  borderRadius: '22px',
  background: 'rgba(249, 250, 251, 0.96)',
  border: '1px solid rgba(226, 232, 240, 0.9)',
};

const verseStyle: React.CSSProperties = {
  marginTop: '24px',
  padding: '18px 22px',
  borderRadius: '18px',
  background: 'linear-gradient(160deg, #fffbea, #fdf4dd)',
  border: '1px solid rgba(200, 151, 58, 0.3)',
  fontFamily: "'Playfair Display', Georgia, serif",
  fontStyle: 'italic',
  color: '#5b4626',
  lineHeight: 1.7,
  fontSize: '1rem',
};

const verseCiteStyle: React.CSSProperties = {
  fontStyle: 'normal',
  fontWeight: 800,
  fontSize: '0.8rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#a07d3b',
};

const stepsTitle: React.CSSProperties = {
  margin: 0,
  fontSize: '1.05rem',
  color: '#0f172a',
  fontWeight: 700,
};

const stepsList: React.CSSProperties = {
  margin: '16px 0 0',
  paddingLeft: '20px',
  color: '#334155',
  lineHeight: 1.8,
};
