'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

type Phase = 'checking' | 'ready' | 'invalid' | 'done';

const VERSES: { text: string; cite: string }[] = [
  { text: 'No temas, porque yo estoy contigo; no desmayes, porque yo soy tu Dios que te fortalezco.', cite: 'Isaías 41, 10' },
  { text: 'Cercano está el Señor a los quebrantados de corazón, y salva a los contritos de espíritu.', cite: 'Salmo 34, 19' },
  { text: 'Vengan a mí todos los que están cansados y agobiados, y yo los aliviaré.', cite: 'Mateo 11, 28' },
  { text: 'Confía en el Señor de todo corazón, y no te apoyes en tu propia prudencia. Reconócelo en todos tus caminos, y él enderezará tus sendas.', cite: 'Proverbios 3, 5-6' },
  { text: 'He aquí, yo hago nuevas todas las cosas.', cite: 'Apocalipsis 21, 5' },
  { text: 'De modo que si alguno está en Cristo, nueva criatura es; las cosas viejas pasaron; he aquí todas son hechas nuevas.', cite: '2 Corintios 5, 17' },
  { text: 'Yo sé los planes que tengo para ustedes, planes de bienestar y no de mal, para darles un futuro y una esperanza.', cite: 'Jeremías 29, 11' },
  { text: 'Crea en mí, oh Dios, un corazón limpio, y renueva un espíritu recto dentro de mí.', cite: 'Salmo 51, 12' },
];

const passwordScore = (pw: string): { score: number; label: string; color: string } => {
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (/[A-ZÁÉÍÓÚÑ]/.test(pw) && /[a-záéíóúñ]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ]/.test(pw)) score += 1;
  const label = ['Muy corta', 'Débil', 'Aceptable', 'Fuerte', 'Muy fuerte'][score];
  const color = ['#dc2626', '#f59e0b', '#eab308', '#16a34a', '#059669'][score];
  return { score, label, color };
};

const friendlyPasswordError = (message?: string | null): string => {
  const m = String(message || '').toLowerCase();
  if (m.includes('at least') || m.includes('6 characters') || m.includes('password should')) {
    return 'La contraseña debe tener al menos 6 caracteres (idealmente 8 o más).';
  }
  if (m.includes('expired') || m.includes('jwt')) return 'Tu enlace ha vencido. Solicita uno nuevo.';
  return message || 'Hubo un problema al actualizar la contraseña. Intenta nuevamente.';
};

