'use client';

import Link from 'next/link';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif' }}>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '14px',
            background: 'linear-gradient(155deg, #1A2744 0%, var(--navy-mid) 100%)',
            color: '#fff',
            textAlign: 'center',
            padding: '24px',
          }}
        >
          <div style={{ fontSize: '44px' }}>✝</div>
          <h1 style={{ fontSize: '1.4rem', margin: 0 }}>Algo salió mal</h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', maxWidth: '420px', lineHeight: 1.7, margin: 0 }}>
            Ocurrió un error inesperado al cargar la página. Podés reintentar o volver al inicio.
          </p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '8px' }}>
            <button
              onClick={reset}
              style={{
                padding: '13px 28px',
                borderRadius: '10px',
                border: 'none',
                background: '#C8973A',
                color: '#1A2744',
                fontWeight: 800,
                fontSize: '13px',
                letterSpacing: '1px',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              Reintentar
            </button>
            <Link
              href="/"
              style={{
                padding: '13px 28px',
                borderRadius: '10px',
                border: '1.5px solid rgba(255,255,255,0.3)',
                color: '#fff',
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: '13px',
                letterSpacing: '1px',
                textTransform: 'uppercase',
              }}
            >
              Ir al inicio
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
