'use client';
import { useState, useEffect, useRef, Suspense, type CSSProperties } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import Script from 'next/script';
import Link from 'next/link';
import {
  store,
  NewsItem, Activity, FaqItem, DocItem, GalleryItem,
  SiteContent, SocialLinks, ActiveSections, MemberProfile,
  Branding, ThemePalette, PageStat, Chapel, HeroSlide, User,
  DEFAULT_NEWS, DEFAULT_ACTIVITIES, DEFAULT_FAQ,
  DEFAULT_DOCS, DEFAULT_CONTENT, DEFAULT_SOCIAL, DEFAULT_SECTIONS, DEFAULT_BRANDING,
  DEFAULT_STATS, DEFAULT_THEME_PALETTE, DEFAULT_USERS, mergePageStats
} from '@/lib/pjlStore';
import { buildGoogleCalendarCreateUrl } from '@/lib/googleCalendar';
import { fetchStoreValue, upsertStoreValue, subscribeStoreChanges } from '@/lib/supabaseStore';
import { SupabaseProfile, fetchProfileByEmail, fetchAllProfiles, fetchPendingProfiles, approveProfile, signInProfile, signUpProfile, subscribeProfileChanges, deleteProfile, resendVerificationEmail, updateProfile } from '@/lib/supabaseProfiles';
import { siteUrlOf } from '@/lib/siteUrl';
import { evgHoyClassify, type EvgHoyResponse } from '@/lib/vaticanEvangelio';
import { uploadFileToR2 } from '@/lib/uploadFile';
import { LIT_COLORS, liturgicalColor, type LitColorKey } from '@/lib/liturgy';

const ZonaMap = dynamic(() => import('@/components/ZonaMap'), { 
  ssr: false,
  loading: () => <div style={{ height: '400px', background: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '25px', border: '1px solid var(--gold-pale)' }}>Cargando mapa interactivo...</div>
});

import { NewsArticleWithDetails } from '@/lib/newsTypes';

const NewsAdminTable = dynamic(() => import('@/components/admin/NewsAdminTable').then(mod => ({ default: mod.NewsAdminTable })), { loading: () => <div>Cargando tabla...</div> });
const NewsArticleForm = dynamic(() => import('@/components/admin/NewsArticleForm').then(mod => ({ default: mod.NewsArticleForm })), { loading: () => <div>Cargando formulario...</div> });
const NewsEventForm = dynamic(() => import('@/components/admin/NewsEventForm').then(mod => ({ default: mod.NewsEventForm })), { loading: () => <div>Cargando formulario de eventos...</div> });

type Module = 'dashboard' | 'identidad' | 'apariencia' | 'contenido' | 'actividades' | 'noticias' | 'usuarios' | 'documentos' | 'configuracion' | 'perfiles' | 'capillas' | 'asistente' | 'carrusel' | 'territorio' | 'logs';

// Read PageStat from pjlStore

const CREDS = { user: 'admin', pass: 'admin' };

const NAV_ITEMS = [
  { id: 'dashboard',      iconKey: 'adminIconDashboard', label: 'Dashboard', defaultIcon: '📊' },
  { id: 'identidad',      iconKey: 'adminIconIdentidad', label: 'Identidad', defaultIcon: '🎨' },
  { id: 'carrusel',       iconKey: 'adminIconCarrusel', label: 'Carrusel Hero', defaultIcon: '🖼️' },
  { id: 'apariencia',     iconKey: 'adminIconApariencia', label: 'Apariencia', defaultIcon: '✨' },
  { id: 'contenido',      iconKey: 'adminIconContenido', label: 'Contenido', defaultIcon: '📝' },
  { id: 'noticias',       iconKey: 'adminIconNoticias', label: 'Noticias', defaultIcon: '📰' },
  { id: 'actividades',    iconKey: 'adminIconActividades', label: 'Actividades', defaultIcon: '📅' },
  { id: 'capillas',       iconKey: 'adminIconCapillas', label: 'Capillas', defaultIcon: '⛪' },
  { id: 'perfiles',       iconKey: 'adminIconPerfiles', label: 'Currículos', defaultIcon: '👤' },
  { id: 'documentos',     iconKey: 'adminIconDocumentos', label: 'Documentos', defaultIcon: '📁' },
  { id: 'usuarios',       iconKey: 'adminIconUsuarios', label: 'Usuarios', defaultIcon: '👥' },
  { id: 'logs',           iconKey: 'adminIconLogs', label: 'Historial', defaultIcon: '📜' },
  { id: 'configuracion',  iconKey: 'adminIconConfiguracion', label: 'Configuración', defaultIcon: '⚙️' },
  { id: 'asistente',      iconKey: 'adminIconAsistente', label: 'Asistente IA', defaultIcon: '🤖' },
];

// Módulos que nunca se delegan desde la UI de permisos (solo acceso total)
const NON_DELEGABLE_MODULES: Module[] = ['usuarios', 'configuracion'];

const getDocPresentation = (doc: Partial<DocItem>) => {
  const lowerType = doc.type?.toLowerCase() || '';
  const lowerName = doc.name?.toLowerCase() || '';
  const lowerUrl = doc.url?.toLowerCase() || '';
  const source = `${lowerType} ${lowerName} ${lowerUrl}`;

  if (source.includes('pdf')) return { kind: 'pdf', icon: '📄', color: '#ef4444', label: 'PDF' };
  if (source.includes('doc') || source.includes('word')) return { kind: 'word', icon: '📝', color: '#2563eb', label: 'Word' };
  if (source.includes('xls') || source.includes('sheet') || source.includes('csv')) return { kind: 'sheet', icon: '📊', color: '#16a34a', label: 'Planilla' };
  if (source.includes('ppt')) return { kind: 'slides', icon: '🎞️', color: '#ea580c', label: 'Presentación' };
  if (source.includes('png') || source.includes('jpg') || source.includes('jpeg') || source.includes('webp') || source.includes('gif') || source.includes('image')) {
    return { kind: 'image', icon: '🖼️', color: '#0f766e', label: 'Imagen' };
  }
  return { kind: 'file', icon: '📁', color: '#C8973A', label: 'Archivo' };
};

const canPreviewInFrame = (doc: Partial<DocItem>) => {
  const kind = getDocPresentation(doc).kind;
  return kind === 'pdf' || kind === 'image';
};

/* Imagen a prueba de enlaces rotos: si la URL falla o está vacía,
   muestra un placeholder elegante en lugar del ícono de imagen rota. */
function SafeImg({ src, alt, style, fallback = '⛪', fallbackStyle }: {
  src?: string; alt: string; style?: React.CSSProperties;
  fallback?: string; fallbackStyle?: React.CSSProperties;
}) {
  const [err, setErr] = useState(false);
  useEffect(() => { setErr(false); }, [src]);
  if (!src || err) {
    return (
      <span
        aria-label={alt}
        role="img"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: 'linear-gradient(135deg, #f3ede0 0%, #e9dfc8 100%)', fontSize: '20px', ...fallbackStyle }}
      >
        {fallback}
      </span>
    );
  }
  return <img src={src} alt={alt} style={style} onError={() => setErr(true)} />;
}

/* Contador animado que sube hasta el valor real */
function CountUp({ value, duration = 1100 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof requestAnimationFrame === 'undefined') { setDisplay(value); return; }
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{display.toLocaleString('es-ES')}</>;
}

/* Tarjeta KPI con brillo al hover y pulso al hacer click */
function KpiCard({ icon, label, value, sub, tone, delay, text }: {
  icon: string; label: string; value: number | string; sub: string;
  tone: 'navy' | 'gold' | 'green' | 'blue' | 'violet' | 'rose'; delay: number; text?: boolean;
}) {
  const [burst, setBurst] = useState(false);
  const handleClick = () => {
    setBurst(false);
    requestAnimationFrame(() => setBurst(true));
    setTimeout(() => setBurst(false), 700);
  };
  return (
    <div
      className={`kpi-card kpi-${tone} pop-in ${burst ? 'kpi-burst' : ''}`}
      style={{ animationDelay: `${delay}s` }}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') handleClick(); }}
    >
      <span className="kpi-shine" aria-hidden="true"></span>
      <span className={`kpi-orb kpi-orb-${tone}`} aria-hidden="true"></span>
      <div className="kpi-top">
        <span className="kpi-icon" aria-hidden="true">{icon}</span>
        <span className="kpi-label">{label}</span>
      </div>
      <div className="kpi-value">
        {text ? <span className="kpi-text">{value}</span> : <CountUp value={Number(value) || 0} />}
      </div>
      <div className="kpi-sub">{sub}</div>
      {burst && <span className="kpi-ring" aria-hidden="true"></span>}
    </div>
  );
}