export default function RecoverPasswordPage() {
  const [phase, setPhase] = useState<Phase>('checking');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [verse, setVerse] = useState(VERSES[Math.floor(Math.random() * VERSES.length)]);
  const supabaseRef = useRef<SupabaseClient | null>(null);

  useEffect(() => {
    let cancelled = false;
    try {
      supabaseRef.current = getSupabaseClient();
    } catch {
      setPhase('invalid');
      return;
    }
    const supabase = supabaseRef.current;
    const sub = supabase.auth.onAuthStateChange((event, session) => {
      if (!cancelled && session?.user) setPhase('ready');
    });

    const poll = async () => {
      for (let i = 0; i < 14 && !cancelled; i++) {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) {
          setPhase('ready');
          return;
        }
        await new Promise((r) => setTimeout(r, 350));
      }
      if (!cancelled) setPhase('invalid');
    };
    poll();

    return () => {
      cancelled = true;
      sub.data.subscription.unsubscribe();
    };
  }, []);

  const strength = useMemo(() => passwordScore(pw), [pw]);
  const match = pw2 === pw;
  const valid = pw.length >= 8 && match && pw.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (pw.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (pw2 !== pw) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (!supabaseRef.current) {
      setError('No se pudo conectar. Vuelve a intentar.');
      return;
    }
    setBusy(true);
    const { error: upErr } = await supabaseRef.current.auth.updateUser({ password: pw });
    setBusy(false);
    if (upErr) {
      setError(friendlyPasswordError(upErr.message));
      return;
    }
    setPhase('done');
  };

  const goLogin = async () => {
    try {
      await supabaseRef.current?.auth.signOut();
    } catch { /* sin sesión */ }
    window.location.assign('/admin');
  };

  const goHome = () => window.location.assign('/');
  const goRequest = () => window.location.assign('/reset-password');

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes prSpin { to { transform: rotate(360deg); } }
        @keyframes prPop { from { opacity: 0; transform: translateY(14px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes prFade { from { opacity: 0; } to { opacity: 1; } }
        .pr-anim { animation: prPop .5s cubic-bezier(.34,1.56,.64,1) both; }
        .pr-fade { animation: prFade .5s ease both; }
        @media (max-width: 560px) {
          .pr-card { border-radius: 22px !important; }
          .pr-body { padding: 26px 20px 32px !important; }
          .pr-head { padding: 26px 18px !important; }
          .pr-title { font-size: 1.5rem !important; }
          .pr-verses { padding: 16px !important; }
        }
      `}} />
      <main style={mainStyle}>
        <div className="pr-card" style={cardStyle}>
          <div className="pr-head" style={headerStyle}>
            <div style={haloStyle}><span style={crossStyle}>✝</span></div>
            <div style={logoStyle}>Pastoral</div>
            <p style={subtitleStyle}>Juvenil Luqueña · Recupera tu camino</p>
          </div>

          <div className="pr-body" style={bodyStyle}>
            {phase === 'checking' && (
              <div className="pr-fade" style={{ textAlign: 'center', padding: '18px 0 8px' }}>
                <div style={spinStyle} aria-hidden="true" />
                <p style={checkingTextStyle}>Verificando tu enlace de recuperación</p>
                <p style={verseSmallStyle}>Mientras tanto, el Buen Pastor cuida de cada una de sus ovejas (cf. Juan 10, 11).</p>
              </div>
            )}

            {phase === 'invalid' && (
              <div className="pr-anim" style={{ textAlign: 'center' }}>
                <div style={bigEmojiStyle}>🌱</div>
                <h1 className="pr-title" style={titleStyle}>Enlace inválido o vencido</h1>
                <p style={textStyle}>
                  Este enlace de recuperación ya no es válido, expiró o ya fue utilizado.
                  No te preocupes: pedir uno nuevo toma solo un momento.
                </p>
                <button type="button" style={primaryBtnStyle} onClick={goRequest}>Solicitar un nuevo enlace</button>
                <button type="button" style={ghostBtnStyle} onClick={goHome}>Volver al inicio</button>
                <div style={versesStyle(null)}>
                  <p style={verseTextStyle}>{verse.text}</p>
                  <span style={verseCiteStyle}>{verse.cite}</span>
                </div>
              </div>
            )}

            {phase === 'ready' && (
              <form className="pr-anim" onSubmit={handleSubmit} style={{ display: 'grid', gap: '16px' }}>
                <div>
                  <h1 className="pr-title" style={titleStyle}>Crea tu nueva contraseña</h1>
                  <p style={textStyle}>Todo vuelve a empezar por un pequeño paso. Guarda tu nuevo secreto con alegría y continúa tu camino.</p>
                </div>

                <div>
                  <label style={labelStyle}>Nueva contraseña</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={pw}
                      onChange={(e) => { setPw(e.target.value); setError(''); }}
                      placeholder="Mínimo 8 caracteres"
                      autoComplete="new-password"
                      style={inputStyle}
                    />
                    <button type="button" onClick={() => setShowPw(!showPw)} style={eyeBtnStyle} aria-label={showPw ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPw ? '🙈' : '👁️'}</button>
                  </div>
                  {pw.length > 0 && (
                    <div className="pr-fade" style={{ marginTop: '10px' }}>
                      <div style={{ display: 'flex', gap: '5px' }}>
                        {[0, 1, 2, 3].map((i) => (
                          <span key={i} style={segStyle(i < strength.score, strength.color)} />
                        ))}
                      </div>
                      <span style={{ fontSize: '11.5px', fontWeight: 700, color: strength.color, marginTop: '5px', display: 'block' }}>{strength.label}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label style={labelStyle}>Repite la contraseña</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPw2 ? 'text' : 'password'}
                      value={pw2}
                      onChange={(e) => { setPw2(e.target.value); setError(''); }}
                      placeholder="Confirma tu contraseña"
                      autoComplete="new-password"
                      style={inputStyle}
                    />
                    <button type="button" onClick={() => setShowPw2(!showPw2)} style={eyeBtnStyle} aria-label={showPw2 ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPw2 ? '🙈' : '👁️'}</button>
                  </div>
                </div>

                <ul style={criteriaStyle}>
                  <li style={criteriaOkStyle(pw.length >= 8)}>{pw.length >= 8 ? '✅' : '⬜'} Al menos 8 caracteres</li>
                  <li style={criteriaOkStyle(/[A-Za-z]/.test(pw) && /\d/.test(pw))}>{/[A-Za-z]/.test(pw) && /\d/.test(pw) ? '✅' : '⬜'} Letras y números</li>
                  <li style={criteriaOkStyle(match && pw2.length > 0)}>{match && pw2.length > 0 ? '✅' : '⬜'} Las contraseñas coinciden</li>
                </ul>

                {error && <div className="pr-fade" style={errorBoxStyle}>{error}</div>}

                <button type="submit" style={primaryBtnStyle} disabled={busy || !valid}>
                  {busy ? 'Guardando…' : 'Actualizar contraseña'}
                </button>

                <button type="button" style={linkBtnStyle} onClick={goRequest}>¿Tu enlace venció? Solicita uno nuevo</button>
              </form>
            )}

            {phase === 'done' && (
              <div className="pr-anim" style={{ textAlign: 'center' }}>
                <div style={haloStyle}><span style={crossStyle}>✔</span></div>
                <h1 className="pr-title" style={titleStyle}>¡Contraseña actualizada!</h1>
                <p style={textStyle}>
                  Tu contraseña se guardó correctamente. Vuelve a encontrarte con nosotros: la puerta sigue abierta para ti.
                </p>
                <button type="button" style={primaryBtnStyle} onClick={goLogin}>Ir a iniciar sesión</button>
                <button type="button" style={ghostBtnStyle} onClick={goHome}>Volver al inicio</button>
                <div style={versesStyle('#f5f0e4')}>
                  <p style={verseTextStyle}>{verse.text}</p>
                  <span style={verseCiteStyle}>{verse.cite}</span>
                  <button type="button" onClick={() => setVerse(VERSES[Math.floor(Math.random() * VERSES.length)])} style={verseBtnStyle}>Otra palabra ↻</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <p style={footStyle}>Pastoral Juvenil Luqueña · “El Señor es mi pastor, nada me faltará” (Salmo 23, 1)</p>
      </main>
    </>
  );
}

/* ---------- Estilos ---------- */

const mainStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  gap: '18px',
  padding: '24px 18px',
  background: 'radial-gradient(circle at 12% 8%, rgba(200,151,58,.2), transparent 30%), radial-gradient(circle at 88% 92%, rgba(124,58,237,.16), transparent 32%), linear-gradient(180deg, #0f1b33 0%, #1a2744 55%, var(--navy-mid) 100%)',
};

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '540px',
  borderRadius: '28px',
  background: 'rgba(255,255,255,.98)',
  border: '1px solid rgba(255,255,255,.35)',
  boxShadow: '0 34px 90px rgba(3,7,20,.55)',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #1A2744 0%, var(--navy-mid) 60%, #7c3aed 130%)',
  color: '#fff',
  padding: '32px 26px',
  textAlign: 'center',
  position: 'relative',
};

const haloStyle: React.CSSProperties = {
  width: '58px',
  height: '58px',
  margin: '0 auto 12px',
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  background: 'linear-gradient(135deg, #C8973A, #f2d488)',
  boxShadow: '0 8px 22px rgba(200,151,58,.55)',
};

const crossStyle: React.CSSProperties = {
  fontSize: '28px',
  color: '#1A2744',
  fontWeight: 800,
};

const logoStyle: React.CSSProperties = {
  fontSize: '1.9rem',
  fontWeight: 800,
  letterSpacing: '.12em',
  textTransform: 'uppercase',
};

const subtitleStyle: React.CSSProperties = {
  margin: '8px 0 0',
  color: '#f2d488',
  fontSize: '.85rem',
  letterSpacing: '.03em',
};

const bodyStyle: React.CSSProperties = {
  padding: '32px 30px 36px',
};

const titleStyle: React.CSSProperties = {
  fontSize: '1.7rem',
  margin: '0 0 10px',
  color: '#0f172a',
  lineHeight: 1.1,
  fontFamily: "'Playfair Display', Georgia, serif",
};

const textStyle: React.CSSProperties = {
  margin: '0 0 8px',
  color: '#475569',
  lineHeight: 1.75,
  fontSize: '.98rem',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '.92rem',
  fontWeight: 700,
  color: '#334155',
  marginBottom: '8px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '15px 52px 15px 16px',
  borderRadius: '14px',
  border: '1px solid rgba(148,163,184,.35)',
  background: 'rgba(248,250,252,.98)',
  color: '#0f172a',
  fontSize: '1rem',
  outline: 'none',
  boxSizing: 'border-box',
};

const eyeBtnStyle: React.CSSProperties = {
  position: 'absolute',
  right: '8px',
  top: '50%',
  transform: 'translateY(-50%)',
  border: 'none',
  background: 'transparent',
  fontSize: '1.05rem',
  cursor: 'pointer',
  padding: '8px',
  borderRadius: '10px',
};

const segStyle = (active: boolean, color: string): React.CSSProperties => ({
  flex: 1,
  height: '6px',
  borderRadius: '999px',
  background: active ? color : 'rgba(148,163,184,.25)',
  transition: 'background .25s ease',
});

const criteriaStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: '0',
  padding: '0',
  display: 'grid',
  gap: '6px',
};

const criteriaOkStyle = (ok: boolean): React.CSSProperties => ({
  fontSize: '.85rem',
  fontWeight: 600,
  color: ok ? '#166534' : '#64748b',
});

const errorBoxStyle: React.CSSProperties = {
  padding: '14px 16px',
  borderRadius: '14px',
  background: 'rgba(254,226,226,.9)',
  border: '1px solid rgba(239,68,68,.18)',
  color: '#991b1b',
  fontSize: '.9rem',
  fontWeight: 600,
};

const primaryBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '16px 20px',
  borderRadius: '16px',
  border: 'none',
  background: 'linear-gradient(135deg, #C8973A 0%, #e2b95f 55%, #a97b22 100%)',
  color: '#1A2744',
  fontWeight: 800,
  fontSize: '1rem',
  cursor: 'pointer',
  boxShadow: '0 12px 26px rgba(200,151,58,.4)',
  transition: 'transform .2s ease, box-shadow .2s ease',
  marginTop: '4px',
};

const ghostBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px 20px',
  borderRadius: '16px',
  border: '1px solid rgba(148,163,184,.4)',
  background: 'transparent',
  color: '#334155',
  fontWeight: 700,
  fontSize: '.95rem',
  cursor: 'pointer',
  marginTop: '10px',
};

const linkBtnStyle: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: '#a07d3b',
  fontWeight: 700,
  fontSize: '.85rem',
  cursor: 'pointer',
  textDecoration: 'underline',
  padding: '4px',
};

const versesStyle = (bg: string | null): React.CSSProperties => ({
  marginTop: '24px',
  padding: '20px',
  borderRadius: '18px',
  background: bg || 'linear-gradient(160deg, #fdf6e7, #f7efdd)',
  border: '1px solid rgba(200,151,58,.3)',
  textAlign: 'left',
});

const verseTextStyle: React.CSSProperties = {
  margin: '0',
  fontFamily: "'Playfair Display', Georgia, serif",
  fontStyle: 'italic',
  fontSize: '1.05rem',
  lineHeight: 1.6,
  color: '#5b4626',
};

const verseCiteStyle: React.CSSProperties = {
  display: 'block',
  marginTop: '8px',
  fontSize: '.78rem',
  fontWeight: 800,
  letterSpacing: '.08em',
  textTransform: 'uppercase',
  color: '#a07d3b',
};

const verseBtnStyle: React.CSSProperties = {
  marginTop: '12px',
  border: '1px solid rgba(200,151,58,.5)',
  background: 'rgba(255,255,255,.7)',
  color: '#7a5a1f',
  borderRadius: '999px',
  padding: '6px 14px',
  fontSize: '.8rem',
  fontWeight: 700,
  cursor: 'pointer',
};

const bigEmojiStyle: React.CSSProperties = {
  fontSize: '3rem',
  marginBottom: '6px',
};

const checkingTextStyle: React.CSSProperties = {
  marginTop: '16px',
  fontWeight: 700,
  color: '#334155',
  fontSize: '1rem',
};

const verseSmallStyle: React.CSSProperties = {
  margin: '8px 0 0',
  color: '#a07d3b',
  fontStyle: 'italic',
  fontSize: '.85rem',
};

const spinStyle: React.CSSProperties = {
  width: '42px',
  height: '42px',
  margin: '14px auto 0',
  borderRadius: '50%',
  border: '4px solid rgba(200,151,58,.25)',
  borderTopColor: '#C8973A',
  animation: 'prSpin .8s linear infinite',
};

const footStyle: React.CSSProperties = {
  margin: 0,
  color: 'rgba(255,255,255,.55)',
  fontSize: '.72rem',
  letterSpacing: '.04em',
  textAlign: 'center',
};