/* Gráfico de dona animado e interactivo */
const DONUT_COLORS = ['#1A2744', '#C8973A', '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899'];
function DonutChart({ items }: { items: { label: string; visits: number }[] }) {
  const [drawn, setDrawn] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDrawn(true), 250);
    return () => clearTimeout(t);
  }, []);
  const total = items.reduce((acc, s) => acc + (s.visits || 0), 0);
  if (!items.length || total === 0) {
    return <p style={{ color: '#bbb', textAlign: 'center', padding: '20px 0', fontSize: '13px', fontStyle: 'italic' }}>Sin datos de visitas aún</p>;
  }
  const r = 54, cx = 75, cy = 75, strokeW = 20;
  const circ = 2 * Math.PI * r;
  let cumulative = 0;
  const segs = items.map((s, i) => {
    const pct = (s.visits || 0) / total;
    const start = cumulative;
    cumulative += pct;
    return { ...s, pct, start, color: DONUT_COLORS[i % DONUT_COLORS.length] };
  });
  const activeSeg = active !== null ? segs[active] : null;
  return (
    <div className="donut-wrap">
      <div className="donut-svg-box">
        <svg viewBox="0 0 150 150" width="150" height="150" role="img" aria-label="Distribución de visitas por sección">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f0ece4" strokeWidth={strokeW} />
          {segs.map((seg, i) => (
            <circle
              key={i}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={active === i ? strokeW + 7 : strokeW}
              strokeLinecap="butt"
              strokeDasharray={`${drawn ? Math.max(seg.pct * circ - 2.5, 0) : 0} ${circ}`}
              strokeDashoffset={-(seg.start * circ)}
              transform={`rotate(-90 ${cx} ${cy})`}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              style={{
                cursor: 'pointer',
                transition: `stroke-dasharray 1.1s cubic-bezier(0.22,1,0.36,1) ${i * 0.13}s, stroke-width 0.25s ease, opacity 0.25s ease`,
                opacity: active === null || active === i ? 1 : 0.28,
              }}
            />
          ))}
        </svg>
        <div className="donut-center">
          {activeSeg ? (
            <>
              <div className="donut-center-pct">{Math.round(activeSeg.pct * 100)}%</div>
              <div className="donut-center-label">{activeSeg.label}</div>
            </>
          ) : (
            <>
              <div className="donut-center-total"><CountUp value={total} /></div>
              <div className="donut-center-label">VISITAS</div>
            </>
          )}
        </div>
      </div>
      <div className="donut-legend">
        {segs.map((seg, i) => (
          <button
            key={i}
            className={`donut-legend-row ${active === i ? 'is-active' : ''}`}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
          >
            <span className="donut-dot" style={{ background: seg.color }} />
            <span className="donut-legend-label">{seg.label}</span>
            <span className="donut-legend-val">{Math.round(seg.pct * 100)}%</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* Contraste WCAG entre dos colores hex */
function hexLuminance(hex: string): number {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return 0;
  const rgb = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
}
function contrastRatio(a: string, b: string): number {
  const l1 = hexLuminance(a), l2 = hexLuminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
const NAVY_POOL = ['#1A2744', '#1A3B2B', '#3B1A3A', '#441A1A', '#0F1F3D', '#2C3E50', '#23306B', '#14343B'];
const GOLD_POOL = ['#C8973A', '#D4AF37', '#B8860B', '#DAA520', '#E6BE6A', '#A0783A', '#C9A227', '#D69E35'];

/* ── Utilidades de color extendidas ─────────────────────────────────────── */
function hexToRgb(hex: string): [number, number, number] {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return [26, 39, 68];
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
function clamp255(n: number): number { return Math.max(0, Math.min(255, Math.round(n))); }
function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(c => clamp255(c).toString(16).padStart(2, '0')).join('').toUpperCase();
}
/* Calcula el color de texto (claro u oscuro) que mejor se lee sobre un fondo. */
function readableTextOn(hex: string): string {
  const c = hexToRgb(hex);
  const lum = 0.2126 * c[0] / 255 + 0.7152 * c[1] / 255 + 0.0722 * c[2] / 255;
  return lum > 0.45 ? '#1c1a16' : '#ffffff';
}
/* Mezcla dos colores; t=0 -> a, t=1 -> b */
function mixColor(a: string, b: string, t: number): string {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
/* Aclara hacia blanco (tint) o oscurece hacia negro (shade). amount 0..1 */
function tint(hex: string, amount: number): string { return mixColor(hex, '#ffffff', amount); }
function shade(hex: string, amount: number): string { return mixColor(hex, '#000000', amount); }
/* Genera una gama derivada de tonos a partir de un color base (paleta armónica). */
function derivePalette(hex: string): string[] {
  return [
    shade(hex, 0.55), shade(hex, 0.3), hex, tint(hex, 0.25), tint(hex, 0.5), tint(hex, 0.75), tint(hex, 0.88)
  ];
}
/* Saturación relativa (más/menos saturado) manteniendo luminosidad aproximada. */
function saturate(hex: string, factor: number): string {
  const [r, g, b] = hexToRgb(hex);
  const gray = 0.299 * r + 0.587 * g + 0.114 * b;
  return rgbToHex(r + (gray - r) * factor, g + (gray - g) * factor, b + (gray - b) * factor);
}
/* Valida si un valor es un color hex de 6 dígitos */
const isHex6 = (v: string) => /^#[0-9A-Fa-f]{6}$/.test(v);

function useLS<T>(key: keyof typeof store, def: T) {
  const [val, setVal] = useState<T>(def);

  useEffect(() => {
    const syncFromStore = () => {
      const storeVal = (store[key].get as () => T)();
      setVal(storeVal);
    };

    const timer = setTimeout(syncFromStore, 0);
    const onStorage = (event: StorageEvent) => {
      if (event.key === `pjl_${String(key)}`) syncFromStore();
    };
    const onCustomUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail;
      if (!detail?.key || detail.key === key) syncFromStore();
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener('pjl_store_update', onCustomUpdate as EventListener);

    const applyRemoteValue = (remoteValue: unknown) => {
      if (remoteValue === null || remoteValue === undefined) return;
      try {
        const parsed = remoteValue as T;
        const current = (store[key].get as () => T)();
        if (JSON.stringify(current) !== JSON.stringify(parsed)) {
          setVal(parsed);
          localStorage.setItem(`pjl_${String(key)}`, JSON.stringify(parsed));
          window.dispatchEvent(new CustomEvent('pjl_store_update', { detail: { key } }));
        }
      } catch {
        // Ignorar problemas de parseo remotos
      }
    };

    const loadRemoteValue = async () => {
      try {
        const remote = await fetchStoreValue<T>(String(key));
        if (remote !== null) {
          applyRemoteValue(remote);
        }
      } catch (error) {
        // Ignorar si Supabase no está disponible
      }
    };

    const unsubscribeRemote = subscribeStoreChanges((changedKey, changedValue) => {
      if (changedKey !== String(key)) return;
      applyRemoteValue(changedValue);
    });

    loadRemoteValue();

    return () => {
      clearTimeout(timer);
      unsubscribeRemote();
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pjl_store_update', onCustomUpdate as EventListener);
    };
  }, [key]);

  const update = (v: T | ((prev: T) => T)) => {
    const next = typeof v === 'function'
      ? (v as (prev: T) => T)((store[key].get as () => T)())
      : v;

    setVal(next);
    const setter = store[key].set as (v: T) => void;
    setter(next);
    upsertStoreValue(String(key), next).catch(() => {
      // Fallback to local persistence if Supabase no está disponible
    });
  };
  return [val, update] as const;
}

// Page stats now managed in pjlStore

const AC_MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function acPad2(n: number) { return String(n).padStart(2, '0'); }

function AdminActCalendar({ items, value, onChange }: { items: Activity[]; value: string; onChange: (k: string) => void }) {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${acPad2(today.getMonth() + 1)}-${acPad2(today.getDate())}`;
  const [viewYm, setViewYm] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const dayKeys = new Set<string>();
  items.forEach(a => {
    const d = new Date(a.date);
    if (!isNaN(d.getTime())) dayKeys.add(`${d.getFullYear()}-${acPad2(d.getMonth() + 1)}-${acPad2(d.getDate())}`);
  });
  const lead = (new Date(viewYm.y, viewYm.m, 1).getDay() + 6) % 7;
  const dim = new Date(viewYm.y, viewYm.m + 1, 0).getDate();
  const cells: Array<number | null> = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="acal">
      <div className="acal-head">
        <button type="button" className="acal-nav" aria-label="Mes anterior"
          onClick={() => setViewYm(v => v.m === 0 ? { y: v.y - 1, m: 11 } : { ...v, m: v.m - 1 })}>{'\u2039'}</button>
        <b>{AC_MONTHS[viewYm.m]} {viewYm.y}</b>
        <button type="button" className="acal-nav" aria-label="Mes siguiente"
          onClick={() => setViewYm(v => v.m === 11 ? { y: v.y + 1, m: 0 } : { ...v, m: v.m + 1 })}>{'\u203A'}</button>
      </div>
      <div className="acal-grid" key={`${viewYm.y}-${viewYm.m}`}>
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <span key={`h${i}`} className="acal-hcell">{d}</span>
        ))}
        {cells.map((d, ci) => {
          if (!d) return <span key={`e${ci}`} className="acal-day empty" />;
          const k = `${viewYm.y}-${acPad2(viewYm.m + 1)}-${acPad2(d)}`;
          const has = dayKeys.has(k);
          return (
            <button
              type="button"
              key={k}
              className={`acal-day${has ? ' has' : ''}${k === todayKey ? ' today' : ''}${value === k ? ' sel' : ''}`}
              onClick={() => onChange(value === k ? 'all' : k)}
              title={has ? 'Ver actividades de este día' : undefined}
            >
              <i>{d}</i>
              {has && <span className="acal-dot" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AdminContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const modParam = searchParams.get('mod') as Module || 'dashboard';

  useEffect(() => {
    document.documentElement.classList.add('no-splash');
    document.documentElement.classList.remove('show-splash', 'pjl-reveal', 'splash-ready');
    document.getElementById('splash-pjl')?.remove();
  }, []);

  // --- AUTH ---
  const [loggedIn, setLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useLS<User[]>('users', DEFAULT_USERS);
  const [pendingProfiles, setPendingProfiles] = useState<SupabaseProfile[]>([]);
  const [registerMode, setRegisterMode] = useState<'login' | 'register'>('login');
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [registerErr, setRegisterErr] = useState('');
  const [registerSuccess, setRegisterSuccess] = useState('');
  const [emailConfirmedMessage, setEmailConfirmedMessage] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isAuth = localStorage.getItem('pjl_admin_auth') === 'true';
      setLoggedIn(isAuth);
      if (isAuth) {
        const savedUser = localStorage.getItem('pjl_current_user');
        if (savedUser) {
          try {
            setCurrentUser(JSON.parse(savedUser));
          } catch (e) {
            // Fallback to first user if JSON is corrupt
            if (allUsers.length > 0) setCurrentUser(allUsers[0]);
          }
        } else if (allUsers.length > 0) {
          // Emergency fallback: if logged in but no user data, take first admin
          setCurrentUser(allUsers[0]);
        }
      }
    }
  }, [allUsers]);
  const [loginForm, setLoginForm] = useState({ user: '', pass: '' });
  const [loginErr, setLoginErr] = useState(false);
  const [loginErrorMessage, setLoginErrorMessage] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [supabaseStatus, setSupabaseStatus] = useState<{ ok: boolean; message: string; sample?: any } | null>(null);

  useEffect(() => {
    const confirmed = searchParams.get('confirmed');
    const type = searchParams.get('type');
    const errorDescription = searchParams.get('error_description') || searchParams.get('error');
    const gcal = searchParams.get('gcal');
    const gcalMessage = searchParams.get('gcal_message');
    const gcalAccount = searchParams.get('gcal_account');

    if (confirmed === 'true' || type === 'signup') {
      setRegisterMode('login');
      setRegisterSuccess('Correo confirmado. Ya puedes iniciar sesión.');
      setEmailConfirmedMessage('Tu correo ha sido confirmado con éxito. Inicia sesión para continuar.');
      router.replace('/admin');
      return;
    }

    if (errorDescription) {
      setLoginErr(true);
      setLoginErrorMessage(decodeURIComponent(errorDescription));
      router.replace('/admin');
      return;
    }

    if (gcal === 'connected') {
      setGoogleCalendarStatus({
        connected: true,
        account: gcalAccount || undefined,
      });
      showToast('Google Calendar conectado ✔');
      router.replace('/admin?mod=actividades');
      return;
    }

    if (gcal === 'error') {
      showToast(gcalMessage || 'No se pudo conectar Google Calendar.');
      router.replace('/admin?mod=actividades');
      return;
    }

    let mounted = true;
    const check = async () => {
      try {
        const res = await fetch('/api/supabase/status');
        const json = await res.json();
        if (mounted) setSupabaseStatus(json);
      } catch (e) {
        if (mounted) setSupabaseStatus({ ok: false, message: String(e) });
      }
    };
    check();
    const interval = setInterval(check, 30000);
    return () => { mounted = false; clearInterval(interval); };
  }, [searchParams, router]);

  useEffect(() => {
    const initSession = async () => {
      try {
        const profiles = await fetchAllProfiles();
        if (profiles.length > 0) {
          setAllUsers(profiles.map(p => ({
            id: p.id,
            name: p.name,
            email: p.email,
            role: p.role,
            status: p.status,
            permissions: p.permissions,
            createdAt: p.created_at,
            authUid: p.auth_uid,
          })));
        }
        const pending = await fetchPendingProfiles();
        setPendingProfiles(pending);
      } catch (e) {
        console.error('Error cargando perfiles Supabase:', e);
      }
    };
    initSession();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeProfileChanges((profile, eventType) => {
      setAllUsers((prev: User[]) => {
        const existingIndex = prev.findIndex(u => u.id === profile.id);
        const updatedUser = {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          role: profile.role,
          status: profile.status,
          permissions: profile.permissions,
          createdAt: profile.created_at,
          authUid: profile.auth_uid,
        };

        if (eventType === 'DELETE') {
          return prev.filter(u => u.id !== profile.id);
        }
        if (existingIndex >= 0) {
          return prev.map(u => u.id === profile.id ? updatedUser : u);
        }
        return [...prev, updatedUser];
      });

      setPendingProfiles(prev => {
        if (profile.status === 'pendiente') {
          const found = prev.find(p => p.id === profile.id);
          if (found) {
            return prev.map(p => p.id === profile.id ? profile : p);
          }
          return [...prev, profile];
        }
        return prev.filter(p => p.id !== profile.id);
      });
    });

    return () => unsubscribe();
  }, []);

  const hasPermission = (m: Module, action: 'view' | 'edit' | 'admin' = 'view') => {
    if (!loggedIn) return false;
    if (!currentUser) return true;
    if (currentUser.role === 'desarrollador' || currentUser.role === 'superadmin') return true;
    if (m === 'dashboard' && action === 'view') return true;

    // Módulos que no se pueden delegar desde la UI de permisos
    if (NON_DELEGABLE_MODULES.includes(m)) return false;

    const permissionKeys = m === 'territorio' ? ['capillas', 'territorio'] : [m];
    const explicitPermissions = currentUser.permissions || [];
    const hasExplicitRules = explicitPermissions.length > 0;

    if (currentUser.role === 'editor') {
      // Si el admin otorgó módulos explícitos, se respetan tal cual
      if (hasExplicitRules) return permissionKeys.some(key => explicitPermissions.includes(key));
      return true;
    }
    if (currentUser.role === 'viewer') {
      if (action !== 'view') return false;
      return hasExplicitRules
        ? permissionKeys.some(key => explicitPermissions.includes(key))
        : ['dashboard', 'logs', 'noticias', 'actividades', 'documentos', 'capillas', 'perfiles', 'territorio'].includes(m);
    }
    return false;
  };

  // --- PERSISTENT STATE ---
  const [news, setNews] = useLS<NewsItem[]>('news', DEFAULT_NEWS);
  const [activities, setActivities] = useLS<Activity[]>('activities', DEFAULT_ACTIVITIES);
  const [faq, setFaq] = useLS<FaqItem[]>('faq', DEFAULT_FAQ);
  const [docs, setDocs] = useLS<DocItem[]>('docs', DEFAULT_DOCS);
  const [content, setContent] = useLS<SiteContent>('content', DEFAULT_CONTENT);
  const [social, setSocial] = useLS<SocialLinks>('social', DEFAULT_SOCIAL);
  const [sections, setSections] = useLS<ActiveSections>('sections', DEFAULT_SECTIONS);
  const [profiles, setProfiles] = useLS<MemberProfile[]>('profiles', []);
  const [branding, setBranding] = useLS<Branding>('branding', DEFAULT_BRANDING);
  const [theme, setTheme] = useLS<ThemePalette>('theme', DEFAULT_THEME_PALETTE);
  const [litPreview, setLitPreview] = useState<string | null>(null);
  const [liveHeroImages, setLiveHeroImages] = useLS<HeroSlide[]>('hero', []);
  const [heroIntervalSecs, setHeroIntervalSecs] = useLS<number>('heroInterval', 3);
  const [editingSlideId, setEditingSlideId] = useState<string | null>(null);
  const [chapels, setChapels] = useLS<Chapel[]>('chapels', []);
  const [pageStats, setPageStats] = useLS<PageStat[]>('stats', DEFAULT_STATS);
  const [logs, setLogs] = useLS<any[]>('logs', []);
  const [googleCalendarStatus, setGoogleCalendarStatus] = useState<{ connected: boolean; account?: string } | null>(null);
  const [googleCalendarSyncing, setGoogleCalendarSyncing] = useState(false);

  useEffect(() => {
    const loadGoogleCalendarStatus = async () => {
      try {
        const response = await fetch('/api/google-calendar/status');
        const json = await response.json();
        setGoogleCalendarStatus(json);
      } catch {
        setGoogleCalendarStatus({ connected: false });
      }
    };

    loadGoogleCalendarStatus();
  }, []);

  useEffect(() => {
    let isMounted = true;

    const updateStatsFromRemote = (remoteValue: unknown) => {
      if (!remoteValue) return;
      try {
        const currentStats = store.stats.get();
        const stats = mergePageStats(currentStats, remoteValue as PageStat[]);
        setPageStats(stats);
        const serialized = JSON.stringify(stats);
        const current = localStorage.getItem('pjl_stats');
        if (current !== serialized) {
          localStorage.setItem('pjl_stats', serialized);
          window.dispatchEvent(new CustomEvent('pjl_store_update', { detail: { key: 'stats' } }));
        }
      } catch (error) {
        console.error('Error parsing remote dashboard stats:', error);
      }
    };

    const fetchInitialStats = async () => {
      try {
        const remoteStats = await fetchStoreValue<PageStat[]>('stats');
        if (!isMounted || !remoteStats) return;
        updateStatsFromRemote(remoteStats);
      } catch (error) {
        console.error('Error cargando estadísticas iniciales:', error);
      }
    };

    fetchInitialStats();

    const unsubscribe = subscribeStoreChanges((changedKey, changedValue) => {
      if (changedKey !== 'stats') return;
      updateStatsFromRemote(changedValue);
    });

    return () => {
      isMounted = false;
      try { unsubscribe(); } catch (e) {}
    };
  }, []);

  // --- LOGGING HELPER ---
  const addLog = (action: string, module: string, details?: string) => {
    const newLog = {
      id: Date.now().toString(),
      userId: currentUser?.id || 'guest',
      userName: currentUser?.name || 'Invitado',
      action,
      module,
      details,
      timestamp: new Date().toISOString()
    };
    setLogs([newLog, ...logs.slice(0, 49)]);
  };

  // --- LOCAL UI STATE ---
  const tabParam = searchParams.get('tab') === 'territorio' ? 'territorio' : 'capillas';
  const [mod, setMod] = useState<Module>(modParam === 'territorio' ? 'capillas' : modParam);
  const [capillasView, setCapillasView] = useState<'capillas' | 'territorio'>(tabParam);
  const [toast, setToast] = useState('');
  const [modal, setModal] = useState<null | Module>(null);
  const [editId, setEditId] = useState<number | string | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const validStats = Array.isArray(pageStats) ? pageStats : [];
  const liveVisits = validStats.reduce((acc, stat) => acc + (stat?.visits || 0), 0);
  const maxVisits = Math.max(...validStats.map(s => s?.visits || 0), 1);
  const maxInteractions = Math.max(...validStats.map(s => s?.interactions || 0), 1);
  const [navyHex, setNavyHex] = useState(theme.navy);
  const [goldHex, setGoldHex] = useState(theme.gold);
  const [savedPalettes, setSavedPalettes] = useState<{navy: string; gold: string; bg?: string; card?: string}[]>([]);
  /* Colores adicionales y preferencias de vista previa (Apariencia) */
  const [bgHex, setBgHex] = useState(tint(theme.navy, 0.86));           // fondo neutral de secciones
  const [cardHex, setCardHex] = useState(tint(tint(theme.navy, 0.92), 0.55)); // superficie de tarjetas
  const [previewMode, setPreviewMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [darkPreview, setDarkPreview] = useState(false);

  useEffect(() => {
    if (!currentUser || currentUser.id === 'master') return;

    const freshUser = allUsers.find(u => u.id === currentUser.id || u.email === currentUser.email);
    if (!freshUser) return;

    if (freshUser.status === 'inactivo') {
      handleLogout();
      return;
    }

    const mergedUser = { ...currentUser, ...freshUser, lastActive: currentUser.lastActive || freshUser.lastActive };
    const changed = JSON.stringify(mergedUser) !== JSON.stringify(currentUser);
    if (changed) {
      setCurrentUser(mergedUser);
      localStorage.setItem('pjl_current_user', JSON.stringify(mergedUser));
    }
  }, [allUsers, currentUser]);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const saved = localStorage.getItem('pjl_saved_palettes');
        if (saved) {
          setSavedPalettes(JSON.parse(saved));
        }
      } catch (e) {}
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Automatic simulation of stats removed in favor of real interaction tracking

  const [form, setForm] = useState<any>({});
  const [activeProfileTeam, setActiveProfileTeam] = useState('coordinacion');
  const [activeContentTab, setActiveContentTab] = useState('institucional');
  const [evgAdmin, setEvgAdmin] = useState<EvgHoyResponse | null>(null);
  const [evgAdminLoading, setEvgAdminLoading] = useState(false);

  useEffect(() => {
    if (activeContentTab !== 'evangelio' || evgAdmin) return;
    let cancel = false;
    setEvgAdminLoading(true);
    fetch('/api/evangelio', { headers: { Accept: 'application/json' } })
      .then(r => r.json())
      .then((j: EvgHoyResponse) => { if (!cancel && j?.ok && Array.isArray(j.paragraphs)) setEvgAdmin(j); })
      .catch(() => { /* sin conexión con Vatican News */ })
      .finally(() => { if (!cancel) setEvgAdminLoading(false); });
    return () => { cancel = true; };
  }, [activeContentTab, evgAdmin]);

  // --- NEWS VIEW STATE ---
  const [newsView, setNewsView] = useState<'list' | 'article' | 'event'>('list');
  const [selectedArticle, setSelectedArticle] = useState<NewsArticleWithDetails | null>(null);

  // --- AI STATE ---
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiMode, setAiMode] = useState('redes');
  const [aiHistory, setAiHistory] = useLS<{ id: string; mode: string; prompt: string; text: string; at: number }[]>('aiHistory', []);
  const [aiKeyStored, setAiKeyStored] = useLS<string>('aiKey', '');
  const [aiKeyInput, setAiKeyInput] = useState('');
  const [aiKeyVisible, setAiKeyVisible] = useState(false);
  const [aiKeyStatus, setAiKeyStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');

  // --- CONFIGURACION DEL SITIO ---
  const [cfgTab, setCfgTab] = useState<'general' | 'social' | 'integraciones' | 'visibilidad' | 'mantenimiento' | 'push'>('general');

  // --- CALENDARIO: IMPORTACION DE AGENDA (.ICS) ---
  const [icsFile, setIcsFile] = useState<File | null>(null);
  const [icsImporting, setIcsImporting] = useState(false);
  const [icsResult, setIcsResult] = useState('');

  // --- NOTIFICACIONES PUSH ---
  const [pushConfig, setPushConfig] = useState<{ configured: boolean; publicKey: string; count: number } | null>(null);
  const [pushVapidKeys, setPushVapidKeys] = useState<{ publicKey: string; privateKey: string; subject: string }>({ publicKey: '', privateKey: '', subject: 'mailto:pastoral@luque.edu.py' });
  const [pushMsg, setPushMsg] = useState<{ title: string; body: string; url: string }>({ title: '', body: '', url: '/' });
  const [pushStatus, setPushStatus] = useState<{ type: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushAdminToken, setPushAdminToken] = useState('');

  const authHeaders = () => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (pushAdminToken) h['Authorization'] = `Bearer ${pushAdminToken}`;
    return h;
  };

  const genAdminToken = async () => {
    // Genera un token corto aleatorio y lo guarda en pjl_store (por seguridad sencilla).
    const tok = Array.from({ length: 3 }, () => Math.random().toString(36).slice(2, 10)).join('-');
    try {
      const res = await fetch('/api/push/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tok, secret: btoa(`${currentUser?.email}|${currentUser?.role}`) }),
      });
      const json = await res.json();
      if (json?.success) {
        setPushAdminToken(tok);
        setPushStatus({ type: 'ok', text: 'Token de autorización generado.' });
      } else {
        setPushStatus({ type: 'err', text: json?.error || 'No se pudo generar el token.' });
      }
    } catch {
      setPushStatus({ type: 'err', text: 'Error de red al generar el token.' });
    }
  };

  const loadPushConfig = async () => {
    if (!pushAdminToken) return;
    try {
      const [v, s] = await Promise.all([
        fetch('/api/push/vapid', { headers: authHeaders() }),
        fetch('/api/push/send', { headers: authHeaders() }),
      ]);
      const vj = await v.json();
      const sj = await s.json();
      setPushConfig({
        configured: !!vj?.config,
        publicKey: vj?.config?.publicKey || '',
        count: sj?.count || 0,
      });
    } catch {
      setPushStatus({ type: 'err', text: 'No se pudo leer la configuración push.' });
    }
  };

  const saveVapid = async (action: 'generate' | 'save') => {
    setPushBusy(true);
    setPushStatus(null);
    try {
      const res = await fetch('/api/push/vapid', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(
          action === 'generate'
            ? { action: 'generate', subject: pushVapidKeys.subject }
            : pushVapidKeys
        ),
      });
      const json = await res.json();
      if (json?.success) {
        setPushStatus({ type: 'ok', text: 'Claves VAPID guardadas correctamente.' });
        await loadPushConfig();
      } else {
        setPushStatus({ type: 'err', text: json?.error || 'Error al guardar las claves.' });
      }
    } catch {
      setPushStatus({ type: 'err', text: 'Error de red al guardar las claves.' });
    } finally {
      setPushBusy(false);
    }
  };

  const sendPush = async () => {
    if (!pushMsg.title.trim() || !pushMsg.body.trim()) {
      setPushStatus({ type: 'err', text: 'Completá el título y el mensaje.' });
      return;
    }
    setPushBusy(true);
    setPushStatus(null);
    try {
      const res = await fetch('/api/push/send', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ title: pushMsg.title, body: pushMsg.body, url: pushMsg.url || '/' }),
      });
      const json = await res.json();
      if (json?.success) {
        setPushStatus({ type: 'ok', text: `Aviso enviado a ${json.sent} dispositivo(s)${json.removed ? ` (${json.removed} removidos por inválidos)` : ''}.` });
        await loadPushConfig();
      } else {
        setPushStatus({ type: 'err', text: json?.error || 'No se pudo enviar el aviso.' });
      }
    } catch {
      setPushStatus({ type: 'err', text: 'Error de red al enviar.' });
    } finally {
      setPushBusy(false);
    }
  };

  // --- ACTIVIDADES: CALENDARIO Y FILTRO POR DIA ---
  const [actSelDate, setActSelDate] = useState<string>('all');

  // --- FILTERS ---
  const [searchTerm, setSearchTerm] = useState('');
  const [capZoneFilter, setCapZoneFilter] = useState<number | 'all'>('all');
  const [capEstadoFilter, setCapEstadoFilter] = useState<'all' | 'Activo' | 'Nucleación' | 'sinGPS'>('all');

  // --- HISTORIAL: PAGINACION Y FILTROS ---
  const [logSearch, setLogSearch] = useState('');
  const [logModule, setLogModule] = useState<string>('all');
  const [logPage, setLogPage] = useState(1);

  // --- TERRITORY EDITOR ---
  const [capturingZone, setCapturingZone] = useState<number | null>(null);
  const [tempPolygon, setTempPolygon] = useState<[number, number][]>([]);
  const [placingChapelId, setPlacingChapelId] = useState<string | null>(null);

  useEffect(() => {
    (window as any).onPJLMapClick = (lat: number, lng: number) => {
      if (capturingZone !== null) {
        setTempPolygon(prev => [...prev, [lat, lng]]);
        return;
      }
      if (placingChapelId) {
        const target = chapels.find(c => c.id === placingChapelId);
        if (target) {
          setChapels(chapels.map(c => (c.id === placingChapelId ? { ...c, lat, lng } : c)));
          showToast(`📍 ${target.name} ubicada en el mapa`);
          addLog('ubicar capilla', 'territorio', `${target.name} (${lat.toFixed(5)}, ${lng.toFixed(5)})`);
        }
        setPlacingChapelId(null);
      }
    };
    return () => { (window as any).onPJLMapClick = null; };
  }, [capturingZone, placingChapelId, chapels]);

  useEffect(() => {
    if (!(mod === 'capillas' && capillasView === 'territorio')) {
      setCapturingZone(null);
      setTempPolygon([]);
      setPlacingChapelId(null);
    }
  }, [mod, capillasView]);

  const saveCapturedPolygon = () => {
    if (capturingZone === null) return;
    setBranding({
      ...branding,
      [`zona${capturingZone}Polygon`]: tempPolygon
    });
    setCapturingZone(null);
    setTempPolygon([]);
    showToast(`Polígono Zona ${capturingZone} guardado ✔`);
    addLog('actualizar territorio', 'territorio', `Zona ${capturingZone}`);
  };

  // ─── TERRITORIO 2.0 · COBERTURA, UBICACIÓN Y EXPORT ───
  const pointInPolygon = (lat: number, lng: number, poly: [number, number][]): boolean => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const yi = poly[i][0], xi = poly[i][1];
      const yj = poly[j][0], xj = poly[j][1];
      if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };

  const territoryStats = ([1, 2, 3, 4] as const).map(num => {
    const poly = branding[`zona${num}Polygon`] as [number, number][] | undefined;
    const zoneList = chapels.filter(c => c.zonaId === num);
    const placed = zoneList.filter(c => typeof c.lat === 'number' && typeof c.lng === 'number');
    const dentro = poly && poly.length > 2 ? placed.filter(c => pointInPolygon(c.lat!, c.lng!, poly)).length : null;
    return {
      zona: num,
      total: zoneList.length,
      activas: zoneList.filter(c => c.estadoComunidad === 'Activo').length,
      ubicadas: placed.length,
      dentro,
      tienePoligono: !!(poly && poly.length > 2),
      color: (branding[`zona${num}Color`] as string) || '#C8973A'
    };
  });

  const TERR_PRESETS = ['#C8973A', '#1A2744', '#1A3B2B', '#441A1A', '#2563EB', '#0D9488'];
  const unplacedChapels = chapels.filter(c => typeof c.lat !== 'number' || typeof c.lng !== 'number');
  const placingChapel = placingChapelId ? chapels.find(c => c.id === placingChapelId) || null : null;
  const zonaColor = (z: number) => (branding[`zona${z}Color`] as string) || '#C8973A';

  const filteredChapels = chapels.filter(c => {
    const q = searchTerm.toLowerCase();
    const matchQ = !q || c.name.toLowerCase().includes(q) || c.zonaId.toString().includes(q);
    const matchZ = capZoneFilter === 'all' || c.zonaId === capZoneFilter;
    const matchE = capEstadoFilter === 'all'
      ? true
      : capEstadoFilter === 'sinGPS'
        ? typeof c.lat !== 'number' || typeof c.lng !== 'number'
        : c.estadoComunidad === capEstadoFilter;
    return matchQ && matchZ && matchE;
  });

  // Sincronización cruzada: desde Capillas → modo ubicación en Territorio
  const goToTerritoryPlace = (id: string) => {
    closeModal();
    navigateMod('capillas', 'territorio');
    startPlacingChapel(id);
  };

  const centerMapOn = (c: Chapel) => {
    if (typeof c.lat !== 'number' || typeof c.lng !== 'number') return;
    setBranding({ ...branding, mapCenterLat: c.lat, mapCenterLng: c.lng });
    showToast(`🎯 Mapa centrado en ${c.name}`);
    addLog('centrar mapa', 'territorio', c.name);
  };

  const toggleEstadoComunidad = (c: Chapel) => {
    const nuevo = c.estadoComunidad === 'Activo' ? 'Nucleación' : 'Activo';
    setChapels(chapels.map(x => (x.id === c.id ? { ...x, estadoComunidad: nuevo } : x)));
    showToast(`⇄ ${c.name}: ${nuevo}`);
    addLog('cambiar estado comunidad', 'capillas', `${c.name} → ${nuevo}`);
  };

  const startPlacingChapel = (id: string) => {
    setCapturingZone(null);
    setTempPolygon([]);
    setPlacingChapelId(id);
  };

  const exportTerritorioGeoJSON = () => {
    const features: Array<Record<string, unknown>> = [];
    ([1, 2, 3, 4] as const).forEach(num => {
      const poly = branding[`zona${num}Polygon`] as [number, number][] | undefined;
      if (poly && poly.length > 2) {
        const ring = [...poly.map(p => [p[1], p[0]]), [poly[0][1], poly[0][0]]];
        features.push({
          type: 'Feature',
          properties: { tipo: 'zona', zona: num, color: (branding[`zona${num}Color`] as string) || '#C8973A' },
          geometry: { type: 'Polygon', coordinates: [ring] }
        });
      }
    });
    chapels.forEach(c => {
      if (typeof c.lat === 'number' && typeof c.lng === 'number') {
        features.push({
          type: 'Feature',
          properties: { tipo: 'capilla', nombre: c.name, zona: c.zonaId, comunidad: c.comunidadNombre, estado: c.estadoComunidad },
          geometry: { type: 'Point', coordinates: [c.lng, c.lat] }
        });
      }
    });
    const blob = new Blob([JSON.stringify({ type: 'FeatureCollection', features }, null, 2)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'territorio-pjl.geojson';
    a.click();
    URL.revokeObjectURL(url);
    showToast('🗺️ Territorio exportado en GeoJSON');
    addLog('exportar territorio', 'territorio', `${features.length} entidades`);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const normalizedMod = modParam === 'territorio' ? 'capillas' : modParam;
    setMod(normalizedMod);
    setCapillasView(modParam === 'territorio' ? 'territorio' : tabParam);
  }, [modParam, tabParam]);
  useEffect(() => { setNavyHex(theme.navy); }, [theme.navy]);
  useEffect(() => { setGoldHex(theme.gold); }, [theme.gold]);

  // Close user menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // --- Modal UX: Body Scroll Lock ---
  useEffect(() => {
    if (modal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => { document.body.style.overflow = 'auto'; };
  }, [modal]);

  // --- Geocoding Automático para Capillas ---
  useEffect(() => {
    if (modal === 'capillas' && form.locationUrl && form.locationUrl.includes('google.com/maps')) {
      const match = form.locationUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (match) {
        const [_, lat, lon] = match;
        // Nominatim reverse geocoding (OpenStreetMap)
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`)
          .then(r => r.json())
          .then(data => {
            if (data.display_name && !form.address) {
              // Limpiar un poco la dirección para que no sea excesivamente larga
              const cleanAddr = data.display_name.split(',').slice(0, 3).join(', ');
              setForm((f: any) => ({ ...f, address: cleanAddr }));
            }
          })
          .catch(e => console.error("Error recuperando dirección:", e));
      }
    }
  }, [form.locationUrl, modal]);

  // --- Automatic Address Fetching ---
  useEffect(() => {
    if (modal === 'capillas' && form.locationUrl) {
      const url = form.locationUrl;
      // Parsing logic for long Google Maps URLs
      if (url.includes('/place/')) {
        try {
          const parts = url.split('/place/');
          if (parts.length > 1) {
            const placeName = parts[1].split('/')[0];
            const parsed = decodeURIComponent(placeName).replace(/\+/g, ' ');
            // Update address only if it's empty or was recently auto-filled
            if (!form.address || form.address === 'Ubicación seleccionada') {
              setForm((prev: any) => ({ ...prev, address: parsed }));
            }
          }
        } catch (e) {}
      }
    }
  }, [form.locationUrl, modal]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginErr(false);
    setLoginErrorMessage('');
    setIsLoggingIn(true);

    const inputUser = loginForm.user.trim();
    const inputPass = loginForm.pass.trim();
    const normalize = (value: string) => value.trim().toLowerCase();

    const resolveEmail = () => {
      const value = normalize(inputUser);
      if (value.includes('@')) return value;
      const found = allUsers.find(u => {
        const email = normalize(u.email);
        const name = normalize(u.name);
        const alias = email.split('@')[0];
        const compactName = name.replace(/\s+/g, '');
        return [email, name, alias, compactName].includes(value);
      });
      return found?.email;
    };

    const inputEmail = resolveEmail();
    const isMaster = normalize(inputUser) === CREDS.user && inputPass === CREDS.pass;
    const supabaseAvailable = supabaseStatus?.ok !== false;
    let authUser: User | null = null;

    try {
      if (isMaster) {
        authUser = {
          id: 'master',
          name: 'Desarrollador',
          email: CREDS.user,
          role: 'desarrollador',
          status: 'activo',
          permissions: NAV_ITEMS.map(n => n.id),
          lastActive: new Date().toISOString(),
        };
      } else if (inputEmail) {
        if (!supabaseAvailable) {
          setLoginErr(true);
          setLoginErrorMessage('Supabase no está disponible. Intenta más tarde.');
          return;
        }

        const { data, error } = await signInProfile(inputEmail, inputPass);
        if (error) {
          const profile = await fetchProfileByEmail(inputEmail);
          if (profile?.status === 'pendiente') {
            setLoginErr(true);
            setLoginErrorMessage('Tu cuenta está pendiente de aprobación. Pronto el administrador te aceptará.');
            return;
          }
          setLoginErr(true);
          setLoginErrorMessage(error.message || 'Usuario o contraseña incorrectos.');
          return;
        }

        if (data?.session?.user?.email) {
          const profile = await fetchProfileByEmail(inputEmail);
          if (profile) {
            if (profile.status !== 'activo') {
              setLoginErr(true);
              setLoginErrorMessage(profile.status === 'pendiente'
                ? 'Tu cuenta está pendiente de aprobación.'
                : 'Tu cuenta no está activa.');
              return;
            }
            authUser = {
              id: profile.id,
              name: profile.name,
              email: profile.email,
              role: profile.role,
              status: profile.status,
              permissions: profile.permissions,
              createdAt: profile.created_at,
              lastActive: new Date().toISOString(),
            };
          }
        }
      }

      if (authUser) {
        setLoggedIn(true);
        setCurrentUser(authUser);
        localStorage.setItem('pjl_admin_auth', 'true');
        localStorage.setItem('pjl_current_user', JSON.stringify(authUser));
        setLoginErr(false);
        setShowPassword(false);
        showToast(`¡Bienvenido, ${authUser.name}! ✔`);
        addLog('inicio de sesión', 'sistema', `Usuario ${authUser.email} ha entrado al panel.`);
        return;
      }

      setLoginErr(true);
      setLoginErrorMessage('Usuario o contraseña incorrectos.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setLoggedIn(false);
    setCurrentUser(null);
    localStorage.removeItem('pjl_admin_auth');
    localStorage.removeItem('pjl_current_user');
    router.push('/');
  };

  const loadPendingProfiles = async () => {
    try {
      const pending = await fetchPendingProfiles();
      setPendingProfiles(pending);
    } catch (error) {
      console.error('Error cargando solicitudes pendientes:', error);
    }
  };

  const handleApproveProfile = async (profileId: string) => {
    const success = await approveProfile(profileId);
    if (success) {
      showToast('Cuenta aprobada ✔');
      const profiles = await fetchAllProfiles();
      setAllUsers(profiles.map(p => ({
        id: p.id,
        name: p.name,
        email: p.email,
        role: p.role,
        status: p.status,
        permissions: p.permissions,
        createdAt: p.created_at,
        authUid: p.auth_uid,
      })));
      await loadPendingProfiles();
      addLog('aprobar cuenta', 'usuarios', `Perfil aprobado: ${profileId}`);
    } else {
      showToast('No se pudo aprobar la cuenta');
    }
  };

  const handleResendVerification = async (email: string, name: string) => {
    const { success, message } = await resendVerificationEmail(email);
    if (success) {
      showToast('✉️ Correo reenviado');
      addLog('reenviar verificación', 'usuarios', `Email reenviado a: ${email}`);
    } else {
      alert(message || 'No se pudo reenviar el correo de verificación.');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterErr('');
    setRegisterSuccess('');
    if (!registerForm.name || !registerForm.email || !registerForm.password) {
      setRegisterErr('Completa todos los campos.');
      return;
    }
    if (registerForm.password !== registerForm.confirmPassword) {
      setRegisterErr('Las contraseñas no coinciden.');
      return;
    }
    if (supabaseStatus?.ok === false) {
      setRegisterErr('No se puede solicitar acceso porque Supabase no está disponible. Intenta más tarde.');
      return;
    }

    setIsRegistering(true);
    try {
      const redirectTo = siteUrlOf('/confirmation?success=true');
      const { error } = await signUpProfile(registerForm.name, registerForm.email, registerForm.password, redirectTo);
      if (error) {
        setRegisterErr(error.message || 'Error al solicitar acceso.');
        return;
      }

      setRegisterSuccess('Solicitud enviada. El desarrollador aprobará tu cuenta pronto.');
      setRegisterForm({ name: '', email: '', password: '', confirmPassword: '' });
      await loadPendingProfiles();
    } catch (e) {
      setRegisterErr('Error al solicitar acceso. Intenta nuevamente.');
    } finally {
      setIsRegistering(false);
    }
  };

  const navigateMod = (m: Module, section?: 'capillas' | 'territorio') => {
    const sectionQuery = section ? `&tab=${section}` : '';
    router.push(`/admin?mod=${m}${sectionQuery}`);
    setSidebarOpen(false);
  };

  const closeModal = () => { setModal(null); setEditId(null); setForm({}); };
  const openNew = (type: Module) => { setModal(type); setEditId(null); setForm({}); };
  const openEdit = (type: Module, item: NewsItem | Activity | FaqItem | DocItem | GalleryItem | Chapel | MemberProfile | User | Record<string, string>) => { setModal(type); setEditId((item as { id?: number | string }).id || null); setForm(item); };

  const syncActivityToGoogleCalendar = async (
    activity: Activity,
    action: 'create' | 'update' | 'delete',
    calendarEventId?: string
  ) => {
    const response = await fetch('/api/google-calendar/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        title: activity.title,
        date: activity.date,
        description: activity.description || '',
        category: activity.category || '',
        eventId: calendarEventId || activity.calendarEventId || '',
      }),
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.ok) {
      throw new Error(json.message || 'No se pudo sincronizar con Google Calendar.');
    }

    return json as { eventId?: string; htmlLink?: string; deleted?: boolean };
  };

  const syncNewsToGoogleCalendar = async (
    item: NewsItem,
    action: 'create' | 'update' | 'delete',
    calendarEventId?: string
  ) => {
    const response = await fetch('/api/google-calendar/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        title: item.title,
        date: item.date,
        description: item.body || '',
        category: 'Noticias',
        eventId: calendarEventId || item.calendarEventId || '',
      }),
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.ok) {
      throw new Error(json.message || 'No se pudo sincronizar la noticia con Google Calendar.');
    }

    return json as { eventId?: string; htmlLink?: string; deleted?: boolean };
  };

  // --- CRUD ---
  const saveNews = async () => {
    const title = typeof form.title === 'string' ? form.title.trim() : '';
    const body = typeof form.body === 'string' ? form.body.trim() : '';
    const date = typeof form.date === 'string' ? form.date : '';
    const published = Boolean(form.published ?? true);
    const existingNews = editId ? news.find(n => n.id === editId) : null;
    const localId = editId || Date.now();
    const savedNews: NewsItem = {
      ...form,
      id: localId,
      title,
      body,
      date,
      published,
      calendarEventId: published ? existingNews?.calendarEventId : undefined,
      calendarUrl: published ? existingNews?.calendarUrl : undefined,
      calendarSyncStatus: googleCalendarStatus?.connected ? 'pending' : 'error',
    };

    if (!title || !date) {
      alert('Debes completar al menos el título y la fecha de la noticia.');
      return;
    }

    const updated = editId
      ? news.map(n => n.id === editId ? { ...n, ...savedNews } : n)
      : [...news, savedNews];
    setNews(updated);
    closeModal();
    addLog(editId ? 'editar' : 'crear', 'noticias', `Tít: ${form.title}`);

    if (!googleCalendarStatus?.connected) {
      showToast('Noticia guardada ✔');
      return;
    }

    if (!published) {
      if (existingNews?.calendarEventId) {
        try {
          await syncNewsToGoogleCalendar({ ...savedNews, calendarEventId: existingNews.calendarEventId }, 'delete', existingNews.calendarEventId);
        } catch (error) {
          console.error('Error borrando noticia en Google Calendar:', error);
        }
      }
      showToast('Noticia guardada ✔');
      return;
    }

    setGoogleCalendarSyncing(true);
    try {
      const result = await syncNewsToGoogleCalendar(
        {
          ...savedNews,
          id: localId,
        } as NewsItem,
        existingNews?.calendarEventId ? 'update' : 'create',
        existingNews?.calendarEventId
      );

      setNews(prev => prev.map(n => {
        if (n.id !== localId) return n;
        return {
          ...n,
          calendarEventId: result.eventId || n.calendarEventId,
          calendarUrl: result.htmlLink || n.calendarUrl,
          calendarSyncStatus: 'synced',
        };
      }));
      showToast(existingNews?.calendarEventId ? 'Noticia actualizada en Google Calendar ✔' : 'Noticia enviada a Google Calendar ✔');
    } catch (error) {
      console.error('Error sincronizando noticia con Google Calendar:', error);
      setNews(prev => prev.map(n => n.id === localId ? { ...n, calendarSyncStatus: 'error' } : n));
      showToast('Noticia guardada ✔');
    } finally {
      setGoogleCalendarSyncing(false);
    }
  };

  const saveActivity = async () => {
    const title = typeof form.title === 'string' ? form.title.trim() : '';
    const date = typeof form.date === 'string' ? form.date : '';
    const category = typeof form.category === 'string' ? form.category : 'Formación';
    const description = typeof form.description === 'string' ? form.description.trim() : '';
    const existingActivity = editId ? activities.find(a => a.id === editId) : null;
    const localId = editId || Date.now();
    const savedActivity: Activity = {
      ...form,
      id: localId,
      title,
      date,
      category,
      description,
      inscription: Boolean(form.inscription),
      active: editId ? Boolean((form as Activity).active ?? true) : true,
      calendarUrl: buildGoogleCalendarCreateUrl(title, date, description, category),
      calendarEventId: existingActivity?.calendarEventId,
      calendarSyncStatus: googleCalendarStatus?.connected ? 'pending' : 'error',
    };

    if (!title || !date) {
      alert('Debes completar al menos el título y la fecha de la actividad.');
      return;
    }

    const updated = editId
      ? activities.map(a => a.id === editId ? { ...a, ...savedActivity } : a)
      : [...activities, savedActivity];
    setActivities(updated);
    closeModal();
    addLog(editId ? 'editar' : 'crear', 'actividades', `Act: ${form.title}`);

    if (!googleCalendarStatus?.connected) {
      showToast('Actividad guardada ✔');
      return;
    }

    setGoogleCalendarSyncing(true);
    try {
      const result = await syncActivityToGoogleCalendar(
        {
          ...savedActivity,
          id: localId,
        } as Activity,
        existingActivity?.calendarEventId ? 'update' : 'create',
        existingActivity?.calendarEventId
      );

      setActivities(prev => prev.map(a => {
        if (a.id !== localId) return a;
        return {
          ...a,
          calendarEventId: result.eventId || a.calendarEventId,
          calendarUrl: result.htmlLink || a.calendarUrl,
          calendarSyncStatus: 'synced',
        };
      }));
      showToast(existingActivity?.calendarEventId ? 'Actividad actualizada en Google Calendar ✔' : 'Actividad enviada a Google Calendar ✔');
    } catch (error) {
      console.error('Error sincronizando actividad con Google Calendar:', error);
      setActivities(prev => prev.map(a => a.id === localId ? { ...a, calendarSyncStatus: 'error' } : a));
      showToast('Actividad guardada ✔');
    } finally {
      setGoogleCalendarSyncing(false);
    }
  };

  const deleteAllActivities = async () => {
    if (!confirm('¿Deseas borrar todas las actividades? Esta acción no se puede deshacer.')) return;

    const remoteDeletes = activities
      .filter(activity => activity.calendarEventId)
      .map(activity => syncActivityToGoogleCalendar(activity, 'delete'));
    await Promise.allSettled(remoteDeletes);

    setActivities([]);
    showToast('Todas las actividades fueron eliminadas 🗑️');
    addLog('eliminar todo', 'actividades');
  };

  const importIcs = async () => {
    if (!icsFile) {
      showToast('Seleccioná primero un archivo .ics.');
      return;
    }
    setIcsImporting(true);
    setIcsResult('');
    try {
      const text = await icsFile.text();
      const response = await fetch('/api/calendar/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, activities }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || 'No se pudo importar la agenda.');
      }
      if (Array.isArray(json.activities)) {
        setActivities(json.activities);
      }
      setIcsResult(`${json.created} eventos nuevos · ${json.updated} actualizados · ${json.skipped} omitidos`);
      showToast(`Agenda importada: ${json.created} eventos nuevos ✔`);
      addLog('importar', 'actividades', 'Importación de agenda desde archivo .ics');
    } catch (error) {
      console.error('Error importando agenda:', error);
      setIcsResult('No se pudo importar la agenda. Verificá que el archivo sea un .ics válido.');
      showToast('Error al importar agenda ✖');
    } finally {
      setIcsImporting(false);
    }
  };

  const saveDoc = () => {
    const normalizedDoc = {
      ...form,
      category: form.category || 'General',
      uploadedAt: form.uploadedAt || new Date().toISOString().slice(0, 10),
    };
    const updated = editId
      ? docs.map(d => d.id === editId ? { ...d, ...normalizedDoc } : d)
      : [...docs, { ...normalizedDoc, id: Date.now(), downloads: 0 }];
    setDocs(updated); closeModal(); showToast('Documento registrado ✔');
    addLog(editId ? 'editar' : 'crear', 'documentos', `Doc: ${normalizedDoc.name}`);
  };

  const saveChapel = () => {
    if (!form.name) return;
    const updated = editId
      ? chapels.map(c => c.id === editId ? { ...c, ...form } : c)
      : [...chapels, { ...form, id: Date.now().toString(), zonaId: form.zonaId || 1, estadoComunidad: form.estadoComunidad || 'Activo' }];
    setChapels(updated); closeModal(); showToast('Capilla guardada ✔');
    addLog(editId ? 'editar' : 'crear', 'capillas', `Nombre: ${form.name}`);
  };

  const saveUser = async () => {
    if (!form.email || !form.name) return;
    const normalizedPermissions = form.role === 'superadmin'
      ? NAV_ITEMS.map(n => n.id)
      : Array.from(new Set(['dashboard', ...(form.permissions || [])]));
    const normalizedUser = { ...form, permissions: normalizedPermissions };

    closeModal();

    if (editId) {
      const previousUsers = allUsers;
      const target = allUsers.find(u => u.id === editId);
      // Actualización optimista en la UI
      setAllUsers(allUsers.map(u => u.id === editId ? { ...u, ...normalizedUser } : u));

      if (target) {
        // Persistir en Supabase: sin esto, los cambios se pierden al recargar
        const ok = await updateProfile(target.id, {
          name: form.name,
          email: form.email,
          role: form.role,
          status: (form.status as 'activo' | 'inactivo' | 'pendiente') || target.status,
          permissions: normalizedPermissions,
        });
        if (!ok) {
          setAllUsers(previousUsers);
          showToast('Sin conexión con la nube: cambios revertidos ✖');
          addLog('error', 'usuarios', `No se pudo actualizar: ${form.email}`);
          return;
        }
        showToast('Usuario actualizado y sincronizado ✔');
      }
    } else {
      setAllUsers([...allUsers, { ...normalizedUser, id: Date.now().toString(), password: form.password || 'pjl123', createdAt: new Date().toISOString() }]);
      showToast('Usuario creado ✔');
    }
    addLog(editId ? 'editar' : 'crear', 'usuarios', `User: ${form.email}`);
  };

  const deleteItem = async (type: 'news' | 'activities' | 'docs' | 'chapels' | 'users', id: number | string) => {
    if (!confirm('¿Estás seguro de eliminar este elemento?')) return;
    const newsToDelete = type === 'news' ? news.find(n => n.id === id) : null;
    const activityToDelete = type === 'activities' ? activities.find(a => a.id === id) : null;
    if (newsToDelete?.calendarEventId) {
      try {
        await syncNewsToGoogleCalendar(newsToDelete, 'delete', newsToDelete.calendarEventId);
      } catch (error) {
        console.error('No se pudo borrar el evento remoto de la noticia en Google Calendar:', error);
      }
    }
    if (activityToDelete?.calendarEventId) {
      try {
        await syncActivityToGoogleCalendar(activityToDelete, 'delete');
      } catch (error) {
        console.error('No se pudo borrar el evento remoto de Google Calendar:', error);
      }
    }
    if (type === 'news') setNews(news.filter(n => n.id !== id));
    if (type === 'activities') setActivities(activities.filter(a => a.id !== id));
    if (type === 'docs') setDocs(docs.filter(d => d.id !== id));
    if (type === 'chapels') setChapels(chapels.filter(c => c.id !== id));
    if (type === 'users') {
      const user = allUsers.find(u => u.id === id);
      if (user) {
        if (user.authUid) {
          const { success, message } = await deleteProfile(user.id, user.authUid);
          if (!success) {
            alert(message || 'No se pudo eliminar el usuario en Supabase.');
            return;
          }
        }
      }
      setAllUsers(allUsers.filter(u => u.id !== id));
      setPendingProfiles(prev => prev.filter(p => p.id !== id));
    }
    showToast('Elemento eliminado 🗑️');
    addLog('eliminar', type, `ID: ${id}`);
  };

  const resetStats = () => {
    if (!confirm('¿Deseas reiniciar todas las estadísticas a cero? Esta acción no se puede deshacer.')) return;
    const resetData = DEFAULT_STATS.map(s => ({ ...s, visits: 0, interactions: 0, desktopVisits: 0, tabletVisits: 0, mobileVisits: 0 }));
    setPageStats(resetData);
    showToast('Estadísticas reiniciadas ✔');
    addLog('reiniciar estadísticas', 'dashboard');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, callback: (url: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const url = await uploadFileToR2(file);
    if (url) {
      callback(url);
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => callback(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleDocumentFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const extension = file.name.includes('.') ? file.name.split('.').pop()?.toUpperCase() : file.type.split('/').pop()?.toUpperCase();
    const sizeMb = file.size / (1024 * 1024);

    handleFileUpload(e, (url) => {
      setForm((prev: any) => ({
        ...prev,
        name: prev.name || file.name,
        type: prev.type || extension || 'FILE',
        size: `${sizeMb >= 1 ? sizeMb.toFixed(1) : Math.max(sizeMb, 0.1).toFixed(1)} MB`,
        url,
        uploadedAt: prev.uploadedAt || new Date().toISOString().slice(0, 10),
      }));
    });
  };

  const applyThemeColor = (navy: string, gold: string, extra?: { bg?: string; card?: string }) => {
    setTheme({ navy, gold, mode: theme.mode, litPreview: theme.litPreview ?? null });
    window.dispatchEvent(new Event('pjl_theme_update'));
    if (typeof window !== 'undefined' && document.documentElement) {
      const root = document.documentElement.style;
      root.setProperty('--on-navy', readableTextOn(navy));
      root.setProperty('--on-gold', readableTextOn(gold));
      root.setProperty('--navy-mid', mixColor(navy, '#ffffff', 0.12));
      root.setProperty('--navy-light', mixColor(navy, '#ffffff', 0.22));
      root.setProperty('--gold-light', tint(gold, 0.28));
      root.setProperty('--gold-pale', tint(gold, 0.86));
      if (extra?.bg) root.setProperty('--cream', extra.bg);
      if (extra?.card) root.setProperty('--surface', extra.card);
    }
  };



  // --- LOGIN SCREEN ---
  if (!loggedIn) return (
    <div className="admin-login-screen">
      <div className="login-glass-container animate-reveal">
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="login-back-button"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              background: 'rgba(200,151,58,0.12)', border: '1px solid rgba(200,151,58,0.4)',
              borderRadius: '20px', padding: '8px 18px', color: 'var(--gold)',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer', marginBottom: '24px',
              transition: '0.2s'
            }}
          >
            ← Volver al Menú Principal
          </button>
          <div className="serif login-title" style={{ fontSize: '2rem', color: 'var(--navy)', letterSpacing: '-1px' }}>PJL <em>Admin</em></div>
          <p className="premium-label" style={{ color: 'var(--gold)', marginTop: '5px' }}>Acceso Restringido</p>
          {supabaseStatus && (
            <div style={{ textAlign: 'center', marginTop: '6px', fontSize: '13px', color: supabaseStatus.ok ? '#16a34a' : '#b91c1c' }}>
              {supabaseStatus.ok ? 'Supabase: Conectado' : 'Supabase: No disponible'} — {supabaseStatus.message}
            </div>
          )}
        </div>
        <div style={{ marginBottom: '20px', display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button type="button" className={`btn-premium ${registerMode === 'login' ? 'btn-premium-gold' : 'btn-premium-outline'}`} onClick={() => setRegisterMode('login')} style={{ minWidth: '140px' }}>
            Iniciar sesión
          </button>
          <button type="button" className={`btn-premium ${registerMode === 'register' ? 'btn-premium-gold' : 'btn-premium-outline'}`} onClick={() => setRegisterMode('register')} style={{ minWidth: '140px' }}>
            Solicitar acceso
          </button>
        </div>
        {supabaseStatus?.ok === false && (
          <div style={{ textAlign: 'center', fontSize: '13px', color: '#b45309', marginBottom: '16px' }}>
            Supabase está desconectado. Solo el acceso maestro <strong>admin/admin</strong> funcionará hasta que se restablezca la conexión.
          </div>
        )}
        {registerMode === 'login' ? (
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {emailConfirmedMessage && <div className="login-alert" style={{ background: '#dcfce7', color: '#166534', padding: '12px', borderRadius: '8px', fontSize: '13px', textAlign: 'center' }}>{emailConfirmedMessage}</div>}
            {loginErr && <div className="login-alert" style={{ background: '#fee2e2', color: '#b91c1c', padding: '12px', borderRadius: '8px', fontSize: '13px', textAlign: 'center' }}>{loginErrorMessage || 'Usuario o contraseña incorrectos'}</div>}
            <div className="form-group">
              <label className="premium-label" style={{ marginBottom: '8px', display: 'block' }}>Usuario</label>
              <input
                className="pjl-input"
                value={loginForm.user}
                onChange={e => {
                  setLoginForm({ ...loginForm, user: e.target.value });
                  if (loginErr) setLoginErr(false);
                }}
                placeholder="admin"
                autoComplete="username"
                required
              />
            </div>
            <div className="form-group">
              <label className="premium-label" style={{ marginBottom: '8px', display: 'block' }}>Contraseña</label>
              <div className="login-password-field" style={{ position: 'relative' }}>
                <input
                  className="pjl-input login-password-input"
                  type={showPassword ? 'text' : 'password'}
                  value={loginForm.pass}
                  onChange={e => {
                    setLoginForm({ ...loginForm, pass: e.target.value });
                    if (loginErr) setLoginErr(false);
                  }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', fontSize: '13px', color: 'var(--navy)', cursor: 'pointer', fontWeight: 600 }}>
                <input 
                  type="checkbox" 
                  checked={showPassword} 
                  onChange={() => setShowPassword(!showPassword)} 
                  style={{ width: '16px', height: '16px', accentColor: 'var(--gold)', cursor: 'pointer' }}
                />
                Mostrar contraseña
              </label>
              <div style={{ textAlign: 'right', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => router.push('/reset-password')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--gold)',
                    fontWeight: 700,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    fontSize: '13px',
                    padding: 0,
                  }}
                >
                  Olvidé mi contraseña
                </button>
              </div>
            </div>
            <button type="submit" className="btn-premium btn-premium-gold" style={{ width: '100%', marginTop: '10px' }} disabled={isLoggingIn}>
              {isLoggingIn ? 'Ingresando...' : 'Entrar al Panel'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {registerErr && <div className="login-alert" style={{ background: '#fee2e2', color: '#b91c1c', padding: '12px', borderRadius: '8px', fontSize: '13px', textAlign: 'center' }}>{registerErr}</div>}
            {registerSuccess && <div className="login-alert" style={{ background: '#dcfce7', color: '#166534', padding: '12px', borderRadius: '8px', fontSize: '13px', textAlign: 'center' }}>{registerSuccess}</div>}
            <div className="form-group">
              <label className="premium-label" style={{ marginBottom: '8px', display: 'block' }}>Nombre completo</label>
              <input
                className="pjl-input"
                value={registerForm.name}
                onChange={e => setRegisterForm({ ...registerForm, name: e.target.value })}
                placeholder="Tu nombre"
                autoComplete="name"
                required
              />
            </div>
            <div className="form-group">
              <label className="premium-label" style={{ marginBottom: '8px', display: 'block' }}>Email</label>
              <input
                className="pjl-input"
                type="email"
                value={registerForm.email}
                onChange={e => setRegisterForm({ ...registerForm, email: e.target.value })}
                placeholder="correo@dominio.com"
                autoComplete="email"
                required
              />
            </div>
            <div className="form-group">
              <label className="premium-label" style={{ marginBottom: '8px', display: 'block' }}>Contraseña</label>
              <input
                className="pjl-input"
                type="password"
                value={registerForm.password}
                onChange={e => setRegisterForm({ ...registerForm, password: e.target.value })}
                placeholder="••••••••"
                autoComplete="new-password"
                required
              />
            </div>
            <div className="form-group">
              <label className="premium-label" style={{ marginBottom: '8px', display: 'block' }}>Repite contraseña</label>
              <input
                className="pjl-input"
                type="password"
                value={registerForm.confirmPassword}
                onChange={e => setRegisterForm({ ...registerForm, confirmPassword: e.target.value })}
                placeholder="••••••••"
                autoComplete="new-password"
                required
              />
            </div>
            <button type="submit" className="btn-premium btn-premium-gold" style={{ width: '100%', marginTop: '10px' }} disabled={isRegistering}>
              {isRegistering ? 'Enviando...' : 'Solicitar acceso'}
            </button>
            <p style={{ fontSize: '12px', color: '#555', margin: 0, textAlign: 'center' }}>Tu solicitud será revisada por un desarrollador y quedará en estado <strong>pendiente</strong>.</p>
          </form>
        )}
      </div>
    </div>
  );

  return (
    <div className="admin-shell" style={{ overflowX: 'hidden' }}>
      {toast && <div className="pjl-toast animate-reveal">{toast}</div>}

      {/* MOBILE OVERLAY */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 98, display: 'none' }}
          className="sidebar-overlay"
        />
      )}

      {/* SIDEBAR */}
      <aside className={`admin-sidebar ${sidebarOpen ? 'sidebar-mobile-open' : ''}`}>
        <div className="sidebar-header" style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>
            <span className="side-logo-wrap">
              {branding.mainLogo ? (
                <img src={branding.mainLogo} alt="PJL Logo" className="logo-img-circular" style={{ width: '40px', height: '40px', border: '2px solid var(--gold)' }} />
              ) : (
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--navy)', fontWeight: 'bold' }}>P</div>
              )}
            </span>
            <div className="serif side-logo-title" style={{ fontSize: '1.6rem', marginLeft: '12px' }}>PJL <em>Admin</em></div>
          </Link>
          <p className="premium-label side-logo-sub" style={{ fontSize: '0.65rem', color: 'var(--gold)', paddingLeft: '54px' }}>Panel Institucional</p>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map(n => {
            const allowed = hasPermission(n.id as Module);
            const icon = (branding[n.iconKey as keyof Branding] as string) || n.defaultIcon;
            return (
              <button
                key={n.id}
                onClick={() => {
                  if (allowed) navigateMod(n.id as Module);
                  else showToast('Este módulo no está habilitado para este usuario');
                }}
                className={`admin-nav-item ${mod === n.id ? 'active' : ''}`}
                style={!allowed ? { opacity: 0.45, filter: 'grayscale(0.15)' } : undefined}
                title={allowed ? n.label : `${n.label} (sin permiso)`}
              >
                <span className="nav-icon">{icon}</span>
                <span className="nav-label">{n.label}</span>
                {!allowed && <span style={{ marginLeft: 'auto', fontSize: '12px', opacity: 0.9 }}>🔒</span>}
                {mod === n.id && allowed && <span className="nav-active-dot" aria-hidden="true"></span>}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <button
            className="btn-premium btn-premium-outline"
            style={{ width: '100%', marginBottom: '10px', fontSize: '0.72rem' }}
            onClick={() => router.push('/')}
          >
            ← Volver al Menú Principal
          </button>
          <button
            className="btn-premium"
            style={{ width: '100%', fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.15)' }}
            onClick={handleLogout}
          >
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="admin-main" data-module={mod}>
        <header className="admin-topbar">
          <div className="topbar-left">
            {/* Hamburger for mobile */}
            <button
              className="sidebar-hamburger"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Abrir menú"
            >
              ☰
            </button>
            <h2 key={mod} className="serif topbar-title" style={{ color: 'var(--navy)' }}>
              {NAV_ITEMS.find(n => n.id === mod)?.label}
            </h2>
          </div>
          <div className="topbar-right">
            <div className="user-profile" ref={userMenuRef} style={{ position: 'relative' }}>
              <div style={{ textAlign: 'right' }} className="user-info-text">
                <div className="user-name">{currentUser?.name || 'Admin Central'}</div>
                <div className="user-role" style={{ textTransform: 'capitalize' }}>{currentUser?.role || 'Super Administrador'}</div>
              </div>
              <button
                className="user-avatar"
                style={{ border: '2px solid var(--gold)', cursor: 'pointer' }}
                onClick={() => setShowUserMenu(!showUserMenu)}
                aria-label="Menú de usuario"
              >
                {currentUser?.name?.[0] || 'A'}
              </button>
              {showUserMenu && (
                <div className="user-menu-pop" style={{
                  position: 'absolute', top: 'calc(100% + 12px)', right: '0',
                  background: '#fff', padding: '15px', borderRadius: '14px',
                  boxShadow: '0 8px 40px rgba(0,0,0,0.18)', display: 'flex',
                  flexDirection: 'column', gap: '8px', zIndex: 200, minWidth: '200px',
                  border: '1px solid var(--gold-pale)'
                }}>
                  <div style={{ paddingBottom: '10px', borderBottom: '1px solid #eee', marginBottom: '4px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Conectado como</span>
                    <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--navy)', marginTop: '2px' }}>{currentUser?.name}</p>
                    <p style={{ fontSize: '11px', color: 'var(--gold)', textTransform: 'capitalize' }}>{currentUser?.role}</p>
                  </div>
                  <button
                    onClick={() => { setShowUserMenu(false); navigateMod('configuracion'); }}
                    className="btn-premium btn-premium-outline"
                    style={{ width: '100%', fontSize: '11px', padding: '8px', justifyContent: 'flex-start', gap: '8px' }}
                  >
                    ⚙️ Configuración
                  </button>
                  <button
                    onClick={() => { setShowUserMenu(false); router.push('/'); }}
                    className="btn-premium btn-premium-outline"
                    style={{ width: '100%', fontSize: '11px', padding: '8px', justifyContent: 'flex-start', gap: '8px' }}
                  >
                    🏠 Ver Sitio Web
                  </button>
                  <button
                    onClick={() => { setShowUserMenu(false); setLoggedIn(false); }}
                    style={{
                      border: '1px solid #ef4444', color: '#ef4444', background: '#fef2f2',
                      width: '100%', fontSize: '11px', padding: '8px', borderRadius: '8px',
                      fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'
                    }}
                  >
                    🚪 Cerrar Sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="admin-content-area" style={{ position: 'relative' }} data-module={mod}>
          {/* LOGO WATERMARK BACKGROUND */}
          {branding.logoWatermark && branding.mainLogo && (
            <div style={{
              position: 'fixed',
              bottom: '50px',
              right: '50px',
              width: '400px',
              height: '400px',
              backgroundImage: `url(${branding.mainLogo})`,
              backgroundSize: 'contain',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              opacity: 0.05,
              pointerEvents: 'none',
              zIndex: 0,
              filter: 'grayscale(1) brightness(0.5)'
            }} />
          )}

          {/* DASHBOARD */}
          {mod === 'dashboard' && (
            <div className="animate-reveal">

              {/* BIENVENIDA */}
              <div className="dash-welcome pop-in">
                <div className="dash-welcome-text">
                  <span className="dash-welcome-hi">✨ Panel de control en vivo</span>
                  <h3 className="serif">¡Hola, {(currentUser?.name || 'Admin').split(' ')[0]}! 👋</h3>
                  <p>{new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · Todo sincronizado con la nube</p>
                </div>
                <div className="dash-welcome-badge">
                  <span className="dash-live-dot"></span> DATOS EN VIVO
                </div>
              </div>

              {/* KPI CARDS ANIMADAS */}
              <div className="admin-dashboard-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '18px', marginBottom: '30px' }}>
                <KpiCard icon="📈" label="VISITAS TOTALES" value={liveVisits} sub="Registradas automáticamente" tone="navy" delay={0.05} />
                <KpiCard icon="⚡" label="INTERACCIONES" value={(Array.isArray(pageStats) ? pageStats : []).reduce((acc, s) => acc + (s?.interactions || 0), 0)} sub="Puntos de contacto activos" tone="gold" delay={0.12} />
                <KpiCard icon="👥" label="USUARIOS" value={allUsers.length} sub="Cuentas registradas en la nube" tone="blue" delay={0.19} />
                <KpiCard icon="📨" label="SOLICITUDES PENDIENTES" value={pendingProfiles.length} sub="Esperando aprobación" tone="rose" delay={0.26} />
                <KpiCard icon="⛪" label="COMUNIDADES ACTIVAS" value={chapels.filter(c => c.estadoComunidad === 'Activo').length} sub={`De ${chapels.length} comunidades totales`} tone="green" delay={0.33} />
                <KpiCard icon="📅" label="EVENTOS PRÓXIMOS" value={activities.filter(a => a.active && a.date && new Date(`${a.date}T23:59:59`) >= new Date()).length} sub="En el calendario pastoral" tone="violet" delay={0.4} />
              </div>

              {/* MAIN ANALYTICS GRID */}
              <div className="admin-dashboard-main-grid" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '20px', marginBottom: '20px' }}>

                {/* VISITS BY SECTION — HORIZONTAL BARS */}
                <div className="admin-analytics-card pop-in anal-visits-card" style={{ background: '#fff', border: '1px solid #e8e0d5', borderRadius: '16px', padding: '28px', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', animationDelay: '0.2s' }}>
                  <div className="admin-dashboard-card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
                    <div>
                      <h3 style={{ margin: 0, color: 'var(--navy)', fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="anal-sec-ico" style={{ width: '34px', height: '34px', borderRadius: '10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, var(--navy), var(--navy-mid))', color: '#fff', fontSize: '16px' }}>📊</span>
                        Visitas por Sección
                      </h3>
                      <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#888' }}>Rendimiento de cada sección del sitio</p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                      <span className="anal-total-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 800, color: 'var(--navy)', background: 'linear-gradient(120deg, #f5e9cf, #fbf6ec)', border: '1px solid var(--gold-pale)', padding: '7px 14px', borderRadius: '30px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--gold)', boxShadow: '0 0 0 3px rgba(200,151,58,.2)' }} />
                        {liveVisits.toLocaleString('es-ES')} visitas
                      </span>
                      <div className="anal-actions" style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => { const s = store.stats.get(); const csv = 'Sección,Visitas,Interacciones,Desktop,Tablet,Móvil\n' + s.map(e => `"${e.label}",${e.visits},${e.interactions},${e.desktopVisits||0},${e.tabletVisits||0},${e.mobileVisits||0}`).join('\n'); const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURI(csv); a.download = 'reporte_pjl.csv'; a.click(); showToast('CSV descargado ✔'); }} title="Exportar reporte" style={{ fontSize: '10px', padding: '5px 12px', background: 'var(--cream)', border: '1px solid var(--gold-pale)', borderRadius: '8px', cursor: 'pointer', color: 'var(--navy)', fontWeight: 700, transition: 'all .25s', boxShadow: '0 2px 6px rgba(0,0,0,.05)' }}>📥 CSV</button>
                        <button onClick={resetStats} title="Reiniciar contadores" style={{ fontSize: '10px', padding: '5px 12px', background: '#fff0f0', border: '1px solid #fca5a5', borderRadius: '8px', cursor: 'pointer', color: '#b91c1c', fontWeight: 700, transition: 'all .25s', boxShadow: '0 2px 6px rgba(0,0,0,.05)' }}>🗑️ Reset</button>
                        <span style={{ fontSize: '10px', background: '#d1fae5', color: '#065f46', padding: '5px 10px', borderRadius: '20px', fontWeight: 700, alignSelf: 'center' }}>● Auto-sync</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {(Array.isArray(pageStats) ? pageStats : [])
                      .sort((a, b) => (b?.visits || 0) - (a?.visits || 0))
                      .slice(0, 8)
                      .map((stat, i) => {
                        if (!stat) return null;
                        const visits = stat.visits || 0;
                        const ints = stat.interactions || 0;
                        const pct = maxVisits > 0 ? Math.round((visits / maxVisits) * 100) : 0;
                        const share = liveVisits > 0 ? Math.round((visits / liveVisits) * 100) : 0;
                        const intPct = maxInteractions > 0 ? Math.round((ints / maxInteractions) * 100) : 0;
                        const icon = ({ inicio: '🏠', home: '🏠', noticia: '📰', agenda: '📅', zona: '🗺️', consejo: '👥', documento: '📁', contacto: '✉️', instituc: '🏛️', historia: '📜', estatuto: '📋', pregunt: '❓', nosotros: '🌿', misi: '🎯' } as Record<string, string>)[(stat.label || '').toLowerCase().replace(/\s/g, '')] || '📍';
                        const rankColor = ['linear-gradient(135deg,#f6c954,#d9a220)', 'linear-gradient(135deg,#c9d4e0,#9fafc0)', 'linear-gradient(135deg,#e3a878,#c97f4d)'][i];
                        return (
                          <div key={stat.page || i} className={`anal-row ${i === 0 ? 'is-top' : ''}`} style={{ '--rd': `${i * 0.06}s` } as React.CSSProperties}>
                            <div className="anal-row-top">
                              <div className="anal-row-left">
                                <span className="anal-rank" style={i < 3 ? { background: rankColor, color: '#1A2744' } : undefined}>{i + 1}</span>
                                <span className="anal-badge" aria-hidden="true">{icon}</span>
                                <span className="anal-label">
                                  {stat.label}
                                  {share >= 20 && <em className="anal-hot">🔥 Popular</em>}
                                  {i === 0 && <em className="anal-top-tag">TOP</em>}
                                </span>
                              </div>
                              <div className="anal-counts">
                                <span className="anal-count" title="Visitas"><b>{visits.toLocaleString('es-ES')}</b><em>vis.</em></span>
                                <span className="anal-count green" title="Interacciones"><b>{ints.toLocaleString('es-ES')}</b><em>int.</em></span>
                              </div>
                            </div>
                            <div className="anal-track">
                              <div className="stat-bar-fill anal-fill anal-fill-main" style={{ width: `${pct}%`, animationDelay: `${0.3 + i * 0.07}s` }} />
                            </div>
                            <div className="anal-foot">
                              <span className="anal-share">{share}% del total</span>
                              <span className="anal-devices">
                                <i title="Desktop">{stat.desktopVisits || 0}</i>
                                <i title="Tablet">{stat.tabletVisits || 0}</i>
                                <i title="Móvil">{stat.mobileVisits || 0}</i>
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    {(Array.isArray(pageStats) ? pageStats : []).filter(s => (s?.visits || 0) === 0).length > 0 && (
                      <p style={{ fontSize: '11px', color: '#bbb', textAlign: 'center', paddingTop: '8px', fontStyle: 'italic' }}>
                        {(Array.isArray(pageStats) ? pageStats : []).filter(s => (s?.visits || 0) === 0).length} secciones aún sin visitas
                      </p>
                    )}
                  </div>

                  {(() => {
                    const sorted = (Array.isArray(pageStats) ? pageStats : []).sort((a, b) => (b?.visits || 0) - (a?.visits || 0));
                    const top = sorted[0];
                    const totInt = (Array.isArray(pageStats) ? pageStats : []).reduce((acc, s) => acc + (s?.interactions || 0), 0);
                    const conv = liveVisits > 0 ? Math.round((totInt / liveVisits) * 100) : 0;
                    const devDesk = (Array.isArray(pageStats) ? pageStats : []).reduce((a, s) => a + (s?.desktopVisits || 0), 0);
                    const devMob = (Array.isArray(pageStats) ? pageStats : []).reduce((a, s) => a + (s?.mobileVisits || 0), 0);
                    const devTab = (Array.isArray(pageStats) ? pageStats : []).reduce((a, s) => a + (s?.tabletVisits || 0), 0);
                    return (
                      <div className="anal-insights">
                        <div className="ai-item"><span className="ai-ico">🥇</span><p><b>{top ? top.label : '—'}</b><em>Sección más visitada</em></p></div>
                        <div className="ai-item"><span className="ai-ico">⚡</span><p><b>{conv}%</b><em>Tasa de interacción</em></p></div>
                        <div className="ai-item"><span className="ai-ico">📱</span><p><b>{devMob.toLocaleString('es-ES')} · {devDesk.toLocaleString('es-ES')} · {devTab.toLocaleString('es-ES')}</b><em>Móvil · Escritorio · Tablet</em></p></div>
                      </div>
                    );
                  })()}

                  <div style={{ marginTop: '16px', display: 'flex', gap: '16px', fontSize: '10px', color: '#888', paddingTop: '10px', borderTop: '1px solid #f0ece4', flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '10px', height: '7px', background: 'var(--navy)', borderRadius: '2px', display: 'inline-block' }} /> Visitas</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '10px', height: '7px', background: '#10B981', borderRadius: '2px', display: 'inline-block' }} /> Interacciones</span>
                    <span className="anal-dev-legend">● Escritorio <span className="d-dot" /> Tablet <span className="d-dot" /> Móvil</span>
                  </div>
                </div>

                {/* RIGHT COLUMN */}
                <div className="admin-dashboard-side-grid" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

                  {/* DISTRIBUTION DONUT (SVG) */}
                  <div className="admin-analytics-card pop-in" style={{ background: '#fff', border: '1px solid #e8e0d5', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', flex: 1, animationDelay: '0.3s' }}>
                    <h3 style={{ margin: '0 0 16px', color: 'var(--navy)', fontSize: '15px', fontWeight: 700 }}>🥧 Distribución por Sección</h3>
                    <p style={{ margin: '-10px 0 14px', fontSize: '11px', color: '#999' }}>Pasá el mouse por la dona o la leyenda para explorar</p>
                    <DonutChart items={(Array.isArray(pageStats) ? pageStats : []).filter(s => (s?.visits || 0) > 0).slice(0, 6).map(s => ({ label: s.label, visits: s.visits || 0 }))} />
                  </div>

                  {/* DISPOSITIVOS */}
                  <div className="admin-analytics-card pop-in" style={{ background: '#fff', border: '1px solid #e8e0d5', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', flex: 1, animationDelay: '0.4s' }}>
                    <h3 style={{ margin: '0 0 16px', color: 'var(--navy)', fontSize: '15px', fontWeight: 700 }}>📱 Dispositivos</h3>
                    {(() => {
                      const data = Array.isArray(pageStats) ? pageStats : [];
                      const desktop = data.reduce((acc, s) => acc + (s?.desktopVisits || 0), 0);
                      const tablet = data.reduce((acc, s) => acc + (s?.tabletVisits || 0), 0);
                      const mobile = data.reduce((acc, s) => acc + (s?.mobileVisits || 0), 0);
                      const totalDevices = desktop + tablet + mobile;

                      if (totalDevices === 0) return <p style={{ color: '#bbb', textAlign: 'center', padding: '10px 0', fontSize: '13px', fontStyle: 'italic', margin: 0 }}>Sin datos de dispositivos aún</p>;

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {[
                            { label: 'Celular', icon: '📱', value: mobile, pct: (mobile / totalDevices) * 100, color: '#10B981' },
                            { label: 'Computadora', icon: '💻', value: desktop, pct: (desktop / totalDevices) * 100, color: '#3B82F6' },
                            { label: 'Tablet', icon: '💻', value: tablet, pct: (tablet / totalDevices) * 100, color: '#C8973A' },
                          ].map((dev, i) => (
                            <div key={i}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '11px', fontWeight: 600, color: 'var(--navy)' }}>
                                <span>{dev.icon} {dev.label}</span>
                                <span style={{ color: '#888' }}>{Math.round(dev.pct)}% ({dev.value.toLocaleString()})</span>
                              </div>
                              <div style={{ height: '6px', background: '#f0ece4', borderRadius: '3px', overflow: 'hidden' }}>
                                <div className="stat-bar-fill" style={{ height: '100%', width: `${dev.pct}%`, background: dev.color, borderRadius: '3px', transition: '1s ease', animationDelay: `${0.5 + i * 0.1}s` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  {/* QUICK ACTIONS */}
                  <div className="admin-analytics-card pop-in" style={{ background: '#fff', border: '1px solid #e8e0d5', borderRadius: '16px', padding: '22px', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', animationDelay: '0.5s' }}>
                    <h3 style={{ margin: '0 0 14px', color: 'var(--navy)', fontSize: '15px', fontWeight: 700 }}>⚡ Accesos Rápidos</h3>
                    <div style={{ display: 'grid', gap: '8px' }}>
                      {[
                        { icon: '📰', label: 'Nueva Noticia', mod: 'noticias' },
                        { icon: '📅', label: 'Nuevo Evento', mod: 'actividades' },
                        { icon: '🎠', label: 'Carrusel Hero', mod: 'carrusel' },
                        { icon: '🎨', label: 'Identidad Visual', mod: 'identidad' },
                      ].map((a, i) => (
                        <button key={i} onClick={() => navigateMod(a.mod as any)} className="quick-action-btn" style={{ width: '100%', textAlign: 'left', padding: '9px 14px', background: 'var(--cream)', border: '1px solid var(--gold-pale)', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="quick-action-icon">{a.icon}</span> {a.label}
                          <span className="quick-action-arrow">→</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* STATUS BAR — Content summary */}
              <div className="admin-dashboard-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                {[
                  { label: 'Noticias', total: news.length, active: news.filter(n => n.published).length, icon: '📰', color: '#3B82F6' },
                  { label: 'Eventos', total: activities.length, active: activities.filter(a => a.active).length, icon: '📅', color: '#8B5CF6' },
                  { label: 'Capillas', total: chapels.length, active: chapels.filter(c => c.estadoComunidad === 'Activo').length, icon: '⛪', color: '#10B981' },
                  { label: 'Perfiles', total: profiles.length, active: profiles.length, icon: '👤', color: '#F59E0B' },
                  { label: 'Slides Hero', total: liveHeroImages.length, active: liveHeroImages.length, icon: '🎠', color: '#EF4444' },
                ].map((item, i) => (
                  <div key={i} className="mini-stat-card pop-in" style={{ animationDelay: `${0.15 + i * 0.08}s` }}>
                    <div className="mini-stat-icon" style={{ background: `${item.color}18`, color: item.color }}>{item.icon}</div>
                    <div style={{ fontSize: '10px', color: '#888', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>{item.label}</div>
                    <div className="mini-stat-total">{item.total}</div>
                    <div style={{ fontSize: '10px', color: item.color, fontWeight: 600, marginTop: '3px' }}>{item.active} activos</div>
                  </div>
                ))}
              </div>
              

              {/* RECENT ACTIVITY FEED */}
              <div className="pjl-card animate-reveal" style={{ marginTop: '30px', padding: '25px', background: '#fff', border: '1px solid var(--gold-pale)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 className="serif" style={{ color: 'var(--navy)', margin: 0, fontSize: '18px' }}>📜 Actividad Reciente</h3>
                  <button onClick={() => setLogs([])} className="premium-label" style={{ background: 'transparent', cursor: 'pointer', border: 'none', color: '#888', textDecoration: 'underline' }}>Limpiar Historial</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {logs.length === 0 ? (
                    <div className="pjl-empty-state" style={{ border: 'none', background: 'var(--cream)' }}>
                      <div className="empty-icon">📜</div>
                      <h4 className="empty-title">Sin actividad todavía</h4>
                      <p className="empty-desc">Cada acción que hagas en el panel (crear, editar, eliminar) quedará registrada aquí.</p>
                    </div>
                  ) : (
                    logs.map(log => (
                      <div key={log.id} className="dash-log-row" style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '12px 15px', background: 'var(--cream)', borderRadius: '12px', border: '1px solid var(--gold-pale)' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--navy)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 900, flexShrink: 0 }}>
                          {log.userName[0]}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                            <span style={{ fontWeight: 800, fontSize: '12px', color: 'var(--navy)' }}>{log.userName}</span>
                            <span style={{ fontSize: '10px', color: '#888' }}>{new Date(log.timestamp).toLocaleString()}</span>
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{log.action.toUpperCase()}</span> en <span style={{ fontWeight: 600 }}>{log.module.toUpperCase()}</span>
                            {log.details && <span style={{ marginLeft: '10px', opacity: 0.7 }}>— {log.details}</span>}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              
              {/* VATICAN NEWS - RELOCATED FROM SIDEBAR */}
              <div className="pjl-card animate-reveal" style={{ marginTop: '40px', padding: '30px', border: '1px solid var(--gold-pale)', background: 'var(--white)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '24px' }}>🇻🇦</span>
                    <h3 className="serif" style={{ color: 'var(--navy)', margin: 0, fontSize: '20px' }}>Vatican News Oficial</h3>
                  </div>
                  <span className="premium-label" style={{ fontSize: '10px', color: 'var(--gold)' }}>ACTUALIDAD DE LA IGLESIA</span>
                </div>
                <div style={{ 
                  borderRadius: '16px', 
                  overflow: 'hidden', 
                  background: '#fff', 
                  border: '1px solid var(--gold-pale)',
                  minHeight: '400px',
                  boxShadow: '0 4px 15px rgba(0,0,0,0.02)'
                }}>
                  {/* @ts-ignore */}
                  <vaticannews-widget lang="es" fontSize="18"></vaticannews-widget>
                  <Script src="https://www.vaticannews.va/widget.js" strategy="lazyOnload" />
                </div>
              </div>
            </div>
          )}



          {/* ASISTENTE IA */}
          {mod === 'asistente' && (() => {
            const AI_MODES = [
              { id: 'redes', icon: '📱', label: 'Redes', hint: 'un post breve para Instagram/Facebook con emojis y hashtags relevantes' },
              { id: 'noticia', icon: '📰', label: 'Noticia', hint: 'un artículo periodístico con titular potente, bajada y cuerpo claro' },
              { id: 'reflexion', icon: '🙏', label: 'Reflexión', hint: 'una reflexión espiritual cálida, inspirada en la Palabra de Dios' },
              { id: 'documento', icon: '📄', label: 'Documento', hint: 'un texto formal estructurado con secciones y subtítulos' },
              { id: 'email', icon: '✉️', label: 'Email', hint: 'un correo cordial con saludo, cuerpo bien organizado y despedida' },
            ];
            const AI_SUGGESTIONS = [
              'Invitación al retiro espiritual de Semana Santa',
              'Convocatoria de nuevos voluntarios para la catequesis',
              'Felicitación por las confirmaciones de este año',
              'Resumen de la jornada de servicio comunitario',
              'Anuncio de la peregrinación juvenil anual',
            ];
            const activeMode = AI_MODES.find(m => m.id === aiMode) || AI_MODES[0];
            const modeMetaOf = (mid: string) => AI_MODES.find(m => m.id === mid) || { icon: '✨', label: 'IA' };
            const haceMin = (t: number) => {
              const m = Math.max(0, Math.floor((Date.now() - t) / 60000));
              if (m < 1) return 'recién';
              if (m < 60) return `hace ${m} min`;
              const h = Math.floor(m / 60);
              if (h < 24) return `hace ${h} h`;
              return `hace ${Math.floor(h / 24)} d`;
            };

            const generarConIA = async () => {
              if (!aiPrompt.trim() || isAiLoading) return;
              setIsAiLoading(true);
              setAiResponse('');
              try {
                const finalPrompt =
                  `[Instrucción]: Redacta ${activeMode.hint} para la Pastoral Juvenil Luqueña. ` +
                  `Responde directamente con el contenido solicitado.\n\n[Solicitud]: ${aiPrompt}`;
                const res = await fetch('/api/ai', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ prompt: finalPrompt, apiKey: aiKeyStored || undefined })
                });
                const data = await res.json();
                if (res.ok && data.text) {
                  setAiResponse(data.text);
                  setAiHistory([{ id: Date.now().toString(), mode: aiMode, prompt: aiPrompt, text: data.text, at: Date.now() }, ...aiHistory].slice(0, 8));
                  showToast('Contenido generado exitosamente ✨');
                  addLog('generar contenido IA', 'asistente', `${activeMode.label}: ${aiPrompt.slice(0, 50)}${aiPrompt.length > 50 ? '…' : ''}`);
                } else {
                  showToast('Error: ' + (data.error || 'respuesta vacía'));
                }
              } catch {
                showToast('Hubo un error de conexión con la IA');
              } finally {
                setIsAiLoading(false);
              }
            };

            const descargarTxt = () => {
              const blob = new Blob([aiResponse], { type: 'text/plain;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `contenido-gemini-${Date.now()}.txt`;
              a.click();
              URL.revokeObjectURL(url);
              showToast('📄 Texto descargado');
            };

            return (
              <div className="animate-reveal pjl-card" style={{ padding: '40px', maxWidth: '1000px', margin: '0 auto' }}>
                <div className="ai-hero">
                  <div className="ai-orb" aria-hidden="true"><span>✨</span></div>
                  <div>
                    <h3 className="serif" style={{ color: 'var(--navy)', fontSize: '24px', margin: '0 0 6px' }}>Asistente Inteligente PJL</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '13.5px', margin: 0 }}>
                      Escribe lo que necesitas y Google Gemini generará contenido para tus noticias, redes o documentos.
                    </p>
                    <span className="ai-badge">⚡ Gemini 3.7 Flash</span>
                  </div>
                </div>

                {/* CONEXION / CLAVE API */}
                <div className="ai-keybox">
                  <div className="aik-head">
                    <b>🔑 Conexión Gemini</b>
                    <span className={`aik-state st-${aiKeyStatus}`}>
                      {aiKeyStatus === 'validating' ? '◌ Validando…'
                        : aiKeyStatus === 'valid' ? '✓ Clave válida'
                        : aiKeyStatus === 'invalid' ? '✕ Clave inválida'
                        : aiKeyStored ? '● Configurada' : '○ Sin configurar'}
                    </span>
                  </div>
                  <div className="aik-row">
                    <div className="aik-field">
                      <input
                        type={aiKeyVisible ? 'text' : 'password'}
                        value={aiKeyInput}
                        onChange={e => { setAiKeyInput(e.target.value); setAiKeyStatus('idle'); }}
                        placeholder={aiKeyStored ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (clave guardada)' : 'Pega tu clave de API (AIza… o AQ…)'}
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <button
                        type="button"
                        className="aik-eye"
                        onClick={() => setAiKeyVisible(v => !v)}
                        title={aiKeyVisible ? 'Ocultar clave' : 'Mostrar clave'}
                        aria-label={aiKeyVisible ? 'Ocultar clave' : 'Mostrar clave'}
                      >{aiKeyVisible ? '🙈' : '👁️'}</button>
                    </div>
                    <button
                      className="btn-premium btn-premium-outline aik-btn"
                      disabled={aiKeyStatus === 'validating' || (!aiKeyInput.trim() && !aiKeyStored)}
                      onClick={async () => {
                        const k = (aiKeyInput.trim() || aiKeyStored).trim();
                        if (!k) { showToast('Escribe una clave primero'); return; }
                        setAiKeyStatus('validating');
                        try {
                          const res = await fetch('/api/ai/validate', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ apiKey: k })
                          });
                          const data = await res.json();
                          setAiKeyStatus(data.valid ? 'valid' : 'invalid');
                          showToast(data.valid ? '✅ Clave válida — ¡Gemini listo!' : '❌ ' + (data.error || 'Clave rechazada'));
                        } catch {
                          setAiKeyStatus('invalid');
                          showToast('Error de conexión al validar la clave');
                        }
                      }}
                    >{aiKeyStatus === 'validating' ? 'Validando…' : 'Validar'}</button>
                    <button
                      className="btn-premium btn-premium-gold aik-btn"
                      disabled={!aiKeyInput.trim()}
                      onClick={() => { setAiKeyStored(aiKeyInput.trim()); setAiKeyInput(''); setAiKeyStatus('idle'); showToast('🔐 Clave guardada en el panel'); }}
                    >Guardar</button>
                  </div>
                  <small>Consigue tu clave gratis en <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a>. Se guarda solo en este panel, nunca en el código.</small>
                </div>

                {/* MODOS */}
                <label className="premium-label" style={{ display: 'block', marginBottom: '10px' }}>FORMATO DEL CONTENIDO</label>
                <div className="ai-modes" role="group" aria-label="Elegir formato">
                  {AI_MODES.map(m => (
                    <button
                      key={m.id}
                      className={`ai-mode ${aiMode === m.id ? 'on' : ''}`}
                      onClick={() => setAiMode(m.id)}
                    >
                      <i>{m.icon}</i>{m.label}
                    </button>
                  ))}
                </div>

                {/* ENTRADA */}
                <div className="ai-inputbox">
                  <textarea
                    className="pjl-input ai-textarea"
                    placeholder={`Ej: Escribe ${activeMode.hint.split(' con ')[0]} invitando al próximo retiro espiritual…`}
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    disabled={isAiLoading}
                    maxLength={4000}
                  />
                  <div className="ai-ta-foot">
                    <div className="ai-sugg">
                      {AI_SUGGESTIONS.map(s => (
                        <button key={s} disabled={isAiLoading} onClick={() => setAiPrompt(s)} title={s}>{s}</button>
                      ))}
                    </div>
                    <span className="ai-count">{aiPrompt.length}/4000</span>
                  </div>
                </div>

                <button
                  className="btn-premium btn-premium-gold ai-go"
                  disabled={isAiLoading || !aiPrompt.trim()}
                  onClick={generarConIA}
                >
                  {isAiLoading ? (<><i className="ai-spin">◌</i> Generando respuesta…</>) : (<>Generar con IA ✨</>)}
                </button>

                {/* PENSANDO */}
                {isAiLoading && (
                  <div className="ai-thinking" role="status">
                    <div className="ai-dots" aria-hidden="true"><i /><i /><i /></div>
                    <div className="ai-phrases" aria-hidden="true">
                      <span>Consultando a Gemini…</span>
                      <span>Dando forma al mensaje…</span>
                      <span>Añadiendo un toque de luz…</span>
                    </div>
                  </div>
                )}

                {/* RESULTADO */}
                {aiResponse && (
                  <div className="ai-result">
                    <div className="air-head">
                      <div className="air-title">
                        <span className="air-flag">✨</span>
                        <div>
                          <b>Respuesta Generada</b>
                          <small>{activeMode.icon} {activeMode.label} · {aiResponse.trim().split(/\s+/).length} palabras</small>
                        </div>
                      </div>
                      <div className="air-actions">
                        <button onClick={() => { navigator.clipboard.writeText(aiResponse); showToast('Copiado al portapapeles 📋'); }} title="Copiar">📋 Copiar</button>
                        <button onClick={descargarTxt} title="Descargar .txt">⬇️ Descargar</button>
                        <button onClick={generarConIA} title="Generar otra versión">🔄 Regenerar</button>
                      </div>
                    </div>
                    <div className="air-body">{aiResponse}</div>
                  </div>
                )}

                {/* HISTORIAL */}
                {aiHistory.length > 0 && (
                  <div className="ai-hist">
                    <div className="ai-hist-head">
                      <b>🕘 Generaciones recientes</b>
                      <button
                        onClick={() => { if (confirm('¿Vaciar el historial del asistente?')) { setAiHistory([]); showToast('Historial del asistente vacío'); } }}
                      >✕ Vaciar</button>
                    </div>
                    <div className="ai-hist-list">
                      {aiHistory.map(h => (
                        <button
                          key={h.id}
                          className="ai-hitem"
                          disabled={isAiLoading}
                          onClick={() => { setAiPrompt(h.prompt); setAiMode(h.mode); setAiResponse(h.text); showToast('Generación restaurada'); }}
                        >
                          <span className="aih-ico">{modeMetaOf(h.mode).icon}</span>
                          <span className="aih-prompt">{h.prompt}</span>
                          <time>{haceMin(h.at)}</time>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* APARIENCIA */}
          {mod === 'apariencia' && (() => {
            const ratio = contrastRatio(readableTextOn(navyHex) === '#ffffff' ? navyHex : tint(navyHex,0.2), goldHex);
            const legNavy = contrastRatio(navyHex, readableTextOn(navyHex));          // contraste del texto sobre primario
            const legGold = contrastRatio(goldHex, readableTextOn(goldHex));          // contraste del texto sobre secundario
            const onNavy = readableTextOn(navyHex);
            const onGold = readableTextOn(goldHex);
            const grade = ratio >= 7
              ? { t: 'AAA · Excelente', c: '#059669', bg: '#d1fae5' }
              : ratio >= 4.5
                ? { t: 'AA · Buena', c: '#16a34a', bg: '#dcfce7' }
                : ratio >= 3
                  ? { t: 'Contraste aceptable', c: '#d97706', bg: '#fef3c7' }
                  : { t: 'Contraste bajo', c: '#dc2626', bg: '#fee2e2' };
            const navyDerived = derivePalette(navyHex);
            const goldDerived = derivePalette(goldHex);
            const mockBg = darkPreview ? shade(navyHex, 0.25) : navyHex;

            const applyAll = (n: string, g: string, bg?: string, card?: string) => {
              setNavyHex(n); setGoldHex(g);
              if (bg) setBgHex(bg); if (card) setCardHex(card);
              applyThemeColor(n, g, { bg, card });
            };

            const curLit = liturgicalColor(new Date());
            const autoMode = theme.mode === 'auto';

            /* Vista previa temporal de un color litúrgico: se persiste en el
               tema sincronizado para que TODOS los dispositivos la vean. */
            const applySeasonPreview = (key: LitColorKey) => {
              const s = LIT_COLORS[key];
              try { localStorage.setItem('pjl_lit_preview', key); } catch {}
              setLitPreview(key);
              setTheme({ ...theme, mode: 'auto', litPreview: key });
              window.dispatchEvent(new Event('pjl_theme_update'));
              showToast(`Vista previa: ${s.label} — ${s.feast} 🎨`);
            };
            const clearSeasonPreview = () => {
              try { localStorage.removeItem('pjl_lit_preview'); } catch {}
              setLitPreview(null);
              setTheme({ ...theme, mode: 'auto', litPreview: null });
              window.dispatchEvent(new Event('pjl_theme_update'));
              showToast('Tiempo litúrgico actual restaurado');
            };
            const toggleAutoMode = () => {
              clearSeasonPreview();
              if (autoMode) {
                setTheme({ navy: navyHex, gold: goldHex, mode: 'manual', litPreview: null });
              } else {
                const base = liturgicalColor(new Date()).color;
                setNavyHex(base.chrome);
                setGoldHex(base.gold);
                setTheme({ navy: base.chrome, gold: base.gold, mode: 'auto', litPreview: null });
              }
            };

            return (
            <div style={{ maxWidth: '1160px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '22px' }}>

              {/* HEADER + MEDIDOR DE CONTRASTE */}
              <div className="ap-header pop-in">
                <div>
                  <h3 className="serif" style={{ marginBottom: '6px' }}>🎨 Apariencia del Sitio</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>
                    Presets litúrgicos, colores, superficies, auto-contraste de letras y vista previa en vivo. Cada cambio se refleja al instante.
                  </p>
                </div>
                <div className="ap-contrast-badge" style={{ color: grade.c, background: grade.bg }} title={`Contraste de texto sobre primario: ${legNavy.toFixed(2)}:1 · sobre secundario: ${legGold.toFixed(2)}:1`}>
                  <span className="ap-contrast-ratio">{ratio.toFixed(1)}</span>
                  <span>{grade.t}</span>
                </div>
              </div>

              <div className="ap-grid">

                {/* PRESETS LITÚRGICOS + ARMÓNICAS + PALETAS GUARDADAS */}
                <div className="ap-card pop-in" style={{ animationDelay: '0.08s' }}>
                  <label className="premium-label" style={{ display: 'block', marginBottom: '14px' }}>PRESETS LITÚRGICOS</label>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, maxWidth: '440px' }}>
                      {autoMode ? (
                        <>⚙ <b>Modo automático</b> — el sitio usa el color del tiempo litúrgico. Hoy: <b>{curLit.color.label} · {curLit.name}</b>. Tocá un color para previsualizarlo.</>
                      ) : (
                        <>✋ <b>Modo manual</b> — los colores los elegís vos. El calendario litúrgico queda en pausa.</>
                      )}
                    </p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {autoMode && (
                        <button className="btn-premium btn-premium-outline" style={{ fontSize: '11px', padding: '7px 12px' }} onClick={clearSeasonPreview}>
                          {litPreview ? 'Aplicar tiempo actual' : 'Re-sincronizar con el calendario'}
                        </button>
                      )}
                      <button
                        className={`btn-premium ${autoMode ? 'btn-premium-outline' : 'btn-premium-gold'}`}
                        style={{ fontSize: '11px', padding: '7px 12px' }}
                        onClick={toggleAutoMode}
                      >
                        {autoMode ? 'Usar colores manuales' : '⚙ Automático por tiempo litúrgico'}
                      </button>
                    </div>
                  </div>
                  {autoMode ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                      {Object.values(LIT_COLORS).map((s, si) => {
                        const isCurrent = s.key === curLit.color.key && !litPreview;
                        const isPreviewed = litPreview === s.key;
                        return (
                          <button
                            key={s.key}
                            className={`liturgical-preset-btn ap-preset-btn pop-in${isCurrent || isPreviewed ? ' lit-active' : ''}`}
                            style={{ animationDelay: `${0.12 + si * 0.06}s` }}
                            onClick={() => applySeasonPreview(s.key)}
                            title={isCurrent ? `Hoy: ${curLit.name}` : `Vista previa: ${s.label} — ${s.feast}`}
                          >
                            {(isCurrent || isPreviewed) && <span className="ap-preset-badge">{isCurrent ? 'HOY' : 'VISTA'}</span>}
                            <span className="ap-preset-spheres" aria-hidden="true">
                              <i style={{ background: s.lit }} />
                              <i style={{ background: s.gold }} />
                            </span>
                            <span className="premium-label" style={{ fontSize: '10px' }}>{s.label}</span>
                            <span className="ap-preset-mini" style={{ background: `linear-gradient(135deg, ${s.chrome} 62%, ${s.gold} 62%)` }} aria-hidden="true" />
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
                    {[
                      { label: 'T. Ordinario',  gold: '#C8973A', navy: '#1A3B2B' },
                      { label: 'Cuaresma/Adv.', gold: '#C8973A', navy: '#3B1A3A' },
                      { label: 'Pascua/Nav.',   gold: '#D4AF37', navy: '#1A2744' },
                      { label: 'Mártires/Esp.', gold: '#C8973A', navy: '#441A1A' },
                    ].map((preset, pi) => (
                      <button
                        key={preset.label}
                        className="liturgical-preset-btn ap-preset-btn pop-in"
                        style={{ animationDelay: `${0.12 + pi * 0.06}s` }}
                        onClick={() => {
                          applyAll(preset.navy, preset.gold);
                          showToast(`Temporada: ${preset.label} aplicada ✔`);
                        }}
                      >
                        <span className="ap-preset-spheres" aria-hidden="true">
                          <i style={{ background: preset.navy }} />
                          <i style={{ background: preset.gold }} />
                        </span>
                        <span className="premium-label" style={{ fontSize: '10px' }}>{preset.label}</span>
                        <span className="ap-preset-mini" style={{ background: `linear-gradient(135deg, ${preset.navy} 62%, ${preset.gold} 62%)` }} aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                  )}

                  {/* ARMÓNICAS ALEATORIAS */}
                  <div style={{ borderTop: '1px solid var(--gold-pale)', marginTop: '18px', paddingTop: '16px' }}>
                    <div style={{ display: 'flex', verticalAlign: 'middle', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
                      <label className="premium-label" style={{ display: 'block' }}>COMBINACIONES ARMÓNICAS</label>
                      <button
                        className="btn-premium btn-premium-outline"
                        style={{ fontSize: '11px', padding: '6px 14px' }}
                        onClick={() => {
                          const base = GOLD_POOL[Math.floor(Math.random() * GOLD_POOL.length)];
                          const variant = saturate(base, (Math.random() * 0.6 + 0.2) * (Math.random() > 0.5 ? 1 : -1));
                          const darker = shade(variant, 0.35 + Math.random() * 0.35);
                          applyAll(darker, variant);
                          showToast('Combinación armónica generada 🎨');
                        }}
                      >🎨 Combinación armónica</button>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {goldDerived.map((c, i) => (
                        <button key={i} className="ap-shade-swatch" title={c} style={{ background: c }}
                          onClick={() => { applyAll(navyHex, c); if (navigator.clipboard) navigator.clipboard.writeText(c).then(() => showToast(`${c} copiado ✔`)); }} />
                      ))}
                      {navyDerived.map((c, i) => (
                        <button key={'n' + i} className="ap-shade-swatch" title={c} style={{ background: c }}
                          onClick={() => { applyAll(c, goldHex); if (navigator.clipboard) navigator.clipboard.writeText(c).then(() => showToast(`${c} copiado ✔`)); }} />
                      ))}
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '8px 0 0' }}>
                      Gama derivada de tu secundario (izquierda → derecha, oscuro a claro) y de tu primario. Click en un tono para probarlo.
                    </p>
                  </div>

                  {/* PALETAS GUARDADAS */}
                  <div style={{ borderTop: '1px solid var(--gold-pale)', marginTop: '22px', paddingTop: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', gap: '10px', flexWrap: 'wrap' }}>
                      <label className="premium-label" style={{ display: 'block' }}>PALETAS GUARDADAS (MÁX. 6)</label>
                      <button
                        className="btn-premium btn-premium-gold"
                        style={{ fontSize: '11px', padding: '6px 14px' }}
                        onClick={() => {
                          const entry = { navy: navyHex, gold: goldHex, bg: bgHex, card: cardHex };
                          const already = savedPalettes.some(p => p.navy === entry.navy && p.gold === entry.gold);
                          if (already) { showToast('Esta paleta ya fue guardada'); return; }
                          const updated = [entry, ...savedPalettes].slice(0, 6);
                          setSavedPalettes(updated);
                          localStorage.setItem('pjl_saved_palettes', JSON.stringify(updated));
                          showToast('Paleta guardada ✔');
                        }}
                      >+ Guardar actual</button>
                    </div>
                    {savedPalettes.length === 0 ? (
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No hay paletas guardadas todavía. Personalizá los colores y presioná «Guardar actual».</p>
                    ) : (
                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        {savedPalettes.map((p, i) => (
                          <div key={i} className="ap-saved-item pop-in" style={{ animationDelay: `${0.2 + i * 0.06}s` }}>
                            <button
                              title={`${p.navy} / ${p.gold}`}
                              className="ap-swatch-btn"
                              onClick={() => { applyAll(p.navy, p.gold, p.bg, p.card); showToast('Paleta aplicada ✔'); }}
                            >
                              <i style={{ background: p.navy }} />
                              <i style={{ background: p.gold }} />
                              {p.card && <i style={{ background: p.card, width: 14, height: 14 }} />}
                            </button>
                            <button
                              onClick={() => { const upd = savedPalettes.filter((_, idx) => idx !== i); setSavedPalettes(upd); localStorage.setItem('pjl_saved_palettes', JSON.stringify(upd)); }}
                              style={{ fontSize: '10px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                            >× Quitar</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* COLUMNA DERECHA: VISTA PREVIA + ACCIONES */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>

                  {/* VISTA PREVIA EN VIVO (con selector responsive + modo oscuro) */}
                  <div className="ap-card pop-in" style={{ animationDelay: '0.16s' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', gap: '10px', flexWrap: 'wrap' }}>
                      <label className="premium-label" style={{ display: 'block' }}>VISTA PREVIA EN VIVO</label>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                        {(['desktop', 'tablet', 'mobile'] as const).map(m => (
                          <button key={m} className={`ap-dev-btn ${previewMode === m ? 'active' : ''}`}
                            onClick={() => setPreviewMode(m)}
                            title={m === 'desktop' ? 'Escritorio' : m === 'tablet' ? 'Tablet' : 'Móvil'}>
                            {m === 'desktop' ? '🖥️' : m === 'tablet' ? '💻' : '📱'}
                          </button>
                        ))}
                        <button className={`ap-dev-btn ${darkPreview ? 'active' : ''}`} onClick={() => setDarkPreview(!darkPreview)} title="Alternar modo oscuro">🌙</button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', overflow: 'hidden' }}>
                      <div
                        className={`ap-mockup ap-mockup-${previewMode}`}
                        style={{
                          background: mockBg,
                          maxWidth: previewMode === 'mobile' ? 220 : previewMode === 'tablet' ? 380 : 'none',
                          width: previewMode === 'mobile' ? 220 : previewMode === 'tablet' ? 380 : '100%',
                        }}
                      >
                        <div className="ap-mockup-nav">
                          <span className="ap-mockup-logo" style={{ background: goldHex, color: onGold }}>✝</span>
                          <span className="ap-mockup-title" style={{ color: onNavy }}>PJL</span>
                          {previewMode !== 'mobile' && (
                            <span className="ap-mockup-links">
                              <i style={{ background: goldHex }} />
                              <i style={{ background: goldHex, opacity: 0.65 }} />
                              <i style={{ background: goldHex, opacity: 0.35 }} />
                            </span>
                          )}
                        </div>
                        <div className="ap-mockup-body" style={{ background: bgHex }}>
                          <div className="ap-mockup-hero">
                            <span className="ap-mockup-line" style={{ width: '68%', background: readableTextOn(bgHex), opacity: 0.92 }} />
                            <span className="ap-mockup-line" style={{ width: '46%', background: goldHex }} />
                            <span className="ap-mockup-line thin" style={{ width: '82%', background: readableTextOn(bgHex), opacity: 0.28 }} />
                            <span className="ap-mockup-btn" style={{ background: goldHex, color: onGold }}>Explorar</span>
                            <span className="ap-mockup-btn ghost" style={{ borderColor: goldHex, color: readableTextOn(bgHex) }}>Leer más</span>
                          </div>
                          <div className="ap-mockup-cards">
                            {[0, 1].map(i => (
                              <div key={i} className="ap-mockup-card" style={{ background: cardHex, borderColor: tint(goldHex, 0.6) }}>
                                <span className="ap-mockup-card-top" style={{ background: goldHex }} />
                                <span className="ap-mockup-card-line" style={{ background: readableTextOn(cardHex), opacity: 0.8 }} />
                                <span className="ap-mockup-card-line thin" style={{ background: readableTextOn(cardHex), opacity: 0.4 }} />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* TICKS DE LEGIBILIDAD */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '16px' }}>
                      <div className="ap-leg-box" style={{ background: navyHex, color: onNavy }}>
                        <span className="ap-leg-label">Texto sobre primario</span>
                        <span className="ap-leg-sample">Aa Bb 123 · {legNavy.toFixed(1)}:1</span>
                      </div>
                      <div className="ap-leg-box" style={{ background: goldHex, color: onGold }}>
                        <span className="ap-leg-label">Texto sobre secundario</span>
                        <span className="ap-leg-sample">Aa Bb 123 · {legGold.toFixed(1)}:1</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', marginTop: '14px', flexWrap: 'wrap' }}>
                      <button className="ap-hex-chip" onClick={() => { if (navigator.clipboard) navigator.clipboard.writeText(navyHex).then(() => showToast('Hex copiado ✔')); }} title="Click para copiar">
                        <i style={{ background: navyHex }} /> {navyHex.toUpperCase()}
                      </button>
                      <button className="ap-hex-chip" onClick={() => { if (navigator.clipboard) navigator.clipboard.writeText(goldHex).then(() => showToast('Hex copiado ✔')); }} title="Click para copiar">
                        <i style={{ background: goldHex }} /> {goldHex.toUpperCase()}
                      </button>
                      <button className="ap-hex-chip" onClick={() => { if (navigator.clipboard) navigator.clipboard.writeText(bgHex).then(() => showToast('Hex copiado ✔')); }} title="Click para copiar">
                        <i style={{ background: bgHex }} /> {bgHex.toUpperCase()}
                      </button>
                    </div>
                  </div>

                  {/* ACCIONES RÁPIDAS */}
                  <div className="ap-card pop-in" style={{ animationDelay: '0.24s' }}>
                    <label className="premium-label" style={{ display: 'block', marginBottom: '14px' }}>ACCIONES RÁPIDAS</label>
                    <div style={{ display: 'grid', gap: '10px' }}>
                      <button
                        className="btn-premium btn-premium-gold quick-action-btn"
                        onClick={() => {
                          const n = NAVY_POOL[Math.floor(Math.random() * NAVY_POOL.length)];
                          const g = GOLD_POOL[Math.floor(Math.random() * GOLD_POOL.length)];
                          applyAll(n, g);
                          showToast('Paleta aleatoria generada 🎲');
                        }}
                      ><span className="quick-action-icon">🎲</span> Sorpréndeme: paleta aleatoria <span className="quick-action-arrow">→</span></button>
                      <button
                        className="btn-premium btn-premium-outline quick-action-btn"
                        onClick={() => {
                          const def = { gold: '#C8973A', navy: '#1A2744' };
                          applyAll(def.navy, def.gold);
                          showToast('Colores restaurados al original ✔');
                        }}
                      ><span className="quick-action-icon">↺</span> Restaurar originales <span className="quick-action-arrow">→</span></button>
                      <button
                        className="btn-premium btn-premium-outline quick-action-btn"
                        onClick={() => {
                          const data = JSON.stringify({ navy: navyHex, gold: goldHex, bg: bgHex, card: cardHex }, null, 2);
                          try {
                            navigator.clipboard.writeText('PJL_PALETTE__' + btoa(unescape(encodeURIComponent(data)))).then(() =>
                              showToast('Paleta copiada al portapapeles 📋'));
                          } catch { showToast('No se pudo copiar la paleta'); }
                        }}
                      ><span className="quick-action-icon">📋</span> Exportar paleta (JSON) <span className="quick-action-arrow">→</span></button>
                      <label className="btn-premium btn-premium-outline quick-action-btn" style={{ cursor: 'pointer', textAlign: 'left' }}>
                        <span className="quick-action-icon">📥</span> Importar paleta <span className="quick-action-arrow">→</span>
                        <input
                          type="file"
                          style={{ display: 'none' }}
                          accept="application/json,.txt"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            const text = await f.text();
                            try {
                              let raw = text.trim();
                              if (raw.startsWith('PJL_PALETTE__')) raw = decodeURIComponent(escape(atob(raw.slice('PJL_PALETTE__'.length))));
                              const parsed = JSON.parse(raw);
                              const n = isHex6(parsed.navy) ? parsed.navy : navyHex;
                              const g = isHex6(parsed.gold) ? parsed.gold : goldHex;
                              const bg = isHex6(parsed.bg) ? parsed.bg : bgHex;
                              const card = isHex6(parsed.card) ? parsed.card : cardHex;
                              applyAll(n, g, bg, card);
                              showToast('Paleta importada ✔');
                            } catch { showToast('Formato de paleta no válido'); }
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* PERSONALIZACIÓN MANUAL */}
              <h4 className="serif" style={{ fontSize: '1.25rem', margin: '6px 0 4px' }}>
                Personalización Manual
                {autoMode && <span style={{ marginLeft: '10px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', padding: '4px 10px', borderRadius: '999px', background: 'var(--gold-pale)', color: 'var(--navy)' }}>en pausa · se aplica en modo manual</span>}
              </h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '12.5px', marginBottom: '18px' }}>Ajustá cada color con el selector, el código hex o la intensidad. Las letras se eligen solas (blanco u oscuro) según lo que mejor se lea sobre cada color.</p>
              <div className="ap-grid">

                {/* NAVY */}
                <div className="form-group ap-color-card pop-in" style={{ animationDelay: '0.3s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '8px', flexWrap: 'wrap' }}>
                    <label className="premium-label" style={{ display: 'block' }}>🎨 Color Primario (Fondo, Footer, Encabezados)</label>
                    <span className="ap-leg-chip" style={{ color: onNavy, background: navyHex }}>Aa · {legNavy.toFixed(1)}:1</span>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <input
                      type="color"
                      value={navyHex}
                      onChange={e => {
                        setNavyHex(e.target.value);
                        applyThemeColor(e.target.value, goldHex);
                      }}
                      style={{ width: '56px', height: '56px', cursor: 'pointer', border: '2px solid var(--gold-pale)', borderRadius: '10px', padding: '2px' }}
                    />
                    <div style={{ flex: 1 }}>
                      <input
                        type="text"
                        className="pjl-input"
                        value={navyHex}
                        maxLength={7}
                        onChange={e => {
                          const v = e.target.value;
                          setNavyHex(v);
                          if (isHex6(v)) { applyThemeColor(v, goldHex); }
                        }}
                        placeholder="#1A2744"
                        style={{ fontFamily: 'monospace', letterSpacing: '1px' }}
                      />
                      <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {['#1A2744', '#1A3B2B', '#3B1A3A', '#441A1A', '#0F1F3D', '#2C3E50'].map(c => (
                          <button key={c} className="ap-mini-swatch" onClick={() => { setNavyHex(c); applyThemeColor(c, goldHex); if (navigator.clipboard) navigator.clipboard.writeText(c).then(() => showToast(`${c.toUpperCase()} copiado ✔`)); }}
                            style={{ width: '22px', height: '22px', borderRadius: '4px', background: c, border: navyHex === c ? '2px solid var(--gold)' : '1px solid #ccc', cursor: 'pointer' }} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* GOLD */}
                <div className="form-group ap-color-card pop-in" style={{ animationDelay: '0.38s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '8px', flexWrap: 'wrap' }}>
                    <label className="premium-label" style={{ display: 'block' }}>✨ Color Secundario (Bordes, Botones, Detalles)</label>
                    <span className="ap-leg-chip" style={{ color: onGold, background: goldHex }}>Aa · {legGold.toFixed(1)}:1</span>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <input
                      type="color"
                      value={goldHex}
                      onChange={e => {
                        setGoldHex(e.target.value);
                        applyThemeColor(navyHex, e.target.value);
                      }}
                      style={{ width: '56px', height: '56px', cursor: 'pointer', border: '2px solid var(--gold-pale)', borderRadius: '10px', padding: '2px' }}
                    />
                    <div style={{ flex: 1 }}>
                      <input
                        type="text"
                        className="pjl-input"
                        value={goldHex}
                        maxLength={7}
                        onChange={e => {
                          const v = e.target.value;
                          setGoldHex(v);
                          if (isHex6(v)) { applyThemeColor(navyHex, v); }
                        }}
                        placeholder="#C8973A"
                        style={{ fontFamily: 'monospace', letterSpacing: '1px' }}
                      />
                      <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {['#C8973A', '#D4AF37', '#B8860B', '#DAA520', '#E6BE6A', '#A0783A'].map(c => (
                          <button key={c} className="ap-mini-swatch" onClick={() => { setGoldHex(c); applyThemeColor(navyHex, c); if (navigator.clipboard) navigator.clipboard.writeText(c).then(() => showToast(`${c.toUpperCase()} copiado ✔`)); }}
                            style={{ width: '22px', height: '22px', borderRadius: '4px', background: c, border: goldHex === c ? '2px solid var(--navy)' : '1px solid #ccc', cursor: 'pointer' }} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* FONDO NEUTRAL */}
                <div className="form-group ap-color-card pop-in" style={{ animationDelay: '0.46s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '8px', flexWrap: 'wrap' }}>
                    <label className="premium-label" style={{ display: 'block' }}>🧱 Color de Fondo (secciones neutras)</label>
                    <span className="ap-leg-chip" style={{ color: readableTextOn(bgHex), background: bgHex }}>Aa · {contrastRatio(bgHex, readableTextOn(bgHex)).toFixed(1)}:1</span>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <input
                      type="color"
                      value={bgHex}
                      onChange={e => { setBgHex(e.target.value); applyThemeColor(navyHex, goldHex, { bg: e.target.value, card: cardHex }); }}
                      style={{ width: '56px', height: '56px', cursor: 'pointer', border: '2px solid var(--gold-pale)', borderRadius: '10px', padding: '2px' }}
                    />
                    <div style={{ flex: 1 }}>
                      <input type="text" className="pjl-input" value={bgHex} maxLength={7}
                        onChange={e => { const v = e.target.value; setBgHex(v); if (isHex6(v)) applyThemeColor(navyHex, goldHex, { bg: v, card: cardHex }); }}
                        style={{ fontFamily: 'monospace', letterSpacing: '1px' }} />
                      <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {['#F7F0E3', '#FDFAF5', '#EEF2F7', '#F3F6EE', '#FAF3EA'].map(c => (
                          <button key={c} className="ap-mini-swatch" title={c} onClick={() => { setBgHex(c); applyThemeColor(navyHex, goldHex, { bg: c, card: cardHex }); }}
                            style={{ width: '22px', height: '22px', borderRadius: '4px', background: c, border: bgHex === c ? '2px solid var(--gold)' : '1px solid #ccc', cursor: 'pointer' }} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* SUPERFICIE DE TARJETAS */}
                <div className="form-group ap-color-card pop-in" style={{ animationDelay: '0.54s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '8px', flexWrap: 'wrap' }}>
                    <label className="premium-label" style={{ display: 'block' }}>📄 Superficie de Tarjetas</label>
                    <span className="ap-leg-chip" style={{ color: readableTextOn(cardHex), background: cardHex }}>Aa · {contrastRatio(cardHex, readableTextOn(cardHex)).toFixed(1)}:1</span>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <input
                      type="color"
                      value={cardHex}
                      onChange={e => { setCardHex(e.target.value); applyThemeColor(navyHex, goldHex, { bg: bgHex, card: e.target.value }); }}
                      style={{ width: '56px', height: '56px', cursor: 'pointer', border: '2px solid var(--gold-pale)', borderRadius: '10px', padding: '2px' }}
                    />
                    <div style={{ flex: 1 }}>
                      <input type="text" className="pjl-input" value={cardHex} maxLength={7}
                        onChange={e => { const v = e.target.value; setCardHex(v); if (isHex6(v)) applyThemeColor(navyHex, goldHex, { bg: bgHex, card: v }); }}
                        style={{ fontFamily: 'monospace', letterSpacing: '1px' }} />
                      <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {['#FFFFFF', '#FBF7EF', '#F1F4F9', '#F4F6EF', '#FFF9F0'].map(c => (
                          <button key={c} className="ap-mini-swatch" title={c} onClick={() => { setCardHex(c); applyThemeColor(navyHex, goldHex, { bg: bgHex, card: c }); }}
                            style={{ width: '22px', height: '22px', borderRadius: '4px', background: c, border: cardHex === c ? '2px solid var(--gold)' : '1px solid #ccc', cursor: 'pointer' }} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* PALETA DERIVADA (AUTOGENERADA) */}
              <div className="ap-card pop-in" style={{ animationDelay: '0.6s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '14px', flexWrap: 'wrap', marginBottom: '14px' }}>
                  <div>
                    <label className="premium-label" style={{ display: 'block', marginBottom: '6px' }}>🌈 PALETA DERIVADA AUTOMÁTICA</label>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, maxWidth: '620px' }}>
                      Los tonos de hover, bordes, marcos y sombras se calculan solos a partir de tus dos colores, así todo el sitio queda armónico sin configurar nada más.
                    </p>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
                  <div>
                    <span className="premium-label" style={{ fontSize: '10px' }}>PRIMARIO</span>
                    <div className="ap-deriv-row">
                      {navyDerived.map((c, i) => (
                        <div key={i} className="ap-deriv-cell" style={{ background: c }} title={`${c}`}>
                          <span style={{ color: readableTextOn(c) }}>{i === 3 ? navyHex.toUpperCase() : ''}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="premium-label" style={{ fontSize: '10px' }}>SECUNDARIO</span>
                    <div className="ap-deriv-row">
                      {goldDerived.map((c, i) => (
                        <div key={i} className="ap-deriv-cell" style={{ background: c }} title={`${c}`}>
                          <span style={{ color: readableTextOn(c) }}>{i === 3 ? goldHex.toUpperCase() : ''}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* ICONOS DEL PANEL */}
              <div className="ap-card pop-in" style={{ animationDelay: '0.68s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '14px', flexWrap: 'wrap', marginBottom: '18px' }}>
                  <div>
                    <label className="premium-label" style={{ display: 'block', marginBottom: '6px' }}>🧩 ICONOS DEL PANEL ADMIN</label>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, maxWidth: '640px' }}>
                      Cambiá el icono de cada botón del menú lateral sin afectar el frontend público.
                    </p>
                  </div>
                  <button
                    className="btn-premium btn-premium-outline"
                    style={{ padding: '8px 14px', fontSize: '11px' }}
                    onClick={() => {
                      setBranding({
                        ...branding,
                        adminIconDashboard: '📊',
                        adminIconIdentidad: '🎨',
                        adminIconCarrusel: '🖼️',
                        adminIconApariencia: '✨',
                        adminIconContenido: '📝',
                        adminIconNoticias: '📰',
                        adminIconActividades: '📅',
                        adminIconCapillas: '⛪',
                        adminIconPerfiles: '👤',
                        adminIconDocumentos: '📁',
                        adminIconUsuarios: '👥',
                        adminIconLogs: '📜',
                        adminIconConfiguracion: '⚙️',
                        adminIconAsistente: '🤖',
                      });
                      showToast('Iconos restaurados ✔');
                    }}
                  >
                    Restaurar iconos
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  {NAV_ITEMS.map((item, idx) => {
                    const currentIcon = (branding[item.iconKey as keyof Branding] as string) || item.defaultIcon;
                    return (
                      <div key={item.id} className="ap-icon-card pop-in" style={{ animationDelay: `${0.5 + idx * 0.035}s` }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
                          <div>
                            <p className="premium-label" style={{ marginBottom: '4px' }}>{item.label}</p>
                            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>Icono del menú</p>
                          </div>
                          <div className="ap-icon-preview">{currentIcon}</div>
                        </div>
                        <input
                          type="text"
                          className="pjl-input"
                          value={currentIcon}
                          maxLength={4}
                          onChange={(e) => setBranding({ ...branding, [item.iconKey]: e.target.value })}
                          placeholder={item.defaultIcon}
                          style={{ textAlign: 'center', fontSize: '20px', padding: '10px 12px', minHeight: '48px' }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            );
          })()}

          {/* IDENTIDAD */}
          {mod === 'identidad' && (() => {
            const syncOk = supabaseStatus?.ok === true;
            const syncState = syncOk ? 'ok' : supabaseStatus ? 'warn' : '';
            const syncText = syncOk
              ? 'Sincronizado · los cambios llegan a todos los dispositivos'
              : supabaseStatus
                ? 'Sin nube · los cambios quedan solo en este dispositivo'
                : 'Verificando sincronización…';
            const activosCount = [branding.mainLogo, branding.androidLogo, branding.whiteLogo, branding.favLogo, branding.zona1Logo, branding.zona2Logo, branding.zona3Logo, branding.zona4Logo].filter(Boolean).length;
            return (
            <div className="animate-reveal pjl-card identity-shell">

              {/* HEADER */}
              <div className="admin-section-header admin-stack-mobile" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px', marginBottom: '26px' }}>
                <div className="admin-section-title-group">
                  <h3 className="serif admin-section-title" style={{ margin: 0 }}>Identidad de Marca</h3>
                  <p className="admin-section-desc">Logos, colores y escudos oficiales de la Pastoral. Cada cambio se refleja automáticamente en el sitio público.</p>
                </div>
                <div className={`identity-sync-badge ${syncState}`}>
                  <span className="identity-sync-dot" />
                  <span>{syncText}</span>
                </div>
              </div>

              {/* HERO PREVIEW */}
              <div className="identity-hero-grid" style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: '16px', marginBottom: '28px' }}>
                <div className="identity-hero">
                  <div className="identity-hero-shine" />
                  <div className="identity-hero-tag">Vista de marca</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', position: 'relative' }}>
                    <div className="identity-hero-logo">
                      {branding.mainLogo ? <img src={branding.mainLogo} alt="Logo principal" /> : <span>⛪</span>}
                    </div>
                    <div>
                      <div className="serif" style={{ fontSize: '1.5rem', lineHeight: 1.1 }}>PJL Luqueña</div>
                      <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '6px' }}>Así se ve tu logo en el encabezado del sitio</div>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'grid', gap: '12px' }}>
                  <div className="identity-stat-box">
                    <span className="identity-stat-icon">🖼️</span>
                    <div>
                      <div className="identity-stat-label">ACTIVOS VISUALES</div>
                      <div className="identity-stat-value">{activosCount} <small>de 8</small></div>
                    </div>
                  </div>
                  <div className="identity-stat-box is-cream">
                    <span className="identity-stat-icon">💧</span>
                    <div>
                      <div className="identity-stat-label">MARCA DE AGUA</div>
                      <div className="identity-stat-value" style={{ fontSize: '15px' }}>{branding.logoWatermark ? 'Activa en el sitio' : 'Desactivada'}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* LOGOS PRINCIPALES */}
              <div className="identity-section-label"><span>Logos principales</span></div>
              <div className="identity-blocks">

                <div className="identity-logo-row identity-rise">
                  <div className="identity-logo-preview">
                    {branding.mainLogo ? <img src={branding.mainLogo} alt="Logo principal" /> : <span>⛪</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="premium-label" style={{ marginBottom: '4px' }}>LOGO PRINCIPAL DEL SITIO</p>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 12px' }}>Aparece en el menú de navegación, el pie de página y los documentos.</p>
                    <label className="btn-premium btn-premium-gold" style={{ padding: '9px 18px', fontSize: '11px' }}>
                      CAMBIAR LOGO
                      <input type="file" style={{ display: 'none' }} accept="image/*" onChange={(e) => handleFileUpload(e, (url) => { setBranding({...branding, mainLogo: url}); showToast('Logo principal actualizado ✔'); })} />
                    </label>
                  </div>
                </div>

                <div className="identity-logo-row identity-rise" style={{ animationDelay: '40ms', border: '1px solid var(--gold-pale)', borderRadius: '16px', background: 'linear-gradient(145deg, #fffdf8 0%, #fbf6ea 100%)' }}>
                  <div className="identity-logo-preview" style={{ background: 'var(--navy)', padding: '14px', borderRadius: '14px' }}>
                    {branding.androidLogo ? <img src={branding.androidLogo} alt="Logo app Android" style={{ objectFit: 'contain', maxWidth: '100%', maxHeight: '100%' }} /> : <span style={{ fontSize: '26px' }}>🤖</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="premium-label" style={{ marginBottom: '4px' }}>LOGO APP ANDROID (ÍCONO)</p>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 10px' }}>Ícono que se ve en la pantalla y en el teléfono cuando la app se instala. Si no lo subís, se usa el logo principal automáticamente.</p>
                    <label className="btn-premium btn-premium-gold" style={{ padding: '9px 18px', fontSize: '11px' }}>
                      SUBIR LOGO
                      <input type="file" style={{ display: 'none' }} accept="image/*" onChange={(e) => handleFileUpload(e, (url) => { setBranding({...branding, androidLogo: url}); showToast('Logo Android actualizado ✔'); })} />
                    </label>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '10px 0 0', lineHeight: 1.6 }}>
                      <strong style={{ color: 'var(--navy)' }}>Tamaño recomendado: 512×512 px (PNG).</strong><br />
                      Debe ser un <strong>cuadrado perfecto</strong> con fondo sólido (el navy del sitio o un color propio) y el símbolo ocupando el <strong>centro (66% del lienzo)</strong>, sin llegar al borde. Android recorta los íconos con máscara redondeada; si el símbolo toca el borde se verá cortado en el teléfono.
                    </p>
                  </div>
                </div>

                <div className="identity-toggle-row identity-rise" style={{ animationDelay: '70ms' }}>
                  <span className="identity-toggle-icon">💧</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 700, color: 'var(--navy)', margin: 0, fontSize: '13px' }}>Marca de Agua del Logo</p>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>Muestra el logo suave de fondo en todo el sitio</p>
                  </div>
                  <label className="pjl-switch">
                    <input type="checkbox" checked={!!branding.logoWatermark} onChange={(e) => setBranding({...branding, logoWatermark: e.target.checked})} />
                    <span className="pjl-slider"></span>
                  </label>
                </div>

                <div className="identity-duo-grid">
                  {[
                    { key: 'whiteLogo', label: 'LOGO BLANCO', desc: 'Para fondos oscuros', dark: true },
                    { key: 'favLogo', label: 'FAVICON / SELLO', desc: 'Icono de la pestaña', dark: false }
                  ].map((lg, i) => (
                    <div key={lg.key} className="identity-mini-card identity-rise" style={{ animationDelay: `${140 + i * 70}ms` }}>
                      <p className="premium-label" style={{ fontSize: '10px', marginBottom: '10px' }}>{lg.label}</p>
                      <div className="identity-mini-body">
                        <div className={`identity-mini-preview ${lg.dark ? 'is-dark' : ''}`}>
                          <SafeImg src={branding[lg.key] as string} alt={lg.label} fallback="🖼️" fallbackStyle={{ fontSize: '22px', background: 'transparent' }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 8px' }}>{lg.desc}</p>
                          <label className="btn-premium btn-premium-outline" style={{ padding: '7px 14px', fontSize: '10px' }}>
                            SUBIR
                            <input type="file" style={{ display: 'none' }} accept="image/*" onChange={(e) => handleFileUpload(e, (url) => { setBranding({...branding, [lg.key]: url}); showToast(`${lg.label} actualizado ✔`); })} />
                          </label>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ZONAS PASTORALES */}
              <div className="identity-section-label" style={{ marginTop: '30px' }}><span>Zonas pastorales</span></div>
              <div className="identity-zones-grid">
                {[1, 2, 3, 4].map((z, i) => {
                  const zColor = (branding[`zona${z}Color`] as string) || '#C8973A';
                  return (
                    <div key={z} className="identity-zone-card identity-rise" style={{ animationDelay: `${i * 80}ms` }}>
                      <div className="identity-zone-bar" style={{ background: zColor }} />
                      <div className="identity-zone-head">
                        <span className="identity-zone-name">Zona {z}</span>
                        <label className="identity-color-swatch" title="Elegir color de la zona" style={{ background: zColor }}>
                          <input
                            type="color"
                            value={zColor}
                            onChange={(e) => setBranding({...branding, [`zona${z}Color`]: e.target.value})}
                          />
                        </label>
                      </div>
                      <div className="identity-zone-body">
                        <div className="identity-zone-shield">
                          <SafeImg src={branding[`zona${z}Logo`] as string} alt={`Escudo Zona ${z}`} fallback="🛡️" fallbackStyle={{ fontSize: '26px', background: 'transparent' }} />
                        </div>
                        <label className="btn-premium btn-premium-outline identity-zone-upload">
                          SUBIR ESCUDO
                          <input type="file" style={{ display: 'none' }} accept="image/*" onChange={(e) => handleFileUpload(e, (url) => { setBranding({...branding, [`zona${z}Logo`]: url}); showToast(`Escudo Zona ${z} actualizado ✔`); })} />
                        </label>
                      </div>
                      <div className="identity-zone-hex">{zColor.toUpperCase()}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            );
          })()}


{mod === 'contenido' && (() => {
            const TABS: { id: string; icon: string; label: string; desc: string }[] = [
              { id: 'institucional', icon: '🏛️', label: 'INSTITUCIONAL', desc: 'Identidad, estructura y presencia territorial de la PJL.' },
              { id: 'nosotros', icon: '🙌', label: 'NOSOTROS', desc: 'Quiénes somos, contacto, horarios, áreas y cifras.' },
              { id: 'textos_inicio', icon: '🏠', label: 'TEXTOS DE INICIO', desc: 'Hero y encabezados de la página principal.' },
              { id: 'evangelio', icon: '✝️', label: 'EVANGELIO DEL DÍA', desc: 'Tarjeta diaria del Evangelio que ven los peregrinos.' },
              { id: 'mision_vision', icon: '🎯', label: 'MISIÓN / VISIÓN', desc: 'Norte y propósito que guían a la pastoral.' },
              { id: 'objetivos', icon: '📌', label: 'OBJETIVOS', desc: 'Meta general y líneas de acción.' },
              { id: 'historia', icon: '🕰️', label: 'HISTORIA', desc: 'Línea de tiempo con los hitos de la PJL.' },
            ];
            const cur = TABS.find(t => t.id === activeContentTab) || TABS[0];
            const moveTL = (i: number, dir: number) => {
              const arr = [...(content.historiaTimeline || [])];
              const j = i + dir;
              if (j < 0 || j >= arr.length) return;
              [arr[i], arr[j]] = [arr[j], arr[i]];
              setContent({ ...content, historiaTimeline: arr });
            };
            return (
              <div className="ctx-shell">
                <div className="ctx-head">
                  <span className="ctx-head-icon">🗂️</span>
                  <div>
                    <h3 className="serif">Gestión de Contenido</h3>
                    <p className="admin-section-desc">Todo el texto del sitio en un solo lugar, ordenado y con vista previa en vivo.</p>
                  </div>
                </div>

                <div className="ctx-tabs" role="tablist" aria-label="Secciones de contenido">
                  {TABS.map(tab => (
                    <button
                      key={tab.id}
                      role="tab"
                      aria-selected={activeContentTab === tab.id}
                      title={tab.desc}
                      className={`ctx-tab ${activeContentTab === tab.id ? 'is-active' : ''}`}
                      onClick={() => setActiveContentTab(tab.id)}
                    >
                      <span className="ctx-tab-ic">{tab.icon}</span>
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </div>

                <div className="ctx-body" style={{ minHeight: '380px' }}>
                  <div data-ctx key={activeContentTab}>
                    <div className="ctx-intro">
                      <span className="big">{cur.icon}</span>
                      <div>
                        <h4 className="serif">{cur.label}</h4>
                        <p>{cur.desc}</p>
                      </div>
                    </div>

                    {/* TAB: INSTITUCIONAL */}
                    {activeContentTab === 'institucional' && (
                      <div className="ctx-two">
                        <div style={{ display: 'grid', gap: '22px' }}>
                          <div className="ctx-card">
                            <div className="sec-head">
                              <span className="sec-ic">📍</span>
                              <div>
                                <h4 className="serif">Información institucional</h4>
                                <p>Texto principal y fotografía de la página Institucional.</p>
                              </div>
                            </div>
                            <div className="ctx-field">
                              <label className="ctx-label">TÍTULO INTRODUCTORIO</label>
                              <input className="pjl-input" value={content.instiTitulo || ''} onChange={e => setContent({ ...content, instiTitulo: e.target.value })} placeholder="Ej: Bienvenidos a la Pastoral" />
                            </div>
                            <div className="ctx-field">
                              <label className="ctx-label">SUBTÍTULO / RESUMEN</label>
                              <input className="pjl-input" value={content.instiSubtitle || ''} onChange={e => setContent({ ...content, instiSubtitle: e.target.value })} placeholder="Ej: Una red pastoral joven que hace de la fe una experiencia comunitaria" />
                            </div>
                            <div className="ctx-field">
                              <label className="ctx-label">TEXTO DETALLADO</label>
                              <textarea className="pjl-input" rows={5} value={content.instiDesc || ''} onChange={e => setContent({ ...content, instiDesc: e.target.value })} placeholder="Describe la estructura, misión y estilo institucional." />
                            </div>
                            <div className="ctx-field" style={{ marginBottom: 0 }}>
                              <label className="ctx-label">TEXTO ALT DE LA IMAGEN</label>
                              <input className="pjl-input" value={content.instiAltText || ''} onChange={e => setContent({ ...content, instiAltText: e.target.value })} placeholder="Texto alternativo de la foto" />
                            </div>
                          </div>

                          <div className="ctx-card">
                            <div className="sec-head">
                              <span className="sec-ic">✨</span>
                              <div style={{ flex: 1 }}>
                                <h4 className="serif">Pulí la sección</h4>
                                <p>Textos sugeridos y tarjetas de apoyo para que la zona luzca editorial.</p>
                              </div>
                              <button
                                className="btn-ghost"
                                onClick={() => {
                                  setContent({
                                    ...content,
                                    instiSubtitle: content.instiSubtitle || 'Una red pastoral joven que hace de la fe una experiencia comunitaria',
                                    instiDesc: content.instiDesc || 'Nuestra estructura combina liderazgo, acompañamiento espiritual y presencia territorial para impulsar a los jóvenes de Luque a vivir la fe con alegría y compromiso.',
                                    instiCards: [
                                      { title: 'Liderazgo Compartido', text: 'Coordinadores, equipos zonales y comunidades trabajan juntos para construir una pastoral fuerte y cercana.', icon: '🤝' },
                                      { title: 'Presencia Territorial', text: 'Cuatro zonas pastorales con identidad propia, unidas por el servicio, la formación y la misión juvenil.', icon: '📍' },
                                      { title: 'Firma Pastoral', text: 'Tradición, acompañamiento y alegría en cada acción pastoral que transforma la realidad de Luque.', icon: '🌟' },
                                    ],
                                  });
                                  showToast('Texto sugerido aplicado ✔');
                                }}
                              >✨ Sugerir texto</button>
                            </div>
                            <div className="ctx-row3">
                              {(content.instiCards || []).slice(0, 3).map((card, idx) => (
                                <div key={idx} className="row-card" style={{ gridTemplateColumns: '1fr' }}>
                                  <div className="ico" style={{ fontSize: '20px', textAlign: 'center', marginBottom: '6px' }}>{card.icon || '✨'}</div>
                                  <strong style={{ color: 'var(--navy)', fontSize: '13px' }}>{card.title || `Idea ${idx + 1}`}</strong>
                                  <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>{card.text || 'Texto adicional para enfatizar la ventaja de la estructura.'}</p>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="ctx-card">
                            <div className="sec-head">
                              <span className="sec-ic">🔧</span>
                              <div>
                                <h4 className="serif">Tarjetas de apoyo</h4>
                                <p>Se muestran como tarjetas en la página Institucional.</p>
                              </div>
                            </div>
                            <div className="ctx-list">
                              {(content.instiCards || []).map((card, idx) => (
                                <div key={idx} className="row-card">
                                  <input
                                    className="pjl-input icon-input"
                                    value={card.icon || ''}
                                    onChange={e => {
                                      const cards = [...(content.instiCards || [])];
                                      cards[idx] = { ...cards[idx], icon: e.target.value };
                                      setContent({ ...content, instiCards: cards });
                                    }}
                                    placeholder="✨"
                                    title="Icono emoji"
                                  />
                                  <div className="grow">
                                    <input
                                      className="pjl-input"
                                      value={card.title || ''}
                                      onChange={e => {
                                        const cards = [...(content.instiCards || [])];
                                        cards[idx] = { ...cards[idx], title: e.target.value };
                                        setContent({ ...content, instiCards: cards });
                                      }}
                                      placeholder="Título de la tarjeta"
                                    />
                                    <textarea
                                      className="pjl-input"
                                      rows={2}
                                      value={card.text || ''}
                                      onChange={e => {
                                        const cards = [...(content.instiCards || [])];
                                        cards[idx] = { ...cards[idx], text: e.target.value };
                                        setContent({ ...content, instiCards: cards });
                                      }}
                                      placeholder="Texto breve de apoyo"
                                    />
                                  </div>
                                  <div className="row-actions">
                                    <button className="mini-btn danger" title="Quitar tarjeta" onClick={() => setContent({ ...content, instiCards: (content.instiCards || []).filter((_, i) => i !== idx) })}>✕</button>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <button
                              className="btn-add"
                              onClick={() => setContent({ ...content, instiCards: [...(content.instiCards || []), { title: '', text: '', icon: '✨' }] })}
                            >+ Agregar tarjeta</button>
                          </div>

                          <div className="ctx-card">
                            <div className="sec-head">
                              <span className="sec-ic">📷</span>
                              <div>
                                <h4 className="serif">Imagen institucional</h4>
                                <p>Foto decorativa que acompaña a la página Institucional.</p>
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                              <div className="thumb-box" style={{ width: 150, height: 96 }}>
                                {content.instiFoto ? <img src={content.instiFoto} alt="" /> : <span className="ph">🖼️</span>}
                              </div>
                              <div className="row-actions">
                                {content.instiFoto ? (
                                  <>
                                    <label className="btn-ghost" style={{ cursor: 'pointer' }}>
                                      🔁 Cambiar
                                      <input type="file" style={{ display: 'none' }} accept="image/*" onChange={(e) => handleFileUpload(e, (url) => { setContent({ ...content, instiFoto: url }); showToast('Imagen institucional actualizada ✔'); })} />
                                    </label>
                                    <button className="btn-ghost danger" style={{ color: '#b91c1c' }} onClick={() => setContent({ ...content, instiFoto: '' })}>✖ Quitar</button>
                                  </>
                                ) : (
                                  <label className="btn-ghost" style={{ background: 'var(--gold)', color: 'var(--navy)', cursor: 'pointer', border: 'none' }}>
                                    📷 Subir imagen
                                    <input type="file" style={{ display: 'none' }} accept="image/*" onChange={(e) => handleFileUpload(e, (url) => { setContent({ ...content, instiFoto: url }); showToast('Imagen institucional añadida ✔'); })} />
                                  </label>
                                )}
                              </div>
                            </div>
                            <p className="ctx-hint" style={{ marginTop: '10px' }}>Se muestra como foto decorativa en la página Institucional.</p>
                          </div>
                        </div>

                        <div className="ctx-preview">
                          <div className="pv-banner" style={{ background: content.instiFoto ? `url(${content.instiFoto}) center/cover no-repeat` : 'linear-gradient(135deg, var(--navy), var(--navy-mid))' }}>
                            {!content.instiFoto && <span className="pv-banner-ico">🏛️</span>}
                          </div>
                          <div className="pv-body">
                            <span className="pv-kicker">{content.instiSubtitle || 'Subtítulo institucional'}</span>
                            <h3 className="serif pv-title" style={{ fontSize: '1.9rem' }}>{content.instiTitulo || 'Nuestra Identidad'}</h3>
                            <p className="pv-text">{content.instiDesc || 'Texto descriptivo sobre la estructura institucional y la presencia pastoral.'}</p>
                            <div className="pv-grid2">
                              {(content.instiCards || []).slice(0, 2).map((card, idx) => (
                                <div key={idx} className="pv-mini">
                                  <span className="ico">{card.icon || '✨'}</span>
                                  <b>{card.title || `Tarjeta ${idx + 1}`}</b>
                                  <p>{card.text || 'Detalle breve de la estructura.'}</p>
                                </div>
                              ))}
                            </div>
                            <p className="pv-app">👁️ <strong>Vista previa en vivo</strong>: así se verá la sección con estilo editorial.</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TAB: NOSOTROS */}
                    {activeContentTab === 'nosotros' && (
                      <div style={{ display: 'grid', gap: '22px' }}>
                        <div className="ctx-card">
                          <div className="sec-head">
                            <span className="sec-ic">🙌</span>
                            <div>
                              <h4 className="serif">Sección «Nosotros»</h4>
                              <p>Textos que se muestran en Institucional, Nuestra Historia y Estatuto.</p>
                            </div>
                          </div>
                          <div className="ctx-field">
                            <label className="ctx-label">INTRODUCCIÓN (QUIÉNES SOMOS)</label>
                            <textarea className="pjl-input" rows={3} value={content.nosotrosIntro || ''} onChange={e => setContent({ ...content, nosotrosIntro: e.target.value })} placeholder="Resumen breve de la pastoral..." />
                          </div>
                          <div className="ctx-field">
                            <label className="ctx-label">LEMA / FRASE</label>
                            <input className="pjl-input" value={content.nosotrosLema || ''} onChange={e => setContent({ ...content, nosotrosLema: e.target.value })} placeholder="«Avivando la llama de Cristo en tu corazón»" />
                          </div>
                          <div className="ctx-field">
                            <label className="ctx-label">HISTORIA AMPLIADA</label>
                            <textarea className="pjl-input" rows={5} value={content.nosotrosHistoria || ''} onChange={e => setContent({ ...content, nosotrosHistoria: e.target.value })} placeholder="Narra el origen y crecimiento de la PJL..." />
                          </div>
                          <div className="ctx-row2">
                            <div className="ctx-field" style={{ marginBottom: 0 }}>
                              <label className="ctx-label">DECANATO</label>
                              <input className="pjl-input" value={content.decanato || ''} onChange={e => setContent({ ...content, decanato: e.target.value })} />
                            </div>
                            <div className="ctx-field" style={{ marginBottom: 0 }}>
                              <label className="ctx-label">PARROQUIA</label>
                              <input className="pjl-input" value={content.parroquia || ''} onChange={e => setContent({ ...content, parroquia: e.target.value })} />
                            </div>
                          </div>
                        </div>

                        <div className="ctx-card">
                          <div className="sec-head">
                            <span className="sec-ic">📞</span>
                            <div>
                              <h4 className="serif">Contacto y ubicación</h4>
                              <p>Datos visibles para los peregrinos.</p>
                            </div>
                          </div>
                          <div className="ctx-row2">
                            <div className="ctx-field" style={{ marginBottom: 0 }}>
                              <label className="ctx-label">SEDE</label>
                              <input className="pjl-input" value={content.contactoSede || ''} onChange={e => setContent({ ...content, contactoSede: e.target.value })} placeholder="Ej: Parroquia..." />
                            </div>
                            <div className="ctx-field" style={{ marginBottom: 0 }}>
                              <label className="ctx-label">DIRECCIÓN</label>
                              <input className="pjl-input" value={content.contactoDireccion || ''} onChange={e => setContent({ ...content, contactoDireccion: e.target.value })} />
                            </div>
                            <div className="ctx-field" style={{ marginBottom: 0 }}>
                              <label className="ctx-label">TELÉFONO</label>
                              <input className="pjl-input" value={content.contactoTel || ''} onChange={e => setContent({ ...content, contactoTel: e.target.value })} />
                            </div>
                            <div className="ctx-field" style={{ marginBottom: 0 }}>
                              <label className="ctx-label">EMAIL</label>
                              <input className="pjl-input" value={content.contactEmail || ''} onChange={e => setContent({ ...content, contactEmail: e.target.value })} />
                            </div>
                            <div className="ctx-field" style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
                              <label className="ctx-label">SITIO WEB</label>
                              <input className="pjl-input" value={content.contactoWeb || ''} onChange={e => setContent({ ...content, contactoWeb: e.target.value })} />
                            </div>
                          </div>
                        </div>

                        <div className="ctx-card">
                          <div className="sec-head">
                            <span className="sec-ic">🕐</span>
                            <div>
                              <h4 className="serif">Horarios</h4>
                              <p>Encuentros, formación y misas.</p>
                            </div>
                          </div>
                          <div className="ctx-row3">
                            <div className="ctx-field" style={{ marginBottom: 0 }}>
                              <label className="ctx-label">ENCUENTROS</label>
                              <input className="pjl-input" value={content.horariosEncuentro || ''} onChange={e => setContent({ ...content, horariosEncuentro: e.target.value })} placeholder="Ej: Sábados 15:00 hs" />
                            </div>
                            <div className="ctx-field" style={{ marginBottom: 0 }}>
                              <label className="ctx-label">FORMACIÓN</label>
                              <input className="pjl-input" value={content.horariosFormacion || ''} onChange={e => setContent({ ...content, horariosFormacion: e.target.value })} />
                            </div>
                            <div className="ctx-field" style={{ marginBottom: 0 }}>
                              <label className="ctx-label">MISAS</label>
                              <input className="pjl-input" value={content.horariosMisaLocal || ''} onChange={e => setContent({ ...content, horariosMisaLocal: e.target.value })} />
                            </div>
                          </div>
                        </div>

                        <div className="ctx-card">
                          <div className="sec-head">
                            <span className="sec-ic">🤝</span>
                            <div>
                              <h4 className="serif">Áreas de trabajo / Servicios</h4>
                              <p>Se muestran como tarjetas en la página Institucional.</p>
                            </div>
                          </div>
                          <div className="ctx-list">
                            {(content.servicios || []).map((sv, idx) => (
                              <div key={sv.id} className="row-card">
                                <input className="pjl-input icon-input" value={sv.icon || ''} onChange={e => { const arr = [...(content.servicios || [])]; arr[idx] = { ...arr[idx], icon: e.target.value }; setContent({ ...content, servicios: arr }); }} placeholder="✨" title="Icono emoji" />
                                <div className="grow">
                                  <input className="pjl-input" value={sv.title || ''} onChange={e => { const arr = [...(content.servicios || [])]; arr[idx] = { ...arr[idx], title: e.target.value }; setContent({ ...content, servicios: arr }); }} placeholder="Título del área" />
                                  <input className="pjl-input" value={sv.desc || ''} onChange={e => { const arr = [...(content.servicios || [])]; arr[idx] = { ...arr[idx], desc: e.target.value }; setContent({ ...content, servicios: arr }); }} placeholder="Descripción breve" />
                                </div>
                                <div className="row-actions">
                                  <button className="mini-btn danger" title="Quitar área" onClick={() => setContent({ ...content, servicios: (content.servicios || []).filter(a => a.id !== sv.id) })}>✕</button>
                                </div>
                              </div>
                            ))}
                          </div>
                          <button
                            className="btn-add"
                            onClick={() => setContent({ ...content, servicios: [...(content.servicios || []), { id: 's' + Date.now(), title: '', desc: '', icon: '✨' }] })}
                          >+ Agregar área</button>
                        </div>

                        <div className="ctx-card">
                          <div className="sec-head">
                            <span className="sec-ic">🏆</span>
                            <div>
                              <h4 className="serif">Cifras y logros clave</h4>
                              <p>Contadores animados en Institucional e Historia.</p>
                            </div>
                          </div>
                          <div className="ctx-list">
                            {(content.logros || []).map((lg, idx) => (
                              <div key={lg.id} className="row-card">
                                <input className="pjl-input icon-input" value={lg.icon || ''} onChange={e => { const arr = [...(content.logros || [])]; arr[idx] = { ...arr[idx], icon: e.target.value }; setContent({ ...content, logros: arr }); }} placeholder="✨" title="Icono emoji" />
                                <div className="grow" style={{ gridTemplateColumns: '120px 1fr', display: 'grid' }}>
                                  <input className="pjl-input" value={lg.valor || ''} onChange={e => { const arr = [...(content.logros || [])]; arr[idx] = { ...arr[idx], valor: e.target.value }; setContent({ ...content, logros: arr }); }} placeholder="Ej: 20" />
                                  <input className="pjl-input" value={lg.label || ''} onChange={e => { const arr = [...(content.logros || [])]; arr[idx] = { ...arr[idx], label: e.target.value }; setContent({ ...content, logros: arr }); }} placeholder="Ej: Años de fe" />
                                </div>
                                <div className="row-actions">
                                  <button className="mini-btn danger" title="Quitar cifra" onClick={() => setContent({ ...content, logros: (content.logros || []).filter(a => a.id !== lg.id) })}>✕</button>
                                </div>
                              </div>
                            ))}
                          </div>
                          <button
                            className="btn-add"
                            onClick={() => setContent({ ...content, logros: [...(content.logros || []), { id: 'l' + Date.now(), valor: '', label: '', icon: '✨' }] })}
                          >+ Agregar cifra</button>
                        </div>
                      </div>
                    )}

                    {/* TAB: TEXTOS DE INICIO */}
                    {activeContentTab === 'textos_inicio' && (
                      <div style={{ display: 'grid', gap: '22px' }}>
                        <div className="ctx-card">
                          <div className="sec-head">
                            <span className="sec-ic">🌟</span>
                            <div>
                              <h4 className="serif">Banner principal (Hero)</h4>
                              <p>La primera impresión que reciben los peregrinos.</p>
                            </div>
                          </div>
                          <div className="ctx-field">
                            <label className="ctx-label"><span className="chip">🏷️</span> ETIQUETA SUPERIOR</label>
                            <input className="pjl-input" value={content.heroTag || ''} onChange={e => setContent({ ...content, heroTag: e.target.value })} placeholder="Ej: Diócesis de San Lorenzo" />
                          </div>
                          <div className="ctx-field">
                            <label className="ctx-label"><span className="chip">✍️</span> TÍTULO PRINCIPAL (SOPORTA HTML)</label>
                            <input className="pjl-input" value={content.heroTitle || ''} onChange={e => setContent({ ...content, heroTitle: e.target.value })} />
                            {content.heroTitle && (
                              <div style={{ marginTop: '12px', padding: '18px 20px', background: 'linear-gradient(135deg, var(--navy), var(--navy-mid))', borderRadius: '16px', border: '1px solid rgba(200,151,58,.5)', boxShadow: '0 14px 30px rgba(26,39,68,.25)' }}>
                                <p style={{ fontSize: '10px', color: 'var(--gold)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Previsualización del título:</p>
                                <h1 className="serif" style={{ color: '#fff', fontSize: '1.7rem', margin: 0 }} dangerouslySetInnerHTML={{ __html: content.heroTitle }} />
                              </div>
                            )}
                          </div>
                          <div className="ctx-field" style={{ marginBottom: 0 }}>
                            <label className="ctx-label"><span className="chip">📄</span> TEXTO DESCRIPTIVO BREVE</label>
                            <textarea className="pjl-input" rows={3} value={content.heroText || ''} onChange={e => setContent({ ...content, heroText: e.target.value })} />
                          </div>
                        </div>

                        <div className="ctx-card">
                          <div className="sec-head">
                            <span className="sec-ic">🗂️</span>
                            <div>
                              <h4 className="serif">Encabezados de secciones</h4>
                              <p>Etiqueta y título de cada bloque de la página principal.</p>
                            </div>
                          </div>
                          <div className="ctx-row2">
                            {[
                              { id: 'equipos', label: 'ESTRUCTURA', tag: 'equiposTag', title: 'equiposTitle' },
                              { id: 'zonas', label: 'ZONAS', tag: 'zonasTag', title: 'zonasTitle' },
                              { id: 'news', label: 'NOTICIAS', tag: 'newsTag', title: 'newsTitle' },
                              { id: 'agenda', label: 'EVENTOS', tag: 'agendaTag', title: 'agendaTitle' },
                            ].map(sec => (
                              <div key={sec.id} className="ctx-card" style={{ padding: '18px', background: '#fdfbf6' }}>
                                <p className="ctx-label" style={{ color: 'var(--gold)' }}>{sec.label}</p>
                                <div className="ctx-field" style={{ marginBottom: '12px' }}>
                                  <label className="ctx-label">ETIQUETA</label>
                                  <input className="pjl-input" value={(content as any)[sec.tag] || ''} onChange={e => setContent({ ...content, [sec.tag]: e.target.value })} />
                                </div>
                                <div className="ctx-field" style={{ marginBottom: 0 }}>
                                  <label className="ctx-label">TÍTULO</label>
                                  <input className="pjl-input" value={(content as any)[sec.title] || ''} onChange={e => setContent({ ...content, [sec.title]: e.target.value })} />
                                  {(content as any)[sec.title] && (
                                    <div style={{ marginTop: '8px', padding: '10px 12px', background: '#fff', borderRadius: '10px', border: '1px solid var(--gold-pale)' }}>
                                      <p style={{ fontSize: '9px', color: 'var(--gold)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '1px' }}>Vista previa:</p>
                                      <h4 className="serif" style={{ color: 'var(--navy)', fontSize: '1.05rem', margin: 0 }} dangerouslySetInnerHTML={{ __html: (content as any)[sec.title] }} />
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TAB: EVANGELIO DEL DÍA */}
                    {activeContentTab === 'evangelio' && (
                      <div className="ctx-two">
                        <div className="ctx-card">
                          <div className="sec-head">
                            <span className="sec-ic">✝️</span>
                            <div>
                              <h4 className="serif">Evangelio del día</h4>
                              <p>El texto llega solo, directo de Vatican News. Vos solo elegís la imagen.</p>
                            </div>
                          </div>
                          <div className="ctx-field" style={{ marginBottom: '18px' }}>
                            <label className="ctx-label"><span className="ctx-chip">📡</span> FUENTE AUTOMÁTICA · VATICAN NEWS</label>
                            <div className="ctx-info">
                              <p>No se edita texto a mano: cada día se trae automáticamente el Evangelio oficial con sus lecturas:</p>
                              <ul>
                                <li>Primera lectura</li>
                                <li>Salmo responsorial</li>
                                <li>Evangelio</li>
                                <li>Pensamiento del día</li>
                              </ul>
                              <p className="ctx-info-note">Al entrar a la página, los peregrinos ven hoy la Palabra del día con la foto que subís abajo.</p>
                            </div>
                          </div>
                          <div className="ctx-field" style={{ marginBottom: 0 }}>
                            <label className="ctx-label">IMAGEN DEL EVANGELIO</label>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                              <div className="thumb-box" style={{ width: 180, height: 96 }}>
                                {content.evangelioFoto ? <img src={content.evangelioFoto} alt="Imagen del Evangelio" /> : <span className="ph">🙏</span>}
                              </div>
                              <div className="row-actions">
                                {content.evangelioFoto && (
                                  <button className="mini-btn danger" title="Quitar imagen" onClick={() => { setContent({ ...content, evangelioFoto: '' }); showToast('Imagen del Evangelio quitada'); }}>✕</button>
                                )}
                                {/* @ts-ignore */}
                                <input type="file" style={{ display: 'none' }} accept="image/*" id="evangelioFotoFile" onChange={(e) => handleFileUpload(e, (url) => { setContent({ ...content, evangelioFoto: url }); showToast('Imagen del Evangelio actualizada ✔'); })} />
                                <label htmlFor="evangelioFotoFile" className="btn-ghost" style={{ cursor: 'pointer' }}>
                                  {content.evangelioFoto ? '🔁 Cambiar imagen' : '📷 Subir imagen del Evangelio'}
                                </label>
                              </div>
                            </div>
                            <p className="ctx-hint">Foto representativa que encabeza la tarjeta del Evangelio que ven los peregrinos al entrar.</p>
                          </div>
                        </div>

                        <div className="ctx-preview">
                          <div className="pv-banner" style={{ background: content.evangelioFoto ? `url(${content.evangelioFoto}) center/cover no-repeat` : 'linear-gradient(135deg, var(--navy), var(--navy-mid))' }}>
                            {!content.evangelioFoto && <span className="pv-banner-ico">🙏</span>}
                          </div>
                          <div className="pv-body">
                            <span className="pv-kicker">✝️ EVANGELIO DEL DÍA · HOY</span>
                            <h4 className="serif pv-title">{evgAdmin?.title || 'Evangelio del día'}</h4>
                            {evgAdminLoading && <p className="pv-text"><span className="evh-spin" aria-hidden="true"></span> Consultando Vatican News…</p>}
                            {!evgAdminLoading && evgAdmin && evgHoyClassify(evgAdmin.paragraphs).map((sec, i) => (
                              <div key={i} style={{ marginTop: '10px' }}>
                                <span className="pv-kicker" style={{ fontSize: '10px' }}>{sec.label}</span>
                                {sec.reference && <p className="pv-text" style={{ fontSize: '12px', margin: '2px 0 0' }}><b>{sec.reference}</b></p>}
                                <p className="pv-text" style={{ fontSize: '12.5px', marginTop: '4px' }}>{sec.body.join(' ').slice(0, 160)}{sec.body.join(' ').length > 160 ? '…' : ''}</p>
                              </div>
                            ))}
                            {!evgAdminLoading && !evgAdmin && <p className="pv-text">Las lecturas de hoy se mostrarán aquí automáticamente al elegir la foto.</p>}
                            <p className="pv-app">💡 Al copiar o compartir se agrega automáticamente la firma:<br /><em>Pastoral Juvenil Luqueña «Avivando la llama de Cristo en tu corazón»</em></p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TAB: MISIÓN / VISIÓN */}
                    {activeContentTab === 'mision_vision' && (
                      <div className="ctx-two">
                        <div className="ctx-card">
                          <div className="sec-head">
                            <span className="sec-ic">🎯</span>
                            <div>
                              <h4 className="serif">Nuestra Misión</h4>
                              <p>El propósito que moviliza a la pastoral.</p>
                            </div>
                          </div>
                          <textarea className="pjl-input" rows={12} value={content.mision || ''} onChange={e => setContent({ ...content, mision: e.target.value })} placeholder="Escribí aquí la misión de la Pastoral Juvenil Luqueña..." />
                        </div>
                        <div className="ctx-card">
                          <div className="sec-head">
                            <span className="sec-ic">🔭</span>
                            <div>
                              <h4 className="serif">Nuestra Visión</h4>
                              <p>A dónde queremos llegar.</p>
                            </div>
                          </div>
                          <textarea className="pjl-input" rows={12} value={content.vision || ''} onChange={e => setContent({ ...content, vision: e.target.value })} placeholder="Escribí aquí la visión de la Pastoral Juvenil Luqueña..." />
                        </div>
                      </div>
                    )}

                    {/* TAB: OBJETIVOS */}
                    {activeContentTab === 'objetivos' && (
                      <div className="ctx-two">
                        <div className="ctx-card">
                          <div className="sec-head">
                            <span className="sec-ic">🎯</span>
                            <div>
                              <h4 className="serif">Objetivo general</h4>
                              <p>La meta que engloba el trabajo pastoral.</p>
                            </div>
                          </div>
                          <textarea className="pjl-input" rows={8} value={content.objetivoGeneral || ''} onChange={e => setContent({ ...content, objetivoGeneral: e.target.value })} />
                        </div>
                        <div className="ctx-card">
                          <div className="sec-head">
                            <span className="sec-ic">📋</span>
                            <div>
                              <h4 className="serif">Líneas de acción / Estatutos</h4>
                              <p>Los caminos concretos para cumplir la misión.</p>
                            </div>
                          </div>
                          <textarea className="pjl-input" rows={8} value={content.lineasAccion || ''} onChange={e => setContent({ ...content, lineasAccion: e.target.value })} />
                        </div>
                      </div>
                    )}

                    {/* TAB: HISTORIA */}
                    {activeContentTab === 'historia' && (
                      <div style={{ display: 'grid', gap: '22px' }}>
                        <div className="ctx-card">
                          <div className="sec-head">
                            <span className="sec-ic">🕰️</span>
                            <div style={{ flex: 1 }}>
                              <h4 className="serif">Línea de tiempo de la PJL</h4>
                              <p>Edita los hitos; se reflejan al instante en «Nuestra Historia».</p>
                            </div>
                            <span className="ctx-count">{content.historiaTimeline?.length || 0} hitos</span>
                          </div>

                          <div className="ctx-tl">
                            {(content.historiaTimeline || []).map((item, idx) => (
                              <div key={item.id} className="ctx-tl-item">
                                <span className="ctx-tl-dot" style={{ background: item.accentColor || 'var(--gold)' }} />
                                <div className="tl-card-top">
                                  <div className="tl-year">
                                    <span style={{ fontSize: '15px' }}>📅</span>
                                    <input value={item.title} onChange={e => { const nt = [...content.historiaTimeline]; nt[idx].title = e.target.value; setContent({ ...content, historiaTimeline: nt }); }} placeholder="Ej: 2015 · Fundación de la PJL" />
                                  </div>
                                  <div className="row-actions">
                                    <button className="mini-btn" title="Subir" disabled={idx === 0} onClick={() => moveTL(idx, -1)} style={{ opacity: idx === 0 ? 0.35 : 1 }}>▲</button>
                                    <button className="mini-btn" title="Bajar" disabled={idx === (content.historiaTimeline.length - 1)} onClick={() => moveTL(idx, 1)} style={{ opacity: idx === (content.historiaTimeline.length - 1) ? 0.35 : 1 }}>▼</button>
                                    <button
                                      className="mini-btn danger"
                                      title="Eliminar evento"
                                      onClick={() => setContent({ ...content, historiaTimeline: (content.historiaTimeline || []).filter((_, i) => i !== idx) })}
                                    >🗑️</button>
                                  </div>
                                </div>

                                <div className="ctx-row2 tl-fields">
                                  <div className="ctx-field" style={{ marginBottom: 0 }}>
                                    <label className="ctx-label"><span className="chip">📝</span> DESCRIPCIÓN DEL HITO</label>
                                    <textarea className="pjl-input" rows={4} value={item.text} onChange={e => { const nt = [...content.historiaTimeline]; nt[idx].text = e.target.value; setContent({ ...content, historiaTimeline: nt }); }} placeholder="Escribe la historia de este hito..." />
                                  </div>
                                  <div style={{ display: 'grid', gap: '14px' }}>
                                    <div className="ctx-field" style={{ marginBottom: 0 }}>
                                      <label className="ctx-label">IMAGEN DEL HITO</label>
                                      <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <div className="thumb-box" style={{ width: 96, height: 72 }}>
                                          {item.image ? <img src={item.image} alt={item.title || 'Vista previa del hito'} /> : <span className="ph">🖼️</span>}
                                        </div>
                                        <div className="row-actions">
                                          <label className="btn-ghost" style={{ cursor: 'pointer', padding: '9px 14px' }}>
                                            SUBIR IMAGEN
                                            <input
                                              type="file"
                                              style={{ display: 'none' }}
                                              accept="image/*"
                                              onChange={e => handleFileUpload(e, (url) => {
                                                const nt = [...content.historiaTimeline];
                                                nt[idx].image = url;
                                                setContent({ ...content, historiaTimeline: nt });
                                              })}
                                            />
                                          </label>
                                          {item.image && (
                                            <button className="mini-btn danger" title="Quitar imagen" onClick={() => { const nt = [...content.historiaTimeline]; nt[idx].image = ''; setContent({ ...content, historiaTimeline: nt }); }}>✕</button>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="ctx-field" style={{ marginBottom: 0 }}>
                                      <label className="ctx-label">COLOR ACENTO</label>
                                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <input
                                          type="color"
                                          className="pjl-input"
                                          style={{ width: '64px', height: '46px', padding: '4px' }}
                                          value={item.accentColor || '#C8973A'}
                                          onChange={e => {
                                            const nt = [...content.historiaTimeline];
                                            nt[idx].accentColor = e.target.value;
                                            setContent({ ...content, historiaTimeline: nt });
                                          }}
                                        />
                                        <span className="ctx-hint" style={{ margin: 0 }}>Este tono se verá en la línea de tiempo y en el modal.</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <div className="tl-shot">
                                  {item.image && <img src={item.image} alt={item.title || 'Vista previa'} />}
                                  <div className="tl-shot-body">
                                    <div className="tl-strip">
                                      <span className="tl-strip-tag" style={{ color: item.accentColor || 'var(--gold)', borderColor: `${item.accentColor || '#C8973A'}55` }}>
                                        {item.title || 'Nuevo hito'}
                                      </span>
                                      <span className="tl-strip-dot" style={{ background: item.accentColor || 'var(--gold)' }} />
                                    </div>
                                    <p className="tl-strip-text">{item.text || 'Aquí aparecerá una vista previa de la historia para que el equipo vea cómo queda en el sitio.'}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>

                          <button
                            className="btn-add"
                            style={{ marginTop: '20px' }}
                            onClick={() => {
                              const newEvent = { id: Date.now().toString(), title: '', text: '', image: '', accentColor: '#C8973A' };
                              setContent({ ...content, historiaTimeline: [...(content.historiaTimeline || []), newEvent] });
                            }}
                          >+ Agregar evento a la historia</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="ctx-savebar">
                  <span className="sb-note"><span className="pulse" /> Los cambios se sincronizan al instante en todo el sitio.</span>
                  <button className="ctx-submit" onClick={() => showToast('¡Contenido guardado con éxito! ✔')}>
                    💾 GUARDAR TODO EL CONTENIDO
                  </button>
                </div>
              </div>
            );
          })()}
          {/* TERRITORIO */}
          {mod === 'capillas' && capillasView === 'territorio' && (
            <div className="animate-reveal pjl-card" style={{ padding: '40px' }}>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
                <button
                  className="btn-premium btn-premium-outline"
                  onClick={() => navigateMod('capillas', 'capillas')}
                  style={{ padding: '8px 14px', fontSize: '11px' }}
                >
                  ⛪ Gestión de Capillas
                </button>
                <button
                  className={`btn-premium ${capillasView === 'territorio' ? 'btn-premium-gold' : 'btn-premium-outline'}`}
                  onClick={() => navigateMod('capillas', 'territorio')}
                  style={{ padding: '8px 14px', fontSize: '11px' }}
                >
                  🗺️ Gestión de Territorio
                </button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '26px', flexWrap: 'wrap' }}>
                <div>
                  <h3 className="serif" style={{ fontSize: '2rem', color: 'var(--navy)', margin: 0 }}>Gestión de Territorio</h3>
                  <p className="premium-label" style={{ color: 'var(--gold)', marginTop: '5px' }}>DELIMITACIÓN DE ZONAS Y COBERTURA EN VIVO</p>
                </div>
                {!capturingZone && !placingChapelId && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                    <button
                      className="btn-premium btn-premium-outline"
                      onClick={exportTerritorioGeoJSON}
                      style={{ padding: '9px 16px', fontSize: '11px' }}
                    >
                      ⬇ EXPORTAR GEOJSON
                    </button>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', maxWidth: '320px', textAlign: 'right', margin: 0 }}>
                      Dibuja los límites de cada zona o ubica capillas sin GPS haciendo clic directo en el mapa.
                    </p>
                  </div>
                )}
              </div>

              {/* DASHBOARD DE COBERTURA POR ZONA */}
              <div className="terr-dash">
                {territoryStats.map(s => {
                  const pct = s.total === 0 ? 0 : Math.round(((s.dentro ?? s.ubicadas) / s.total) * 100);
                  return (
                    <div key={s.zona} className="td-card" style={{ '--zc': s.color } as CSSProperties}>
                      <div className="td-top">
                        <span className="td-zona">ZONA {s.zona}</span>
                        {s.tienePoligono ? <span className="td-tag ok">LÍMITES ✔</span> : <span className="td-tag warn">SIN LÍMITES</span>}
                      </div>
                      <div className="td-nums">
                        <div><strong>{s.total}</strong><span>Capillas</span></div>
                        <div><strong>{s.activas}</strong><span>Activas</span></div>
                        <div><strong>{s.ubicadas}</strong><span>Con GPS</span></div>
                      </div>
                      <div className="td-bar"><i style={{ width: `${pct}%` }} /></div>
                      <div className="td-foot">
                        <span>Cobertura {pct}%</span>
                        <span>{s.dentro === null ? (s.tienePoligono ? 'define vértices' : 'polígono pendiente') : `${s.dentro}/${s.ubicadas} dentro`}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="territory-editor-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '30px' }}>
                <div
                  className={`territory-map-shell ${placingChapelId ? 'map-shell-placing' : ''}`}
                  style={{ height: '600px', borderRadius: '25px', overflow: 'hidden', border: `3px solid ${capturingZone !== null || placingChapelId ? 'var(--gold)' : 'var(--gold-pale)'}`, position: 'relative', transition: 'border-color 0.3s ease', boxShadow: capturingZone !== null || placingChapelId ? '0 0 0 4px rgba(200,151,58,0.15)' : 'none' }}
                >
                  <ZonaMap 
                    key={`territory-map-${capturingZone ?? 'view'}`}
                    selectedZone={capturingZone || 0}
                    showAllZones={capturingZone === null}
                    tempPolygon={tempPolygon}
                    scrollWheelZoom={true}
                    drawingMode={!!capturingZone}
                    hideFallbackPolygon={!!capturingZone && tempPolygon.length === 0 && !branding[`zona${capturingZone}Polygon`]}
                    enableSearch={true}
                    zoneColors={{
                      1: branding.zona1Color as string || '#C8973A',
                      2: branding.zona2Color as string || '#1A2744',
                      3: branding.zona3Color as string || '#1A3B2B',
                      4: branding.zona4Color as string || '#441A1A'
                    }}
                    polygons={{
                      1: branding.zona1Polygon as [number, number][],
                      2: branding.zona2Polygon as [number, number][],
                      3: branding.zona3Polygon as [number, number][],
                      4: branding.zona4Polygon as [number, number][]
                    }}
                  />
                  {capturingZone && (
                    <>
                      {/* Top status banner */}
                      <div className="territory-status-banner" style={{ position: 'absolute', top: '15px', left: '15px', right: '65px', background: 'rgba(26,39,68,0.92)', color: '#fff', padding: '12px 20px', borderRadius: '12px', zIndex: 1000, backdropFilter: 'blur(10px)', border: '1px solid var(--gold)', display: 'flex', alignItems: 'center', gap: '12px', pointerEvents: 'none' }}>
                        <span style={{ fontSize: '20px' }}>✏️</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 900, fontSize: '13px', letterSpacing: '1px' }}>DIBUJANDO ZONA {capturingZone}</div>
                          <div style={{ fontSize: '10px', opacity: 0.75 }}>
                            {tempPolygon.length === 0
                              ? 'Haz clic en el mapa para marcar el primer vértice'
                              : tempPolygon.length < 3
                              ? `${tempPolygon.length} punto(s) — necesitas al menos 3`
                              : `${tempPolygon.length} puntos marcados — listo para guardar ✔`}
                          </div>
                        </div>
                        <div style={{ background: 'var(--gold)', color: 'var(--navy)', fontWeight: 900, fontSize: '14px', minWidth: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {tempPolygon.length}
                        </div>
                      </div>
                      {/* Bottom action bar */}
                      <div className="territory-action-bar" style={{ position: 'absolute', bottom: '15px', left: '15px', right: '15px', display: 'flex', gap: '8px', zIndex: 1000 }}>
                        <button
                          onClick={() => setTempPolygon(prev => prev.slice(0, -1))}
                          disabled={tempPolygon.length === 0}
                          style={{ flex: 1, padding: '10px', background: 'rgba(239,68,68,0.88)', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '12px', cursor: tempPolygon.length === 0 ? 'not-allowed' : 'pointer', backdropFilter: 'blur(8px)', opacity: tempPolygon.length === 0 ? 0.4 : 1, transition: '0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
                        >↩ Deshacer</button>
                        <button
                          onClick={() => { if (tempPolygon.length > 0 && confirm('¿Borrar todos los puntos?')) setTempPolygon([]); }}
                          disabled={tempPolygon.length === 0}
                          title="Borrar todos los puntos"
                          style={{ padding: '10px 14px', background: 'rgba(26,39,68,0.88)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '10px', fontWeight: 700, fontSize: '13px', cursor: tempPolygon.length === 0 ? 'not-allowed' : 'pointer', backdropFilter: 'blur(8px)', opacity: tempPolygon.length === 0 ? 0.4 : 1, transition: '0.2s' }}
                        >🗑️</button>
                        <button
                          onClick={saveCapturedPolygon}
                          disabled={tempPolygon.length < 3}
                          style={{ flex: 2, padding: '10px', background: tempPolygon.length >= 3 ? 'var(--gold)' : 'rgba(200,151,58,0.35)', color: tempPolygon.length >= 3 ? 'var(--navy)' : 'rgba(255,255,255,0.5)', border: 'none', borderRadius: '10px', fontWeight: 900, fontSize: '12px', cursor: tempPolygon.length < 3 ? 'not-allowed' : 'pointer', backdropFilter: 'blur(8px)', transition: '0.2s', letterSpacing: '0.5px' }}
                        >GUARDAR ({tempPolygon.length} pts)</button>
                        <button
                          onClick={() => { setCapturingZone(null); setTempPolygon([]); }}
                          title="Cancelar"
                          style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.65)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', fontWeight: 700, fontSize: '13px', cursor: 'pointer', backdropFilter: 'blur(8px)' }}
                         >✕</button>
                       </div>
                     </>
                   )}
                   {placingChapel && (
                     <>
                       {/* Banner de colocación */}
                       <div className="place-banner" style={{ position: 'absolute', top: '15px', left: '15px', right: '65px', zIndex: 1000 }}>
                         <span className="pinpulse" />
                         <div style={{ flex: 1, minWidth: 0 }}>
                           <div style={{ fontWeight: 900, fontSize: '13px', letterSpacing: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>UBICANDO “{placingChapel.name}”</div>
                           <div style={{ fontSize: '10px', opacity: 0.85 }}>Haz clic en el punto exacto del mapa</div>
                         </div>
                       </div>
                       <div style={{ position: 'absolute', bottom: '15px', left: '15px', right: '15px', display: 'flex', zIndex: 1000 }}>
                         <button
                           onClick={() => setPlacingChapelId(null)}
                           style={{ width: '100%', padding: '10px', background: 'rgba(26,39,68,0.9)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', borderRadius: '10px', fontWeight: 700, fontSize: '12px', cursor: 'pointer', backdropFilter: 'blur(8px)', letterSpacing: '0.5px', transition: '0.2s' }}
                          >✕ CANCELAR UBICACIÓN</button>
                       </div>
                     </>
                   )}
                  </div>

                  {/* LEYENDA INTERACTIVA */}
                  <div className="terr-legend">
                    {territoryStats.map(s => (
                      <button
                        key={s.zona}
                        className={`tl-pill ${capturingZone === s.zona ? 'tl-on' : ''}`}
                        style={{ '--zc': s.color } as CSSProperties}
                        title={`Seleccionar Zona ${s.zona} para dibujar`}
                        onClick={() => { setPlacingChapelId(null); setCapturingZone(s.zona); setTempPolygon((branding[`zona${s.zona}Polygon`] as [number, number][]) || []); }}
                      >
                        <i className="tl-dot" />
                        <span className="tl-name">Zona {s.zona}</span>
                        <span className="tl-count">{s.total} ⛪ · {s.ubicadas}/{s.total} 📍</span>
                      </button>
                    ))}
                  </div>

                  {/* ACCIONES RÁPIDAS */}
                  <div className="terr-quick">
                    <div className="tq-card tq-gold">
                      <span className="tq-ico">🖌️</span>
                      <div className="tq-txt">
                        <strong>Dibujar límites</strong>
                        <small>Traza el polígono de una zona en el mapa</small>
                      </div>
                      <button
                        className="tq-btn"
                        onClick={() => {
                          const z = ([1, 2, 3, 4] as const).find(n => !((branding[`zona${n}Polygon`] as [number, number][] | undefined)?.length)) || 1;
                          setPlacingChapelId(null);
                          setCapturingZone(z);
                          setTempPolygon((branding[`zona${z}Polygon`] as [number, number][]) || []);
                        }}
                      >COMENZAR</button>
                    </div>
                    <div className="tq-card tq-blue">
                      <span className="tq-ico">📍</span>
                      <div className="tq-txt">
                        <strong>Ubicar capilla</strong>
                        <small>{unplacedChapels.length ? `${unplacedChapels.length} esperando coordenadas` : 'Todo sincronizado con GPS ✔'}</small>
                      </div>
                      <button
                        className="tq-btn"
                        disabled={!unplacedChapels.length}
                        onClick={() => unplacedChapels[0] && startPlacingChapel(unplacedChapels[0].id)}
                      >{unplacedChapels.length ? 'UBICAR' : 'LISTO ✔'}</button>
                    </div>
                    <div className="tq-card tq-green">
                      <span className="tq-ico">⬇️</span>
                      <div className="tq-txt">
                        <strong>Exportar GeoJSON</strong>
                        <small>Zonas + capillas para QGIS o Google Earth</small>
                      </div>
                      <button className="tq-btn" onClick={exportTerritorioGeoJSON}>DESCARGAR</button>
                    </div>
                  </div>

                 <div className="territory-zone-list" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  {[1, 2, 3, 4].map((num, idx) => {
                    const st = territoryStats[idx];
                    const currentColor = (branding[`zona${num}Color`] as string) || '#C8973A';
                    const hasPoly = !!(branding[`zona${num}Polygon`] as [number, number][] | undefined);
                    return (
                      <div
                        key={num}
                        className={`tz-card ${capturingZone === num ? 'tz-active' : ''}`}
                        style={{ '--zc': currentColor, animationDelay: `${idx * 80 + 120}ms` } as CSSProperties}
                      >
                        <div className="tz-head">
                          <h4 className="tz-name">ZONA {num}</h4>
                          <input
                            type="color"
                            value={currentColor}
                            onChange={e => setBranding({ ...branding, [`zona${num}Color`]: e.target.value })}
                            title="Color de la zona"
                            style={{ border: 'none', width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer', background: 'transparent', padding: 0 }}
                          />
                        </div>
                        <div className="tz-swatches">
                          {TERR_PRESETS.map(pc => (
                            <button
                              key={pc}
                              aria-label={`Color ${pc}`}
                              title={pc}
                              className={`sw ${currentColor.toLowerCase() === pc.toLowerCase() ? 'on' : ''}`}
                              style={{ background: pc }}
                              onClick={() => setBranding({ ...branding, [`zona${num}Color`]: pc })}
                            />
                          ))}
                        </div>
                        <div className="tz-mini">
                          <span><b>{st.total}</b> capillas</span>
                          <span><b>{st.ubicadas}</b> con GPS</span>
                          {!st.tienePoligono && <span className="tz-warn">⚠ sin límites</span>}
                        </div>
                        <button
                          className="tz-btn gold"
                          onClick={() => { setPlacingChapelId(null); setCapturingZone(num); setTempPolygon((branding[`zona${num}Polygon`] as [number, number][]) || []); }}
                        >
                          {hasPoly ? '✏️ REDEFINIR LÍMITES' : '➕ DEFINIR LÍMITES'}
                        </button>
                        {hasPoly && (
                          <button
                            className="tz-btn danger"
                            onClick={() => {
                              if (confirm('¿Eliminar límites de esta zona?')) {
                                setBranding({ ...branding, [`zona${num}Polygon`]: undefined });
                                showToast(`Límites de Zona ${num} eliminados`);
                                addLog('eliminar territorio', 'territorio', `Zona ${num}`);
                              }
                            }}
                          >🗑️ ELIMINAR POLÍGONO</button>
                        )}
                      </div>
                    );
                  })}

                  {/* CAPILLAS SIN UBICAR */}
                  <div className="unpanel">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: unplacedChapels.length ? '10px' : '0' }}>
                      <h4 style={{ margin: 0, fontSize: '13px', color: 'var(--gold)', letterSpacing: '0.5px' }}>📍 CAPILLAS SIN UBICAR</h4>
                      <span className="unbadge">{unplacedChapels.length}</span>
                    </div>
                    {unplacedChapels.length === 0 ? (
                      <p className="unok">✔ Todas las capillas tienen coordenadas GPS.</p>
                    ) : (
                      <>
                        <p style={{ fontSize: '10px', opacity: 0.75, margin: '0 0 10px' }}>Toca UBICAR y luego haz clic en el mapa:</p>
                        {unplacedChapels.slice(0, 6).map((c, i) => (
                          <div key={c.id} className="unchip" style={{ animationDelay: `${i * 55 + 200}ms` }}>
                            {(c.logoUrl || c.photo) ? (
                              <img src={(c.logoUrl || c.photo) as string} alt="" style={{ width: '22px', height: '22px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                            ) : (
                              <span className="dotz" style={{ background: (branding[`zona${c.zonaId}Color`] as string) || '#C8973A' }} />
                            )}
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div className="uc-name">{c.name}</div>
                              <div className="uc-sub">Zona {c.zonaId} · {c.comunidadNombre}</div>
                            </div>
                            <button
                              className="unplace-btn"
                              disabled={!!placingChapelId || capturingZone !== null}
                              onClick={() => startPlacingChapel(c.id)}
                            >UBICAR</button>
                          </div>
                        ))}
                        {unplacedChapels.length > 6 && (
                          <p style={{ fontSize: '9px', opacity: 0.6, margin: '6px 0 0' }}>+{unplacedChapels.length - 6} más…</p>
                        )}
                      </>
                    )}
                  </div>

                  <div className="unpanel" style={{ animationDelay: '300ms' }}>
                    <h4 style={{ margin: '0 0 10px', fontSize: '13px', color: 'var(--gold)' }}>📌 Instrucciones</h4>
                    <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '11px', lineHeight: '1.8', opacity: 0.85 }}>
                      <li><strong>DEFINIR LÍMITES</strong>: haz clic en el mapa para marcar cada vértice.</li>
                      <li>Mínimo <strong>3 puntos</strong>; usa ↩ Deshacer si te equivocas.</li>
                      <li><strong>UBICAR</strong>: coloca una capilla sin GPS con un solo clic.</li>
                      <li><strong>GEOJSON</strong>: exporta zonas y capillas para otras apps.</li>
                      <li>Los cambios se reflejan en toda la web automáticamente.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* HISTORIAL / LOGS */}
          {mod === 'logs' && (() => {
            const LOG_PAGE_SIZE = 8;
            const MOD_META: Record<string, { icon: string; label: string }> = {
              territorio: { icon: '\u{1F5FA}\uFE0F', label: 'Territorio' },
              capillas: { icon: '\u26EA', label: 'Capillas' },
              noticias: { icon: '\u{1F4F0}', label: 'Noticias' },
              usuarios: { icon: '\u{1F464}', label: 'Usuarios' },
              actividades: { icon: '\u{1F4C5}', label: 'Actividades' },
              documentos: { icon: '\u{1F4C4}', label: 'Documentos' },
              galeria: { icon: '\u{1F5BC}\uFE0F', label: 'Galería' },
              carrusel: { icon: '\u{1F3A0}', label: 'Carrusel' },
              faq: { icon: '\u2753', label: 'FAQ' },
              sistema: { icon: '\u2699\uFE0F', label: 'Sistema' },
            };
            const toneOf = (action: string): 'danger' | 'ok' | 'info' | 'gold' => {
              const a = action.toLowerCase();
              if (a.includes('eliminar') || a.includes('limpiar')) return 'danger';
              if (a.includes('crear') || a.includes('agregar') || a.includes('publicar') || a.includes('aprobar')) return 'ok';
              if (a.includes('inicio de sesi\u00f3n') || a.includes('sesi\u00f3n') || a.includes('enviar') || a.includes('reenviar')) return 'info';
              return 'gold';
            };
            const hace = (iso: string) => {
              const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
              if (s < 60) return 'hace instantes';
              const m = Math.floor(s / 60);
              if (m < 60) return `hace ${m} min`;
              const h = Math.floor(m / 60);
              if (h < 24) return `hace ${h} h`;
              return `hace ${Math.floor(h / 24)} d`;
            };
            const pageNums = (cur: number, tot: number): (number | '...')[] => {
              if (tot <= 7) return Array.from({ length: tot }, (_, i) => i + 1);
              const keep = new Set([1, tot, cur - 1, cur, cur + 1].filter(p => p >= 1 && p <= tot));
              const arr = [...keep].sort((a, b) => a - b);
              const res: (number | '...')[] = [];
              arr.forEach((p, i) => {
                if (i && p - arr[i - 1] > 1) res.push('...');
                res.push(p);
              });
              return res;
            };

            const modulesPresent = Array.from(new Set(logs.map(l => l.module)));
            const lq = logSearch.trim().toLowerCase();
            const filteredLogs = logs.filter(l => {
              if (logModule !== 'all' && l.module !== logModule) return false;
              if (!lq) return true;
              return [l.action, l.details, l.userName].some(v => (v || '').toLowerCase().includes(lq));
            });
            const totalPages = Math.max(1, Math.ceil(filteredLogs.length / LOG_PAGE_SIZE));
            const safePage = Math.min(logPage, totalPages);
            const pageLogs = filteredLogs.slice((safePage - 1) * LOG_PAGE_SIZE, safePage * LOG_PAGE_SIZE);

            const hoyStr = new Date().toDateString();
            const countHoy = logs.filter(l => new Date(l.timestamp).toDateString() === hoyStr).length;
            const weekAgoMs = Date.now() - 7 * 864e5;
            const countSemana = logs.filter(l => new Date(l.timestamp).getTime() >= weekAgoMs).length;

            const exportLogsCSV = () => {
              if (!filteredLogs.length) { showToast('No hay registros para exportar'); return; }
              const rows: string[][] = [
                ['Fecha', 'Hora', 'Usuario', 'ID Usuario', 'Acción', 'Módulo', 'Detalles'],
                ...filteredLogs.map(l => {
                  const d = new Date(l.timestamp);
                  return [
                    d.toLocaleDateString('es-PY'),
                    d.toLocaleTimeString('es-PY'),
                    l.userName, l.userId, l.action, l.module, l.details || ''
                  ];
                }),
              ];
              const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
              const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `historial-pjl-${new Date().toISOString().slice(0, 10)}.csv`;
              a.click();
              URL.revokeObjectURL(url);
              showToast('\u{1F4E5} Historial exportado en CSV');
            };

            return (
              <div className="animate-reveal pjl-card" style={{ padding: '40px' }}>
                <div className="admin-section-header admin-stack-mobile" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                  <div className="admin-section-title-group">
                    <h3 className="serif" style={{ fontSize: '2rem', color: 'var(--navy)', margin: 0 }}>Historial de Actividad</h3>
                    <p className="premium-label" style={{ color: 'var(--gold)', marginTop: '5px' }}>REGISTRO DE ACCIONES ADMINISTRATIVAS</p>
                  </div>
                  <div className="admin-stack-mobile" style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn-premium btn-premium-outline admin-section-action lg-export" onClick={exportLogsCSV}>
                      <span className="lg-xico">{'\u2913'}</span> EXPORTAR CSV
                    </button>
                    <button className="btn-premium btn-premium-outline admin-section-action lg-clear" onClick={() => {
                      if (confirm('¿Deseas limpiar todo el historial?')) {
                        setLogs([]);
                        setLogPage(1);
                        showToast('Historial limpiado');
                        addLog('limpiar historial', 'sistema', `${logs.length} registros eliminados`);
                      }
                    }}>LIMPIAR HISTORIAL</button>
                  </div>
                </div>

                {/* ESTADISTICAS */}
                <div className="lg-stats">
                  <div className="lg-stat"><b>{logs.length}</b><span>Total registros</span></div>
                  <div className="lg-stat lg-st-hoy"><b>{countHoy}</b><span>Hoy</span></div>
                  <div className="lg-stat lg-st-sem"><b>{countSemana}</b><span>Esta semana</span></div>
                  <div className="lg-stat lg-st-mod"><b>{modulesPresent.length}</b><span>Módulos activos</span></div>
                </div>

                {/* TOOLBAR */}
                <div className="lg-toolbar">
                  <div className="lg-searchbox">
                    <span>{'\u{1F50D}'}</span>
                    <input
                      type="text"
                      placeholder="Buscar acción, detalle o usuario…"
                      value={logSearch}
                      onChange={e => { setLogSearch(e.target.value); setLogPage(1); }}
                      aria-label="Buscar en el historial"
                    />
                    {logSearch && (
                      <button title="Limpiar" aria-label="Limpiar búsqueda" onClick={() => { setLogSearch(''); setLogPage(1); }}>{'\u2715'}</button>
                    )}
                  </div>
                  <div className="lg-chips" role="group" aria-label="Filtrar por módulo">
                    <button
                      className={`lg-chip ${logModule === 'all' ? 'on' : ''}`}
                      onClick={() => { setLogModule('all'); setLogPage(1); }}
                    >Todos</button>
                    {modulesPresent.map(mk => (
                      <button
                        key={mk}
                        className={`lg-chip ${logModule === mk ? 'on' : ''}`}
                        onClick={() => { setLogModule(mk); setLogPage(1); }}
                      >
                        {(MOD_META[mk] || { icon: '\u{1F4E6}' }).icon} {(MOD_META[mk] || { label: mk }).label}
                      </button>
                    ))}
                  </div>
                </div>

                <p className="lg-count">
                  {filteredLogs.length} de {logs.length} registros
                  {(logSearch || logModule !== 'all') && <> · filtros activos <button className="lg-reset" onClick={() => { setLogSearch(''); setLogModule('all'); setLogPage(1); }}>limpiar {'\u2715'}</button></>}
                </p>

                {/* LISTA PAGINADA */}
                {logs.length === 0 ? (
                  <div className="lg-empty">
                    <span className="lge-ico">{'\u{1F4DC}'}</span>
                    <h4>Historial vacío</h4>
                    <p>Cuando empieces a gestionar el contenido, todas las acciones quedarán registradas aquí.</p>
                  </div>
                ) : pageLogs.length === 0 ? (
                  <div className="lg-empty">
                    <span className="lge-ico">{'\u{1F50D}'}</span>
                    <h4>Sin resultados</h4>
                    <p>Ningún registro coincide con los filtros aplicados.</p>
                    <button className="btn-premium btn-premium-outline" style={{ marginTop: '14px' }} onClick={() => { setLogSearch(''); setLogModule('all'); setLogPage(1); }}>
                      VER TODO EL HISTORIAL
                    </button>
                  </div>
                ) : (
                  <div className="lg-list" key={safePage}>
                    {pageLogs.map((log, idx) => {
                      const tone = toneOf(log.action);
                      const meta = MOD_META[log.module] || { icon: '\u{1F4E6}', label: log.module };
                      return (
                        <article key={log.id} className={`lg-card lg-${tone}`} style={{ '--d': `${idx * 45}ms` } as CSSProperties}>
                          <div className="lg-top">
                            <span className="lg-ico">{meta.icon}</span>
                            <span className="lg-action">{log.action.toUpperCase()}</span>
                            <span className="lg-ago">{hace(log.timestamp)}</span>
                          </div>
                          {log.details && <p className="lg-det">{log.details}</p>}
                          <div className="lg-foot">
                            <span className="lg-user"><i>{(log.userName || '?').charAt(0).toUpperCase()}</i>{log.userName}</span>
                            <span className="lg-dot">{meta.label}</span>
                            <time>
                              {new Date(log.timestamp).toLocaleString('es-PY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </time>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}

                {/* PAGINACION */}
                {totalPages > 1 && (
                  <div className="lg-pages">
                    <button
                      className="lg-pg lg-nav"
                      disabled={safePage === 1}
                      onClick={() => setLogPage(safePage - 1)}
                      aria-label="Página anterior"
                    >{'\u2039'}</button>
                    {pageNums(safePage, totalPages).map((p, i) =>
                      p === '...' ? (
                        <span key={`gap${i}`} className="lg-gap">{'\u2026'}</span>
                      ) : (
                        <button
                          key={p}
                          className={`lg-pg ${p === safePage ? 'on' : ''}`}
                          onClick={() => setLogPage(p)}
                          aria-current={p === safePage ? 'page' : undefined}
                        >{p}</button>
                      )
                    )}
                    <button
                      className="lg-pg lg-nav"
                      disabled={safePage === totalPages}
                      onClick={() => setLogPage(safePage + 1)}
                      aria-label="Página siguiente"
                    >{'\u203A'}</button>
                    <span className="lg-pageinfo">Página {safePage} de {totalPages}</span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* NOTICIAS */}
          {mod === 'noticias' && (
            <div className="animate-reveal pjl-card" style={{ padding: '40px' }}>
              {newsView === 'list' && (
                <>
                  <div className="admin-section-header admin-stack-mobile" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                    <div className="admin-section-title-group">
                      <h3 className="serif admin-section-title">Gestión de Noticias</h3>
                      <p className="admin-section-desc">Redacta, publica y administra las noticias que aparecen en el sitio. También podés asociar eventos a cada noticia.</p>
                    </div>
                    <button className="btn-premium btn-premium-gold admin-section-action" onClick={() => { setSelectedArticle(null); setNewsView('article'); }}>+ PUBLICAR NOTICIA</button>
                  </div>
                  <div className="news-admin-grid">
                    <div>
                      <NewsAdminTable
                        onEdit={(art) => {
                          setSelectedArticle(art);
                          setNewsView('article');
                        }}
                        onDelete={() => {}}
                        onEvent={(art) => {
                          setSelectedArticle(art);
                          setNewsView('event');
                        }}
                      />
                    </div>

                    {/* SIDE WIDGET - VATICAN NEWS */}
                    <div className="vatican-news-sidebar" style={{ position: 'sticky', top: '20px' }}>
                      <div className="pjl-card" style={{ padding: '20px', background: 'var(--cream)', border: '1px solid var(--gold-pale)' }}>
                        <h4 className="serif" style={{ color: 'var(--navy)', marginBottom: '15px', fontSize: '1rem', borderBottom: '1px solid var(--gold-pale)', paddingBottom: '10px' }}>🇻🇦 Vaticano al Día</h4>
                        {/* @ts-ignore */}
                        <vaticannews-widget lang="es" fontSize="18"></vaticannews-widget>
                      </div>
                      <div className="pjl-card" style={{ padding: '20px', background: 'var(--navy)', color: '#fff', marginTop: '20px', border: '1px solid var(--gold)' }}>
                        <p style={{ fontSize: '11px', lineHeight: '1.5', opacity: 0.8 }}>Mantente conectado con las noticias oficiales de la Santa Sede directamente desde tu panel.</p>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {newsView === 'article' && (
                <div>
                  <NewsArticleForm
                    article={selectedArticle || undefined}
                    onSave={() => {
                      setNewsView('list');
                      setSelectedArticle(null);
                      showToast('Noticia guardada con éxito ✔');
                    }}
                    onCancel={() => {
                      setNewsView('list');
                      setSelectedArticle(null);
                    }}
                  />
                </div>
              )}

              {newsView === 'event' && selectedArticle && (
                <div>
                  <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                    <button className="btn-premium btn-premium-outline" onClick={() => { setNewsView('list'); setSelectedArticle(null); }}>
                      ← Volver a la lista
                    </button>
                    <h3 className="serif" style={{ margin: 0 }}>Agregar/Editar Evento para: &quot;{selectedArticle.title}&quot;</h3>
                  </div>
                  <NewsEventForm
                    articleId={selectedArticle.id}
                    event={selectedArticle.event}
                    onSave={() => {
                      setNewsView('list');
                      setSelectedArticle(null);
                      showToast('Evento guardado con éxito ✔');
                    }}
                    onCancel={() => {
                      setNewsView('list');
                      setSelectedArticle(null);
                    }}
                  />
                </div>
              )}

              <Script src="https://www.vaticannews.va/widget.js" strategy="lazyOnload" />
            </div>
          )}

          {/* CARRUSEL HERO */}
          {mod === 'carrusel' && (() => {
            const posMap: Record<string, string> = {
              'Top': 'center top',
              'Bottom': 'center bottom',
              'Left': 'left center',
              'Right': 'right center',
            };
            const currentSlide = liveHeroImages.find(s => s.id === editingSlideId) || liveHeroImages[0];
            const currentIndex = currentSlide ? liveHeroImages.findIndex(s => s.id === currentSlide.id) : -1;
            const updateSlide = (patch: Partial<HeroSlide>) => {
              if (!currentSlide) return;
              setLiveHeroImages(liveHeroImages.map(s => s.id === currentSlide.id ? { ...s, ...patch } : s));
            };
            const moveSlide = (from: number, to: number) => {
              if (to < 0 || to >= liveHeroImages.length) return;
              const arr = [...liveHeroImages];
              const [item] = arr.splice(from, 1);
              arr.splice(to, 0, item);
              setLiveHeroImages(arr);
            };
            return (
            <div className="animate-reveal pjl-card" style={{ padding: '40px' }}>
              <div className="admin-section-header admin-stack-mobile" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '26px', flexWrap: 'wrap', gap: '16px' }}>
                <div className="admin-section-title-group">
                  <h3 className="serif admin-section-title" style={{ margin: 0 }}>Carrusel del Hero</h3>
                  <p className="admin-section-desc">Gestioná las fotos de fondo de la página de inicio: subí imágenes, ordenalas y definí su enfoque para celular y computadora. Los textos se editan al final de esta página.</p>
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label className="premium-label" style={{ fontSize: '0.65rem' }}>INTERVALO (SEG)</label>
                    <input
                      type="number"
                      className="pjl-input"
                      style={{ width: '80px', padding: '8px', textAlign: 'center' }}
                      value={heroIntervalSecs}
                      onChange={e => setHeroIntervalSecs(Math.max(1, parseInt(e.target.value) || 3))}
                    />
                  </div>
                  <button className="btn-premium btn-premium-gold" onClick={() => {
                    const newId = Date.now().toString();
                    setLiveHeroImages([...liveHeroImages, {
                      id: newId, imageUrl: '', title: '', subtitle: '',
                      buttonText: '', buttonLink: '', mobilePosition: 'Centro (Default)', desktopPosition: 'Centro (Default)'
                    }]);
                    setEditingSlideId(newId);
                  }}>+ AGREGAR SLIDE</button>
                </div>
              </div>

              {liveHeroImages.length === 0 ? (
                <div className="pjl-empty-state">
                  <div className="empty-icon">🎠</div>
                  <h4 className="empty-title">El carrusel está vacío</h4>
                  <p className="empty-desc">Agregá el primer slide y subí una imagen de fondo (resolución recomendada 1920×1080). Sin fotos, el sitio muestra un fondo azul de respaldo.</p>
                  <button className="btn-premium btn-premium-gold" onClick={() => {
                    const newId = Date.now().toString();
                    setLiveHeroImages([{
                      id: newId, imageUrl: '', title: '', subtitle: '',
                      buttonText: '', buttonLink: '', mobilePosition: 'Centro (Default)', desktopPosition: 'Centro (Default)'
                    }]);
                    setEditingSlideId(newId);
                  }}>+ Crear primer slide</button>
                </div>
              ) : (
                <div className="carousel-admin-grid" style={{ display: 'grid', gridTemplateColumns: '290px 1fr', gap: '22px', alignItems: 'start' }}>

                  {/* LISTA DE SLIDES */}
                  <div className="carousel-slide-list" style={{ display: 'grid', gap: '10px' }}>
                    <span className="toolbar-label" style={{ paddingLeft: '4px' }}>{liveHeroImages.length} slides · tocá uno para editar</span>
                    {liveHeroImages.map((slide, i) => (
                      <div
                        key={slide.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setEditingSlideId(slide.id)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setEditingSlideId(slide.id); }}
                        className={`slide-thumb-row ${currentSlide?.id === slide.id ? 'selected' : ''}`}
                      >
                        <span className="slide-thumb-num">{i + 1}</span>
                        <span className="slide-thumb-img">
                          {slide.imageUrl
                            ? <img src={slide.imageUrl} alt={`Miniatura slide ${i + 1}`} />
                            : '🖼️'}
                        </span>
                        <span className="slide-thumb-meta">
                          <strong>Slide {i + 1}</strong>
                          <small>{slide.imageUrl ? 'Con imagen' : 'Sin imagen'}</small>
                        </span>
                        <span className="slide-thumb-actions" onClick={e => e.stopPropagation()}>
                          <button title="Subir" disabled={i === 0} onClick={() => moveSlide(i, i - 1)}>↑</button>
                          <button title="Bajar" disabled={i === liveHeroImages.length - 1} onClick={() => moveSlide(i, i + 1)}>↓</button>
                          <button title="Eliminar" className="is-danger" onClick={() => {
                            if (confirm(`¿Eliminar el Slide ${i + 1}?`)) {
                              setLiveHeroImages(liveHeroImages.filter(s => s.id !== slide.id));
                              if (editingSlideId === slide.id) setEditingSlideId(null);
                              showToast('Slide eliminado');
                            }
                          }}>✕</button>
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* EDITOR DEL SLIDE SELECCIONADO */}
                  {currentSlide && (
                    <div className="carousel-editor-panel">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                        <h4 className="serif" style={{ margin: 0, color: 'var(--navy)', fontSize: '1.15rem' }}>
                          Editando Slide {currentIndex + 1}
                          {!currentSlide.imageUrl && <span style={{ fontSize: '11px', color: '#b45309', fontWeight: 700, marginLeft: '10px' }}>⚠ Falta la imagen</span>}
                        </h4>
                        <label className="btn-premium btn-premium-gold" style={{ cursor: 'pointer', padding: '10px 18px', whiteSpace: 'nowrap' }}>
                          📤 Subir / Cambiar Foto
                          <input type="file" style={{ display: 'none' }} accept="image/*" onChange={(e) => handleFileUpload(e, (url) => updateSlide({ imageUrl: url }))} />
                        </label>
                      </div>

                      <div
                        className="carousel-preview"
                        style={{
                          backgroundImage: currentSlide.imageUrl ? `url(${currentSlide.imageUrl})` : undefined,
                          backgroundPosition: posMap[currentSlide.desktopPosition] || 'center center',
                        }}
                      >
                        {!currentSlide.imageUrl && <span>Vista previa aparecerá aquí</span>}
                      </div>

                      <div style={{ marginTop: '18px', display: 'grid', gap: '15px' }}>
                        <div>
                          <label className="premium-label" style={{ fontSize: '0.7rem', marginBottom: '5px', display: 'block' }}>URL DE IMAGEN (1920×1080 RECOMENDADO)</label>
                          <input type="text" className="pjl-input" placeholder="https://..." value={currentSlide.imageUrl} onChange={e => updateSlide({ imageUrl: e.target.value })} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }} className="carousel-pos-grid">
                          <div>
                            <label className="premium-label" style={{ fontSize: '0.7rem', marginBottom: '5px', display: 'block' }}>📱 ENFOQUE EN CELULAR</label>
                            <select className="pjl-input" value={currentSlide.mobilePosition} onChange={e => updateSlide({ mobilePosition: e.target.value })}>
                              <option>Centro (Default)</option><option>Top</option><option>Bottom</option><option>Left</option><option>Right</option>
                            </select>
                          </div>
                          <div>
                            <label className="premium-label" style={{ fontSize: '0.7rem', marginBottom: '5px', display: 'block' }}>💻 ENFOQUE EN COMPUTADORA</label>
                            <select className="pjl-input" value={currentSlide.desktopPosition} onChange={e => updateSlide({ desktopPosition: e.target.value })}>
                              <option>Centro (Default)</option><option>Top</option><option>Bottom</option><option>Left</option><option>Right</option>
                            </select>
                          </div>
                        </div>
                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                          💡 El enfoque controla qué parte de la foto se ve cuando la imagen se recorta. La vista previa usa el enfoque de computadora.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* GLOBAL HERO CONTENT CONFIGURATION */}
              <div style={{ marginTop: '34px', paddingTop: '28px', borderTop: '2px solid var(--gold-pale)' }}>
                <h4 className="serif" style={{ margin: '0 0 6px', color: 'var(--navy)', fontWeight: 800 }}>Textos Fijos del Hero</h4>
                <p style={{ margin: '0 0 18px', fontSize: '12.5px', color: 'var(--text-muted)' }}>Estos textos se muestran sobre todas las fotos del carrusel.</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div>
                    <label className="premium-label" style={{ fontSize: '0.7rem', marginBottom: '5px', display: 'block' }}>ETIQUETA SUPERIOR (TAG)</label>
                    <input type="text" className="pjl-input" value={content.heroTag || ''} onChange={e => setContent({...content, heroTag: e.target.value})} />
                  </div>
                  <div>
                    <label className="premium-label" style={{ fontSize: '0.7rem', marginBottom: '5px', display: 'block' }}>TÍTULO (Soporta HTML)</label>
                    <input type="text" className="pjl-input" value={content.heroTitle || ''} onChange={e => setContent({...content, heroTitle: e.target.value})} />
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label className="premium-label" style={{ fontSize: '0.7rem', marginBottom: '5px', display: 'block' }}>DESCRIPCIÓN / TEXTO DE INTRODUCCIÓN</label>
                    <textarea className="pjl-input" rows={3} value={content.heroText || ''} onChange={e => setContent({...content, heroText: e.target.value})} />
                  </div>
                  <div>
                    <label className="premium-label" style={{ fontSize: '0.7rem', marginBottom: '5px', display: 'block' }}>TEXTO BOTÓN PRINCIPAL (Opcional)</label>
                    <input type="text" className="pjl-input" placeholder="ej. Conocer Estatuto" value={content.heroBtnText || ''} onChange={e => setContent({...content, heroBtnText: e.target.value})} />
                  </div>
                  <div>
                    <label className="premium-label" style={{ fontSize: '0.7rem', marginBottom: '5px', display: 'block' }}>LINK BOTÓN PRINCIPAL (Opcional)</label>
                    <input type="text" className="pjl-input" placeholder="ej. /estatuto o contacto" value={content.heroBtnLink || ''} onChange={e => setContent({...content, heroBtnLink: e.target.value})} />
                  </div>
                </div>
              </div>
            </div>
            );
          })()}

          {/* CAPILLAS */}
          {mod === 'capillas' && (
            <div className="animate-reveal pjl-card" style={{ padding: '40px' }}>
              <div className="admin-section-header admin-stack-mobile" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div className="admin-section-title-group">
                  <h3 className="serif admin-section-title" style={{ margin: 0 }}>Territorio y Comunidades</h3>
                  <p className="admin-section-desc">Administra las capillas, comunidades juveniles y la organización territorial de las 4 zonas pastorales.</p>
                </div>
                {capillasView === 'capillas' && (
                  <button className="btn-premium btn-premium-gold admin-section-action" onClick={() => openNew('capillas')}>+ REGISTRAR CAPILLA</button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
                <button
                  className={`btn-premium ${capillasView === 'capillas' ? 'btn-premium-gold' : 'btn-premium-outline'}`}
                  onClick={() => navigateMod('capillas', 'capillas')}
                  style={{ padding: '8px 14px', fontSize: '11px' }}
                >
                  ⛪ Gestión de Capillas
                </button>
                <button
                  className={`btn-premium ${capillasView === 'territorio' ? 'btn-premium-gold' : 'btn-premium-outline'}`}
                  onClick={() => navigateMod('capillas', 'territorio')}
                  style={{ padding: '8px 14px', fontSize: '11px' }}
                >
                  🗺️ Gestión de Territorio
                </button>
              </div>
              {capillasView === 'capillas' && (
              <>
              {/* RESUMEN RÁPIDO SINCRONIZADO */}
              <div className="cap-stats">
                <div className="cst-chip cst-a"><span className="cst-num">{chapels.length}</span><span className="cst-lab">Capillas</span></div>
                <div className="cst-chip cst-b"><span className="cst-num">{chapels.filter(c => c.estadoComunidad === 'Activo').length}</span><span className="cst-lab">Activas</span></div>
                <div className="cst-chip cst-c"><span className="cst-num">{chapels.filter(c => c.estadoComunidad !== 'Activo').length}</span><span className="cst-lab">Nucleación</span></div>
                <div className="cst-chip cst-d"><span className="cst-num">{unplacedChapels.length}</span><span className="cst-lab">Sin GPS</span></div>
              </div>

              {/* TOOLBAR CON FILTROS SINCRONIZADOS */}
              <div className="cap-toolbar">
                <div className="ct-search">
                  <span className="ct-search-ico">🔍</span>
                  <input
                    type="text"
                    placeholder="Buscar por nombre o zona…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  {searchTerm && (
                    <button className="ct-clear" onClick={() => setSearchTerm('')} title="Limpiar búsqueda">✕</button>
                  )}
                </div>
                <div className="ct-zones">
                  <button
                    className={`cz-chip ${capZoneFilter === 'all' ? 'on' : ''}`}
                    onClick={() => setCapZoneFilter('all')}
                  >Todas</button>
                  {([1, 2, 3, 4] as const).map(z => (
                    <button
                      key={z}
                      className={`cz-chip ${capZoneFilter === z ? 'on' : ''}`}
                      style={capZoneFilter === z ? { background: zonaColor(z), borderColor: zonaColor(z), color: '#fff' } : undefined}
                      onClick={() => setCapZoneFilter(capZoneFilter === z ? 'all' : z)}
                    >
                      <i className="cz-dot" style={{ background: zonaColor(z) }} />Zona {z}
                    </button>
                  ))}
                </div>
                <div className="ct-estados">
                  {(['all', 'Activo', 'Nucleación', 'sinGPS'] as const).map(e => (
                    <button
                      key={e}
                      className={`ce-chip ${capEstadoFilter === e ? 'on' : ''}`}
                      onClick={() => setCapEstadoFilter(e)}
                    >{e === 'all' ? 'Todos' : e === 'sinGPS' ? '⚠ Sin GPS' : e}</button>
                  ))}
                </div>
                <span className="ct-count">{filteredChapels.length} de {chapels.length} capillas</span>
              </div>

              {/* GRID DE TARJETAS */}
              <div className="cap-grid">
                {filteredChapels.map((c, i) => {
                  const zc = zonaColor(c.zonaId);
                  const hasGps = typeof c.lat === 'number' && typeof c.lng === 'number';
                  return (
                    <div key={c.id} className="cap-card" style={{ '--zc': zc, '--d': `${Math.min(i, 12) * 45}ms` } as CSSProperties}>
                      <div className="cc-head">
                        <div className="cc-logo">
                          {c.logoUrl ? <SafeImg src={c.logoUrl} alt={`Logo de la Capilla ${c.name}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span>⛪</span>}
                        </div>
                        <div className="cc-tit">
                          <h4>{c.name}</h4>
                          <span className="cc-zbadge" style={{ background: zc }}>ZONA {c.zonaId}</span>
                        </div>
                        <button
                          title="Cambiar estado de la comunidad"
                          className={`cc-estado ${c.estadoComunidad === 'Activo' ? 'b-act' : 'b-nuc'}`}
                          onClick={() => toggleEstadoComunidad(c)}
                        >
                          {c.estadoComunidad}<i className="cc-swap">⇄</i>
                        </button>
                      </div>
                      <div className="cc-body">
                        <div className="cc-row"><span className="cc-k">Comunidad</span><span className="cc-v">{c.comunidadNombre || '—'}</span></div>
                        <div className="cc-row"><span className="cc-k">Dirección</span><span className="cc-v">{c.address || '—'}</span></div>
                        <div className="cc-row">
                          <span className="cc-k">Ubicación</span>
                          {hasGps
                            ? <span className="cc-coords">📌 {c.lat!.toFixed(4)}, {c.lng!.toFixed(4)}</span>
                            : <span className="cc-nogps">⚠ Sin ubicar</span>}
                        </div>
                      </div>
                      <div className="cc-actions">
                        <button className="ccb ccb-edit" onClick={() => openEdit('capillas', c)}>✏️ Editar<i>→</i></button>
                        {!hasGps && (
                          <button className="ccb ccb-place" onClick={() => goToTerritoryPlace(c.id)} title="Ubicar en el mapa de Territorio">📍 Ubicar</button>
                        )}
                        {hasGps && (
                          <button className="ccb ccb-target" onClick={() => centerMapOn(c)} title="Guardar como centro del mapa en toda la web">🎯 Centrar mapa</button>
                        )}
                        <button className="ccb ccb-del" onClick={() => deleteItem('chapels', c.id)} title="Eliminar capilla">🗑️</button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {filteredChapels.length === 0 && chapels.length > 0 && (
                <div className="pjl-empty-state" style={{ marginTop: '20px' }}>
                  <div className="empty-icon">🔍</div>
                  <h4 className="empty-title">Sin resultados</h4>
                  <p className="empty-desc">No hay capillas que coincidan con los filtros actuales. Probá limpiar la búsqueda.</p>
                  <button className="btn-premium btn-premium-outline" onClick={() => { setSearchTerm(''); setCapZoneFilter('all'); setCapEstadoFilter('all'); }}>
                    Limpiar filtros
                  </button>
                </div>
              )}

              {chapels.length === 0 && (
                <div className="pjl-empty-state" style={{ marginTop: '20px' }}>
                  <div className="empty-icon">⛪</div>
                  <h4 className="empty-title">Todavía no hay capillas registradas</h4>
                  <p className="empty-desc">Registrá la primera capilla para empezar a armar el mapa territorial de la pastoral.</p>
                  <button className="btn-premium btn-premium-gold" onClick={() => openNew('capillas')}>+ Registrar primera capilla</button>
                </div>
              )}

              {/* MAPA GENERAL CON LEYENDA */}
              <div className="cap-mapwrap">
                <div className="cm-head">
                  <h4 className="serif">Mapa de Capillas</h4>
                  <div className="cm-legend">
                    {([1, 2, 3, 4] as const).map(z => (
                      <span key={z} className="cm-leg"><i style={{ background: zonaColor(z) }} />Zona {z} · {chapels.filter(c => c.zonaId === z).length}</span>
                    ))}
                  </div>
                </div>
                <div className="cm-shell">
                   <ZonaMap
                     chapels={chapels}
                     mapCenterLat={branding.mapCenterLat as number}
                     mapCenterLng={branding.mapCenterLng as number}
                     mapZoom={branding.mapZoom as number}
                     zoneColors={{
                       1: branding.zona1Color as string,
                       2: branding.zona2Color as string,
                       3: branding.zona3Color as string,
                       4: branding.zona4Color as string,
                     }}
                     polygons={{
                       1: branding.zona1Polygon as [number, number][],
                       2: branding.zona2Polygon as [number, number][],
                       3: branding.zona3Polygon as [number, number][],
                       4: branding.zona4Polygon as [number, number][],
                     }}
                   />
                </div>
              </div>
              </>
              )}
            </div>
          )}
          {/* ACTIVIDADES */}
{mod === 'actividades' && (() => {
  const ACT_CATS = ['Todos', 'Formación', 'Liturgia', 'Organización', 'Social'];
  const ACT_CAT_COLOR: Record<string, string> = {
    'Formación': '#C8973A',
    'Liturgia': '#7C3AED',
    'Organización': '#2563EB',
    'Social': '#059669',
  };
  const acNormKey = (d: Date) => `${d.getFullYear()}-${acPad2(d.getMonth() + 1)}-${acPad2(d.getDate())}`;
  const acToday = new Date();
  const acTodayKey = `${acToday.getFullYear()}-${acPad2(acToday.getMonth() + 1)}-${acPad2(acToday.getDate())}`;

  const baseFiltered = activities.filter(a =>
    !searchTerm ||
    (a.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (a.category || '').toLowerCase().includes(searchTerm.toLowerCase())
  );
  const filteredActs = actSelDate === 'all'
    ? baseFiltered
    : baseFiltered.filter(a => { const d = new Date(a.date); return !isNaN(d.getTime()) && acNormKey(d) === actSelDate; });
  const sortedActs = [...filteredActs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const upCount = activities.filter(a => { const t = new Date(a.date).getTime(); return !isNaN(t) && t >= new Date(acTodayKey).getTime(); }).length;
  const monthCount = activities.filter(a => {
    const d = new Date(a.date);
    return !isNaN(d.getTime()) && d.getMonth() === acToday.getMonth() && d.getFullYear() === acToday.getFullYear();
  }).length;
  const inscCount = activities.filter(a => a.inscription).length;

  const toggleActivo = (a: Activity) => {
    setActivities(activities.map(x => x.id === a.id ? { ...x, active: !x.active } : x));
    showToast(a.active ? `«${a.title}» marcada como pasada` : `«${a.title}» reactivada`);
    addLog('cambiar estado actividad', 'actividades', `${a.title} → ${a.active ? 'pasada' : 'activa'}`);
  };

  return (
    <div className="animate-reveal" style={{ maxWidth: '1180px', margin: '0 auto' }}>
      <div className="admin-section-header admin-stack-mobile" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px', flexWrap: 'wrap', gap: '14px' }}>
        <div className="admin-section-title-group">
          <h3 className="serif admin-section-title" style={{ margin: 0 }}>Agenda Pastoral</h3>
          <p className="admin-section-desc">Todo lo que registres aquí aparece al instante en la agenda pública del sitio.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            className="btn-premium btn-premium-outline"
            style={{ borderColor: 'rgba(239,68,68,0.5)', color: '#EF4444', padding: '10px 16px', fontSize: '11px' }}
            onClick={deleteAllActivities}
          >BORRAR TODO</button>
          <button className="btn-premium btn-premium-gold" onClick={() => openNew('actividades')}>+ NUEVA ACTIVIDAD</button>
        </div>
      </div>

      {/* ESTADISTICAS */}
      <div className="act-stats">
        <div className="act-stat"><b>{activities.length}</b><span>Total actividades</span></div>
        <div className="act-stat as-up"><b>{upCount}</b><span>Próximas</span></div>
        <div className="act-stat as-month"><b>{monthCount}</b><span>Este mes</span></div>
        <div className="act-stat as-insc"><b>{inscCount}</b><span>Con inscripción</span></div>
      </div>

      {/* CALENDARIO + LISTA */}
      <div className="act-layout">
        <div className="act-calcard">
          <h4 className="cf-h" style={{ marginBottom: '12px' }}>📅 Calendario de la agenda</h4>
          <AdminActCalendar items={activities} value={actSelDate} onChange={setActSelDate} />
          <p className="act-calhint">Clic en un día para filtrar · clic de nuevo para ver todo</p>
          {actSelDate !== 'all' && (
            <button className="act-clearsel" onClick={() => setActSelDate('all')}>
              ✕ Quitar filtro del día
            </button>
          )}
        </div>

        <div className="act-listcol">
          <div className="admin-chip-scroll" style={{ display: 'flex', gap: '7px', overflowX: 'auto', paddingBottom: '4px', marginBottom: '16px' }}>
            {ACT_CATS.map(cat => (
              <button
                key={cat}
                onClick={() => setSearchTerm(cat === 'Todos' ? '' : cat)}
                className={`act-catpill ${cat !== 'Todos' && ACT_CAT_COLOR[cat] && searchTerm === cat ? 'on' : ''} ${cat === 'Todos' && !searchTerm ? 'on' : ''}`}
                style={cat !== 'Todos' && searchTerm === cat && ACT_CAT_COLOR[cat] ? { background: ACT_CAT_COLOR[cat], borderColor: ACT_CAT_COLOR[cat], color: '#fff' } : undefined}
              >{cat.toUpperCase()}</button>
            ))}
            {searchTerm && !ACT_CATS.slice(1).includes(searchTerm) && (
              <span className="act-searchchip">🔍 «{searchTerm}»</span>
            )}
          </div>

          {sortedActs.length === 0 ? (
            <div className="act-empty">
              <span className="ae-ico">{activities.length === 0 ? '🗓️' : '🔍'}</span>
              <h4>{activities.length === 0 ? 'La agenda está vacía' : 'Sin resultados'}</h4>
              <p>
                {activities.length === 0
                  ? 'Creá la primera actividad y aparecerá automáticamente en el calendario público.'
                  : actSelDate !== 'all'
                    ? 'No hay actividades ese día. Probá con otra fecha o quitá el filtro.'
                    : `Nada coincide con «${searchTerm}».`}
              </p>
              {activities.length === 0 && (
                <button className="btn-premium btn-premium-gold" style={{ marginTop: '14px' }} onClick={() => openNew('actividades')}>+ Agregar actividad</button>
              )}
            </div>
          ) : (
            <div className="act-list">
              {sortedActs.map((a, i) => {
                const d = new Date(a.date);
                const valid = !isNaN(d.getTime());
                const upcoming = valid && acNormKey(d) >= acTodayKey;
                const catColor = ACT_CAT_COLOR[a.category] || '#C8973A';
                return (
                  <article key={a.id} className={`act-card ${a.active ? '' : 'past'}`} style={{ '--ad': `${Math.min(i, 10) * 50}ms` } as CSSProperties}>
                    <div className="act-datebadge" aria-hidden="true">
                      <b>{valid ? d.getDate() : '?'}</b>
                      <small>{valid ? AC_MONTHS[d.getMonth()].slice(0, 3) : '—'}</small>
                    </div>
                    <div className="act-body">
                      <div className="act-toprow">
                        <span className="act-status" style={upcoming ? undefined : { background: 'rgba(26,39,68,0.06)', color: '#8A8477' }}>
                          {upcoming ? '● PRÓXIMA' : '○ PASADA'}
                        </span>
                        <span className="act-catchip" style={{ background: `${catColor}18`, color: catColor, borderColor: `${catColor}45` }}>
                          {a.category || 'Sin categoría'}
                        </span>
                        {a.inscription && <span className="act-inscchip">Inscripción</span>}
                        {!a.active && <span className="act-offchip">Oculta en web</span>}
                      </div>
                      <h5>{a.title || 'Sin título'}</h5>
                      {a.description && <p>{a.description}</p>}
                      <div className="act-actions">
                        <button className="abtn ab-edit" onClick={() => openEdit('actividades', a)} title="Editar">✏️<em>Editar</em></button>
                        <button
                          className={`abtn ab-toggle ${a.active ? 'on' : ''}`}
                          onClick={() => toggleActivo(a)}
                          title={a.active ? 'Marcar como pasada (oculta en web)' : 'Reactivar'}
                        >
                          <i>{a.active ? '👁️' : '🚫'}</i><em>{a.active ? 'Visible' : 'Oculta'}</em>
                        </button>
                        {a.calendarUrl && (
                          <a className="abtn ab-gcal" href={a.calendarUrl} target="_blank" rel="noreferrer" title="Ver en Google Calendar">＋<em>G-Cal</em></a>
                        )}
                        <button className="abtn ab-del" onClick={() => deleteItem('activities', a.id)} title="Eliminar">🗑️</button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
})()}

          {/* DOCUMENTOS */}
          {mod === 'documentos' && (
            <div className="animate-reveal pjl-card" style={{ padding: '40px' }}>
              <div style={{ display: 'grid', gap: '24px', marginBottom: '30px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  <div>
                    <h3 className="serif" style={{ margin: 0, color: 'var(--navy)' }}>Centro de Descargas</h3>
                    <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: '13px' }}>Un área más clara, útil y elegante para organizar PDFs, imágenes, Word y materiales internos.</p>
                  </div>
                  <button className="btn-premium btn-premium-gold" onClick={() => openNew('documentos')}>+ REGISTRAR ARCHIVO</button>
                </div>
              <div className="docs-admin-summary-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr repeat(3, minmax(0, 1fr))', gap: '16px' }}>
                  <div style={{ padding: '22px', borderRadius: '22px', background: 'linear-gradient(135deg, var(--navy), var(--navy-light))', color: '#fff', boxShadow: '0 18px 35px rgba(26,39,68,0.14)' }}>
                    <div style={{ fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase', opacity: 0.75, marginBottom: '10px' }}>Biblioteca activa</div>
                    <div className="serif" style={{ fontSize: '2rem', lineHeight: 1, marginBottom: '8px' }}>{docs.length}</div>
                    <div style={{ fontSize: '13px', opacity: 0.82 }}>documentos listos para descarga o consulta</div>
                  </div>
                  <div style={{ padding: '18px', borderRadius: '22px', background: '#fff', border: '1px solid var(--gold-pale)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: '8px' }}>Más descargado</div>
                    <div style={{ color: 'var(--navy)', fontWeight: 800, fontSize: '14px', lineHeight: 1.4 }}>{[...docs].sort((a, b) => (b.downloads || 0) - (a.downloads || 0))[0]?.name || 'Sin datos aún'}</div>
                  </div>
                  <div style={{ padding: '18px', borderRadius: '22px', background: '#fff', border: '1px solid var(--gold-pale)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: '8px' }}>Categorías</div>
                    <div style={{ color: 'var(--navy)', fontWeight: 800, fontSize: '28px', lineHeight: 1 }}>{new Set(docs.map(d => d.category || 'General')).size}</div>
                  </div>
                  <div style={{ padding: '18px', borderRadius: '22px', background: '#fff', border: '1px solid var(--gold-pale)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: '8px' }}>Con vista previa</div>
                    <div style={{ color: 'var(--navy)', fontWeight: 800, fontSize: '28px', lineHeight: 1 }}>{docs.filter(d => !!d.url).length}</div>
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '20px' }}>
                {docs.map(d => {
                  const presentation = getDocPresentation(d);
                  const previewable = canPreviewInFrame(d);

                  return (
                    <div key={d.id} className="pjl-card hover-lift" style={{ padding: '0', border: '1px solid var(--gold-pale)', display: 'flex', flexDirection: 'column', gap: '0', background: '#fff', overflow: 'hidden' }}>
                      <div style={{ padding: '18px', background: 'linear-gradient(135deg, rgba(200,151,58,0.08), rgba(26,39,68,0.04))', borderBottom: '1px solid rgba(200,151,58,0.14)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                          <div style={{ width: '54px', height: '54px', borderRadius: '14px', background: `${presentation.color}15`, color: presentation.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px' }}>
                            {presentation.icon}
                          </div>
                          <button onClick={() => deleteItem('docs', d.id)} style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#b91c1c', width: '30px', height: '30px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', cursor: 'pointer', transition: '0.2s' }} title="Eliminar documento">×</button>
                        </div>
                      </div>
                      <div style={{ padding: '18px', display: 'grid', gap: '14px', flex: 1 }}>
                        <div>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                            <span style={{ background: '#f8fafc', padding: '4px 9px', borderRadius: '999px', fontSize: '10px', fontWeight: 800, color: presentation.color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{presentation.label}</span>
                            <span style={{ background: 'var(--cream)', padding: '4px 9px', borderRadius: '999px', fontSize: '10px', fontWeight: 700, color: 'var(--navy)' }}>{d.category || 'General'}</span>
                          </div>
                          <h4 style={{ margin: '0 0 8px', color: 'var(--navy)', fontSize: '15px', fontWeight: 800, lineHeight: 1.35 }}>{d.name}</h4>
                          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.7 }}>{d.description || 'Documento institucional listo para ser consultado desde la biblioteca pastoral.'}</p>
                        </div>
                        <div style={{ borderRadius: '16px', border: '1px solid #f0ece4', background: '#fcfcfb', overflow: 'hidden' }}>
                          {previewable && d.url ? (
                            presentation.kind === 'image' ? (
                              <img src={d.url} alt={d.name} style={{ width: '100%', height: '150px', objectFit: 'cover', display: 'block' }} />
                            ) : (
                              <iframe src={d.url} title={d.name} style={{ width: '100%', height: '150px', border: 'none', display: 'block', background: '#fff' }} />
                            )
                          ) : (
                            <div style={{ height: '150px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '10px', color: presentation.color, background: 'linear-gradient(135deg, rgba(248,250,252,0.95), rgba(255,255,255,1))' }}>
                              <div style={{ fontSize: '34px' }}>{presentation.icon}</div>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>Vista previa disponible al vincular archivo</div>
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px', fontSize: '11px' }}>
                          <div style={{ padding: '10px 12px', background: 'var(--cream)', borderRadius: '12px' }}>
                            <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>Formato</div>
                            <div style={{ color: 'var(--navy)', fontWeight: 800 }}>{d.type || 'DOC'}</div>
                          </div>
                          <div style={{ padding: '10px 12px', background: 'var(--cream)', borderRadius: '12px' }}>
                            <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>Tamaño</div>
                            <div style={{ color: 'var(--navy)', fontWeight: 800 }}>{d.size || '0 KB'}</div>
                          </div>
                          <div style={{ padding: '10px 12px', background: 'var(--cream)', borderRadius: '12px' }}>
                            <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>Subido</div>
                            <div style={{ color: 'var(--navy)', fontWeight: 800 }}>{d.uploadedAt || '-'}</div>
                          </div>
                        </div>
                        <div style={{ marginTop: 'auto', paddingTop: '4px', borderTop: '1px solid #f0ece4', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                          <div style={{ fontSize: '12px', color: 'var(--navy)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '16px', color: 'var(--gold)' }}>📥</span>
                            <span>{d.downloads || 0} <span style={{ fontWeight: 400, color: '#888' }}>descargas</span></span>
                          </div>
                          <button onClick={() => openEdit('documentos', d)} className="btn-premium btn-premium-gold" style={{ padding: '6px 14px', fontSize: '10px', borderRadius: '8px' }}>
                            EDITAR
                          </button>
                        </div>
                      </div>
                     </div>
                   );
                 })}
                 {docs.length === 0 && (
                   <div className="pjl-empty-state" style={{ gridColumn: '1 / -1' }}>
                     <div className="empty-icon">📚</div>
                     <h4 className="empty-title">La biblioteca está vacía</h4>
                     <p className="empty-desc">Registrá el primer archivo para que quede disponible en el centro de descargas del sitio público.</p>
                     <button className="btn-premium btn-premium-gold" onClick={() => openNew('documentos')}>+ Registrar archivo</button>
                   </div>
                 )}
               </div>
             </div>
           )}

          {/* PERFILES */}
          {mod === 'perfiles' && (() => {
            const teamMeta: Record<string, { label: string; icon: string }> = {
              coordinacion: { label: 'Coordinación', icon: '⛪' },
              efo: { label: 'EFO', icon: '🎓' },
              ecomu: { label: 'ECOMU', icon: '📡' },
              eli: { label: 'ELI', icon: '🕊️' },
              mmpjl: { label: 'Música', icon: '🎵' },
              zona1: { label: 'Zona 1', icon: '📍' },
              zona2: { label: 'Zona 2', icon: '📍' },
              zona3: { label: 'Zona 3', icon: '📍' },
              zona4: { label: 'Zona 4', icon: '📍' },
            };
            const teamProfiles = profiles.filter(p => p.teamKey === activeProfileTeam);
            return (
            <div className="animate-reveal pjl-card" style={{ padding: '40px' }}>
              <div className="admin-section-header admin-stack-mobile" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
                <div className="admin-section-title-group">
                  <h3 className="serif admin-section-title" style={{ margin: 0 }}>Gestión de Currículos y Perfiles</h3>
                  <p className="admin-section-desc">Armá el consejo pastoral: foto, cargo, historia y CV de cada integrante. Todo se publica automáticamente en la sección Consejo del sitio.</p>
                </div>
                <button
                  className="btn-premium btn-premium-gold admin-section-action"
                  onClick={() => {
                    const newProfile: MemberProfile = {
                      id: Date.now(),
                      name: 'Nuevo Miembro',
                      role: 'Cargo',
                      bio: 'Biografía',
                      quote: '',
                      teamKey: activeProfileTeam,
                      photo: '',
                      birthday: ''
                    };
                    setProfiles([...profiles, newProfile]);
                    showToast('Miembro agregado ✔');
                  }}
                >
                  + Agregar Miembro
                </button>
              </div>

              {/* SELECTOR DE EQUIPOS */}
              <div className="profile-teams-bar custom-scrollbar admin-chip-scroll">
                {Object.entries(teamMeta).map(([tk, meta]) => {
                  const count = profiles.filter(x => x.teamKey === tk).length;
                  const active = activeProfileTeam === tk;
                  return (
                    <button
                      key={tk}
                      onClick={() => setActiveProfileTeam(tk)}
                      className={`profile-team-tab ${active ? 'active' : ''}`}
                    >
                      <span className="profile-team-icon">{meta.icon}</span>
                      <span>{meta.label}</span>
                      <span className="profile-team-count">{count}</span>
                    </button>
                  );
                })}
              </div>

              {/* GRILLA DE MIEMBROS */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 400px), 1fr))', gap: '25px' }}>
                {teamProfiles.map((p, idx) => (
                  <div key={p.id} className="pjl-card profile-member-card" style={{ animationDelay: `${idx * 80}ms` }}>
                    <button
                      className="profile-delete-btn"
                      onClick={() => {
                        if (confirm(`¿Seguro que deseas eliminar a ${p.name}?`)) {
                          setProfiles(profiles.filter(x => x.id !== p.id));
                          showToast('Miembro eliminado ✖');
                        }
                      }}
                      style={{ position: 'absolute', top: '16px', right: '16px' }}
                    >
                      🗑 Eliminar
                    </button>

                    <div className="profile-photo-wrap" style={{ position: 'relative', width: '124px', flexShrink: 0 }}>
                      <div className="profile-photo-ring">
                        <div className="profile-photo-inner">
                          {p.photo ? <img src={p.photo} alt={p.name} /> : '👤'}
                        </div>
                      </div>
                      <label className="profile-camera-badge" title="Cambiar foto" style={{ position: 'absolute', bottom: '-2px', right: '-2px' }}>
                        📷
                        <input type="file" style={{ display: 'none' }} accept="image/*" onChange={(e) => handleFileUpload(e, (url) => { setProfiles(profiles.map(x => x.id === p.id ? {...x, photo: url} : x)); showToast('Foto guardada ✔'); })} />
                      </label>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="profile-head-row">
                        <input
                          className="pjl-input profile-name-input"
                          value={p.name}
                          onChange={e => setProfiles(profiles.map(x => x.id === p.id ? { ...x, name: e.target.value } : x))}
                          placeholder="Nombre del Miembro"
                        />
                        <input
                          className="pjl-input profile-role-input"
                          value={p.role}
                          onChange={e => setProfiles(profiles.map(x => x.id === p.id ? { ...x, role: e.target.value } : x))}
                          placeholder="Rol o Cargo"
                        />
                      </div>
                      <label className="profile-birthday-label" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', margin: '12px 0 5px', fontWeight: 700, letterSpacing: '0.4px' }}>
                        🎂 CUMPLEAÑOS <em style={{ fontStyle: 'normal', fontWeight: 500, color: '#9aa4ba' }}>(aparece como aviso en la campana)</em>
                      </label>
                      <input
                        type="date"
                        className="pjl-input profile-birthday-input"
                        value={p.birthday || ''}
                        onChange={e => setProfiles(profiles.map(x => x.id === p.id ? { ...x, birthday: e.target.value } : x))}
                      />
                      <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', margin: '14px 0 5px', fontWeight: 700, letterSpacing: '0.4px' }}>HISTORIAL PASTORAL</label>
                      <textarea
                        className="pjl-input profile-bio-input"
                        value={p.bio}
                        onChange={e => setProfiles(profiles.map(x => x.id === p.id ? { ...x, bio: e.target.value } : x))}
                        placeholder="Contá el recorrido pastoral del miembro..."
                      />
                      <div className={`profile-cv-box ${p.cvUrl ? 'loaded' : ''}`}>
                        <span className="profile-cv-icon">{p.cvUrl ? '✅' : '📄'}</span>
                        <span className="profile-cv-info">
                          <strong>Currículum Pastoral</strong>
                          <small>{p.cvUrl ? 'Archivo cargado y visible en el sitio' : 'PDF o Word · opcional'}</small>
                        </span>
                        <label className="btn-premium btn-premium-outline profile-cv-btn">
                          {p.cvUrl ? 'CAMBIAR' : 'SUBIR'}
                          <input type="file" style={{ display: 'none' }} accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => handleFileUpload(e, (url) => { setProfiles(profiles.map(x => x.id === p.id ? {...x, cvUrl: url} : x)); showToast('CV guardado ✔'); })} />
                        </label>
                        {p.cvUrl && (
                          <button className="profile-cv-remove" title="Quitar CV" onClick={() => setProfiles(profiles.map(x => x.id === p.id ? {...x, cvUrl: ''} : x))}>×</button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {teamProfiles.length === 0 && (
                  <div className="pjl-empty-state" style={{ gridColumn: '1 / -1' }}>
                    <div className="empty-icon">👤</div>
                    <h4 className="empty-title">Sin miembros en este equipo</h4>
                    <p className="empty-desc">Cargá al primer integrante con su foto, cargo y currículum. Aparecerá automáticamente en la sección Consejo del sitio.</p>
                    <button className="btn-premium btn-premium-gold" onClick={() => {
                      const newProfile: MemberProfile = {
                        id: Date.now(),
                        name: 'Nuevo Miembro',
                        role: 'Cargo',
                        bio: 'Biografía',
                        quote: '',
                        teamKey: activeProfileTeam,
                        photo: ''
                      };
                      setProfiles([...profiles, newProfile]);
                      showToast('Miembro agregado ✔');
                    }}>+ Agregar primer miembro</button>
                  </div>
                )}
              </div>
            </div>
            );
          })()}


          {/* USUARIOS */}
          {mod === 'usuarios' && (() => {
            const roleMeta: Record<string, { label: string; color: string; bg: string }> = {
              desarrollador: { label: 'Desarrollador', color: '#7c3aed', bg: 'rgba(124,58,237,0.12)' },
              superadmin: { label: 'Super Admin', color: '#b45309', bg: 'rgba(200,151,58,0.18)' },
              editor: { label: 'Editor', color: '#8a6516', bg: 'rgba(200,151,58,0.12)' },
              viewer: { label: 'Visualizador', color: '#475569', bg: 'rgba(71,85,105,0.12)' },
            };
            const statusMeta: Record<string, { label: string; color: string; bg: string }> = {
              activo: { label: 'Activo', color: '#166534', bg: '#dcfce7' },
              inactivo: { label: 'Bloqueado', color: '#991b1b', bg: '#fee2e2' },
              pendiente: { label: 'Pendiente', color: '#92400e', bg: '#fef3c7' },
            };
            const filteredUsers = allUsers.filter(u =>
              u.name.toLowerCase().includes(searchTerm.toLowerCase()) || u.email.toLowerCase().includes(searchTerm.toLowerCase())
            );
            return (
            <div className="animate-reveal pjl-card" style={{ padding: '40px' }}>
              <div className="admin-section-header admin-stack-mobile" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '26px', flexWrap: 'wrap', gap: '16px' }}>
                <div className="admin-section-title-group">
                  <h3 className="serif admin-section-title" style={{ margin: 0 }}>Gestión de Acceso</h3>
                  <p className="admin-section-desc">Creá cuentas, definí roles y habilitá módulos específicos. Los cambios se sincronizan al instante con la cuenta de cada usuario.</p>
                </div>
                <div className="admin-toolbar" style={{ marginBottom: 0 }}>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
                    <input
                      type="text"
                      placeholder="Buscar usuario..."
                      className="pjl-input"
                      style={{ paddingLeft: '35px', width: '230px', height: '40px' }}
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <button className="btn-premium btn-premium-gold" onClick={() => {
                    setForm({ email: '', name: '', role: 'editor', permissions: ['dashboard'] });
                    setModal('usuarios');
                  }}>+ Nuevo Usuario</button>
                </div>
              </div>

              {currentUser?.role === 'desarrollador' && (
                <div className="pjl-card admin-user-pending-card" style={{ padding: '22px 24px', marginBottom: '24px', background: 'linear-gradient(135deg, #fdf7e8, #fffdf5)', border: '1.5px dashed #e9c96a' }}>
                  <h4 className="serif" style={{ margin: '0 0 14px', color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    ⏳ Solicitudes pendientes
                    {pendingProfiles.length > 0 && (
                      <span className="user-count-pill">{pendingProfiles.length}</span>
                    )}
                  </h4>
                  {pendingProfiles.length === 0 ? (
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>No hay cuentas esperando aprobación. Todo al día ✨</p>
                  ) : (
                    <div style={{ display: 'grid', gap: '12px' }}>
                      {pendingProfiles.map((profile, i) => (
                        <div key={profile.id} className="admin-user-pending-item user-rise" style={{ padding: '14px 16px', borderRadius: '14px', background: '#fff', border: '1px solid #f1d77b', animationDelay: `${i * 70}ms` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                              <div className="user-avatar">{profile.name[0]}</div>
                              <div style={{ minWidth: 0 }}>
                                <strong>{profile.name}</strong> <span style={{ color: '#666', fontSize: '12px' }}>{profile.email}</span>
                                <div style={{ fontSize: '11px', color: '#777', marginTop: '4px' }}>Registrado el {profile.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'}</div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              <button
                                className="btn-premium btn-premium-outline"
                                style={{ padding: '8px 14px', fontSize: '11px' }}
                                onClick={() => void handleResendVerification(profile.email, profile.name)}
                                title="Reenviar correo de verificación"
                              >
                                ✉️ Reenviar
                              </button>
                              <button
                                className="btn-premium btn-premium-gold"
                                style={{ padding: '8px 14px', fontSize: '11px' }}
                                onClick={() => handleApproveProfile(profile.id)}
                              >
                                ✓ Aprobar cuenta
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="users-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 330px', gap: '28px', alignItems: 'start' }}>
                {/* LISTA DE USUARIOS */}
                <div className="users-grid">
                  {filteredUsers.map((u, i) => {
                    const role = roleMeta[u.role] || roleMeta.viewer;
                    const status = statusMeta[u.status || 'activo'] || statusMeta.activo;
                    const permCount = u.permissions?.filter(p => p !== 'dashboard').length || 0;
                    return (
                      <div key={u.id} className="user-card user-rise" style={{ animationDelay: `${i * 70}ms` }}>
                        <div className="user-card-head">
                          <div className="user-avatar is-lg">{u.name[0]}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <strong className="user-card-name">{u.name}</strong>
                            <code className="user-card-email">{u.email}</code>
                          </div>
                          <span className="user-role-badge" style={{ color: role.color, background: role.bg }}>{role.label}</span>
                        </div>
                        <div className="user-card-meta">
                          <span className="user-status-pill" style={{ color: status.color, background: status.bg }}>● {status.label}</span>
                          <span className="user-perm-chip" title={u.permissions?.join(', ') || 'Sin módulos'}>🛡 {permCount} módulo{permCount === 1 ? '' : 's'}</span>
                          <span className="user-last-active">🕒 {u.lastActive ? new Date(u.lastActive).toLocaleDateString() : 'Sin actividad'}</span>
                        </div>
                        <div className="user-card-actions">
                          <button onClick={() => openEdit('usuarios', u)} className="btn-premium btn-premium-outline" style={{ padding: '7px 14px', fontSize: '10.5px' }}>✏️ Editar accesos</button>
                          <button onClick={() => void deleteItem('users', u.id)} className="user-delete-btn">🗑 Eliminar</button>
                        </div>
                      </div>
                    );
                  })}
                  {filteredUsers.length === 0 && (
                    <div className="pjl-empty-state">
                      <div className="empty-icon">🔍</div>
                      <h4 className="empty-title">Sin usuarios encontrados</h4>
                      <p className="empty-desc">Ningún usuario coincide con «{searchTerm}». Verificá el nombre o el correo.</p>
                    </div>
                  )}
                </div>

                {/* ROLE PERMISSIONS INFO */}
                <div className="pjl-card roles-info-card">
                  <h4 className="serif" style={{ color: 'var(--navy)', margin: '0 0 14px', borderBottom: '1px solid var(--gold-pale)', paddingBottom: '10px' }}>Permisos por Rol</h4>
                  <div style={{ display: 'grid', gap: '12px' }}>
                    {[
                      { icon: '👑', title: 'SUPERADMIN', color: '#b45309', desc: 'Acceso total: usuarios, configuración del sistema y branding.' },
                      { icon: '✏️', title: 'EDITOR', color: '#8a6516', desc: 'Crea y edita noticias, actividades, capillas y contenido general según los módulos habilitados.' },
                      { icon: '👁️', title: 'VIEWER', color: '#64748b', desc: 'Solo lectura de estadísticas y listados, limitado a los módulos asignados.' },
                    ].map((r, i) => (
                      <div key={r.title} className="roles-info-item user-rise" style={{ animationDelay: `${200 + i * 80}ms` }}>
                        <span className="roles-info-icon">{r.icon}</span>
                        <div>
                          <p style={{ fontWeight: 800, color: r.color, fontSize: '12px', margin: '0 0 4px' }}>{r.title}</p>
                          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>{r.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            );
          })()}

          {/* CONFIGURACIÓN */}
          {mod === 'configuracion' && (() => {
            const CFG_TABS = [
              { id: 'general', icon: '🏠', label: 'General' },
              { id: 'social', icon: '💬', label: 'Redes y Contacto' },
              { id: 'integraciones', icon: '🔌', label: 'Integraciones' },
              { id: 'visibilidad', icon: '👁️', label: 'Visibilidad' },
              { id: 'mantenimiento', icon: '🛠️', label: 'Mantenimiento' },
              { id: 'push', icon: '🔔', label: 'Notificaciones Push' },
            ] as const;
            const SOCIAL_META: Record<string, { icon: string; label: string; ph: string }> = {
              facebook: { icon: '📘', label: 'Facebook', ph: 'https://facebook.com/tu-pagina' },
              instagram: { icon: '📸', label: 'Instagram', ph: 'https://instagram.com/tu-cuenta' },
              youtube: { icon: '📺', label: 'YouTube', ph: 'https://youtube.com/@tu-canal' },
              tiktok: { icon: '🎵', label: 'TikTok', ph: 'https://tiktok.com/@tu-cuenta' },
              twitter: { icon: '🐦', label: 'X / Twitter', ph: 'https://x.com/tu-cuenta' },
            };
            const SECTION_META: Record<string, { icon: string; label: string; desc: string }> = {
              zonas: { icon: '🗺️', label: 'Zonas Pastorales', desc: 'Territorio, capillas y mapa interactivo' },
              consejo: { icon: '👥', label: 'Consejo', desc: 'Equipo de coordinación y áreas' },
              agenda: { icon: '📅', label: 'Agenda', desc: 'Actividades y calendario de eventos' },
              institucional: { icon: '🏛️', label: 'Institucional', desc: 'Misión, visión, líneas y documentos' },
              faq: { icon: '❓', label: 'Preguntas Frecuentes', desc: 'Ayuda rápida para visitantes' },
              contacto: { icon: '✉️', label: 'Contacto', desc: 'Formulario y datos de la sede' },
            };
            const waDigits = (content.whatsappNumber || '').replace(/[^\d]/g, '');
            const waOk = waDigits.length >= 9;
            const gaVal = (content.googleAnalyticsId || '').trim();
            const gaOk = !gaVal || /^G-[A-Z0-9]{5,}$/i.test(gaVal);
            const activeCount = Object.values(sections).filter(Boolean).length;
            const totalSections = Object.keys(sections).length;

            const guardarCfg = (nombre: string) => {
              showToast(`✔ ${nombre} guardado`);
              addLog('guardar configuración', 'sistema', nombre);
            };
            const descargarBackup = () => {
              const dump: Record<string, string | null> = {};
              for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith('pjl_')) dump[k] = localStorage.getItem(k);
              }
              const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `pjl-backup-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(url);
              showToast('📦 Backup descargado');
              addLog('respaldo de datos', 'sistema', `${Object.keys(dump).length} colecciones`);
            };
            const restaurarBackup = (file?: File | null) => {
              if (!file) return;
              if (!confirm(`¿Restaurar "${file.name}"? Se reemplazarán los datos actuales del sitio.`)) return;
              const reader = new FileReader();
              reader.onload = () => {
                try {
                  const obj = JSON.parse(String(reader.result)) as Record<string, unknown>;
                  const keys = Object.keys(obj).filter(k => k.startsWith('pjl_'));
                  if (!keys.length) { showToast('El archivo no contiene datos del sitio'); return; }
                  keys.forEach(k => {
                    const v = obj[k];
                    localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
                  });
                  keys.forEach(k => window.dispatchEvent(new CustomEvent('pjl_store_update', { detail: { key: k.replace('pjl_', '') } })));
                  showToast(`✅ ${keys.length} colecciones restauradas · recargando…`);
                  addLog('restaurar backup', 'sistema', file.name);
                  setTimeout(() => window.location.reload(), 1100);
                } catch {
                  showToast('Archivo inválido o corrupto');
                }
              };
              reader.readAsText(file);
            };

            return (
            <div className="animate-reveal" style={{ maxWidth: '1080px', margin: '0 auto' }}>
              <div className="admin-section-header" style={{ marginBottom: '20px' }}>
                <div className="admin-section-title-group">
                  <h3 className="serif admin-section-title" style={{ margin: 0 }}>Configuración del Sitio</h3>
                  <p className="admin-section-desc">Identidad, contacto, integraciones y mantenimiento — todo tu sitio web en un solo lugar.</p>
                </div>
                <span className="cf-livechip">● Cambios al instante</span>
              </div>

              <nav className="cf-tabs" role="tablist">
                {CFG_TABS.map(t => (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={cfgTab === t.id}
                    className={`cf-tab ${cfgTab === t.id ? 'on' : ''}`}
                    onClick={() => setCfgTab(t.id)}
                  >
                    <i>{t.icon}</i>{t.label}
                  </button>
                ))}
              </nav>

              {/* ===== GENERAL ===== */}
              {cfgTab === 'general' && (
                <div className="cf-grid cf-in">

                  <div className="cf-card">
                    <h4 className="cf-h">🏷️ Identidad en el navegador</h4>
                    <div className="form-group">
                      <label className="premium-label">NOMBRE DEL SITIO (PESTAÑA DEL NAVEGADOR)</label>
                      <input
                        className="pjl-input"
                        value={content.siteTitle || ''}
                        onChange={e => setContent({ ...content, siteTitle: e.target.value })}
                        placeholder="Pastoral Juvenil Luqueña"
                      />
                    </div>
                    {content.siteTitle?.trim() ? (
                      <div className="cf-tabprev" aria-hidden="true">
                        <span /><span /><span />
                        <em>{content.siteTitle.trim()} · PJL</em>
                      </div>
                    ) : null}

                    <div className="form-group" style={{ marginTop: '18px' }}>
                      <label className="premium-label">DESCRIPCIÓN PARA GOOGLE (META DESCRIPTION)</label>
                      <textarea
                        className="pjl-input"
                        rows={3}
                        style={{ resize: 'vertical' }}
                        maxLength={200}
                        value={content.siteDescription || ''}
                        onChange={e => setContent({ ...content, siteDescription: e.target.value })}
                        placeholder="Sitio oficial de la Pastoral Juvenil Luqueña: fe, comunidad y servicio con los jóvenes de Luque."
                      />
                      <p className={`cf-count ${(content.siteDescription || '').length > 160 ? 'warn' : ''}`}>
                        {(content.siteDescription || '').length}/160 caracteres recomendados
                      </p>
                    </div>

                    <button className="btn-premium btn-premium-gold cf-save" onClick={() => guardarCfg('Identidad del sitio')}>GUARDAR IDENTIDAD</button>
                  </div>

                  <div className="cf-card">
                    <h4 className="cf-h">🔧 Modo mantenimiento</h4>
                    <div className={`cf-maint ${content.maintenanceMode ? 'on' : ''}`}>
                      <div className="cf-maint-top">
                        <span className={`cf-mdot ${content.maintenanceMode ? 'on' : ''}`} />
                        <b>{content.maintenanceMode ? 'SITIO EN MANTENIMIENTO' : 'SITIO VISIBLE AL PÚBLICO'}</b>
                        <label className="pjl-switch" style={{ marginLeft: 'auto' }}>
                          <input
                            type="checkbox"
                            checked={!!content.maintenanceMode}
                            onChange={e => setContent({ ...content, maintenanceMode: e.target.checked })}
                          />
                          <span className="pjl-slider" />
                        </label>
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '10px 0 0' }}>
                        Al activarlo, los visitantes verán una pantalla informativa en lugar de la página principal.
                      </p>
                      {content.maintenanceMode && (
                        <>
                          <textarea
                            className="pjl-input"
                            rows={2}
                            style={{ marginTop: '14px', resize: 'vertical' }}
                            value={content.maintenanceMessage || ''}
                            onChange={e => setContent({ ...content, maintenanceMessage: e.target.value })}
                            placeholder="Mensaje personalizado para los visitantes…"
                          />
                          <p style={{ fontSize: '11px', marginTop: '8px', color: 'var(--gold)' }}>
                            Tip: abre <code>?preview=1</code> al final de la dirección para ver el sitio normal mientras dure el mantenimiento.
                          </p>
                        </>
                      )}
                    </div>
                    <button
                      className="btn-premium btn-premium-gold cf-save"
                      onClick={() => guardarCfg(content.maintenanceMode ? 'Modo mantenimiento ACTIVADO' : 'Modo mantenimiento desactivado')}
                    >GUARDAR MODO</button>
                  </div>
                </div>
              )}

              {/* ===== REDES Y CONTACTO ===== */}
              {cfgTab === 'social' && (
                <div className="cf-grid cf-in">

                  <div className="cf-card">
                    <h4 className="cf-h">🌐 Redes sociales</h4>
                    <div style={{ display: 'grid', gap: '14px' }}>
                      {Object.entries(social).map(([key, val]) => {
                        const meta = SOCIAL_META[key] || { icon: '🔗', label: key, ph: `https://${key}.com/…` };
                        return (
                          <div key={key} className="cf-srow">
                            <span title={meta.label}>{meta.icon}</span>
                            <input
                              className="pjl-input"
                              value={val as string}
                              placeholder={meta.ph}
                              onChange={e => setSocial({ ...social, [key]: e.target.value })}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <button className="btn-premium btn-premium-gold cf-save" onClick={() => guardarCfg('Redes sociales')}>GUARDAR REDES</button>
                  </div>

                  <div className="cf-card">
                    <h4 className="cf-h">📮 Contacto directo</h4>
                    <div style={{ display: 'grid', gap: '16px' }}>
                      <div className="form-group">
                        <label className="premium-label">WHATSAPP DE CONTACTO</label>
                        <input
                          className="pjl-input"
                          value={content.whatsappNumber || ''}
                          placeholder="+595 981 123 456"
                          onChange={e => setContent({ ...content, whatsappNumber: e.target.value })}
                        />
                        {waDigits ? (
                          <a
                            className={`cf-wa ${waOk ? '' : 'bad'}`}
                            href={waOk ? `https://wa.me/${waDigits}` : undefined}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {waOk ? '💬 Probar enlace de WhatsApp' : '⚠️ Número incompleto'}
                          </a>
                        ) : null}
                      </div>
                      <div className="form-group">
                        <label className="premium-label">EMAIL OFICIAL DE CONTACTO</label>
                        <input
                          className="pjl-input"
                          value={content.contactEmail || ''}
                          placeholder="info@pjlluque.org"
                          onChange={e => setContent({ ...content, contactEmail: e.target.value })}
                        />
                      </div>
                      <div className="form-group">
                        <label className="premium-label">DIRECCIÓN DE LA SEDE</label>
                        <input
                          className="pjl-input"
                          value={content.contactAddress || ''}
                          placeholder="Santuario Virgen del Rosario, Luque"
                          onChange={e => setContent({ ...content, contactAddress: e.target.value })}
                        />
                      </div>
                    </div>
                    <button className="btn-premium btn-premium-gold cf-save" onClick={() => guardarCfg('Datos de contacto')}>GUARDAR CONTACTO</button>
                  </div>
                </div>
              )}

              {/* ===== INTEGRACIONES ===== */}
              {cfgTab === 'integraciones' && (
                <div className="cf-card cf-in">
                  <h4 className="cf-h">🔌 Servicios externos y analítica</h4>
                  <div style={{ display: 'grid', gap: '18px' }}>

                    <div className="cf-trow">
                      <div>
                        <b>Widget del Vaticano</b>
                        <small>Noticias de Vatican News en el menú del sitio público</small>
                      </div>
                      <label className="pjl-switch">
                        <input
                          type="checkbox"
                          checked={!!branding.showVaticanWidget}
                          onChange={e => setBranding({ ...branding, showVaticanWidget: e.target.checked })}
                        />
                        <span className="pjl-slider" />
                      </label>
                    </div>

                    <div className="form-group">
                      <label className="premium-label">📅 CALENDARIO INSTITUCIONAL — IMPORTAR AGENDA (.ICS)</label>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 10px', lineHeight: '1.6' }}>
                        En Google Calendar: <b>Ajustes (⚙) → Importar y exportar → Exportar</b> y descargá el archivo
                        <b> .ics</b> con todos los eventos del año. Subilo acá y se pasan automáticamente al
                        calendario de la Agenda PJL. Si volvés a subir el mismo archivo, los eventos se actualizan
                        sin duplicarse.
                      </p>
                      <div className="ics-import-row">
                        <input
                          type="file"
                          accept=".ics,text/calendar,text/plain"
                          onChange={e => { setIcsFile(e.target.files?.[0] || null); setIcsResult(''); }}
                          className="pjl-input"
                          style={{ padding: '10px 12px', cursor: 'pointer' }}
                        />
                        <button
                          className="btn-premium btn-premium-gold"
                          style={{ padding: '10px 18px', borderRadius: '10px', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap' }}
                          onClick={importIcs}
                          disabled={icsImporting || !icsFile}
                        >
                          {icsImporting ? 'IMPORTANDO…' : '📥 SUBIR ARCHIVO'}
                        </button>
                      </div>
                      {icsResult && (
                        <p
                          style={{
                            marginTop: '8px',
                            fontSize: '12px',
                            fontWeight: 700,
                            color: icsResult.startsWith('No se pudo') ? '#b91c1c' : 'var(--navy)',
                          }}
                        >
                          {icsResult}
                        </p>
                      )}
                    </div>

                    <div className="form-group">
                      <label className="premium-label">GOOGLE ANALYTICS ID</label>
                      <div className="cf-inline">
                        <input
                          className="pjl-input"
                          value={content.googleAnalyticsId || ''}
                          placeholder="G-XXXXXXXXXX"
                          onChange={e => setContent({ ...content, googleAnalyticsId: e.target.value })}
                        />
                        {gaVal ? <span className={`cf-badge ${gaOk ? 'ok' : 'bad'}`}>{gaOk ? '\u2713 Formato correcto' : '\u2715 Debe iniciar con G-'}</span> : null}
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="premium-label">META PIXEL ID</label>
                      <input
                        className="pjl-input"
                        value={content.metaPixelId || ''}
                        placeholder="123456789012345"
                        onChange={e => setContent({ ...content, metaPixelId: e.target.value })}
                      />
                    </div>
                  </div>
                  <button className="btn-premium btn-premium-gold cf-save" onClick={() => guardarCfg('Integraciones')}>GUARDAR INTEGRACIONES</button>
                </div>
              )}

              {/* ===== VISIBILIDAD ===== */}
              {cfgTab === 'visibilidad' && (
                <div className="cf-card cf-in">
                  <h4 className="cf-h">👁️ Secciones visibles en el sitio público</h4>
                  <p className="cf-sub">Desactiva temporalmente secciones enteras sin borrar su contenido. <b>{activeCount} de {totalSections}</b> activas.</p>
                  <div className="cf-vgrid">
                    {Object.entries(sections).map(([key, val]) => {
                      const meta = SECTION_META[key] || { icon: '\u{1F4C4}', label: key, desc: '' };
                      return (
                        <div key={key} className={`cf-vrow ${val ? '' : 'off'}`}>
                          <span className="cfv-ico">{meta.icon}</span>
                          <div className="cfv-txt">
                            <b>{meta.label}</b>
                            <small>{meta.desc}</small>
                          </div>
                          <label className="pjl-switch">
                            <input
                              type="checkbox"
                              checked={val}
                              onChange={() => setSections({ ...sections, [key as keyof typeof sections]: !val })}
                            />
                            <span className="pjl-slider" />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                  <div className="cf-bar">
                    <button
                      className="btn-premium btn-premium-outline cf-mini"
                      onClick={() => { setSections(Object.fromEntries(Object.keys(sections).map(k => [k, true])) as unknown as typeof sections); showToast('Todas las secciones activadas'); }}
                    >ACTIVAR TODAS</button>
                    <button
                      className="btn-premium btn-premium-outline cf-mini"
                      onClick={() => { setSections(Object.fromEntries(Object.keys(sections).map(k => [k, false])) as unknown as typeof sections); showToast('Secciones desactivadas'); }}
                    >DESACTIVAR TODAS</button>
                  </div>
                </div>
              )}

              {/* ===== MANTENIMIENTO ===== */}
              {cfgTab === 'mantenimiento' && (
                <div className="cf-grid cf-in">

                  <div className="cf-card">
                    <h4 className="cf-h">📦 Respaldos</h4>
                    <div style={{ display: 'grid', gap: '14px' }}>
                      <div className="cf-mcard">
                        <b>Descargar backup completo</b>
                        <p>Copia de seguridad de todo el contenido del sitio en un archivo JSON.</p>
                        <button className="btn-premium btn-premium-gold" onClick={descargarBackup}>{'\u2B07'} DESCARGAR BACKUP</button>
                      </div>
                      <div className="cf-mcard">
                        <b>Restaurar desde backup</b>
                        <p>Sube un archivo JSON previamente descargado para recuperar los datos.</p>
                        <input
                          id="cfRestoreFile"
                          type="file"
                          accept=".json,application/json"
                          style={{ display: 'none' }}
                          onChange={e => { restaurarBackup(e.target.files?.[0]); e.target.value = ''; }}
                        />
                        <button className="btn-premium btn-premium-outline" onClick={() => document.getElementById('cfRestoreFile')?.click()}>{'\u2B06'} SELECCIONAR ARCHIVO</button>
                      </div>
                    </div>
                  </div>

                  <div className="cf-card">
                    <h4 className="cf-h">{'\u{1F5C2}\uFE0F'} Datos guardados</h4>
                    <div className="cf-dgrid">
                      {(['news', 'activities', 'faq', 'docs', 'gallery', 'profiles', 'users', 'chapels'] as const).map(k => {
                        let n = 0;
                        try { n = ((store[k].get as () => unknown[])()?.length) || 0; } catch { n = 0; }
                        const LABELS: Record<typeof k, string> = { news: 'Noticias', activities: 'Actividades', faq: 'FAQs', docs: 'Documentos', gallery: 'Galería', profiles: 'Perfiles', users: 'Usuarios', chapels: 'Capillas' };
                        return (
                          <div key={k} className="cf-dchip">
                            <b>{n}</b><span>{LABELS[k]}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="cf-mcard danger" style={{ marginTop: '14px' }}>
                      <b>Zona de riesgo</b>
                      <p>Pone en cero todos los contadores de visitas e interacciones. Esta acción no se puede deshacer.</p>
                      <button className="btn-premium btn-premium-outline" style={{ borderColor: '#ef4444', color: '#ef4444' }} onClick={resetStats}>REINICIAR ESTADÍSTICAS</button>
                    </div>
                  </div>
                </div>
              )}

              {cfgTab === 'push' && (
                <div className="cf-grid cf-in">
                  <div className="cf-card">
                    <h4 className="cf-h">🔐 Autorización del panel</h4>
                    <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                      Para evitar que cualquiera envíe avisos, generá un token de autorización. Se guarda en Supabase y
                      se usa para firmar los envíos y la configuración de claves.
                    </p>
                    {pushAdminToken ? (
                      <div className="cf-mcard" style={{ background: '#f0f4e8', borderColor: '#7bb661' }}>
                        <b>Token activo</b>
                        <code style={{ display: 'block', fontSize: '12px', wordBreak: 'break-all', marginTop: '6px' }}>
                          {pushAdminToken}
                        </code>
                        <p style={{ marginTop: '8px' }}>
                          {pushConfig?.count != null
                            ? `💡 ${pushConfig.count} dispositivo(s) suscripto(s) a los avisos.`
                            : 'Podés generar uno nuevo si perdiste el control anterior.'}
                        </p>
                      </div>
                    ) : (
                      <button
                        className="btn-premium btn-premium-gold"
                        style={{ width: '100%' }}
                        onClick={() => { genAdminToken().then(() => loadPushConfig()); }}
                      >
                        🔑 GENERAR TOKEN DE AUTORIZACIÓN
                      </button>
                    )}
                  </div>

                  <div className="cf-card">
                    <h4 className="cf-h">🔑 Claves VAPID (Web Push)</h4>
                    <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                      Android las necesita para suscribir los teléfonos. Generalas una sola vez; si las regenerás, los
                      teléfonos ya suscriptos dejarán de recibir avisos.
                    </p>
                    <div style={{ display: 'grid', gap: '12px' }}>
                      <label className="premium-label">CORREO/SITIO (subject)</label>
                      <input
                        className="pjl-input"
                        value={pushVapidKeys.subject}
                        onChange={e => setPushVapidKeys({ ...pushVapidKeys, subject: e.target.value })}
                        placeholder="mailto:pastoral@luque.edu.py"
                      />
                      <div className="cf-keybox">
                        <label className="premium-label">CLAVE PÚBLICA</label>
                        <textarea
                          className="pjl-input"
                          rows={2}
                          value={pushVapidKeys.publicKey}
                          onChange={e => setPushVapidKeys({ ...pushVapidKeys, publicKey: e.target.value.trim() })}
                          placeholder="Pegá la clave pública (si la tenés)"
                        />
                      </div>
                      <div className="cf-keybox">
                        <label className="premium-label">CLAVE PRIVADA</label>
                        <textarea
                          className="pjl-input"
                          rows={2}
                          value={pushVapidKeys.privateKey}
                          onChange={e => setPushVapidKeys({ ...pushVapidKeys, privateKey: e.target.value.trim() })}
                          placeholder="Pegá la clave privada (la guardamos en servidor)"
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button className="btn-premium btn-premium-gold" disabled={pushBusy || !pushAdminToken} onClick={() => saveVapid('generate')}>
                          {pushBusy ? '…' : '⚡ GENERAR CLAVES'}
                        </button>
                        <button
                          className="btn-premium btn-premium-outline"
                          disabled={pushBusy || !pushAdminToken || !pushVapidKeys.publicKey || !pushVapidKeys.privateKey}
                          onClick={() => saveVapid('save')}
                        >
                          💾 GUARDAR CLAVES
                        </button>
                      </div>
                      {pushConfig?.publicKey && (
                        <p style={{ fontSize: '11px', color: 'var(--gold)', wordBreak: 'break-all' }}>
                          ✅ Clave pública activa: {pushConfig.publicKey.slice(0, 60)}… 
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="cf-card" style={{ gridColumn: '1 / -1' }}>
                    <h4 className="cf-h">📣 Enviar aviso de último momento</h4>
                    <div style={{ display: 'grid', gap: '12px' }}>
                      <label className="premium-label">TÍTULO</label>
                      <input
                        className="pjl-input"
                        value={pushMsg.title}
                        onChange={e => setPushMsg({ ...pushMsg, title: e.target.value })}
                        placeholder="Ej: La misa de hoy cambia de horario"
                      />
                      <label className="premium-label">MENSAJE</label>
                      <textarea
                        className="pjl-input"
                        rows={3}
                        value={pushMsg.body}
                        onChange={e => setPushMsg({ ...pushMsg, body: e.target.value })}
                        placeholder="Ej: La misa de las 19:00 pasa a las 18:00. ¡Llegá antes!"
                      />
                      <label className="premium-label">ENLACE (al tocar la notificación)</label>
                      <input
                        className="pjl-input"
                        value={pushMsg.url}
                        onChange={e => setPushMsg({ ...pushMsg, url: e.target.value })}
                        placeholder="/  o  /?page=noticias"
                      />
                      <button
                        className="btn-premium btn-premium-gold"
                        style={{ width: '100%' }}
                        disabled={pushBusy || !pushAdminToken}
                        onClick={sendPush}
                      >
                        {pushBusy ? 'ENVIANDO…' : `🚀 ENVIAR A ${pushConfig?.count ?? 0} DISPOSITIVOS`}
                      </button>
                    </div>
                  </div>

                  {pushStatus && (
                    <div
                      className="cf-mcard"
                      style={{
                        gridColumn: '1 / -1',
                        background: pushStatus.type === 'err' ? '#fdeaea' : '#eef7ee',
                        borderColor: pushStatus.type === 'err' ? '#ef4444' : '#7bb661',
                      }}
                    >
                      <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: pushStatus.type === 'err' ? '#b91c1c' : '#166534' }}>
                        {pushStatus.type === 'ok' ? '✔ ' : pushStatus.type === 'err' ? '✖ ' : ''}{pushStatus.text}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
            );
          })()}

        </div>
      </main>

      {/* MODALS */}
      {modal && (
        <div className="glass-modal-overlay" onClick={closeModal}>
          <div className="pjl-card animate-reveal modal-responsive-card" style={{ maxWidth: '600px', width: '100%', padding: '50px' }} onClick={e => e.stopPropagation()}>
            <h3 className="serif" style={{ marginBottom: '30px', color: 'var(--navy)' }}>
              {editId ? 'Editar' : 'Crear'} {({
                noticias: 'Noticia',
                actividades: 'Actividad',
                docs: 'Documento',
                capillas: 'Capilla',
                usuarios: 'Usuario',
              } as Record<string, string>)[modal] || 'Elemento'}
            </h3>

            {(modal === 'noticias' || modal === 'actividades') && (
              <div style={{ display: 'grid', gap: '20px' }}>
                <div className="form-group">
                  <label className="premium-label">TÍTULO</label>
                  <input className="pjl-input" value={form.title || ''} onChange={e => setForm({...form, title: e.target.value})} />
                  {form.title && (
                    <div style={{ marginTop: '5px', padding: '10px', background: 'var(--cream)', borderRadius: '8px', border: '1px solid var(--gold-pale)' }}>
                      <p style={{ fontSize: '9px', color: 'var(--gold)', marginBottom: '4px' }}>PREVISUALIZACIÓN:</p>
                      <h4 className="serif" style={{ color: 'var(--navy)', margin: 0, fontSize: '1.1rem' }}>{form.title}</h4>
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label className="premium-label">FECHA</label>
                  <input className="pjl-input" type="date" value={form.date || ''} onChange={e => setForm({...form, date: e.target.value})} />
                </div>
                {modal === 'noticias' ? (
                  <>
                    <div className="form-group">
                      <label className="premium-label">CUERPO DEL ARTÍCULO</label>
                      <textarea className="pjl-input" rows={8} value={form.body || ''} onChange={e => setForm({...form, body: e.target.value})} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px', background: 'var(--cream)', padding: '15px', borderRadius: '12px', border: '1px solid var(--gold-pale)' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--navy)' }}>PUBLICAR INMEDIATAMENTE</span>
                      <label className="pjl-switch">
                        <input type="checkbox" checked={!!form.published} onChange={e => setForm({...form, published: e.target.checked})} />
                        <span className="pjl-slider"></span>
                      </label>
                    </div>
                  </>
                ) : (
                  <div className="form-group">
                    <label className="premium-label">CATEGORÍA</label>
                    <select className="pjl-input" value={form.category || 'Formación'} onChange={e => setForm({...form, category: e.target.value})}>
                      <option>Formación</option><option>Liturgia</option><option>Misión</option><option>Social</option>
                    </select>
                  </div>
                )}
              </div>
            )}

            {modal === 'documentos' && (
              <div style={{ display: 'grid', gap: '20px' }}>
                <div style={{ padding: '18px', borderRadius: '18px', background: 'linear-gradient(135deg, rgba(200,151,58,0.12), rgba(26,39,68,0.06))', border: '1px solid var(--gold-pale)', display: 'grid', gap: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
                    <div>
                      <div className="premium-label" style={{ marginBottom: '6px' }}>ARCHIVO PRINCIPAL</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Sube el documento y el panel completará automáticamente formato, tamaño y fecha.</div>
                    </div>
                    <label className="btn-premium btn-premium-gold" style={{ padding: '8px 16px', fontSize: '11px' }}>
                      SUBIR ARCHIVO
                      <input type="file" style={{ display: 'none' }} accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,image/*" onChange={handleDocumentFileUpload} />
                    </label>
                  </div>
                  <div style={{ borderRadius: '16px', border: '1px solid rgba(200,151,58,0.18)', background: '#fff', overflow: 'hidden' }}>
                    {form.url && canPreviewInFrame(form) ? (
                      getDocPresentation(form).kind === 'image' ? (
                        <img src={form.url} alt={form.name || 'Vista previa'} style={{ width: '100%', height: '220px', objectFit: 'cover', display: 'block' }} />
                      ) : (
                        <iframe src={form.url} title={form.name || 'Vista previa de documento'} style={{ width: '100%', height: '220px', border: 'none', display: 'block', background: '#fff' }} />
                      )
                    ) : (
                      <div style={{ minHeight: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '10px', color: getDocPresentation(form).color || 'var(--gold)' }}>
                        <div style={{ fontSize: '40px' }}>{getDocPresentation(form).icon}</div>
                        <div style={{ fontWeight: 800, color: 'var(--navy)' }}>{form.name || 'Documento sin nombre'}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>PDF e imágenes mostrarán vista previa aquí. Word y otros formatos se registran con su ficha.</div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="form-group">
                  <label className="premium-label">NOMBRE DEL ARCHIVO</label>
                  <input className="pjl-input" value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="form-group">
                    <label className="premium-label">FORMATO (PDF, DOC, etc)</label>
                    <input className="pjl-input" value={form.type || 'PDF'} onChange={e => setForm({...form, type: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="premium-label">TAMAÑO</label>
                    <input className="pjl-input" value={form.size || '1.0 MB'} onChange={e => setForm({...form, size: e.target.value})} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="form-group">
                    <label className="premium-label">CATEGORÍA</label>
                    <select className="pjl-input" value={form.category || 'General'} onChange={e => setForm({...form, category: e.target.value})}>
                      <option>General</option>
                      <option>Boletines</option>
                      <option>Planificación</option>
                      <option>Currículos</option>
                      <option>Formación</option>
                      <option>Presentaciones</option>
                      <option>Recursos visuales</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="premium-label">FECHA DE CARGA</label>
                    <input className="pjl-input" type="date" value={form.uploadedAt || ''} onChange={e => setForm({...form, uploadedAt: e.target.value})} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="premium-label">DESCRIPCIÓN BREVE</label>
                  <textarea className="pjl-input" rows={4} value={form.description || ''} onChange={e => setForm({...form, description: e.target.value})} placeholder="Describe para qué sirve este archivo y cuándo conviene usarlo." />
                </div>
                <div className="form-group">
                  <label className="premium-label">URL / ENLACE DEL ARCHIVO</label>
                  <input className="pjl-input" value={form.url || ''} onChange={e => setForm({...form, url: e.target.value})} placeholder="https://... o archivo subido" />
                </div>
                <div style={{ padding: '16px', borderRadius: '16px', background: 'var(--cream)', border: '1px solid var(--gold-pale)', display: 'grid', gap: '8px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--navy)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Sugerencias útiles</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.7 }}>Usa categorías para ordenar la biblioteca, agrega descripciones cortas para que el equipo sepa qué descargar y sube el archivo desde aquí para evitar enlaces rotos.</div>
                </div>
              </div>
            )}

            {modal === 'capillas' && (
              <div style={{ display: 'grid', gap: '20px' }}>
                <div className="form-group">
                  <label className="premium-label">NOMBRE DE LA CAPILLA</label>
                  <input className="pjl-input" value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="premium-label">LOGOTIPO / ESCUDO PERSONAL</label>
                  <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                    <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'var(--cream)', border: '2px solid var(--gold-pale)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <SafeImg src={form.logoUrl} alt="Previsualización de Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <label className="btn-premium btn-premium-gold" style={{ padding: '8px 15px', fontSize: '10px' }}>
                      SUBIR LOGO
                      <input type="file" style={{ display: 'none' }} accept="image/*" onChange={e => handleFileUpload(e, url => setForm({...form, logoUrl: url}))} />
                    </label>
                  </div>
                </div>
                <div className="form-group">
                  <label className="premium-label">FOTO DE LA CAPILLA (FACHADA)</label>
                  <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                    <div style={{ width: '60px', height: '60px', borderRadius: '12px', background: 'var(--cream)', border: '2px solid var(--gold-pale)', overflow: 'hidden' }}>
                      {form.photo && <img src={form.photo} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Previsualización de Fachada" />}
                    </div>
                    <label className="btn-premium btn-premium-gold" style={{ padding: '8px 15px', fontSize: '10px' }}>
                      SUBIR FOTO
                      <input type="file" style={{ display: 'none' }} accept="image/*" onChange={e => handleFileUpload(e, url => setForm({...form, photo: url}))} />
                    </label>
                  </div>
                </div>

                <div className="form-group">
                  <label className="premium-label">ZONA PASTORAL</label>
                  <select className="pjl-input" value={form.zonaId || 1} onChange={e => setForm({...form, zonaId: parseInt(e.target.value)})}>
                    <option value={1}>Zona 1 (San Miguel)</option>
                    <option value={2}>Zona 2 (San Rafael)</option>
                    <option value={3}>Zona 3 (San Gabriel)</option>
                    <option value={4}>Zona 4 (Urbana)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="premium-label">COLOR DEL MARCADOR EN EL MAPA</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <input type="color" className="pjl-input" style={{ width: '60px', height: '40px', padding: '2px' }} value={form.markerColor || '#C8973A'} onChange={e => setForm({...form, markerColor: e.target.value})} />
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Este color se usará para el ícono ⛪ de esta capilla específica en el mapa.
                    </div>
                  </div>
                </div>
                <div className="form-group">
                  <label className="premium-label">NOMBRE DE LA COMUNIDAD JUVENIL</label>
                  <input className="pjl-input" value={form.comunidadNombre || ''} onChange={e => setForm({...form, comunidadNombre: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="premium-label">ESTADO DE LA COMUNIDAD</label>
                  <select className="pjl-input" value={form.estadoComunidad || 'Activo'} onChange={e => setForm({...form, estadoComunidad: e.target.value})}>
                    <option value="Activo">Activo</option>
                    <option value="Nucleación">Nucleación</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="premium-label">DIRECCIÓN / CALLE</label>
                  <input className="pjl-input" value={form.address || ''} onChange={e => setForm({...form, address: e.target.value})} placeholder="Ej: Calle Principal c/ San Miguel" />
                </div>
                <div className="form-group">
                  <label className="premium-label">URL UBICACIÓN (GOOGLE MAPS)</label>
                  <input className="pjl-input" value={form.locationUrl || ''} onChange={e => setForm({...form, locationUrl: e.target.value})} placeholder="https://goo.gl/maps/..." />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div className="form-group">
                    <label className="premium-label">LATITUD</label>
                    <input type="number" step="any" className="pjl-input" value={form.lat ?? ''} onChange={e => setForm({ ...form, lat: e.target.value === '' ? undefined : parseFloat(e.target.value) })} placeholder="-25.2688" />
                  </div>
                  <div className="form-group">
                    <label className="premium-label">LONGITUD</label>
                    <input type="number" step="any" className="pjl-input" value={form.lng ?? ''} onChange={e => setForm({ ...form, lng: e.target.value === '' ? undefined : parseFloat(e.target.value) })} placeholder="-57.4754" />
                  </div>
                </div>
                {modal === 'capillas' && !!editId && (
                  <div className="form-group">
                    <label className="premium-label">UBICACIÓN PRECISA EN EL MAPA</label>
                    <button
                      type="button"
                      className="btn-premium btn-premium-gold modal-place-btn"
                      onClick={() => goToTerritoryPlace(editId as string)}
                    >📍 UBICAR EN EL MAPA INTERACTIVO</button>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                      Se abrirá Gestión de Territorio en modo ubicación: hacé clic en el punto exacto y volvé.
                    </div>
                  </div>
                )}
              </div>
            )}

            {modal === 'usuarios' && (
              <div style={{ display: 'grid', gap: '20px' }}>
                <div className="form-group">
                  <label className="premium-label">NOMBRE COMPLETO</label>
                  <input className="pjl-input" value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} placeholder="Ej: Juan Pérez" />
                </div>
                <div className="form-group">
                  <label className="premium-label">EMAIL (USUARIO)</label>
                  <input className="pjl-input" type="email" value={form.email || ''} onChange={e => setForm({...form, email: e.target.value})} placeholder="juan@ejemplo.com" />
                </div>
                <div className="form-group">
                  <label className="premium-label">ROL DEL SISTEMA</label>
                  <select className="pjl-input" value={form.role || 'viewer'} onChange={e => setForm({...form, role: e.target.value})}>
                    <option value="superadmin">Super Administrador (Acceso Total)</option>
                    <option value="editor">Editor (Acceso Modular)</option>
                    <option value="viewer">Visualizador (Solo Lectura)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="premium-label">ESTADO DE CUENTA</label>
                  <select className="pjl-input" value={form.status || 'activo'} onChange={e => setForm({...form, status: e.target.value})}>
                    <option value="activo">Activo</option>
                    <option value="inactivo">Desactivado / Bloqueado</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="premium-label">CONTRASEÑA</label>
                  <input className="pjl-input" type="text" value={form.password || ''} onChange={e => setForm({...form, password: e.target.value})} placeholder="Definir contraseña de acceso" />
                </div>
                
                {(form.role === 'editor' || form.role === 'viewer') && (
                  <div style={{ marginTop: '20px' }}>
                    <label className="premium-label" style={{ marginBottom: '12px', display: 'block' }}>🔐 MÓDULOS PERMITIDOS (ACCESO ESPECÍFICO)</label>
                    <p style={{ margin: '0 0 12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                      {form.role === 'viewer'
                        ? 'Para usuarios visualizadores, estos módulos se mostrarán en modo solo lectura.'
                        : 'Para editores, estos módulos quedarán habilitados de forma inmediata al guardar.'}
                    </p>
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', 
                      gap: '10px', 
                      background: 'var(--cream)', 
                      padding: '20px', 
                      borderRadius: '16px', 
                      border: '1px solid var(--gold-pale)' 
                    }}>
                      {NAV_ITEMS.filter(n => !NON_DELEGABLE_MODULES.includes(n.id as Module)).map(n => {
                        const icon = (branding[n.iconKey as keyof Branding] as string) || n.defaultIcon;
                        const checked = (form.permissions || []).includes(n.id);
                        return (
                        <label key={n.id} className={`perm-chip ${checked ? 'checked' : ''}`}>
                          <input
                            type="checkbox"
                            style={{ display: 'none' }}
                            checked={checked}
                            onChange={e => {
                              const perms = form.permissions || [];
                              if (e.target.checked) setForm({...form, permissions: [...perms, n.id]});
                              else setForm({...form, permissions: perms.filter((p: string) => p !== n.id)});
                            }}
                          />
                          <span className="perm-chip-check">{checked ? '✓' : ''}</span>
                          <span>{icon} {n.label}</span>
                        </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label className="premium-label">URL AVATAR (FOTO)</label>
                  <input className="pjl-input" type="text" value={form.avatar || ''} onChange={e => setForm({...form, avatar: e.target.value})} placeholder="https://..." />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '20px', marginTop: '40px' }}>
              <button className="btn-premium btn-premium-gold" style={{ flex: 1, padding: '15px' }} onClick={
                modal === 'noticias' ? saveNews : 
                modal === 'actividades' ? saveActivity : 
                modal === 'capillas' ? saveChapel :
                modal === 'usuarios' ? saveUser :
                saveDoc
              }>GUARDAR DATOS</button>
              <button className="btn-premium btn-premium-outline" style={{ flex: 1 }} onClick={closeModal}>CANCELAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<div>Cargando panel...</div>}>
      <AdminContent />
    </Suspense>
  );
}
