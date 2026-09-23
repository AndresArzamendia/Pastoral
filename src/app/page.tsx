/* eslint-disable @typescript-eslint/no-unused-vars, @next/next/no-img-element, @typescript-eslint/ban-ts-comment, react-hooks/exhaustive-deps */
'use client';

import { useState, useEffect, useRef, useLayoutEffect, Suspense, type CSSProperties } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  store, NewsItem, Activity, FaqItem, SiteContent, DocItem, MemberProfile, Chapel, Branding, ThemePalette, TimelineEvent, HeroSlide,
  DEFAULT_CONTENT, DEFAULT_NEWS, DEFAULT_ACTIVITIES, DEFAULT_FAQ, DEFAULT_SOCIAL, SocialLinks, DEFAULT_BRANDING, DEFAULT_CHAPELS,
  DEFAULT_STATS, PageStat, mergePageStats
} from '@/lib/pjlStore';
import { fetchStoreValue } from '@/lib/supabaseStore';
import Link from 'next/link';
import Script from 'next/script';
import NavDownloadButton from '@/components/NavDownloadButton';
import NotificationBell from '@/components/NotificationBell';
import FactWidget from '@/components/FactWidget';
import ShareButton from '@/components/ShareButton';
import { buildIcs, IcsItem } from '@/lib/ics';
import { evgHoyClassify, evgHoyDateLabel, EVH_BASE_URL, type EvgHoyResponse } from '@/lib/vaticanEvangelio';

type PublicNewsItem = Omit<NewsItem, 'id'> & {
  id: number | string;
  subtitle?: string;
  featured_image_url?: string | null;
  inscription_url?: string | null;
  external_link?: string | null;
  google_drive_url?: string | null;
  event_date?: string | null;
  event_location?: string | null;
};

type NewsResource = {
  href: string;
  label: string;
  detail: string;
  icon: string;
  tone: 'gold' | 'blue' | 'neutral';
};

const EVG_SESSION_KEY = 'pjl_evangelio_cache';
const EVG_SESSION_TTL = 6 * 60 * 60 * 1000;

const ZonaMap = dynamic(() => import('@/components/ZonaMap'), { ssr: false, loading: () => <div style={{ height: '500px', background: 'var(--cream)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Cargando mapa...</div> });

const STAT_LABELS: Record<string, string> = {
  '/': 'Página Principal',
  '/agenda': 'Agenda / Calendario',
  '/noticias': 'Noticias',
  '/zonas': 'Zonas Pastorales',
  '/curriculos': 'Currículos',
  '/documentos': 'Documentos',
  '/mision': 'Misión / Visión',
  '/contacto': 'Contacto',
  '/estatuto': 'Estatuto',
  '/historia': 'Historia',
  '/institucional': 'Institucional',
  '/consejo': 'Consejo PJL',
  '/equipos': 'Equipos',
  '/preguntas': 'Preguntas Frecuentes',
  '/faq': 'Preguntas Frecuentes',
  '/home': 'Página Principal',
};

const humanizeStatLabel = (path: string) => {
  if (STAT_LABELS[path]) return STAT_LABELS[path];
  const clean = path.replace(/^\//, '');
  if (!clean) return 'Página Principal';
  return clean
    .split(/[-_]/g)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

/* Imagen a prueba de enlaces rotos: si la URL falla o está vacía,
   muestra un placeholder elegante en lugar del ícono de imagen rota. */
function SafeImg({ src, alt, style, className, fallback = '⛪', fallbackStyle }: {
  src?: string; alt: string; style?: React.CSSProperties; className?: string;
  fallback?: string; fallbackStyle?: React.CSSProperties;
}) {
  const [err, setErr] = useState(false);
  useEffect(() => { setErr(false); }, [src]);
  if (!src || err) {
    return (
      <span
        aria-label={alt}
        role="img"
        className={className ? `safe-img-fallback ${className}` : 'safe-img-fallback'}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: 'linear-gradient(135deg, #f3ede0 0%, #e9dfc8 100%)', fontSize: '28px', ...fallbackStyle }}
      >
        {fallback}
      </span>
    );
  }
  return <img src={src} alt={alt} style={style} className={className} loading="lazy" decoding="async" onError={() => setErr(true)} />;
};

const mapHeroPosition = (position?: string) => {
  switch (position) {
    case 'Top':
      return 'center top';
    case 'Bottom':
      return 'center bottom';
    case 'Left':
      return 'left center';
    case 'Right':
      return 'right center';
    default:
      return 'center center';
  }
};

const detectDeviceType = () => {
  if (typeof window === 'undefined') return 'desktop' as const;
  const ua = window.navigator.userAgent.toLowerCase();
  const width = window.innerWidth;
  const height = window.innerHeight;
  const platform = window.navigator.platform?.toLowerCase() || '';
  const maxTouchPoints = window.navigator.maxTouchPoints || 0;
  const screenWidth = window.screen?.width || width;
  const screenHeight = window.screen?.height || height;
  const shortestSide = Math.min(screenWidth, screenHeight, width, height);
  const longestSide = Math.max(screenWidth, screenHeight, width, height);
  const isIPadLike = platform.includes('mac') && maxTouchPoints > 1 && width >= 768;
  const isTouchTabletSize = maxTouchPoints > 1 && shortestSide >= 600 && longestSide >= 900;

  if (/ipad|tablet/.test(ua) || isIPadLike || isTouchTabletSize || (width >= 768 && width <= 1180 && (/android/.test(ua) || maxTouchPoints > 1))) return 'tablet' as const;
  if (/mobi|iphone|ipod|android/.test(ua) || width < 768) return 'mobile' as const;
  return 'desktop' as const;
};

function TextWithLinks({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/gi);
  const isUrl = (value: string) => /^https?:\/\/[^\s]+$/i.test(value);

  return (
    <>
      {parts.map((part, index) =>
        isUrl(part) ? (
          <a
            key={`${part}-${index}`}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{
              color: 'var(--gold)',
              textDecoration: 'underline',
              fontWeight: 600,
              wordBreak: 'break-word',
            }}
          >
            {part}
          </a>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        )
      )}
    </>
  );
}

const extractUrls = (text: string) => Array.from(new Set(text.match(/https?:\/\/[^\s]+/gi) || []));

const resourceDetail = (href: string) => {
  try {
    return new URL(href).hostname.replace(/^www\./, '');
  } catch {
    return 'Abrir recurso';
  }
};

const getNewsResources = (news: PublicNewsItem): NewsResource[] => {
  const resources: NewsResource[] = [];
  const used = new Set<string>();
  const addResource = (resource: NewsResource) => {
    if (!resource.href || used.has(resource.href)) return;
    used.add(resource.href);
    resources.push(resource);
  };

  if (news.inscription_url) {
    addResource({
      href: news.inscription_url,
      label: 'Formulario de inscripción',
      detail: resourceDetail(news.inscription_url),
      icon: '✍️',
      tone: 'gold',
    });
  }

  if (news.google_drive_url) {
    addResource({
      href: news.google_drive_url,
      label: 'Fotos o archivos en Drive',
      detail: resourceDetail(news.google_drive_url),
      icon: '📂',
      tone: 'blue',
    });
  }

  if (news.external_link) {
    addResource({
      href: news.external_link,
      label: 'Más información',
      detail: resourceDetail(news.external_link),
      icon: '🌐',
      tone: 'neutral',
    });
  }

  extractUrls(news.body).forEach((href, index) => {
    addResource({
      href,
      label: index === 0 ? 'Link citado en la noticia' : `Link citado ${index + 1}`,
      detail: resourceDetail(href),
      icon: '🔗',
      tone: 'neutral',
    });
  });

  return resources;
};


function MaintenanceScreen({ message, email }: { message?: string; email?: string }) {
  return (
    <div className="cfm-wrap">
      <div className="cfm-card">
        <div className="cfm-gear" aria-hidden="true">⚙️</div>
        <span className="cfm-kicker">Pastoral Juvenil Luqueña</span>
        <h1 className="cfm-title">Estamos mejorando<br />el sitio 🙏</h1>
        <p className="cfm-msg">
          {message?.trim() || 'Realizamos tareas de mantenimiento para servirte mejor. Volvemos en unos momentos.'}
        </p>
        {email && <a className="cfm-mail" href={`mailto:${email}`}>✉️ {email}</a>}
      </div>
    </div>
  );
}


type AgEvent = {
  id: string;
  title: string;
  dateObj: Date;
  kind: 'actividad' | 'noticia';
  desc: string;
  category?: string;
  inscription?: boolean;
  newsRef?: PublicNewsItem;
};

function pad2(n: number) { return String(n).padStart(2, '0'); }
const AG_MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function gcalTemplateUrl(ev: AgEvent): string {
  const f = (d: Date) => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
  const end = new Date(ev.dateObj.getFullYear(), ev.dateObj.getMonth(), ev.dateObj.getDate() + 1);
  let url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(ev.title)}&dates=${f(ev.dateObj)}/${f(end)}`;
  if (ev.desc) url += `&details=${encodeURIComponent(ev.desc.slice(0, 280))}`;
  if (ev.category) url += `&location=${encodeURIComponent('Pastoral Juvenil Luque\u00f1a \u00b7 ' + ev.category)}`;
  return url;
}

function AgendaCalendar({ activities, news, onOpenNews }: { activities: Activity[]; news: PublicNewsItem[]; onOpenNews: (n: PublicNewsItem) => void }) {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
  const [viewYm, setViewYm] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [selKey, setSelKey] = useState(todayKey);
  const [kindFilter, setKindFilter] = useState<'all' | 'actividad' | 'noticia'>('all');

  const normKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

  const allEvents: Record<string, AgEvent[]> = {};
  activities.filter(a => a.active !== false).forEach(a => {
    const d = new Date(a.date);
    if (isNaN(d.getTime())) return;
    const k = normKey(d);
    (allEvents[k] = allEvents[k] || []).push({
      id: `act-${a.id}`, title: a.title, dateObj: d, kind: 'actividad',
      desc: a.description || a.category || '', category: a.category, inscription: a.inscription,
    });
  });
  news.forEach(n => {
    const rawDate = n.event_date || n.date;
    if (!rawDate) return;
    const d = new Date(rawDate);
    if (isNaN(d.getTime())) return;
    const k = normKey(d);
    (allEvents[k] = allEvents[k] || []).push({
      id: `news-${n.id}`, title: n.title, dateObj: d, kind: 'noticia',
      desc: n.subtitle || n.body?.slice(0, 160) || '', category: 'Evento especial',
      inscription: !!n.inscription_url, newsRef: n,
    });
  });
  Object.values(allEvents).forEach(list => list.sort((a, b) => a.title.localeCompare(b.title)));

  const lead = (new Date(viewYm.y, viewYm.m, 1).getDay() + 6) % 7;
  const dim = new Date(viewYm.y, viewYm.m + 1, 0).getDate();
  const cells: Array<number | null> = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const visibleOf = (k: string) =>
    (allEvents[k] || []).filter(e => kindFilter === 'all' || e.kind === kindFilter);

  const monthEventsCount = Object.keys(allEvents)
    .filter(k => k.startsWith(`${viewYm.y}-${pad2(viewYm.m + 1)}`))
    .reduce((acc, k) => acc + visibleOf(k).length, 0);

  const [sy, sm, sd] = selKey.split('-').map(Number);
  const selEvents = visibleOf(selKey);

  return (
    <div className="ag-wrap">
      <div className="ag-head">
        <div className="ag-monthnav">
          <button
            className="ag-nav"
            aria-label="Mes anterior"
            onClick={() => setViewYm(v => v.m === 0 ? { y: v.y - 1, m: 11 } : { ...v, m: v.m - 1 })}
          >{'\u2039'}</button>
          <b className="ag-mlabel">{AG_MONTHS[viewYm.m]} {viewYm.y}</b>
          <button
            className="ag-nav"
            aria-label="Mes siguiente"
            onClick={() => setViewYm(v => v.m === 11 ? { y: v.y + 1, m: 0 } : { ...v, m: v.m + 1 })}
          >{'\u203A'}</button>
          <button
            className="ag-today"
            onClick={() => {
              setViewYm({ y: today.getFullYear(), m: today.getMonth() });
              setSelKey(todayKey);
            }}
          >Hoy</button>
        </div>
        <span className="ag-count">{monthEventsCount} evento{monthEventsCount === 1 ? '' : 's'} este mes</span>
      </div>

      <div className="ag-filters" role="group" aria-label="Filtrar tipo de evento">
        {([['all', 'Todos'], ['actividad', '⛪ Actividades'], ['noticia', '✨ Fechas especiales']] as const).map(([val, label]) => (
          <button key={val} className={`ag-pill ${kindFilter === val ? 'on' : ''}`} onClick={() => setKindFilter(val)}>{label}</button>
        ))}
      </div>

      <div className="ag-grid" key={`${viewYm.y}-${viewYm.m}`} role="grid" aria-label={`Eventos de ${AG_MONTHS[viewYm.m]}`}>
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <span key={`h${i}`} className="ag-hcell">{d}</span>
        ))}
        {cells.map((d, ci) => {
          if (!d) return <span key={`e${ci}`} className="ag-day empty" />;
          const k = `${viewYm.y}-${pad2(viewYm.m + 1)}-${pad2(d)}`;
          const evs = visibleOf(k);
          const hasA = evs.some(e => e.kind === 'actividad');
          const hasN = evs.some(e => e.kind === 'noticia');
          return (
            <button
              key={k}
              className={`ag-day${k === todayKey ? ' today' : ''}${evs.length ? ' has' : ''}${selKey === k ? ' sel' : ''}`}
              onClick={() => setSelKey(k)}
              aria-label={`${d} de ${AG_MONTHS[viewYm.m]}, ${evs.length} eventos`}
            >
              <i>{d}</i>
              {evs.length > 0 && (
                <span className="ag-dots">
                  {hasA && <b className="dot-a" />}
                  {hasN && <b className="dot-n" />}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="ag-list" key={selKey}>
        <p className="ag-listhead">
          {sd} de {AG_MONTHS[sm - 1]} · {selEvents.length === 0 ? 'sin eventos' : `${selEvents.length} evento${selEvents.length === 1 ? '' : 's'}`}
        </p>
        {selEvents.length === 0 ? (
          <div className="ag-empty">🌤️<p>Nada programado para este día.</p></div>
        ) : selEvents.map((ev, i) => (
          <article key={ev.id} className={`ag-ev ${ev.kind}`} style={{ '--ad': `${i * 60}ms` } as CSSProperties}>
            <div className="age-date" aria-hidden="true">
              <b>{ev.dateObj.getDate()}</b>
              <small>{AG_MONTHS[ev.dateObj.getMonth()].slice(0, 3)}</small>
            </div>
            <div className="age-body">
              <span className="age-kind">{ev.kind === 'actividad' ? '⛪ Actividad' : '✨ Fecha especial'}{ev.category ? ` · ${ev.category}` : ''}</span>
              <h5>{ev.title}</h5>
              {ev.desc && <p>{ev.desc}</p>}
              <div className="age-actions">
                <a className="age-btn age-gcal" href={gcalTemplateUrl(ev)} target="_blank" rel="noreferrer" title="Añadir a tu Google Calendar">
                  ＋ Mi Calendar
                </a>
                {ev.newsRef && (
                  <button className="age-btn age-note" onClick={() => onOpenNews(ev.newsRef!)}>
                    Ver nota →
                  </button>
                )}
                {ev.kind === 'actividad' && ev.inscription && (
                  <span className="age-chip">Inscripción abierta</span>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}


function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentPage = searchParams.get('page') || 'home';
  const [selectedZone, setSelectedZone] = useState<number | null>(null);

  // --- STATE ---
  const [fontSize, setFontSize] = useState(16);
  const [isHighContrast, setIsHighContrast] = useState(false);
  const [activeZoneTab, setActiveZoneTab] = useState<'capillas' | 'coordination' | 'mapa'>('capillas');
  const [selectedProfile, setSelectedProfile] = useState<MemberProfile | null>(null);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<TimelineEvent | null>(null);
  const [activeConsejoTab, setActiveConsejoTab] = useState('coordinacion');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [globalCommFilter, setGlobalCommFilter] = useState<number | 'all'>('all');
  const [newsEmail, setNewsEmail] = useState('');
  const [newsSubscribed, setNewsSubscribed] = useState(false);
  const [expandedCommIds, setExpandedCommIds] = useState<Set<string>>(new Set());
  const toggleExpandedComm = (id: string) => {
    setExpandedCommIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };
const [docSearch, setDocSearch] = useState('');
const [docCategory, setDocCategory] = useState('all');
const [newsSearch, setNewsSearch] = useState('');

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [mobileSubmenuOpen, setMobileSubmenuOpen] = useState<Record<string, boolean>>({});
  const toggleMobileSubmenu = (key: string) => {
    setMobileSubmenuOpen(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Navbar reactiva al scroll (compacta + sombra más profunda)
  const [navScrolled, setNavScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Entrada escalonada del navbar: los elementos nacen ocultos y SOLO se
  // revelan cuando la pantalla de carga levanta el velo (ver efecto del
  // splash más abajo). Nunca antes de la intro.
  const [navEntered, setNavEntered] = useState(false);

  // Sección activa del navbar (agrupa subpáginas con su botón padre)
  const activeSection = (
    {
      estatuto: 'institucional',
      historia: 'institucional',
    } as Record<string, string>
  )[currentPage] ?? currentPage;

  // Viewport real (evita mismatch de hidratación y reacciona a redimensionados)
  // Nota: se usa 'resize' porque MediaQueryList.addEventListener no existe
  // en Safari/iOS antiguos y su error rompe la hidratación completa.
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  useEffect(() => {
    const update = () => setIsMobileViewport(window.innerWidth <= 768);
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  // Reset selected zone when leaving zones page
  useEffect(() => {
    if (currentPage !== 'zonas') {
      queueMicrotask(() => setSelectedZone(null));
    }
  }, [currentPage]);

  const [liveSocial, setLiveSocial] = useState<SocialLinks>(DEFAULT_SOCIAL);
  const [liveChapels, setLiveChapels] = useState<Chapel[]>([]);
  const [selectedNews, setSelectedNews] = useState<PublicNewsItem | null>(null);
  const [siteContent, setSiteContent] = useState<SiteContent>(DEFAULT_CONTENT);
  const [liveActivities, setLiveActivities] = useState<Activity[]>([]);
  const [liveNews, setLiveNews] = useState<PublicNewsItem[]>([]);
  const [liveFaq, setLiveFaq] = useState<FaqItem[]>([]);
  const [liveProfiles, setLiveProfiles] = useState<MemberProfile[]>([]);
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);
  const [liveHeroImages, setLiveHeroImages] = useState<HeroSlide[]>([]);
  const [heroIntervalSecs, setHeroIntervalSecs] = useState<number>(3);
  const [liveHeroIndex, setLiveHeroIndex] = useState(0);
  const [liveDocs, setLiveDocs] = useState<DocItem[]>([]);
  const [splashDone, setSplashDone] = useState(false);

  // --- EVANGELIO DEL DÍA ---
  const [evangelioOpen, setEvangelioOpen] = useState(false);
  const [evangelioToast, setEvangelioToast] = useState(false);
  const evangelioShownRef = useRef(false);
  const hasEvangelio = true;
  const EVANGELIO_SIG = 'Pastoral Juvenil Luque\u00f1a \u00abAvivando la llama de Cristo en tu coraz\u00f3n\u00bb';

  const dataUrlToBlob = async (url: string): Promise<Blob> => {
    const res = await fetch(url);
    return await res.blob();
  };

  const closeEvangelio = () => setEvangelioOpen(false);

  const copyEvangelio = async () => {
    try {
      const items: ClipboardItem[] = [new ClipboardItem({ 'text/plain': new Blob([evangelioTextForCopy], { type: 'text/plain' }) })];
      if (siteContent.evangelioFoto) {
        try {
          const blob = await dataUrlToBlob(siteContent.evangelioFoto);
          if (blob && blob.type.startsWith('image/')) items.push(new ClipboardItem({ 'image/png': blob }));
        } catch { /* la imagen no se pudo copiar, seguimos con el texto */ }
      }
      await navigator.clipboard.write(items);
    } catch {
      try { await navigator.clipboard.writeText(evangelioTextForCopy); } catch { /* portapapeles no disponible */ }
    }
    setEvangelioToast(true);
    window.setTimeout(() => setEvangelioToast(false), 2600);
  };

  const shareEvangelio = async () => {
    const text = evangelioTextForCopy;
    if (navigator.share) {
      try {
        if (siteContent.evangelioFoto) {
          try {
            const blob = await dataUrlToBlob(siteContent.evangelioFoto);
            const file = new File([blob], 'evangelio-del-dia.jpg', { type: 'image/jpeg' });
            await navigator.share({ text, files: [file] });
            return;
          } catch { /* compartir con archivo falló, seguimos con texto */ }
        }
        await navigator.share({ text });
        return;
      } catch (e) {
        const err = e as { name?: string };
        if (err?.name === 'AbortError') return;
      }
    }
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener,noreferrer');
  };

  useEffect(() => {
    if (!hasEvangelio || !splashDone || evangelioShownRef.current) return;
    evangelioShownRef.current = true;
    try {
      if (sessionStorage.getItem('pjl_evangelio_visto')) return;
      sessionStorage.setItem('pjl_evangelio_visto', '1');
    } catch { /* sin sessionStorage en este contexto */ }
    const t = window.setTimeout(() => setEvangelioOpen(true), 750);
    return () => window.clearTimeout(t);
  }, [splashDone, hasEvangelio]);

  useEffect(() => {
    if (!evangelioOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, [evangelioOpen]);

  // --- EVANGELIO DE HOY · Vatican News (fuente oficial automática) ---
  const [evgHoyData, setEvgHoyData] = useState<EvgHoyResponse | null>(null);
  const [evgHoyLoading, setEvgHoyLoading] = useState(false);
  const [evgHoyError, setEvgHoyError] = useState(false);

  const loadEvgHoy = async () => {
    if (evgHoyLoading || evgHoyData) return;
    try {
      const raw = sessionStorage.getItem(EVG_SESSION_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as { ts: number; data: EvgHoyResponse };
        if (cached?.data && cached.ts && Date.now() - cached.ts < EVG_SESSION_TTL && cached.data.ok && Array.isArray(cached.data.paragraphs)) {
          setEvgHoyData(cached.data);
          return;
        }
      }
    } catch { /* sin sessionStorage */ }
    setEvgHoyLoading(true);
    setEvgHoyError(false);
    try {
      const res = await fetch('/api/evangelio', { headers: { Accept: 'application/json' } });
      const json = await res.json() as EvgHoyResponse;
      if (!res.ok || !json.ok || !(json.paragraphs && json.paragraphs.length)) throw new Error('Datos no disponibles');
      setEvgHoyData(json);
      try { sessionStorage.setItem(EVG_SESSION_KEY, JSON.stringify({ ts: Date.now(), data: json })); } catch { /* no persistir */ }
    } catch {
      setEvgHoyError(true);
    } finally {
      setEvgHoyLoading(false);
    }
  };

  useEffect(() => { void loadEvgHoy(); }, []);

  // Descarga la agenda completa en formato .ics para añadirla a Google Calendar
  const downloadAgendaIcs = () => {
    const items: IcsItem[] = [];
    liveActivities.filter(a => a.active !== false).forEach(a => {
      const d = new Date(a.date);
      if (isNaN(d.getTime())) return;
      items.push({
        title: a.title,
        date: a.date,
        description: [a.description, a.category].filter(Boolean).join(' · '),
        location: 'Pastoral Juvenil Luque\u00f1a',
      });
    });
    liveNews.forEach(n => {
      const rawDate = n.event_date || n.date;
      if (!rawDate || isNaN(new Date(rawDate).getTime())) return;
      items.push({
        title: n.title,
        date: String(rawDate).slice(0, 10),
        description: n.subtitle || n.body.slice(0, 160) || 'Evento especial',
        location: 'Pastoral Juvenil Luque\u00f1a',
      });
    });
    items.sort((a, b) => a.date.localeCompare(b.date));
    if (items.length === 0) return;

    const ics = buildIcs(items);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'agenda-pastoral-juvenil-luquena.ics';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // --- NOTICIAS · DATOS DERIVADOS ---
  const NEWS_RC = ['#C8973A', '#2563EB', '#0D9488', '#8A2B3B'];
  const nowDate = new Date();
  const newsEsteMes = liveNews.filter(n => {
    const d = new Date(n.date);
    return d.getMonth() === nowDate.getMonth() && d.getFullYear() === nowDate.getFullYear();
  }).length;
  const newsConInscripcion = liveNews.filter(n => !!n.inscription_url).length;
  const newsRest = liveNews.slice(1).filter(n => {
    const q = newsSearch.trim().toLowerCase();
    if (!q) return true;
    return n.title.toLowerCase().includes(q) || (n.subtitle || '').toLowerCase().includes(q) || n.body.toLowerCase().includes(q);
  });

  // Prevent background scrolling when modals or mobile menu is open
  useEffect(() => {
    if (!splashDone || selectedProfile || selectedHistoryItem || selectedNews || isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }, [splashDone, selectedProfile, selectedHistoryItem, selectedNews, isMobileMenuOpen]);

  // Cierra el detalle de perfil con la tecla Escape
  useEffect(() => {
    if (!selectedProfile) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedProfile(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedProfile]);

  // Toma el control de la pantalla de carga estática: coloca el logo real del
  // admin, reinicia la coreografía y cierra con fundido. El contenido nace
  // oculto (CSS crítico del layout) y esta secuencia lo revela en orden:
  // primero la intro completa, después el menú principal.
  // Se usa useLayoutEffect (antes del pintado) y se REAPLICA show-splash:
  // React/Next.js reescribe className en <html> durante la hidratación y
  // borra la clase que añade el script inline del layout, lo que ocultaba
  // la intro y dejaba el contenido visible SIN el navbar (opacity:0) hasta
  // que saltaban los temporizadores. Reaplicarla aquí garantiza que el velo
  // y el splash sobrevivan a la hidratación.
  useLayoutEffect(() => {
    const splash = document.getElementById('splash-pjl');
    const root = document.documentElement;
    // Si venimos de una navegación interna (no de una recarga), NO reproducir
    // la intro: revelar todo al instante. La bandera la marca navigate() justo
    // antes de router.push(). Una recarga real siempre muestra la intro.
    let skipSplash = false;
    try {
      const ne = window.performance?.getEntriesByType?.('navigation');
      const nt = ne && ne[0] ? (ne[0] as any).type : '';
      const isReload = nt === 'reload' || (window.performance as any)?.navigation?.type === 1;
      if (!isReload) {
        const ts = parseInt(sessionStorage.getItem('pjl_skip_splash') || '', 10);
        if (ts && Date.now() - ts < 8000) skipSplash = true;
      }
    } catch {
      skipSplash = false;
    }
    if (skipSplash) {
      try { sessionStorage.removeItem('pjl_skip_splash'); } catch { /* ignore */ }
      root.classList.remove('show-splash');
      root.classList.add('no-hero-intro');
      splash?.remove();
      setNavEntered(true);
      setSplashDone(true);
      return;
    }
    root.classList.add('show-splash');
    const reduced = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Levanta el velo: el contenido vuelve a ser visible bajo el fundido.
    const liftCurtain = () => root.classList.remove('show-splash');
    // Sin pantalla (vuelta a la home por navegación interna) o sin animaciones:
    // revelar todo de inmediato.
    if (!splash || reduced) {
      liftCurtain();
      root.classList.add('no-hero-intro');
      splash?.remove();
      setNavEntered(true);
      setSplashDone(true);
      return;
    }
    // Reemplaza el fallback del logo por la imagen real y habilita coreografía.
    // Envuelto en try-catch para que NO bloquee la salida del splash.
    try {
      const mainLogo = store.branding.get()?.mainLogo;
      if (mainLogo) {
        const fallbackNode = splash.querySelector('.splash-logo-fallback');
        if (fallbackNode) {
          const img = document.createElement('img');
          img.src = mainLogo;
          img.alt = 'Logotipo de la Pastoral Juvenil Luqueña';
          img.className = 'splash-logo-img';
          fallbackNode.replaceWith(img);
        }
      }
      root.classList.add('splash-ready');
    } catch { /* ignore */ }

    // Salida y revelado garantizados: la coreografía normal termina a ~5.5s.
    // Un temporizador de seguridad fuerza la salida si algo impide
    // que el setTimeout principal se dispare (así el menú se muestra
    // siempre, sin dejar el splash cubriendo la página).
    let exited = false;
    const triggerExit = () => {
      if (exited) return;
      exited = true;
      try {
        document.getElementById('splash-pjl')?.classList.add('is-leaving');
        root.classList.add('pjl-reveal');
        root.classList.add('hero-ready');
        root.classList.remove('show-splash');
        // El hero se "ensambla" EN EL MISMO instante en que el splash empieza
        // a fundirse: una sola coreografía continua, sin cortes ni re-colocado.
        setNavEntered(true);
      } catch { /* ignore */ }
      window.setTimeout(() => { root.classList.remove('pjl-reveal'); }, 5200);
      window.setTimeout(() => {
        document.getElementById('splash-pjl')?.remove();
        setNavEntered(true);
        setSplashDone(true);
      }, 5600);
    };
    // Coreografía normal: comienza 900ms después y sale a 4600ms (= 5500ms tot).
    window.setTimeout(() => {
      window.setTimeout(() => { triggerExit(); }, 4600);
    }, 900);
    // Seguridad: si triggerExit no se ejecutó antes de 7000ms, forzar salida.
    window.setTimeout(() => { if (!exited) triggerExit(); }, 7000);

    return () => {
      if (window.location.pathname !== '/') {
        exited = true;
        root.classList.remove('show-splash', 'pjl-reveal', 'splash-ready');
        root.classList.add('no-splash');
        splash?.remove();
      }
    };
  }, []);

  // --- SYNC LOGIC ---
  const syncData = () => {
    const newContent = store.content.get();
    const newActivities = store.activities.get().filter(a => a.active);
    const newFaq = store.faq.get();
    const newProfiles = store.profiles.get();
    const newBranding = store.branding.get();
    const newHero = store.hero.get() || [];
    const newHeroInterval = store.heroInterval.get() || 3;
    const newSocial = store.social.get();
    const newChapels = store.chapels.get();
    const newDocs = store.docs.get() || [];

    // Only update if stringified value changed to avoid unnecessary interval resets
    setSiteContent(prev => JSON.stringify(prev) !== JSON.stringify(newContent) ? newContent : prev);
    setLiveActivities(prev => JSON.stringify(prev) !== JSON.stringify(newActivities) ? newActivities : prev);
    setLiveFaq(prev => JSON.stringify(prev) !== JSON.stringify(newFaq) ? newFaq : prev);
    setLiveProfiles(prev => JSON.stringify(prev) !== JSON.stringify(newProfiles) ? newProfiles : prev);
    setBranding(prev => JSON.stringify(prev) !== JSON.stringify(newBranding) ? newBranding : prev);
    setLiveHeroImages(prev => JSON.stringify(prev) !== JSON.stringify(newHero) ? newHero : prev);
    setHeroIntervalSecs(prev => prev !== newHeroInterval ? newHeroInterval : prev);
    setLiveSocial(prev => JSON.stringify(prev) !== JSON.stringify(newSocial) ? newSocial : prev);
    setLiveChapels(prev => JSON.stringify(prev) !== JSON.stringify(newChapels) ? newChapels : prev);
    setLiveDocs(prev => JSON.stringify(prev) !== JSON.stringify(newDocs) ? newDocs : prev);
  };

  useEffect(() => {
    // Small delay to avoid 'setState in effect' warning for synchronous mount sync
    const timer = setTimeout(syncData, 0);
    const interval = setInterval(syncData, 60000);
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith('pjl_')) syncData();
    };
    const onCustomUpdate = () => syncData();

    window.addEventListener('storage', onStorage);
    window.addEventListener('pjl_store_update', onCustomUpdate);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pjl_store_update', onCustomUpdate);
    };
  }, []);

  // --- FETCH REAL NEWS FROM DATABASE ---
  useEffect(() => {
    const fetchRealNews = async () => {
      try {
        const response = await fetch('/api/news/articles?published=true&limit=20');
        const data = await response.json();
        if (data.success && Array.isArray(data.data)) {
          const mapped = data.data.map((n: any) => ({
            id: n.id,
            title: n.title,
            body: n.body,
            date: n.published_at || n.created_at,
            published: n.published,
            subtitle: n.subtitle || '',
            featured_image_url: n.featured_image_url || null,
            inscription_url: n.inscription_url || null,
            external_link: n.external_link || null,
            google_drive_url: n.google_drive_url || null,
            event_date: n.event_date || null,
            event_location: n.event_location || null,
          }));
          setLiveNews(mapped);
        }
      } catch (err) {
        console.error('Error fetching real news:', err);
      }
    };

    fetchRealNews();
    const interval = setInterval(fetchRealNews, 120000);
    return () => clearInterval(interval);
  }, []);

  // --- AUTO-SLIDE HERO BANNER ---
  useEffect(() => {
    if (liveHeroImages.length <= 1) return;
    
    const interval = setInterval(() => {
      setLiveHeroIndex(prev => (prev + 1) % liveHeroImages.length);
    }, heroIntervalSecs * 1000);

    return () => clearInterval(interval);
  }, [liveHeroImages.length, heroIntervalSecs]);

  // --- INTERSECTION OBSERVER FOR EXQUISITE SCROLL ANIMATIONS ---
  // La cascada de entrada .reveal SOLO debe reproducirse en la primera
  // carga/recarga de la página. En navegaciones internas (cambio de
  // sección vía ?page=) el contenido debe aparecer al instante: al navegar
  // a una sección distinta se marca <html>.pjl-nav-entered y el CSS fuerza
  // .reveal a opacity 1 sin transición, evitando que la intro se repita.
  const initialPageRef = useRef(currentPage);
  useLayoutEffect(() => {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return;
    const root = document.documentElement;
    if (currentPage !== initialPageRef.current) {
      root.classList.add('pjl-nav-entered');
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    }, { threshold: 0.1, rootMargin: "0px 0px -50px 0px" });

    const reveals = document.querySelectorAll('.reveal');
    reveals.forEach(r => observer.observe(r));

    return () => observer.disconnect();
  }, [currentPage, activeZoneTab, activeConsejoTab, selectedZone, globalCommFilter, liveChapels]);

  // --- INTERACTION TRACKING ---
  const updateStat = async (id: string, field: 'visits' | 'interactions') => {
    try {
      const mappedId = id === 'home' ? '/' : id.startsWith('/') ? id : `/${id}`;
      const deviceType = detectDeviceType();
      const localStats = store.stats.get();
      let baseStats = localStats;

      try {
        const remoteStats = await fetchStoreValue<PageStat[]>('stats');
        if (Array.isArray(remoteStats)) {
          baseStats = mergePageStats(localStats, remoteStats);
        }
      } catch {
        baseStats = localStats;
      }

      baseStats = mergePageStats(store.stats.get(), baseStats);
      const s = mergePageStats(DEFAULT_STATS, baseStats);
      let existing = s.find(x => x.page === mappedId);

      if (!existing) {
        existing = { page: mappedId, label: humanizeStatLabel(mappedId), visits: 0, interactions: 0, desktopVisits: 0, tabletVisits: 0, mobileVisits: 0 };
        s.push(existing);
      }

      existing[field] += 1;
      if (field === 'visits') {
        if (deviceType === 'desktop') existing.desktopVisits = (existing.desktopVisits || 0) + 1;
        if (deviceType === 'tablet') existing.tabletVisits = (existing.tabletVisits || 0) + 1;
        if (deviceType === 'mobile') existing.mobileVisits = (existing.mobileVisits || 0) + 1;
      }
      store.stats.set(s);
    } catch (e) {}
  };

  const trackVisit = (id: string) => {
    void updateStat(id, 'visits');
  };

  const trackInteraction = (id: string) => {
    try {
      const mappedId = id === 'home' ? '/' : `/${id}`;
      void updateStat(mappedId, 'interactions');
    } catch (e) {}
  };

  useEffect(() => {
    trackVisit(currentPage);
  }, [currentPage]);

  // --- VATICAN WIDGET SCRIPT ---
  useEffect(() => {
    const scriptId = 'vatican-news-script';
    if (document.getElementById(scriptId)) return;
    
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = "https://www.vaticannews.va/etc.clientlibs/vaticannews/clientlibs/vaticannews-widgets/vaticannews-widget.js";
    script.async = true;
    document.body.appendChild(script);
  }, []);

  // --- UI ACTIONS ---
  const markInternalNav = () => {
    // Marca la navegación interna para que el splash NO se reproduzca en la
    // siguiente carga (por si algún cliente la convierte en carga completa).
    try { sessionStorage.setItem('pjl_skip_splash', String(Date.now())); } catch { /* ignore */ }
  };

  const navigate = (id: string, e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    trackInteraction(id);

    const pageIds = new Set([
      'home', 'estatuto', 'historia', 'institucional', 'consejo', 'zonas',
      'agenda', 'noticias', 'contacto', 'faq', 'preguntas', 'documentos'
    ]);
    
    // Si ya estamos en la página y es 'zonas', reseteamos la selección
    if (id === 'zonas') setSelectedZone(null);

    if (pageIds.has(id)) {
      markInternalNav();
      router.push(id === 'home' ? '/' : `/?page=${id}`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    
    // Si es un ID de sección (ancla), desplazamos suavemente
    const section = document.getElementById(id);
    if (section) {
      section.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    markInternalNav();
    router.push(`/?page=${id}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // El panel de notificaciones pide navegar a una sección (evento externo).
  useEffect(() => {
    const onNavReq = (e: Event) => {
      const detail = (e as CustomEvent<{ id?: string }>).detail;
      if (detail?.id) navigate(detail.id);
    };
    window.addEventListener('pjl_navigate', onNavReq);
    return () => window.removeEventListener('pjl_navigate', onNavReq);
  }, [navigate]);

  const toggleContrast = () => setIsHighContrast(!isHighContrast);
  const changeFont = (delta: number) => setFontSize((prev) => Math.max(12, Math.min(24, prev + delta)));

  const handleDownload = (data: string, filename: string) => {
    if (!data) return;
    const link = document.createElement('a');
    link.href = data;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Truncate bio to first sentence or 120 chars, with ellipsis
  const truncateBio = (bio: string, limit = 110) => {
    if (!bio) return '';
    const dot = bio.indexOf('.');
    const cut = dot > 0 && dot < limit ? dot + 1 : limit;
    return bio.length <= cut ? bio : bio.slice(0, cut).trimEnd() + '...';
  };

  // --- DATA ---
  const zonasInfo = [
    { id: 1, name: '' },
    { id: 2, name: '' },
    { id: 3, name: '' },
    { id: 4, name: '' }
  ];

  const councilTabs = [
    { id: 'coordinacion', label: 'Coordinación' },
    { id: 'efo', label: 'EFO' },
    { id: 'ecomu', label: 'ECOMU' },
    { id: 'eli', label: 'ELI' },
    { id: 'mmpjl', label: 'Música' }
  ];

  // Identidad visual y descripción de cada equipo del consejo
  const councilTabMeta: Record<string, { icon: string; desc: string }> = {
    coordinacion: { icon: '⛪', desc: 'Órgano de gobierno y planificación estratégica de la Pastoral Juvenil Luqueña.' },
    efo: { icon: '🎓', desc: 'Formación, retiros, talleres y capacitaciones para crecer en la fe.' },
    ecomu: { icon: '📡', desc: 'La voz digital de la comunidad: redes, boletín y comunicación institucional.' },
    eli: { icon: '🕯️', desc: 'Evangelización y liturgia al servicio de cada comunidad juvenil.' },
    mmpjl: { icon: '🎵', desc: 'Música y coral que acompañan cada celebración de la juventud luqueña.' }
  };

  const zoneColors = {
    1: branding.zona1Color || '#C8973A',
    2: branding.zona2Color || '#C8973A',
    3: branding.zona3Color || '#C8973A',
    4: branding.zona4Color || '#C8973A'
  };
  const activeHeroSlide = liveHeroImages[liveHeroIndex];
  const activeHeroPosition = activeHeroSlide
    ? mapHeroPosition(isMobileViewport ? activeHeroSlide.mobilePosition : activeHeroSlide.desktopPosition)
    : 'center center';

  // --- CONFIG: titulo y meta descripcion dinamicos ---
  useEffect(() => {
    const t = siteContent.siteTitle?.trim();
    if (t) document.title = t;
    const d = siteContent.siteDescription?.trim();
    if (d) {
      let md = document.querySelector('meta[name="description"]');
      if (!md) {
        md = document.createElement('meta');
        md.setAttribute('name', 'description');
        document.head.appendChild(md);
      }
      md.setAttribute('content', d);
    }
  }, [siteContent.siteTitle, siteContent.siteDescription]);

  // --- CONFIG: modo mantenimiento ---
  if (siteContent.maintenanceMode && !searchParams.get('preview')) {
    return <MaintenanceScreen message={siteContent.maintenanceMessage} email={siteContent.contactEmail} />;
  }

  const evgHoySections = evgHoyClassify(evgHoyData?.paragraphs);
  const evgHoyDate = evgHoyDateLabel(evgHoyData?.title, evgHoyData?.pubDate);

  const evgLabelOf = (label: string): string => (
    label === 'Segunda' ? 'Segunda lectura'
      : label === 'Evangelio' ? 'Evangelio'
      : label === 'Salmo' ? 'Salmo responsorial'
      : label === 'Pensamiento del día' ? 'Las palabras del Papa'
      : 'Primera lectura'
  );

  const evgHoyTitle = evgHoyData?.commemoration || evgHoyData?.title || siteContent.evangelioRef || 'Evangelio del día';

  const evangelioTextForCopy = [evgHoyTitle, evgHoySections.map(s => [evgLabelOf(s.label), s.reference, s.body.join('\n\n')].filter(Boolean).join('\n')).join('\n\n') || siteContent.evangelioTexto || '', EVANGELIO_SIG].filter(Boolean).join('\n\n');

  const renderEvangelioSections = () => {
    const link = evgHoyData?.link || EVH_BASE_URL;
    if (evgHoyLoading) {
      return (
        <div className="evh-load" role="status"><span className="evh-spin" aria-hidden="true"></span>Trayendo la Palabra del día…</div>
      );
    }
    if (evgHoyError || !evgHoySections.length) {
      return (
        <div className="evh-err">
          <p>No pudimos conectar con Vatican News ahora mismo.</p>
          <a className="evh-open-btn" href={link} target="_blank" rel="noreferrer">Abrir el Evangelio en Vatican News ↗</a>
        </div>
      );
    }
    return (
      <div className="evh-secs">
        {evgHoySections.map((sec, i) => (
          <section key={i} className={`evh-sec evh-sec--${sec.label === 'Pensamiento del día' ? 'pens' : sec.label === 'Segunda' ? 'segunda' : sec.label === 'Evangelio' ? 'evangelio' : sec.label === 'Salmo' ? 'salmo' : 'lectura'}`}>
            <div className="evh-sec-head">
              <span className="evh-kicker">{evgLabelOf(sec.label)}</span>
              {sec.heading && <h5>{sec.heading}</h5>}
              {sec.reference && <span className="evh-ref">{sec.reference}</span>}
            </div>
            {sec.body.map((p, j) => <p key={j}>{p}</p>)}
          </section>
        ))}
        <div className="evh-foot">
          <span className="evh-src">Fuente: Vatican News</span>
          <a className="evh-open-btn" href={link} target="_blank" rel="noreferrer">Leer completo en Vatican News ↗</a>
        </div>
      </div>
    );
  };

  return (
    <div className={isHighContrast ? 'high-contrast' : ''} style={{ '--font-size-base': `${fontSize}px` } as React.CSSProperties}>
      
      {/* FLOATING PERSISTENT LOGO */}
      {branding.mainLogo && (
        <div style={{
          position: 'fixed',
          bottom: '30px',
          right: '30px',
          width: '66px',
          height: '66px',
          zIndex: 9999,
          borderRadius: '50%',
          background: 'var(--white)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.14)',
          padding: '4px',
          border: '1px solid var(--gold-pale)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
        }} 
        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.1) rotate(5deg)')}
        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1) rotate(0deg)')}
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        title="Volver al inicio"
        >
          <img
            src={branding.mainLogo}
            className="logo-img-circular"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            alt="Logo flotante"
          />
        </div>
      )}

      {/* DATO DEL DÍA — curiosidades católicas de fuentes oficiales (vatican.va) */}
      <FactWidget />

      {/* 1. NAVBAR REFINADA */}
      <nav className={`top-nav ${navScrolled ? 'nav-scrolled' : ''} ${navEntered ? 'nav-entered' : ''}`}>
        <div className="container nav-content">
          <div
            className="logo-area brand-lockup"
            role="button"
            tabIndex={0}
            aria-label="PJL — Ir al inicio"
            onClick={() => navigate('home')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('home'); } }}
          >
            <span className="brand-logo-wrap">
              <span className="brand-logo-ring" aria-hidden="true"></span>
              <span className="brand-logo-halo" aria-hidden="true"></span>
              {branding.mainLogo ? (
                <img src={branding.mainLogo} className="logo-img-circular site-logo-img brand-logo" style={{ height: '60px', width: '60px' }} alt="Logotipo Principal PJL" />
              ) : (
                <span className="brand-logo brand-logo-fallback">†</span>
              )}
            </span>
            <span className="brand-text">
              <h1>PJL</h1>
              <p>Pastoral Juvenil Luqueña</p>
            </span>
          </div>
          <button
            className={`mobile-menu-toggle ${isMobileMenuOpen ? 'active' : ''}`}
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label={isMobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={isMobileMenuOpen}
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
          <ul className="nav-links">
            <li className={`nav-item ${activeSection === 'home' ? 'nav-item-active' : ''}`}>
              <button type="button" onClick={() => navigate('home')} data-nav="home" aria-current={activeSection === 'home' ? 'page' : undefined} className={`nav-btn ${activeSection === 'home' ? 'is-active' : ''}`}>
                <span className="nav-ico" aria-hidden="true">🏠</span>
                <span className="nav-txt">Inicio</span>
              </button>
            </li>
            <li className={`nav-item nav-item-featured ${activeSection === 'institucional' ? 'nav-item-active' : ''}`}>
              <button type="button" onClick={() => navigate('institucional')} data-nav="institucional" aria-current={activeSection === 'institucional' ? 'page' : undefined} className={`nav-btn has-caret ${activeSection === 'institucional' ? 'is-active' : ''}`}>
                <span className="nav-ico" aria-hidden="true">📖</span>
                <span className="nav-txt">Nosotros</span>
                <span className="nav-caret" aria-hidden="true">▾</span>
              </button>
              <div className="dropdown-pjl dropdown-pjl-featured dropdown-about">
                <div className="dd-head">📖 Nosotros</div>
                {[
                  { id: 'estatuto',      icon: '📜', tag: '#C8973A', t: 'Estatuto',        d: 'El marco y los principios que nos guían' },
                  { id: 'historia',      icon: '🏛️', tag: '#2563EB', t: 'Nuestra Historia', d: 'El camino de fe que nos trajo hasta hoy' },
                  { id: 'institucional', icon: '🕊️', tag: '#059669', t: 'Institucional',   d: 'Misión, visión y nuestra estructura' },
                ].map((it, i) => (
                  <button type="button" key={it.id} style={{ '--ad': `${i * 0.05}s`, '--tg': it.tag } as CSSProperties}
                    onClick={() => navigate(it.id)} className="dd-team dd-about">
                    <span className="dd-team-ico">{it.icon}</span>
                    <span className="dd-team-body">
                      <strong>{it.t}</strong>
                      <em>{it.d}</em>
                    </span>
                  </button>
                ))}
              </div>
            </li>
            <li className={`nav-item ${activeSection === 'consejo' ? 'nav-item-active' : ''}`}>
              <button type="button" onClick={() => navigate('consejo')} data-nav="consejo" data-tooltip="Conoce la estructura y líderes" aria-current={activeSection === 'consejo' ? 'page' : undefined} className={`nav-btn has-caret ${activeSection === 'consejo' ? 'is-active' : ''}`}>
                <span className="nav-ico" aria-hidden="true">👥</span>
                <span className="nav-txt">Consejo PJL</span>
                <span className="nav-caret" aria-hidden="true">▾</span>
              </button>
              <div className="dropdown-pjl dropdown-council">
                <div className="dd-head">👥 Consejo de la PJL</div>
                {councilTabs.map((t, i) => (
                  <button key={t.id} type="button" style={{ '--ad': `${i * 0.05}s` } as CSSProperties} onClick={() => { navigate('consejo'); setActiveConsejoTab(t.id); }}
                    className="dd-team">
                    <span className="dd-team-ico" style={{ '--tg': ['#C8973A','#2563EB','#059669','#7C3AED','#EF4444'][i % 5] } as CSSProperties}>{councilTabMeta[t.id]?.icon || '•'}</span>
                    <span className="dd-team-body">
                      <strong>{t.label}</strong>
                      <em>{councilTabMeta[t.id]?.desc || ''}</em>
                    </span>
                  </button>
                ))}
              </div>
            </li>
            <li className={`nav-item ${activeSection === 'zonas' ? 'nav-item-active' : ''}`}>
              <button type="button" onClick={() => navigate('zonas')} data-nav="zonas" data-tooltip="Explorar nuestras comunidades" aria-current={activeSection === 'zonas' ? 'page' : undefined} className={`nav-btn has-caret ${activeSection === 'zonas' ? 'is-active' : ''}`}>
                <span className="nav-ico" aria-hidden="true">🗺️</span>
                <span className="nav-txt">Zonas</span>
                <span className="nav-caret" aria-hidden="true">▾</span>
              </button>
              <div className="dropdown-pjl dropdown-zones">
                <div className="dd-head">🗺️ Nuestras Zonas Pastorales</div>
                {zonasInfo.map((z, i) => (
                  <button key={z.id} type="button" style={{ '--ad': `${i * 0.05}s` } as CSSProperties} onClick={() => { navigate('zonas'); setActiveZoneTab('capillas'); setSelectedZone(z.id); }}
                    className="dd-zone">
                    <span className="dd-zone-logo">
                      {branding[`zona${z.id}Logo`] ? (
                        <SafeImg src={branding[`zona${z.id}Logo`] as string} alt={`Logotipo de la Zona ${z.id}`} fallback={`${z.id}`} fallbackStyle={{ fontSize: '22px', fontWeight: 800 }} />
                      ) : (
                        <span className="dd-zone-fallback">{z.id}</span>
                      )}
                    </span>
                    <span className="dd-zone-body">
                      <strong>Zona {z.id}</strong>
                      <em>{z.name || `${['Centro','Norte','Sur','Este','Oeste'][z.id] || `Zona ${z.id}`}`}</em>
                    </span>
                  </button>
                ))}
              </div>
            </li>
            <li className={`nav-item ${activeSection === 'agenda' ? 'nav-item-active' : ''}`}>
              <button type="button" onClick={() => navigate('agenda')} data-nav="agenda" aria-current={activeSection === 'agenda' ? 'page' : undefined} className={`nav-btn ${activeSection === 'agenda' ? 'is-active' : ''}`}>
                <span className="nav-ico" aria-hidden="true">📅</span>
                <span className="nav-txt">Agenda</span>
              </button>
            </li>
            <li className={`nav-item ${activeSection === 'noticias' ? 'nav-item-active' : ''}`}>
              <button type="button" onClick={() => navigate('noticias')} data-nav="noticias" aria-current={activeSection === 'noticias' ? 'page' : undefined} className={`nav-btn ${activeSection === 'noticias' ? 'is-active' : ''}`}>
                <span className="nav-ico" aria-hidden="true">📰</span>
                <span className="nav-txt">Noticias</span>
              </button>
            </li>
            <li className={`nav-item ${activeSection === 'documentos' ? 'nav-item-active' : ''}`}>
              <button type="button" onClick={() => navigate('documentos')} data-nav="documentos" aria-current={activeSection === 'documentos' ? 'page' : undefined} className={`nav-btn ${activeSection === 'documentos' ? 'is-active' : ''}`}>
                <span className="nav-ico" aria-hidden="true">📁</span>
                <span className="nav-txt">Documentos</span>
              </button>
            </li>
            <li className={`nav-item ${activeSection === 'contacto' ? 'nav-item-active' : ''}`}>
              <button type="button" onClick={() => navigate('contacto')} data-nav="contacto" aria-current={activeSection === 'contacto' ? 'page' : undefined} className={`nav-btn ${activeSection === 'contacto' ? 'is-active' : ''}`}>
                <span className="nav-ico" aria-hidden="true">✉️</span>
                <span className="nav-txt">Contacto</span>
              </button>
            </li>

            <li className="nav-item">
              <a href="#" data-nav="vaticano" className="nav-btn has-caret">
                <span className="nav-ico" aria-hidden="true">🇻🇦</span>
                <span className="nav-txt">Vaticano</span>
                <span className="nav-caret" aria-hidden="true">▾</span>
              </a>
              <div className="dropdown-pjl dropdown-pjl-vatican" style={{ minWidth: '240px', padding: '15px' }}>
                {/* @ts-ignore */}
                <vaticannews-widget lang="es" fontSize="18"></vaticannews-widget>
              </div>
            </li>

            {hasEvangelio && (
              <li className="nav-item nav-item-icononly evangelio-nav-item">
                <button type="button" className="nav-btn evangelio-nav-btn" onClick={() => setEvangelioOpen(true)} title="Evangelio del día" aria-label="Evangelio del día">
                  <span className="nav-ico" aria-hidden="true">✝️</span>
                  <span className="nav-txt">Evangelio</span>
                </button>
              </li>
            )}

            <NavDownloadButton />
          </ul>
          <NotificationBell />
        </div>
      </nav>

      {/* MOBILE DRAWER */}
      {isMobileMenuOpen && (
        <div className="drawer-backdrop" onClick={() => setIsMobileMenuOpen(false)}></div>
      )}
      <div className={`mobile-nav-drawer ${isMobileMenuOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <div className="logo-area brand-lockup" style={{ cursor: 'pointer' }} onClick={() => { navigate('home'); setIsMobileMenuOpen(false); }}>
            <span className="brand-logo-wrap">
              <span className="brand-logo-halo" aria-hidden="true"></span>
              {branding.mainLogo ? <img src={branding.mainLogo} className="logo-img-circular site-logo-img brand-logo" style={{ height: '50px', width: '50px' }} alt="Logotipo Principal PJL" /> : <span className="brand-logo brand-logo-fallback" style={{ fontSize: '24px' }}>†</span>}
            </span>
            <div>
              <h2>PJL</h2>
              <p>Pastoral Juvenil Luqueña</p>
            </div>
          </div>
          <button className="drawer-close" onClick={() => setIsMobileMenuOpen(false)} aria-label="Cerrar menú">✕</button>
        </div>
        <div className="drawer-body">
          <ul className="drawer-links">
            <li>
              <Link href="/" onClick={(e) => { navigate('home', e); setIsMobileMenuOpen(false); }} className={`drawer-btn ${activeSection === 'home' ? 'is-active' : ''}`}><span className="drawer-ico" aria-hidden="true">🏠</span><span>Inicio</span></Link>
            </li>

            {hasEvangelio && (
              <li>
                <button onClick={() => { setEvangelioOpen(true); setIsMobileMenuOpen(false); }} className="drawer-btn">
                  <span className="drawer-ico" aria-hidden="true">✝️</span>
                  <span>Evangelio del día</span>
                </button>
              </li>
            )}

            <li>
              <button onClick={() => toggleMobileSubmenu('nosotros')} className={`drawer-btn dropdown-toggle ${activeSection === 'institucional' ? 'is-active' : ''}`}>
                <span className="drawer-ico" aria-hidden="true">📖</span>
                <span>Nosotros</span>
                <span className={`drawer-caret ${mobileSubmenuOpen['nosotros'] ? 'open' : ''}`}>▾</span>
              </button>
              {mobileSubmenuOpen['nosotros'] && (
                <ul className="drawer-sublinks drawer-sublinks-rich">
                  {[
                    { id: 'estatuto',      icon: '📜', tag: '#C8973A', t: 'Estatuto',          d: 'El marco y los principios que nos guían' },
                    { id: 'historia',      icon: '🏛️', tag: '#2563EB', t: 'Nuestra Historia',   d: 'El camino de fe que nos trajo hasta hoy' },
                    { id: 'institucional', icon: '🕊️', tag: '#059669', t: 'Institucional',     d: 'Misión, visión y nuestra estructura' },
                  ].map((it) => (
                    <li key={it.id}>
                      <Link href={`/?page=${it.id}`} onClick={(e) => { navigate(it.id, e); setIsMobileMenuOpen(false); }} className="drawer-sublink drawer-sublink-rich">
                        <span className="dd-team-ico" style={{ '--tg': it.tag } as CSSProperties}>{it.icon}</span>
                        <span className="dd-team-body"><strong>{it.t}</strong><em>{it.d}</em></span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>

            <li>
              <button onClick={() => toggleMobileSubmenu('consejo')} className={`drawer-btn dropdown-toggle ${activeSection === 'consejo' ? 'is-active' : ''}`}>
                <span className="drawer-ico" aria-hidden="true">👥</span>
                <span>Consejo PJL</span>
                <span className={`drawer-caret ${mobileSubmenuOpen['consejo'] ? 'open' : ''}`}>▾</span>
              </button>
              {mobileSubmenuOpen['consejo'] && (
                <ul className="drawer-sublinks drawer-sublinks-rich">
                  {councilTabs.map((t, i) => (
                    <li key={t.id}>
                      <Link href="/?page=consejo" onClick={(e) => { navigate('consejo', e); setActiveConsejoTab(t.id); setIsMobileMenuOpen(false); }} className="drawer-sublink drawer-sublink-rich">
                        <span className="dd-team-ico" style={{ '--tg': ['#C8973A','#2563EB','#059669','#7C3AED','#EF4444'][i % 5] } as CSSProperties}>{councilTabMeta[t.id]?.icon || '•'}</span>
                        <span className="dd-team-body"><strong>{t.label}</strong><em>{councilTabMeta[t.id]?.desc || ''}</em></span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>

            <li>
              <button onClick={() => toggleMobileSubmenu('zonas')} className={`drawer-btn dropdown-toggle ${activeSection === 'zonas' ? 'is-active' : ''}`}>
                <span className="drawer-ico" aria-hidden="true">🗺️</span>
                <span>Zonas</span>
                <span className={`drawer-caret ${mobileSubmenuOpen['zonas'] ? 'open' : ''}`}>▾</span>
              </button>
              {mobileSubmenuOpen['zonas'] && (
                <ul className="drawer-sublinks drawer-sublinks-rich">
                  {zonasInfo.map(z => (
                    <li key={z.id}>
                      <Link href="/?page=zonas" onClick={(e) => { navigate('zonas', e); setActiveZoneTab('capillas'); setSelectedZone(z.id); setIsMobileMenuOpen(false); }} className="drawer-sublink drawer-sublink-rich">
                        <span className="dd-zone-logo">
                          {branding[`zona${z.id}Logo`] ? (
                            <SafeImg src={branding[`zona${z.id}Logo`] as string} alt={`Logotipo de la Zona ${z.id}`} fallback={`${z.id}`} fallbackStyle={{ fontSize: '20px', fontWeight: 800 }} />
                          ) : (
                            <span className="dd-zone-fallback">{z.id}</span>
                          )}
                        </span>
                        <span className="dd-zone-body"><strong>Zona {z.id}</strong><em>{z.name || `${['Centro','Norte','Sur','Este','Oeste'][z.id] || `Zona ${z.id}`}`}</em></span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>

            <li>
              <Link href="/?page=agenda" onClick={(e) => { navigate('agenda', e); setIsMobileMenuOpen(false); }} className={`drawer-btn ${activeSection === 'agenda' ? 'is-active' : ''}`}><span className="drawer-ico" aria-hidden="true">📅</span><span>Agenda</span></Link>
            </li>
            <li>
              <Link href="/?page=noticias" onClick={(e) => { navigate('noticias', e); setIsMobileMenuOpen(false); }} className={`drawer-btn ${activeSection === 'noticias' ? 'is-active' : ''}`}><span className="drawer-ico" aria-hidden="true">📰</span><span>Noticias</span></Link>
            </li>
            <li>
              <Link href="/?page=documentos" onClick={(e) => { navigate('documentos', e); setIsMobileMenuOpen(false); }} className={`drawer-btn ${activeSection === 'documentos' ? 'is-active' : ''}`}><span className="drawer-ico" aria-hidden="true">📁</span><span>Documentos</span></Link>
            </li>
            <li>
              <Link href="/?page=contacto" onClick={(e) => { navigate('contacto', e); setIsMobileMenuOpen(false); }} className={`drawer-btn ${activeSection === 'contacto' ? 'is-active' : ''}`}><span className="drawer-ico" aria-hidden="true">✉️</span><span>Contacto</span></Link>
            </li>

            <li>
              <button onClick={() => toggleMobileSubmenu('vaticano')} className="drawer-btn dropdown-toggle">
                <span className="drawer-ico" aria-hidden="true">🇻🇦</span>
                <span>Vaticano</span>
                <span className={`drawer-caret ${mobileSubmenuOpen['vaticano'] ? 'open' : ''}`}>▾</span>
              </button>
              {mobileSubmenuOpen['vaticano'] && (
                <div className="drawer-vatican-widget" style={{ padding: '10px 15px' }}>
                  {/* @ts-ignore */}
                  <vaticannews-widget lang="es" fontSize="16"></vaticannews-widget>
                </div>
              )}
            </li>

            <NavDownloadButton variant="mobile" />
          </ul>
        </div>
      </div>

      {/* VATICAN SCRIPT */}
      <Script src="https://www.vaticannews.va/widget.js" strategy="lazyOnload" />

      {/* 3. CONTENIDO PRINCIPAL */}
      <main>
        

        {/* HOME PAGE */}
        {currentPage === 'home' && (
          <>
            <section className="hero-pjl" id="hero">
              <div className="hero-ornament"></div>
              
              {/* Images layer — absolute, full cover */}
              <div className="hero-bg-layer">
                {liveHeroImages.map((slide, i) => (
                  <div key={slide.id || i} className="hero-bg-slide" style={{ opacity: i === liveHeroIndex ? 1 : 0 }}>
                    <img src={slide.imageUrl} className="hero-bg-image" style={{ objectPosition: i === liveHeroIndex ? activeHeroPosition : 'center center' }} alt="" />
                    <div className="hero-bg-overlay" />
                  </div>
                ))}
                {liveHeroImages.length === 0 && <div style={{ position: 'absolute', inset: 0, background: 'var(--navy)' }} />}
              </div>

              {/* Content layer — always above images */}
              <div className="container hero-content-container hero-in">
                <div className="hero-welcome reveal">
                  <span className="hero-welcome-ico" aria-hidden="true">🔥</span>
                  <span className="hero-welcome-txt">¡Bienvenido, joven!</span>
                  <span className="hero-welcome-ico hero-welcome-ico-spark" aria-hidden="true">✨</span>
                </div>
                {liveHeroImages.length > 0 && (
                  <div className="hero-slide-meta">
                    Slide {liveHeroIndex + 1} de {liveHeroImages.length}
                  </div>
                )}
                <span className="hero-tag reveal">{siteContent.heroTag}</span>
                 <h2 className="reveal" style={{ marginBottom: '20px', lineHeight: 1.05, color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 900 }}>
                   <span dangerouslySetInnerHTML={{ __html: siteContent.heroTitle || '' }} />
                 </h2>
                 <p className="reveal" style={{ marginBottom: '35px', fontSize: '1.15rem', maxWidth: '580px', lineHeight: '1.75', color: 'rgba(255,255,255,0.85)' }}>
                   {siteContent.heroText}
                 </p>
                 <div className="reveal hero-cta-group" style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                   {siteContent.heroBtnText ? (
                     <button className="btn-pjl hero-primary-cta" style={{ padding: '15px 40px', color: 'var(--navy)', fontWeight: 700 }} onClick={() => navigate(siteContent.heroBtnLink?.replace('/', '') || 'contacto')}>{siteContent.heroBtnText}</button>
                   ) : (
                     <>
                       <button className="btn-pjl hero-primary-cta" style={{ padding: '15px 40px', color: 'var(--navy)', fontWeight: 700 }} onClick={() => navigate('estatuto')}>Conocer Estatuto</button>
                       <button className="btn-pjl hero-secondary-cta" style={{ padding: '15px 40px', border: '2px solid rgba(255,255,255,0.8)', color: '#fff', borderRadius: '8px' }} onClick={() => navigate('contacto')}>Contáctanos</button>
                     </>
                   )}
                 </div>
                {liveHeroImages.length > 1 && (
                  <div className="hero-controls" style={{ display: 'flex', gap: '8px', marginTop: '50px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="hero-nav-arrow"
                      onClick={() => setLiveHeroIndex(prev => (prev - 1 + liveHeroImages.length) % liveHeroImages.length)}
                      aria-label="Slide anterior"
                    >
                      ‹
                    </button>
                    {liveHeroImages.map((_, i) => (
                      <button key={i} onClick={() => setLiveHeroIndex(i)} className={`hero-dot-btn${i === liveHeroIndex ? ' is-active' : ''}`} style={{ background: i === liveHeroIndex ? 'var(--gold)' : 'rgba(255,255,255,0.35)', border: 'none', cursor: 'pointer', padding: 0 }} aria-label={`Ir al slide ${i + 1}`} />
                    ))}
                    <button
                      type="button"
                      className="hero-nav-arrow"
                      onClick={() => setLiveHeroIndex(prev => (prev + 1) % liveHeroImages.length)}
                      aria-label="Slide siguiente"
                    >
                      ›
                    </button>
                  </div>
                )}
              </div>
            </section>

            {/* MISIÓN VISIÓN VALORES */}
            <section className="section-pjl section-tint tint-violet" id="identidad">
              <div className="container">
                <div className="section-head reveal" onClick={() => navigate('identidad')} style={{ cursor: 'pointer' }}>
                  <span style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 700, letterSpacing: '2px', color: 'var(--gold)', textTransform: 'uppercase' }}>NUESTRA IDENTIDAD</span>
                  <h3 style={{ margin: '10px 0' }}>Misión, <i style={{ color: 'var(--gold)', fontFamily: 'var(--font-display)', fontWeight: 400 }}>Visión</i> y Valores</h3>
                  <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>Los pilares que guían el caminar de la Pastoral Juvenil Luqueña.</p>
                  <div className="line" style={{ margin: '0 auto' }}></div>
                </div>
                <div className="mvv-grid">
                  <div className="mvv-card reveal glass-panel click-card" style={{ animationDelay: '0.1s' }} onClick={() => navigate('identidad')}>
                    <div className="equipos-icon">🎯</div>
                    <h4>Misión</h4>
                    <p>{siteContent.mision || 'Acompañar a los jóvenes de la ciudad de Luque en su proceso de fe, formación integral y compromiso cristiano, desde los valores del Evangelio.'}</p>
                    <span className="card-arrow">Conocer más →</span>
                  </div>
                  <div className="mvv-card reveal glass-panel click-card" style={{ animationDelay: '0.2s' }} onClick={() => navigate('identidad')}>
                    <div className="equipos-icon">🔭</div>
                    <h4>Visión</h4>
                    <p>{siteContent.vision || 'Ser una pastoral juvenil dinámica, inclusiva y transformadora, que forme jóvenes líderes capaces de incidir positivamente en su comunidad.'}</p>
                    <span className="card-arrow">Conocer más →</span>
                  </div>
                  <div className="mvv-card reveal glass-panel click-card" style={{ animationDelay: '0.3s' }} onClick={() => navigate('identidad')}>
                    <div className="equipos-icon">💎</div>
                    <h4>Valores</h4>
                    <p>{siteContent.valores || 'Empatía, Servicio, Responsabilidad, Amor al prójimo, Respeto, Trabajo en equipo y Alegría cristiana.'}</p>
                    <span className="card-arrow">Conocer más →</span>
                  </div>
                </div>
              </div>
            </section>

            {/* INSTITUCIONAL SECTION - PREMIUM REDESIGN */}
            <section className="section-pjl" id="institucional-preview" style={{ 
              position: 'relative', 
              overflow: 'hidden',
              background: 'linear-gradient(155deg, var(--navy) 0%, var(--navy-mid) 60%, var(--navy-mid) 100%)',
              padding: '100px 0'
            }}>
              {/* Background decorative elements */}
              <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
                <div style={{ position: 'absolute', top: '-20%', right: '-10%', width: '700px', height: '700px', borderRadius: '50%', border: '1px solid rgba(200,151,58,0.12)', animation: 'spin-slow 40s linear infinite' }} />
                <div style={{ position: 'absolute', top: '-10%', right: '-5%', width: '500px', height: '500px', borderRadius: '50%', border: '1px dashed rgba(200,151,58,0.08)' }} />
                <div style={{ position: 'absolute', bottom: '-15%', left: '-8%', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(200,151,58,0.04) 0%, transparent 70%)' }} />
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '100%', height: '100%', background: 'radial-gradient(ellipse 60% 80% at 30% 50%, rgba(200,151,58,0.03) 0%, transparent 100%)' }} />
              </div>

              <div className="container" style={{ position: 'relative', zIndex: 2 }}>
                <div className="insti-premium-layout reveal">
                  
                  {/* LEFT: Text Content */}
                  <div className="insti-text-side">
                    <div style={{ marginBottom: '24px' }}>
                      <span style={{ 
                        display: 'inline-flex', alignItems: 'center', gap: '8px',
                        color: 'var(--gold)', fontWeight: 800, fontSize: '11px', 
                        letterSpacing: '3px', textTransform: 'uppercase',
                        padding: '6px 16px', borderRadius: '20px',
                        background: 'rgba(200,151,58,0.12)',
                        border: '1px solid rgba(200,151,58,0.25)',
                        marginBottom: '20px'
                      }}>
                        <span style={{ fontSize: '14px' }}>✦</span>
                        HISTORIA Y LEGADO
                      </span>
                    </div>
                    
                    <h3 style={{ 
                      fontSize: 'clamp(2rem, 4vw, 2.8rem)', 
                      marginBottom: '8px', 
                      color: '#fff',
                      lineHeight: 1.15,
                      fontFamily: 'var(--font-display)'
                    }}>
                      {siteContent.instiTitulo || 'Nuestra Identidad'}
                    </h3>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '20px 0 28px' }}>
                      <span style={{ height: '1px', flexGrow: 1, maxWidth: '50px', background: 'var(--gold)', opacity: 0.5 }}></span>
                      <span style={{ fontSize: '20px', color: 'var(--gold)', opacity: 0.8 }}>†</span>
                      <span style={{ height: '1px', flexGrow: 1, maxWidth: '50px', background: 'var(--gold)', opacity: 0.5 }}></span>
                    </div>

                    <p style={{ 
                      color: 'rgba(255,255,255,0.78)', 
                      fontSize: '1.05rem', 
                      lineHeight: '1.85',
                      marginBottom: '36px',
                      maxWidth: '520px'
                    }}>
                      {siteContent.instiDesc || 'Somos una comunidad pastoral que camina desde hace décadas en la fe y el compromiso juvenil de la ciudad de Luque.'}
                    </p>

                    {/* Stats row */}
                    <div style={{ 
                      display: 'flex', gap: '24px', flexWrap: 'wrap',
                      marginBottom: '40px'
                    }}>
                      {[
                        { value: siteContent.statsAnos || '20', label: 'Años de Fe' },
                        { value: siteContent.statsJovenes || '200+', label: 'Jóvenes' },
                        { value: siteContent.statsZonas || '4', label: 'Zonas' }
                      ].map((s, i) => (
                        <div key={i} style={{
                          textAlign: 'center',
                          padding: '16px 22px',
                          borderRadius: '16px',
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(200,151,58,0.2)',
                          backdropFilter: 'blur(10px)',
                          minWidth: '90px'
                        }}>
                          <div style={{ fontSize: '1.9rem', fontWeight: 900, color: 'var(--gold)', fontFamily: 'var(--font-display)', lineHeight: 1 }}>{s.value}</div>
                          <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '1.5px', marginTop: '6px' }}>{s.label}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                      <button 
                        style={{ 
                          padding: '14px 28px', borderRadius: '10px',
                          background: 'var(--gold)', color: 'var(--navy)',
                          fontWeight: 800, fontSize: '13px', letterSpacing: '1px',
                          textTransform: 'uppercase', border: 'none', cursor: 'pointer',
                          transition: 'all 0.3s ease',
                          boxShadow: '0 8px 20px rgba(200,151,58,0.35)'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 28px rgba(200,151,58,0.5)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(200,151,58,0.35)'; }}
                        onClick={() => navigate('historia')}
                      >
                        Nuestra Trayectoria
                      </button>
                      <button 
                        style={{ 
                          padding: '14px 28px', borderRadius: '10px',
                          background: 'transparent', color: '#fff',
                          fontWeight: 700, fontSize: '13px', letterSpacing: '1px',
                          textTransform: 'uppercase',
                          border: '1.5px solid rgba(255,255,255,0.25)', cursor: 'pointer',
                          transition: 'all 0.3s ease'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.color = 'var(--gold)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; e.currentTarget.style.color = '#fff'; }}
                        onClick={() => navigate('estatuto')}
                      >
                        Marco Legal
                      </button>
                    </div>
                  </div>

                  {/* RIGHT: Image + floating badge */}
                  <div className="insti-visual-side">
                    <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
                      {/* Outer glow frame */}
                      <div style={{
                        position: 'absolute', inset: '-12px',
                        borderRadius: '28px',
                        background: 'linear-gradient(135deg, rgba(200,151,58,0.3) 0%, rgba(200,151,58,0.05) 50%, rgba(200,151,58,0.15) 100%)',
                        filter: 'blur(20px)',
                        zIndex: 0
                      }} />
                      {/* Image border frame */}
                      <div style={{
                        position: 'absolute', inset: '-3px',
                        borderRadius: '24px',
                        background: 'linear-gradient(135deg, rgba(200,151,58,0.6), rgba(200,151,58,0.1), rgba(200,151,58,0.4))',
                        zIndex: 1
                      }} />
                      <img
                        src={siteContent.instiFoto || 'https://images.unsplash.com/photo-1544427928-c49cdfebf193?ixlib=rb-1.2.1&auto=format&fit=crop&w=900&q=80'}
                        onError={(e) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1544427928-c49cdfebf193?ixlib=rb-1.2.1&auto=format&fit=crop&w=900&q=80'; }}
                        alt="Imagen Institucional PJL"
                        style={{ 
                          width: '100%', 
                          borderRadius: '22px', 
                          display: 'block',
                          objectFit: 'cover',
                          aspectRatio: '4/3',
                          position: 'relative',
                          zIndex: 2
                        }}
                      />
                      {/* Floating badge */}
                      <div style={{
                        position: 'absolute',
                        bottom: '-18px',
                        right: '-18px',
                        width: '110px',
                        height: '110px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, var(--gold) 0%, #E8B85A 100%)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 10,
                        boxShadow: '0 12px 35px rgba(200,151,58,0.5)',
                        border: '4px solid rgba(26,39,68,0.9)'
                      }}>
                        <span style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--navy)', lineHeight: 1, fontFamily: 'var(--font-display)' }}>{siteContent.statsAnos || '20'}</span>
                        <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.8 }}>Años de Fe</span>
                      </div>
                      {/* Corner ornament */}
                      <div style={{
                        position: 'absolute',
                        top: '-14px',
                        left: '-14px',
                        width: '50px',
                        height: '50px',
                        borderRadius: '12px',
                        background: 'rgba(200,151,58,0.15)',
                        border: '1.5px solid rgba(200,151,58,0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '22px',
                        zIndex: 10
                      }}>✝</div>
                    </div>
                  </div>

                </div>
              </div>
            </section>


            {/* EQUIPOS Y CONSEJO */}
            <section className="section-pjl section-tint tint-blue" id="equipos">
              <div className="container">
                <div className="section-head reveal" onClick={() => navigate('equipos')} style={{ textAlign: 'center', cursor: 'pointer' }}>
                  <span style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 700, letterSpacing: '2px', color: 'var(--gold)', textTransform: 'uppercase' }}>{siteContent.equiposTag}</span>
                  <h3 style={{ margin: '10px 0' }} dangerouslySetInnerHTML={{ __html: siteContent.equiposTitle || '' }}></h3>
                  <div className="line" style={{ margin: '0 auto' }}></div>
                </div>
                <div className="mvv-grid">
                  {/* EFO */}
                  <div className="mvv-card equipos-card reveal click-card" style={{ textAlign: 'center' }} onClick={() => { setActiveConsejoTab('efo'); navigate('consejo'); }}>
                    <span className="mvv-watermark" aria-hidden="true">01</span>
                    <div className="equipos-icon"><span className="equipos-orbit" aria-hidden="true"></span>🎓</div>
                    <h4>Equipo de Formación</h4>
                    <p style={{ marginBottom: '18px', minHeight: '90px' }}>Responsable de los procesos formativos, retiros, talleres y capacitaciones para los jóvenes de la PJL.</p>
                    <span className="card-arrow">Explorar EFO →</span>
                  </div>
                  {/* ECO */}
                  <div className="mvv-card equipos-card reveal click-card" style={{ textAlign: 'center', animationDelay: '0.1s' }} onClick={() => { setActiveConsejoTab('ecomu'); navigate('consejo'); }}>
                    <span className="mvv-watermark" aria-hidden="true">02</span>
                    <div className="equipos-icon"><span className="equipos-orbit" aria-hidden="true"></span>📡</div>
                    <h4>Equipo de Comunicación</h4>
                    <p style={{ marginBottom: '18px', minHeight: '90px' }}>Gestiona las redes sociales, el boletín parroquial y toda la comunicación institucional de la PJL.</p>
                    <span className="card-arrow">Explorar ECOMU →</span>
                  </div>
                  {/* CPJ */}
                  <div className="mvv-card equipos-card reveal click-card" style={{ textAlign: 'center', animationDelay: '0.2s' }} onClick={() => { setActiveConsejoTab('coordinacion'); navigate('consejo'); }}>
                    <span className="mvv-watermark" aria-hidden="true">03</span>
                    <div className="equipos-icon"><span className="equipos-orbit" aria-hidden="true"></span>⛪</div>
                    <h4>Consejo Pastoral</h4>
                    <p style={{ marginBottom: '18px', minHeight: '90px' }}>Órgano de gobierno y planificación estratégica de la Pastoral Juvenil Luqueña a nivel general.</p>
                    <span className="card-arrow">Ver Miembros →</span>
                  </div>
                </div>
              </div>
            </section>

            {/* GRID DE ZONAS */}
            <section className="section-pjl section-tint tint-green">
              <div className="container">
                <div className="section-head reveal">
                  <span className="premium-label">{siteContent.zonasTag}</span>
                  <h3 dangerouslySetInnerHTML={{ __html: siteContent.zonasTitle || '' }}></h3>
                  <div className="line"></div>
                </div>
                <div className="zone-grid">
                  {zonasInfo.map((z, idx) => {
                    const zoneChapels = liveChapels.filter(chap => chap.zonaId === z.id);
                    const total = zoneChapels.length;
                    const activos = zoneChapels.filter(c => c.estadoComunidad === 'Activo').length;
                    const nucleacion = zoneChapels.filter(c => c.estadoComunidad === 'Nucleación').length;
                    const openZone = () => { setSelectedZone(z.id); navigate('zonas'); };

                    return (
                      <div key={z.id} className="zone-card reveal click-card" style={{ animationDelay: `${idx * 0.1}s` }} onClick={openZone}>
                        <div className="zone-card-header">
                          <h4>Zona {z.id}</h4>
                          {branding[`zona${z.id}Logo`] && <SafeImg src={branding[`zona${z.id}Logo`] as string} className="logo-img-circular" style={{ height: '40px', width: '40px' }} alt={`Logo zona ${z.id}`} fallback="🛡️" fallbackStyle={{ fontSize: '20px' }} />}
                        </div>
                        <div className="zone-card-body">
                          <p style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--gold)', marginBottom: '5px', fontSize: '18px' }}>{z.name}</p>

                          <div className="zone-meta" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '18px', color: 'var(--navy)', fontSize: '13px', fontWeight: 600 }}>
                            <span>{total} comunidades</span>
                            <span>{activos} activas</span>
                            <span>{nucleacion} nucleación</span>
                          </div>

                          <div style={{ marginTop: '0', marginBottom: '20px' }}>
                            <button className="btn-premium btn-premium-gold" style={{ width: '100%', fontSize: '12px', borderRadius: '999px', padding: '14px 18px' }} onClick={(e) => { e.stopPropagation(); openZone(); }}>
                              VER COMUNIDADES
                            </button>
                          </div>

                          <div className="zone-info" style={{ maxHeight: '140px', overflowY: 'auto', marginBottom: '15px' }}>
                            {zoneChapels.slice(0, 3).map((c, i) => (
                              <div key={i} className="zone-info-row">
                                <span>{c.name}</span>
                              </div>
                            ))}
                            {total > 3 && <p style={{ fontSize: '12px', color: 'var(--navy)', margin: '10px 0 0' }}>+ {total - 3} más...</p>}
                          </div>
                          <span className="card-arrow">Explorar zona →</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* NOTICIAS Y AGENDA SECTION */}
            <section className="section-pjl section-tint tint-gold">
              <div className="container agenda-split">
                {/* Column 1: News */}
                <div>
                  {/* VATICAN WIDGET EN NOTICIAS */}
                  <div className="vatican-widget-shell" style={{ marginBottom: '30px', background: 'var(--white)', padding: '15px', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', overflow: 'hidden', width: '100%', maxHeight: '400px' }}>
                     {/* @ts-ignore */}
                     <vaticannews-widget lang="es" fontSize="18"></vaticannews-widget>
                  </div>

                  <div className="section-head reveal">
                    <span style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 700, letterSpacing: '2px', color: 'var(--gold)', textTransform: 'uppercase' }}>{siteContent.newsTag}</span>
                    <h3 style={{ margin: '10px 0' }} dangerouslySetInnerHTML={{ __html: siteContent.newsTitle || '' }}></h3>
                    <div className="line"></div>
                  </div>
                  <div style={{ display: 'grid', gap: '30px' }}>
                    {liveNews.slice(0, 2).map((n, i) => (
                      <div key={n.id} className="news-highlight reveal" style={{ animationDelay: `${i * 0.1}s`, cursor: 'pointer', transition: '0.3s transform' }}
                           onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-4px)')}
                           onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
                           onClick={() => navigate('noticias')}>
                        <span className="date">
                          {new Date(n.date).toLocaleDateString('es-PY', { day: '2-digit', month: 'long', year: 'numeric' })}
                        </span>
                        <h4>{n.title}</h4>
                        <p>{(n.subtitle || n.body).substring(0, 150)}...</p>
                        <Link href="/" onClick={(e) => { e.stopPropagation(); navigate('noticias', e); }}>Leer artículo completo <span style={{ fontSize: '16px' }}>➞</span></Link>
                        <div style={{ marginTop: '12px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <ShareButton
                            title={n.title}
                            text={n.subtitle || (n.body || '').substring(0, 120)}
                            url={typeof window !== 'undefined' ? `${window.location.origin}/?page=noticias` : '/'}
                            label="Compartir"
                            className="news-share-btn"
                          />
                        </div>
                      </div>
                    ))}
                    {liveNews.length === 0 && (
                      <div className="pjl-empty-state">
                        <div className="empty-icon">📰</div>
                        <h4 className="empty-title">Aún no hay noticias publicadas</h4>
                        <p className="empty-desc">Las novedades de la comunidad aparecerán aquí. Podés explorar la agenda mientras tanto.</p>
                      </div>
                    )}
                  </div>
                  <div style={{ marginTop: '30px' }}>
                    <button className="btn-pjl" style={{ padding: '12px 30px', border: '1px solid var(--navy)', color: 'var(--navy)', background: 'transparent', fontWeight: 600, display: 'inline-block' }} onClick={() => navigate('noticias')}>+ Ver Todas las Noticias</button>
                  </div>
                </div>

                {/* Column 2: Agenda */}
                <div>
                  <div className="section-head reveal">
                    <span style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 700, letterSpacing: '2px', color: 'var(--gold)', textTransform: 'uppercase' }}>{siteContent.agendaTag}</span>
                    <h3 style={{ margin: '10px 0' }} dangerouslySetInnerHTML={{ __html: siteContent.agendaTitle || '' }}></h3>
                    <div className="line"></div>
                  </div>
                  <div className="timeline">
                    {liveActivities.slice(0, 3).map((a, i) => {
                      const dateObj = new Date(a.date);
                      return (
                        <div key={a.id} className="timeline-item reveal" style={{ animationDelay: `${i * 0.1}s` }}>
                          <div className="timeline-dot"></div>
                          <span className="timeline-date">{dateObj.toLocaleDateString('es-PY', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                          <div className="timeline-card" onClick={() => navigate('agenda')} style={{ cursor: 'pointer', transition: '0.3s transform' }}
                               onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-3px)')}
                               onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}>
                            <h4>{a.title}</h4>
                            <p>{a.description || a.category}</p>
                          </div>
                        </div>
                      );
                    })}
                    {liveActivities.length === 0 && (
                      <div className="pjl-empty-state">
                        <div className="empty-icon">🗓️</div>
                        <h4 className="empty-title">Agenda en preparación</h4>
                        <p className="empty-desc">Todavía no hay eventos próximos. Muy pronto vamos a anunciar nuevas actividades.</p>
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: '40px' }}>
                    <button className="btn-pjl" style={{ width: '100%', padding: '15px', background: 'var(--gold)', color: 'var(--navy)', fontWeight: 700, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }} onClick={() => navigate('agenda')}>
                      Ir a la Agenda Completa →
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}

        {/* ESTATUTO / OBJETIVO */}
        {currentPage === 'estatuto' && (
          <section className="section-pjl nosotros-page">
            <div className="container">
              <div className="nosotros-hero reveal" style={{ paddingBottom: '20px' }}>
                <div className="nosotros-hero-badge"><span>✦</span> NORMATIVA</div>
                <h2 className="serif nosotros-hero-title">Estatuto y <i style={{ color: 'var(--gold)', fontFamily: 'var(--font-display)' }}>Objetivos</i></h2>
                <div className="nosotros-hero-divider"><span className="dot">†</span></div>
              </div>

              <div className="estatuto-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
                <div className="mvv-card nosotros-ident-card reveal" style={{ '--ad': '0.05s' } as CSSProperties}>
                  <div className="equipos-icon">🎯</div>
                  <h4>Objetivo General</h4>
                  <p>{siteContent.objetivoGeneral || DEFAULT_CONTENT.objetivoGeneral}</p>
                </div>
                <div className="mvv-card nosotros-ident-card reveal" style={{ '--ad': '0.15s' } as CSSProperties}>
                  <div className="equipos-icon">🧭</div>
                  <h4>Líneas de Acción</h4>
                  <p>{siteContent.lineasAccion || DEFAULT_CONTENT.lineasAccion}</p>
                </div>
              </div>

              <div className="mvv-card reveal" style={{ '--ad': '0.2s', borderLeft: 'none', borderRight: '4px solid var(--gold)', borderRadius: '18px' } as CSSProperties}>
                <h4>📜 Cuerpo del Estatuto</h4>
                <p style={{ whiteSpace: 'pre-line' }}>{siteContent.estatuto || DEFAULT_CONTENT.estatuto}</p>
              </div>

              {(siteContent.organigrama || siteContent.decanato || siteContent.parroquia) && (
                <div className="estatuto-meta" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '32px' }}>
                  {siteContent.decanato && <div className="estatuto-mini reveal"><span>🏛️</span><strong>Decanato</strong><p>{siteContent.decanato}</p></div>}
                  {siteContent.parroquia && <div className="estatuto-mini reveal"><span>⛪</span><strong>Parroquia</strong><p>{siteContent.parroquia}</p></div>}
                  {siteContent.organigrama && <div className="estatuto-mini reveal"><span>🗂️</span><strong>Estructura</strong><p>{siteContent.organigrama}</p></div>}
                </div>
              )}
            </div>
          </section>
        )}

        {/* HISTORIA - TIMELINE */}
        {currentPage === 'historia' && (
          <section className="section-pjl history-premium-section nosotros-page">
            <div className="container">
              <div className="nosotros-hero reveal">
                <div className="nosotros-hero-badge"><span>✦</span> LEGADO</div>
                <h2 className="serif nosotros-hero-title">Nuestra <i style={{ color: 'var(--gold)', fontFamily: 'var(--font-display)' }}>Historia</i></h2>
                <div className="nosotros-hero-divider"><span className="dot">†</span></div>
                <p className="nosotros-hero-intro">{siteContent.nosotrosHistoria || 'Seguí la línea de tiempo...'}</p>
              </div>

              {/* CIFRAS / LOGROS */}
              {(siteContent.logros && siteContent.logros.length > 0) && (
                <div className="nosotros-logros" style={{ marginBottom: '56px' }}>
                  {siteContent.logros.map((lg, i) => (
                    <div key={lg.id} className="nosotros-logro reveal" style={{ '--ad': `${i * 0.09}s` } as CSSProperties}>
                      <span className="nl-ico">{lg.icon}</span>
                      <strong>{lg.valor}</strong>
                      <small>{lg.label}</small>
                    </div>
                  ))}
                </div>
              )}

              <div className="timeline">
                {siteContent.historiaTimeline && siteContent.historiaTimeline.length > 0 ? (
                  siteContent.historiaTimeline.map((item, i) => (
                    <div 
                      key={item.id} 
                      className="timeline-item reveal" 
                      style={{ animationDelay: `${i * 0.1}s`, cursor: 'pointer' }}
                      onClick={() => setSelectedHistoryItem(item)}
                    >
                      <div className="timeline-dot" style={{ background: item.accentColor || 'var(--gold)' }}></div>
                      <span className="timeline-date">{item.title}</span>
                      <div
                        className="timeline-premium-card"
                        style={{ '--timeline-accent': item.accentColor || 'var(--gold)' } as any}
                      >
                        {item.image && (
                          <div className="timeline-premium-media">
                            <img src={item.image} alt={item.title} />
                          </div>
                        )}
                        <div className="timeline-premium-body">
                          <div className="timeline-premium-topline">
                            <span>Memoria pastoral</span>
                            <span>{String(i + 1).padStart(2, '0')}</span>
                          </div>
                          <p style={{ whiteSpace: 'pre-line', margin: 0 }}>{item.text}</p>
                          <div className="timeline-premium-footer">
                            <span>Haz clic para ampliar</span>
                            <strong>Ver detalle</strong>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="pjl-empty-state" style={{ maxWidth: '560px', margin: '0 auto' }}>
                    <div className="empty-icon">📜</div>
                    <h4 className="empty-title">Nuestra historia se está escribiendo</h4>
                    <p className="empty-desc">Muy pronto vas a conocer los hitos que marcaron el camino de la Pastoral Juvenil Luqueña, año por año.</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* --- PAGE: INSTITUCIONAL --- */}
        {currentPage === 'institucional' && (
          <section className="section-pjl nosotros-page">
            <div className="container">
              {/* HERO DE INSTITUCIONAL */}
              <div className="nosotros-hero reveal">
                <div className="nosotros-hero-badge"><span>✦</span> QUIÉNES SOMOS</div>
                <h2 className="serif nosotros-hero-title">{siteContent.instiTitulo || 'Nuestra Identidad'}</h2>
                <div className="nosotros-hero-divider"><span className="dot">†</span></div>
                <p className="nosotros-hero-intro">{siteContent.nosotrosIntro || 'Somos la Pastoral Juvenil Luqueña, una comunidad eclesial viva...'}</p>
              </div>

              {/* CIFRAS / LOGROS */}
              {(siteContent.logros && siteContent.logros.length > 0) && (
                <div className="nosotros-logros">
                  {siteContent.logros.map((lg, i) => (
                    <div key={lg.id} className="nosotros-logro reveal" style={{ '--ad': `${i * 0.09}s` } as CSSProperties}>
                      <span className="nl-ico">{lg.icon}</span>
                      <strong>{lg.valor}</strong>
                      <small>{lg.label}</small>
                    </div>
                  ))}
                </div>
              )}

              {/* MISIÓN / VISIÓN / VALORES */}
              <div className="nosotros-identidad">
                <div className={`mvv-card nosotros-ident-card reveal ${siteContent.mision ? 'has' : ''}`} style={{ '--ad': '0.05s' } as CSSProperties}>
                  <div className="equipos-icon">🎯</div>
                  <h4>Misión</h4>
                  <p>{siteContent.mision || 'Acompañar a los jóvenes...'}</p>
                </div>
                <div className={`mvv-card nosotros-ident-card reveal ${siteContent.vision ? 'has' : ''}`} style={{ '--ad': '0.15s' } as CSSProperties}>
                  <div className="equipos-icon">🔭</div>
                  <h4>Visión</h4>
                  <p>{siteContent.vision || 'Ser una pastoral viva y misionera...'}</p>
                </div>
                <div className={`mvv-card nosotros-ident-card reveal ${siteContent.valores ? 'has' : ''}`} style={{ '--ad': '0.25s' } as CSSProperties}>
                  <div className="equipos-icon">💎</div>
                  <h4>Valores</h4>
                  <p>{siteContent.valores || 'Fe, Comunidad, Servicio...'}</p>
                </div>
              </div>

              {/* HISTORIA AMPLIADA + IMAGEN */}
              <div className="nosotros-historia">
                <div className="nh-media reveal">
                  {siteContent.instiFoto ? (
                    <img src={siteContent.instiFoto} alt="Imagen Institucional" />
                  ) : (
                    <div className="nh-media-placeholder">🕊️</div>
                  )}
                  <div className="nh-media-caption">{siteContent.instiSubtitle || ''}</div>
                </div>
                <div className="nh-text reveal" style={{ '--ad': '0.15s' } as CSSProperties}>
                  <span className="premium-label nh-eyebrow">NUESTRO CAMINO</span>
                  <h3 className="serif nh-title">Una historia de <i style={{ color: 'var(--gold)', fontFamily: 'var(--font-display)' }}>fe y servicio</i></h3>
                  <p>{siteContent.nosotrosHistoria || siteContent.instiDesc || 'Somos una pastoral que camina...'}</p>
                  {siteContent.decanato && <p><strong>Decanato:</strong> {siteContent.decanato}</p>}
                  {siteContent.parroquia && <p><strong>Parroquia:</strong> {siteContent.parroquia}</p>}
                </div>
              </div>

              {/* SERVICIOS / ÁREAS DE TRABAJO */}
              {(siteContent.servicios && siteContent.servicios.length > 0) && (
                <div className="nosotros-servicios">
                  <div className="ns-head reveal">
                    <span className="premium-label">ÁREAS DE TRABAJO</span>
                    <h3 className="serif">Así <i style={{ color: 'var(--gold)', fontFamily: 'var(--font-display)' }}>servimos</i></h3>
                  </div>
                  <div className="ns-grid">
                    {siteContent.servicios.map((sv, i) => (
                      <div key={sv.id} className="ns-card reveal" style={{ '--ad': `${i * 0.08}s`, '--ic': ['#C8973A','#2563EB','#059669','#7C3AED'][i % 4] } as CSSProperties}>
                        <span className="ns-icon">{sv.icon}</span>
                        <h4>{sv.title}</h4>
                        <p>{sv.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CONTACTO + HORARIOS */}
              <div className="nosotros-contacto">
                <div className="nc-block reveal">
                  <h4>📍 Dónde encontrarnos</h4>
                  <ul>
                    {siteContent.contactoSede && <li><span className="nc-k">Sede:</span> {siteContent.contactoSede}</li>}
                    {siteContent.contactoDireccion && <li><span className="nc-k">Dirección:</span> {siteContent.contactoDireccion}</li>}
                    {siteContent.contactoTel && <li><span className="nc-k">Teléfono:</span> {siteContent.contactoTel}</li>}
                    {siteContent.contactEmail && <li><span className="nc-k">Email:</span> {siteContent.contactEmail}</li>}
                    {siteContent.contactoWeb && <li><span className="nc-k">Web:</span> {siteContent.contactoWeb}</li>}
                  </ul>
                </div>
                <div className="nc-block reveal" style={{ '--ad': '0.12s' } as CSSProperties}>
                  <h4>🕐 Horarios de encuentro</h4>
                  <ul>
                    {siteContent.horariosEncuentro && <li><span className="nc-k">Encuentros:</span> {siteContent.horariosEncuentro}</li>}
                    {siteContent.horariosFormacion && <li><span className="nc-k">Formación:</span> {siteContent.horariosFormacion}</li>}
                    {siteContent.horariosMisaLocal && <li><span className="nc-k">Misas:</span> {siteContent.horariosMisaLocal}</li>}
                  </ul>
                  {!siteContent.horariosEncuentro && !siteContent.horariosFormacion && !siteContent.horariosMisaLocal && (
                    <p className="nc-empty">Consultá la agenda pastoral para conocer los horarios de cada encuentro.</p>
                  )}
                </div>
                <div className="nc-block nc-cta reveal" style={{ '--ad': '0.24s' } as CSSProperties}>
                  <span className="nc-cta-ico">🙌</span>
                  <h4>¿Querés sumarte?</h4>
                  <p>Acercate a tu capilla zonal o escribinos por nuestras redes. ¡Todos los jóvenes son bienvenidos!</p>
                  <button type="button" className="btn-premium btn-premium-gold" onClick={() => navigate('contacto')}>HABLEMOS</button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ZONAS OVERVIEW - when no zone selected */}
        {currentPage === 'zonas' && !selectedZone && (
          <section className="section-pjl" id="zonas">
            <div className="container">
              <div className="section-head reveal" onClick={() => navigate('zonas')}>
                <span className="premium-label">TERRITORIO</span>
                <h3>Nuestras <i>Zonas Pastorales</i></h3>
                <div className="line"></div>
              </div>

              <div className="zone-grid">
                {zonasInfo.map((z, idx) => {
                  const zoneChapels = liveChapels.filter(chap => chap.zonaId === z.id);
                  const total = zoneChapels.length;
                  const activos = zoneChapels.filter(c => c.estadoComunidad === 'Activo').length;
                  const nucleacion = zoneChapels.filter(c => c.estadoComunidad === 'Nucleación').length;

                  return (
                    <div key={z.id} className="zone-card reveal" style={{ animationDelay: `${idx * 0.1}s`, cursor: 'pointer' }}
                         onClick={() => { setActiveZoneTab('capillas'); setSelectedZone(z.id); }}>
                      <div className="zone-card-header">
                        <h4>Zona {z.id}</h4>
                        {branding[`zona${z.id}Logo`] && <SafeImg src={branding[`zona${z.id}Logo`] as string} className="logo-img-circular" style={{ height: '40px', width: '40px' }} alt={`Logotipo de la Zona ${z.id}`} fallback="🛡️" fallbackStyle={{ fontSize: '20px' }} />}
                      </div>
                      <div className="zone-card-body">
                        <p style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--gold)', marginBottom: '5px', fontSize: '18px' }}>{z.name}</p>
                        
                        {/* Estadísticas de Zona */}
                        <div className="zone-stats">
                          <div className="zone-stat"><strong>{total}</strong><span>Total</span></div>
                          <div className="zone-stat"><strong>{activos}</strong><span>Activos</span></div>
                          <div className="zone-stat"><strong>{nucleacion}</strong><span>Nuc.</span></div>
                        </div>

                        <div className="zone-info" style={{ maxHeight: '100px', overflowY: 'auto', marginBottom: '15px' }}>
                          {zoneChapels.slice(0, 3).map((c, i) => (
                            <div key={i} style={{ marginBottom: '5px', fontSize: '12px' }}>
                              <span style={{ color: 'var(--navy)', fontWeight: 600 }}>{c.name}</span>
                            </div>
                          ))}
                          {total > 3 && <p style={{ fontSize: '11px', color: 'var(--gold)', margin: 0 }}>+ {total - 3} más...</p>}
                        </div>
                        <button className="btn-premium btn-premium-gold" style={{ marginTop: 'auto', width: '100%' }}
                                onClick={(e) => { e.stopPropagation(); setActiveZoneTab('capillas'); setSelectedZone(z.id); }}>
                          VER ZONA {z.id} →
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* MAPA GENERAL DE ZONAS */}
              <div className="reveal" style={{ marginTop: '80px', marginBottom: '0' }}>
                <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                  <span className="premium-label" style={{ background: 'var(--cream)', color: 'var(--gold)', padding: '5px 15px', borderRadius: '20px' }}>MAPA TERRITORIAL</span>
                  <h3 className="serif" style={{ fontSize: '28px', color: 'var(--navy)', margin: '12px 0 8px' }}>Distribución de <i>Zonas Pastorales</i></h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Cada zona coloreada representa un territorio pastoral. Haz clic en los íconos para ver las capillas.</p>
                </div>
                <div style={{ borderRadius: '16px', overflow: 'hidden', border: '2px solid var(--gold-pale)', boxShadow: '0 15px 50px rgba(0,0,0,0.07)' }}>
                  <ZonaMap
                    chapels={liveChapels.map(c => ({ id: c.id, name: c.name, lat: c.lat, lng: c.lng, zonaId: c.zonaId, estadoComunidad: c.estadoComunidad, comunidadNombre: c.comunidadNombre }))}
                    selectedZone={null}
                    zoneColors={zoneColors}
                    height="480px"
                  />
                </div>
              </div>

              {/* LISTA GLOBAL DE COMUNIDADES (SOLICITADO) */}
              <div className="reveal" style={{ marginTop: '100px', background: '#fff', borderRadius: '24px', padding: '50px', border: '1px solid var(--gold-pale)', boxShadow: '0 20px 60px rgba(0,0,0,0.03)' }}>

                <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                  <span className="premium-label" style={{ background: 'var(--cream)', color: 'var(--gold)', padding: '5px 15px', borderRadius: '20px' }}>ORGANIZACIÓN</span>
                  <h3 className="serif" style={{ fontSize: '32px', color: 'var(--navy)', margin: '15px 0' }}>Directorio General de <i>Comunidades</i></h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Encuentra a todos los grupos juveniles activos en nuestro territorio pastoral.</p>
                </div>

                <div className="dir-filters" role="group" aria-label="Filtrar comunidades por zona">
                  <button type="button" onClick={() => setGlobalCommFilter('all')} className={`dir-filter ${globalCommFilter === 'all' ? 'is-active' : ''}`}>Todas</button>
                  {[1, 2, 3, 4].map(zId => (
                    <button key={zId} type="button" onClick={() => setGlobalCommFilter(zId)} className={`dir-filter ${globalCommFilter === zId ? 'is-active' : ''}`}>
                      <span className="df-dot" style={{ background: zoneColors[zId as 1 | 2 | 3 | 4] }} aria-hidden="true"></span>
                      Zona {zId}
                    </button>
                  ))}
                </div>

                <div key={globalCommFilter} className="dir-list">
                  {liveChapels
                    .filter(c => c.comunidadNombre && (globalCommFilter === 'all' || c.zonaId == globalCommFilter))
                    .sort((a, b) => a.zonaId - b.zonaId || a.comunidadNombre.localeCompare(b.comunidadNombre))
                    .map((c, i) => {
                      const open = expandedCommIds.has(c.id);
                      const accent = zoneColors[c.zonaId as 1 | 2 | 3 | 4];
                      return (
                        <div key={c.id}
                             className={`dir-card ${open ? 'is-open' : ''}`}
                             style={{ animationDelay: `${Math.min(i * 0.06, 0.6)}s`, '--zaccent': accent } as React.CSSProperties}>
                          <button type="button" className="dir-head" aria-expanded={open} onClick={() => toggleExpandedComm(c.id)}>
                            <span className="dir-logo" aria-hidden="true">
                              <SafeImg src={c.logoUrl} alt="" fallback="⛪" fallbackStyle={{ fontSize: '22px' }} />
                            </span>
                            <span className="dir-id">
                              <span className="dir-zone">Zona {c.zonaId}</span>
                              <strong className="dir-name">{c.comunidadNombre}</strong>
                              <span className="dir-church">⛪ {c.name}</span>
                            </span>
                            <span className={`dir-status ${c.estadoComunidad === 'Activo' ? 'is-ok' : 'is-nuc'}`}>
                              <i aria-hidden="true"></i>{c.estadoComunidad}
                            </span>
                            <span className="dir-chevron" aria-hidden="true">▾</span>
                          </button>
                          <div className="dir-body">
                            <div className="dir-body-in">
                              {c.address && (
                                <div className="dir-row">
                                  <span className="dr-ico" aria-hidden="true">📍</span>
                                  <div><p className="dr-label">DIRECCIÓN</p><p className="dr-val">{c.address}</p></div>
                                </div>
                              )}
                              <div className="dir-row">
                                <span className="dr-ico" aria-hidden="true">⛪</span>
                                <div><p className="dr-label">CAPILLA / SEDE</p><p className="dr-val">{c.name}</p></div>
                              </div>
                              <div className="dir-row">
                                <span className="dr-ico" aria-hidden="true">⚡</span>
                                <div><p className="dr-label">ESTADO DE LA COMUNIDAD</p><p className="dr-val">{c.estadoComunidad}</p></div>
                              </div>
                              <div className="dir-actions">
                                {c.locationUrl && (
                                  <a href={c.locationUrl} target="_blank" rel="noreferrer" className="dir-btn dir-btn-gold">🗺️ Ver en Google Maps</a>
                                )}
                                <button type="button" className="dir-btn dir-btn-line"
                                        onClick={(e) => { e.stopPropagation(); setSelectedZone(c.zonaId); setActiveZoneTab('capillas'); }}>
                                  Explorar la Zona {c.zonaId} <span aria-hidden="true">→</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
                {liveChapels.filter(c => c.comunidadNombre && (globalCommFilter === 'all' || c.zonaId == globalCommFilter)).length === 0 && (
                  <div className="pjl-empty-state">
                    <div className="empty-icon">⛪</div>
                    <h4 className="empty-title">No hay comunidades en esta vista</h4>
                    <p className="empty-desc">Probá con otra zona o mirá el mapa territorial para explorar todo el territorio pastoral.</p>
                    <button className="btn-premium btn-premium-gold" onClick={() => setGlobalCommFilter('all')}>Ver todas las zonas</button>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ZONAS DETAIL - zone selected */}
        {currentPage === 'zonas' && selectedZone && (
          <>
            <section className="zone-hero">
               <div className="container">
                  <button type="button" onClick={() => setSelectedZone(null)} className="zh-back">
                    <span aria-hidden="true">←</span> Volver a Zonas
                  </button>

                  <span className="zh-numeral" aria-hidden="true">{selectedZone}</span>
                  <div className="zh-auroras" aria-hidden="true"><span></span><span></span></div>

                  {branding[`zona${selectedZone}Logo`] && (
                    <div className="zone-crest reveal">
                      <span className="zc-halo" aria-hidden="true"></span>
                      <span className="zc-ring zc-ring-a" aria-hidden="true"></span>
                      <span className="zc-ring zc-ring-b" aria-hidden="true"></span>
                      <div className="zc-frame">
                        <SafeImg src={branding[`zona${selectedZone}Logo`] as string} className="zc-img" alt={`Logotipo de la Zona ${selectedZone}`} fallback="🛡️" fallbackStyle={{ fontSize: '56px' }} />
                      </div>
                    </div>
                  )}

                  <span className="premium-label">DIÓCESIS DE SAN LORENZO</span>
                  <h2 className="serif">Zona <em className="zh-gold">{selectedZone}</em></h2>
                  <div className="line" style={{ margin: '20px auto 24px', background: 'var(--gold)', width: '120px', height: '4px' }}></div>
                  <p style={{ fontSize: '1.8rem', color: 'rgba(255,255,255,0.9)', letterSpacing: '1px', fontFamily: 'var(--font-display)', fontWeight: 500 }}>
                    {zonasInfo.find(z => z.id === selectedZone)?.name || `${['Centro','Norte','Sur','Este','Oeste'][selectedZone] || `Zona ${selectedZone}`}`}
                  </p>

                  {(() => {
                    const zhChapels = liveChapels.filter(c => c.zonaId === selectedZone);
                    const zhTotal = zhChapels.length;
                    const zhActivos = zhChapels.filter(c => c.estadoComunidad === 'Activo').length;
                    const zhNucleacion = zhChapels.filter(c => c.estadoComunidad === 'Nucleación').length;
                    return (
                      <div className="zone-hero-stats reveal">
                        <div className="zh-stat"><strong>{zhTotal}</strong><span>Comunidades</span></div>
                        <div className="zh-stat"><strong>{zhActivos}</strong><span>Activas</span></div>
                        <div className="zh-stat"><strong>{zhNucleacion}</strong><span>Nucleación</span></div>
                      </div>
                    );
                  })()}
               </div>
            </section>

            <section className="section-pjl">
              <div className="container">
                <div className="zone-tabs reveal" role="tablist" aria-label="Secciones de la zona">
                  {([
                    { id: 'capillas', label: 'Capillas', ico: '⛪' },
                    { id: 'coordination', label: 'Coordinadores', ico: '👥' },
                    { id: 'mapa', label: 'Mapa', ico: '🗺️' }
                  ] as const).map((t, i) => (
                    <button key={t.id} type="button" role="tab" aria-selected={activeZoneTab === t.id}
                            onClick={() => setActiveZoneTab(t.id)}
                            className={`zone-tab ${activeZoneTab === t.id ? 'is-active' : ''}`}
                            style={{ animationDelay: `${i * 0.08}s` }}>
                      <span className="zt-ico" aria-hidden="true">{t.ico}</span>
                      <span className="zt-txt">{t.label}</span>
                      <span className="zt-bar" aria-hidden="true"></span>
                    </button>
                  ))}
                </div>

                {activeZoneTab === 'capillas' && (
                  <div className="zone-grid">
                    {liveChapels.filter(c => c.zonaId === selectedZone).map((c, i) => (
                      <div key={c.id} className="chapel-premium-card reveal" style={{ animationDelay: `${i * 0.1}s` }}>
                        <div className="chapel-photo">
                          <SafeImg src={c.photo} alt={`Foto de la Capilla ${c.name}`} fallback="⛪" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <span className={`chapel-status-tag ${c.estadoComunidad === 'Activo' ? 'is-active' : 'is-nucleation'}`}>
                            {c.estadoComunidad}
                          </span>
                        </div>
                        <div className="chapel-details">
                          <h4 style={{ fontSize: '1.2rem', color: 'var(--navy)', marginBottom: '10px' }}>{c.name}</h4>
                          <div className="detail-item" style={{ alignItems: 'center' }}>
                            {c.logoUrl ? (
                               <div style={{ width: '40px', height: '40px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '1px solid var(--gold-pale)' }}>
                                 <SafeImg src={c.logoUrl} alt={`Logo de la Comunidad ${c.comunidadNombre}`} fallback="👥" fallbackStyle={{ fontSize: '18px' }} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                               </div>
                            ) : (
                               <span className="icon">👥</span>
                            )}
                            <div>
                              <p className="label">COMUNIDAD JUVENIL</p>
                              <p className="value">{c.comunidadNombre || 'En formación'}</p>
                            </div>
                          </div>
                          {c.address && (
                            <div className="detail-item">
                              <span className="icon">📍</span>
                              <div>
                                <p className="label">DIRECCIÓN</p>
                                <p className="value">{c.address}</p>
                              </div>
                            </div>
                          )}
                          {c.locationUrl && (
                            <a href={c.locationUrl} target="_blank" rel="noreferrer" className="btn-premium btn-premium-gold" style={{ marginTop: '20px', width: '100%', fontSize: '0.75rem', padding: '12px' }}>
                              VER EN GOOGLE MAPS
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                    {liveChapels.filter(c => c.zonaId === selectedZone).length === 0 && (
                      <div className="pjl-empty-state" style={{ gridColumn: '1 / -1' }}>
                        <div className="empty-icon">⛪</div>
                        <h4 className="empty-title">Capillas en actualización</h4>
                        <p className="empty-desc">Todavía no hay capillas registradas en esta zona. Volvé a visitarla pronto.</p>
                      </div>
                    )}
                  </div>
                )}

                {activeZoneTab === 'coordination' && (
                  <div className="zone-grid" style={{ justifyContent: 'center' }}>
                    {liveProfiles.filter(p => p.teamKey === `zona${selectedZone}`).map((p, idx) => (
                      <div key={p.id} className="profile-card reveal" style={{ animationDelay: `${idx * 0.1}s` }}>
                        <div className="profile-card-top">
                           <img src={p.photo || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'} className="profile-icon-3d" alt={p.name} />
                        </div>
                        <div className="profile-card-bottom">
                          <h4>{p.name}</h4>
                          <p className="profile-card-role">{p.role}</p>
                          <div className="profile-card-bio" style={{ textAlign: 'center', minHeight: '60px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                            {p.bio ? (
                              <>
                                {truncateBio(p.bio)}{' '}
<button type="button" onClick={() => setSelectedProfile(p)} className="pc-more">Leer más</button>
                              </>
                            ) : (
                              <p style={{ fontStyle: 'italic', fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>Responsable de la animación y comunión en esta zona.</p>
                            )}
                          </div>
                          <button onClick={() => p.cvUrl && handleDownload(p.cvUrl, `CV_${p.name}.pdf`)} className="btn-cv-pjl">
                            <span>📄</span> Currículum Pastoral
                          </button>
                        </div>
                      </div>
                    ))}
                    {liveProfiles.filter(p => p.teamKey === `zona${selectedZone}`).length === 0 && (
                      <div className="pjl-empty-state" style={{ gridColumn: '1 / -1' }}>
                        <div className="empty-icon">👥</div>
                        <h4 className="empty-title">Coordinadores en actualización</h4>
                        <p className="empty-desc">El equipo de coordinación de esta zona se estará publicando próximamente.</p>
                      </div>
                    )}
                  </div>
                )}

                {activeZoneTab === 'mapa' && (
                  <div>
                    <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <h4 style={{ margin: 0, color: 'var(--navy)' }}>🗺️ Mapa Zona {selectedZone}</h4>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Las capillas aparecen marcadas con íconos de color. Haz clic en cada marcador para ver los detalles.</span>
                    </div>
                    <div style={{ borderRadius: '14px', overflow: 'hidden', border: '2px solid var(--gold-pale)', boxShadow: '0 10px 40px rgba(0,0,0,0.06)' }}>
                      <ZonaMap
                        chapels={liveChapels.map(c => ({ 
                          id: c.id, 
                          name: c.name, 
                          lat: c.lat, 
                          lng: c.lng, 
                          zonaId: c.zonaId, 
                          estadoComunidad: c.estadoComunidad, 
                          comunidadNombre: c.comunidadNombre,
                          markerColor: c.markerColor
                        }))}
                        selectedZone={selectedZone}
                        zoneColors={zoneColors}
                        showAllZones={branding.showAllZones}
                        height="520px"
                      />
                    </div>
                  </div>
                )}



                {/* DIRECTORIO DE COMUNIDADES DE ESTA ZONA (mismo estilo que el directorio general) */}
                <div className="reveal" style={{ marginTop: '80px', borderTop: '2px solid var(--gold-pale)', paddingTop: '60px' }}>
                  <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                    <span className="premium-label" style={{ background: 'var(--cream)', color: 'var(--gold)', padding: '5px 15px', borderRadius: '20px' }}>ORGANIZACIÓN</span>
                    <h4 className="serif" style={{ fontSize: '28px', color: 'var(--navy)', margin: '15px 0 8px' }}>Directorio de Comunidades · <i>Zona {selectedZone}</i></h4>
                    <p style={{ color: 'var(--gold)', fontSize: '14px' }}>Encuentra a todos los grupos juveniles activos de esta zona pastoral.</p>
                  </div>

                  <div className="dir-list">
                    {liveChapels
                      .filter(c => c.zonaId === selectedZone && c.comunidadNombre)
                      .sort((a, b) => a.comunidadNombre.localeCompare(b.comunidadNombre))
                      .map((c, i) => {
                        const open = expandedCommIds.has(c.id);
                        const accent = zoneColors[c.zonaId as 1 | 2 | 3 | 4];
                        return (
                          <div key={c.id}
                               className={`dir-card ${open ? 'is-open' : ''}`}
                               style={{ animationDelay: `${Math.min(i * 0.06, 0.6)}s`, '--zaccent': accent } as React.CSSProperties}>
                            <button type="button" className="dir-head" aria-expanded={open} onClick={() => toggleExpandedComm(c.id)}>
                              <span className="dir-logo" aria-hidden="true">
                                <SafeImg src={c.logoUrl} alt="" fallback="⛪" fallbackStyle={{ fontSize: '22px' }} />
                              </span>
                              <span className="dir-id">
                                <span className="dir-zone">Zona {c.zonaId}</span>
                                <strong className="dir-name">{c.comunidadNombre}</strong>
                                <span className="dir-church">⛪ {c.name}</span>
                              </span>
                              <span className={`dir-status ${c.estadoComunidad === 'Activo' ? 'is-ok' : 'is-nuc'}`}>
                                <i aria-hidden="true"></i>{c.estadoComunidad}
                              </span>
                              <span className="dir-chevron" aria-hidden="true">▾</span>
                            </button>
                            <div className="dir-body">
                              <div className="dir-body-in">
                                {c.address && (
                                  <div className="dir-row">
                                    <span className="dr-ico" aria-hidden="true">📍</span>
                                    <div><p className="dr-label">DIRECCIÓN</p><p className="dr-val">{c.address}</p></div>
                                  </div>
                                )}
                                <div className="dir-row">
                                  <span className="dr-ico" aria-hidden="true">⛪</span>
                                  <div><p className="dr-label">CAPILLA / SEDE</p><p className="dr-val">{c.name}</p></div>
                                </div>
                                <div className="dir-row">
                                  <span className="dr-ico" aria-hidden="true">⚡</span>
                                  <div><p className="dr-label">ESTADO DE LA COMUNIDAD</p><p className="dr-val">{c.estadoComunidad}</p></div>
                                </div>
                                <div className="dir-actions">
                                  {c.locationUrl && (
                                    <a href={c.locationUrl} target="_blank" rel="noreferrer" className="dir-btn dir-btn-gold">🗺️ Ver en Google Maps</a>
                                  )}
                                  <button type="button" className="dir-btn dir-btn-line"
                                          onClick={(e) => { e.stopPropagation(); setActiveZoneTab('capillas'); }}>
                                    Ver en Capillas <span aria-hidden="true">→</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                  {liveChapels.filter(c => c.zonaId === selectedZone && c.comunidadNombre).length === 0 && (
                    <div className="pjl-empty-state">
                      <div className="empty-icon">⛪</div>
                      <h4 className="empty-title">No hay comunidades en esta zona</h4>
                      <p className="empty-desc">Las comunidades de esta zona se irán publicando próximamente. Volvé a visitarla pronto.</p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </>
        )}

        {/* CONSEJO PJL */}
        {currentPage === 'consejo' && (
          <section className="section-pjl section-tint tint-blue">
            <div className="container">
              <div className="section-head reveal">
                <span className="premium-label">EQUIPO LÍDER</span>
                <h3>Consejo <i>PJL Luque</i></h3>
                <div className="line"></div>
              </div>
              <div className="council-tabs reveal" role="tablist" aria-label="Equipos del Consejo">
                {councilTabs.map(t => (
                  <button key={t.id} type="button" role="tab" aria-selected={activeConsejoTab === t.id}
                          onClick={() => setActiveConsejoTab(t.id)}
                          className={`council-tab ${activeConsejoTab === t.id ? 'is-active' : ''}`}>
                    <span className="ct-ico" aria-hidden="true">{councilTabMeta[t.id]?.icon}</span>
                    <span className="ct-txt">{t.label}</span>
                  </button>
                ))}
              </div>
              {councilTabMeta[activeConsejoTab] && (
                <p key={activeConsejoTab} className="council-tab-desc">
                  <span aria-hidden="true">{councilTabMeta[activeConsejoTab].icon}</span>
                  {councilTabMeta[activeConsejoTab].desc}
                </p>
              )}

              {/* Representantes: show one coordinator per zone + team leads */}
              {activeConsejoTab === 'representantes' ? (
                <div>
                  <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '40px', fontStyle: 'italic' }}>Coordinadores Zonales y líderes de cada equipo</p>
                  <div className="zone-grid" style={{ justifyContent: 'center' }}>
                    {/* Zone coordinators */}
                    {zonasInfo.map((z, idx) => {
                      const coord = liveProfiles.find(p => p.teamKey === `zona${z.id}`);
                      if (!coord) return null;
                      return (
                        <div key={`zona${z.id}`} className="profile-card reveal" style={{ animationDelay: `${idx * 0.1}s` }}>
                          <div className="profile-card-top" style={{ position: 'relative' }}>
                            <div style={{ position: 'absolute', top: '15px', left: '15px', background: 'var(--gold)', color: 'var(--navy)', padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700 }}>Zona {z.id}</div>
                            <img src={coord.photo || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'} className="profile-icon-3d" alt={coord.name} />
                          </div>
                          <div className="profile-card-bottom">
                            <h4>{coord.name}</h4>
                            <p className="profile-card-role">{z.name}</p>
                            <p className="profile-card-bio" style={{ textAlign: 'center' }}>
                              {truncateBio(coord.bio)}{' '}
                              <button type="button" onClick={() => setSelectedProfile(coord)} className="pc-more">Leer más</button>
                            </p>
                            {coord.cvUrl && (
                              <button onClick={() => handleDownload(coord.cvUrl!, `CV_${coord.name}.pdf`)} className="btn-cv-pjl">
                                <span>📄</span> Currículum Pastoral
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {/* Team coordinators */}
                    {(['coordinacion', 'efo', 'ecomu', 'eli', 'mmpjl'] as const).map((tk, idx) => {
                      const coord = liveProfiles.find(p => p.teamKey === tk);
                      if (!coord) return null;
                      return (
                        <div key={tk} className="profile-card reveal" style={{ animationDelay: `${(idx + 4) * 0.1}s` }}>
                          <div className="profile-card-top">
                            <img src={coord.photo || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'} className="profile-icon-3d" alt={coord.name} />
                          </div>
                          <div className="profile-card-bottom">
                            <h4>{coord.name}</h4>
                            <p className="profile-card-role">{tk.toUpperCase()}</p>
                            <p className="profile-card-bio" style={{ textAlign: 'center' }}>
                              {truncateBio(coord.bio)}{' '}
                              <button type="button" onClick={() => setSelectedProfile(coord)} className="pc-more">Leer más</button>
                            </p>
                            {coord.cvUrl && (
                              <button onClick={() => handleDownload(coord.cvUrl!, `CV_${coord.name}.pdf`)} className="btn-cv-pjl">
                                <span>📄</span> Currículum Pastoral
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {!liveProfiles.some(p => ['zona1','zona2','zona3','zona4','coordinacion','efo','ecomu','eli','mmpjl'].includes(p.teamKey || '')) && (
                      <div className="pjl-empty-state" style={{ gridColumn: '1 / -1' }}>
                        <div className="empty-icon">🤝</div>
                        <h4 className="empty-title">Representantes en actualización</h4>
                        <p className="empty-desc">Los coordinadores zonales y de equipo se estarán publicando próximamente.</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="zone-grid" style={{ justifyContent: 'center' }}>
                  {liveProfiles.filter(p => p.teamKey === activeConsejoTab).map((p, idx) => (
                    <div key={p.id} className="profile-card reveal" style={{ animationDelay: `${idx * 0.2}s` }}>
                      <div className="profile-card-top">
                        <img src={p.photo || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'} className="profile-icon-3d" alt={p.name} />
                      </div>
                      <div className="profile-card-bottom">
                        <h4>{p.name}</h4>
                        <p className="profile-card-role">{p.role}</p>
                        <div className="profile-card-bio" style={{ textAlign: 'center', minHeight: '60px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                          {p.bio ? (
                            <>
                              {truncateBio(p.bio)}{' '}
                              <button onClick={() => setSelectedProfile(p)} style={{ background:'none', border:'none', color:'var(--gold)', fontWeight:700, fontSize:'13px', cursor:'pointer', padding:0 }}>Leer más</button>
                            </>
                          ) : (
                            <p style={{ fontStyle: 'italic', fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>Colaborador activo del Consejo PJL Luque.</p>
                          )}
                        </div>
                        {(p.quote && p.quote !== '') && (
                          <div className="profile-quote">
                            <span className="quote-mark">&#8220;</span>
                            {p.quote.replace(/"/g, '')}
                          </div>
                        )}
                        {p.cvUrl && (
                          <button onClick={() => handleDownload(p.cvUrl!, `CV_${p.name}.pdf`)} className="btn-cv-pjl">
                            <span>📄</span> Currículum Pastoral
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {liveProfiles.filter(p => p.teamKey === activeConsejoTab).length === 0 && (
                    <div className="pjl-empty-state" style={{ gridColumn: '1 / -1' }}>
                      <div className="empty-icon">👥</div>
                      <h4 className="empty-title">Integrantes en actualización</h4>
                      <p className="empty-desc">Estamos preparando la información de este equipo. Muy pronto vas a conocer a sus miembros.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* INSTITUCIONAL */}
        {currentPage === 'institucional' && (
          <section className="section-pjl section-tint tint-green" id="info-institucional">
            <div className="container">
              <div className="section-head reveal" onClick={() => navigate('institucional')}>
                <h3>Información Institucional</h3>
                <div className="line"></div>
              </div>
              <div className="mvv-grid">
                <div className="mvv-card">
                  <h4>Parroquia</h4>
                  <p>{siteContent.parroquia}</p>
                  <h4 style={{ marginTop: '20px' }}>Decanato</h4>
                  <p>{siteContent.decanato}</p>
                </div>
                <div className="mvv-card">
                  <h4>Secretaría</h4>
                  <p style={{ whiteSpace: 'pre-line' }}>{siteContent.horariosSecretaria}</p>
                </div>
                <div className="mvv-card">
                  <h4>Misas y Confesiones</h4>
                  <p style={{ whiteSpace: 'pre-line' }}>{siteContent.horariosMisa}</p>
                  <h4 style={{ marginTop: '20px' }}>Atención Sacerdotal</h4>
                  <p>{siteContent.atencionSacerdotal}</p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* --- PAGE: AGENDA --- */}
        {currentPage === 'agenda' && (
          <section className="section-pjl section-tint tint-gold" id="agenda">
            <div className="container agenda-split">
              {/* Timeline (Left Column) */}
              <div>
                <div className="section-head reveal" onClick={() => navigate('agenda')}>
                  <span style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 700, letterSpacing: '2px', color: 'var(--gold)', textTransform: 'uppercase' }}>CRONOGRAMA</span>
                  <h3 style={{ margin: '10px 0' }}>Agenda Pastoral</h3>
                  <div className="line"></div>
                </div>
                <div className="timeline">
                  {liveActivities.length > 0 ? liveActivities.map((a, i) => {
                    const dateObj = new Date(a.date);
                    return (
                      <div key={a.id} className="timeline-item reveal" style={{ animationDelay: `${i * 0.1}s` }}>
                        <div className="timeline-dot"></div>
                        <span className="timeline-date">{dateObj.toLocaleDateString('es-PY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                        <div className="timeline-card">
                          <span style={{ color: 'var(--gold)', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}>{a.category}</span>
                          <h4 style={{ margin: '8px 0' }}>{a.title}</h4>
                          <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)' }}>{a.description || 'Consulta los detalles de este evento.'}</p>
                          {a.inscription && (
                            <button
                              className="btn-pjl"
                              style={{ marginTop: '15px', padding: '10px 20px', border: '1px solid var(--navy)', color: 'var(--navy)', background: 'transparent', fontSize: '13px', borderRadius: '8px', fontWeight: 600, boxShadow: 'none' }}
                              onClick={() => {
                                const waNumber = liveSocial.whatsapp.replace(/\D/g, '');
                                const texto = encodeURIComponent(`Hola, quiero inscribirme al evento "${a.title}" de la Agenda Pastoral.`);
                                if (waNumber) window.open(`https://wa.me/${waNumber}?text=${texto}`, '_blank', 'noopener');
                                else navigate('contacto');
                              }}
                            >
                              Inscribirse al Evento
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="pjl-empty-state">
                      <div className="empty-icon">🗓️</div>
                      <h4 className="empty-title">Agenda en preparación</h4>
                      <p className="empty-desc">No hay actividades programadas por el momento. Podés sincronizar la agenda con Google Calendar para no perderte nada.</p>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Columna derecha: Agenda PJL + Calendario institucional */}
              <div>
                <div className="section-head reveal" onClick={() => navigate('agenda')}>
                  <span style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 700, letterSpacing: '2px', color: 'var(--gold)', textTransform: 'uppercase' }}>SINCRONIZACIÓN AUTOMÁTICA</span>
                  <h3 style={{ margin: '10px 0' }}>Agenda &amp; Calendario</h3>
                  <div className="line"></div>
                </div>

                <div className="ag-export reveal" style={{ animationDelay: '0.05s' }}>
                  <button className="ag-export-btn" onClick={downloadAgendaIcs}>
                    📅 Añadir toda la agenda a mi Google Calendar
                  </button>
                  <small>Descargá el archivo de eventos (.ics) e impórtalo: Google Calendar → ⚙ Ajustes → Importar y exportar.</small>
                </div>

                <div className="reveal" style={{ animationDelay: '0.15s' }}>
                  <AgendaCalendar
                    activities={liveActivities}
                    news={liveNews}
                    onOpenNews={(n) => setSelectedNews(n)}
                  />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* --- PAGE: NOTICIAS --- */}
        {currentPage === 'noticias' && (
          <section className="section-pjl section-tint tint-blue" id="noticias">
            <div className="container">
              <div className="section-head reveal">
                <span className="premium-label">COMUNIDAD</span>
                <h3>Boletín de <i>Noticias</i></h3>
                <p style={{ color: 'var(--text-muted)', maxWidth: '620px', margin: '10px auto 0', fontSize: '15px' }}>
                  Novedades, crónicas y anuncios de la Pastoral Juvenil Luqueña.
                </p>
                <div className="line"></div>
              </div>

              {/* HERO · NOTICIA DESTACADA + PANEL DE EXPLORACIÓN */}
              {liveNews.length > 0 && (
                <div className="nhero">
                  <article
                    className="nh-main"
                    onClick={() => setSelectedNews(liveNews[0])}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter') setSelectedNews(liveNews[0]); }}
                  >
                    {liveNews[0].featured_image_url && (
                      <img src={liveNews[0].featured_image_url} alt="" className="nh-img" />
                    )}
                    <span className="nh-flag">✦ DESTACADA</span>
                    <div className="nh-body">
                      <div className="nh-chips">
                        <span className="nh-chip">{new Date(liveNews[0].date).toLocaleDateString('es-PY', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                        {liveNews[0].event_date && (
                          <span className="nh-chip nh-chip-ev">📅 {new Date(liveNews[0].event_date).toLocaleDateString('es-PY', { day: '2-digit', month: 'long' })}</span>
                        )}
                      </div>
                      <h3>{liveNews[0].title}</h3>
                      <p>{(liveNews[0].subtitle || liveNews[0].body).substring(0, 180)}{(liveNews[0].subtitle || liveNews[0].body).length > 180 ? '…' : ''}</p>
                      <span className="nh-cta">Leer noticia completa <i>→</i></span>
                    </div>
                  </article>

                  <aside className="nh-side">
                    <div className="nstat nstat-gold"><b>{liveNews.length}</b><span>Publicadas</span></div>
                    <div className="nstat nstat-blue"><b>{newsEsteMes}</b><span>Este mes</span></div>
                    <div className="nstat nstat-green"><b>{newsConInscripcion}</b><span>Con inscripción</span></div>
                    <div className="nsearch">
                      <span>🔍</span>
                      <input
                        type="text"
                        placeholder="Buscar noticias…"
                        value={newsSearch}
                        onChange={e => setNewsSearch(e.target.value)}
                        aria-label="Buscar noticias"
                      />
                      {newsSearch && (
                        <button onClick={() => setNewsSearch('')} title="Limpiar búsqueda" aria-label="Limpiar búsqueda">✕</button>
                      )}
                    </div>
                  </aside>
                </div>
              )}

              {/* GRID DE TARJETAS ÚNICAS */}
              <div className="news-grid">
                {newsRest.map((n, i) => {
                  const rc = NEWS_RC[i % NEWS_RC.length];
                  const dObj = new Date(n.date);
                  const resources = getNewsResources(n);
                  return (
                    <article
                      key={n.id}
                      className="ncard"
                      style={{ '--rc': rc, '--d': `${Math.min(i, 9) * 70}ms` } as CSSProperties}
                      onClick={() => setSelectedNews(n)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => { if (e.key === 'Enter') setSelectedNews(n); }}
                    >
                      <div className="nc-top">
                        <span className="nc-date">
                          <b>{String(dObj.getDate()).padStart(2, '0')}</b>
                          <small>{dObj.toLocaleDateString('es-PY', { month: 'short', year: 'numeric' })}</small>
                        </span>
                        <span className="nc-ico">{n.event_date ? '📅' : '📰'}</span>
                      </div>
                      <h4>{n.title}</h4>
                      {n.subtitle && <p className="nc-sub">{n.subtitle}</p>}
                      <p className="nc-body">{n.body}</p>
                      {(n.event_date || n.event_location) && (
                        <div className="nc-event">
                          {n.event_date && <span>📅 {new Date(n.event_date).toLocaleDateString('es-PY', { day: '2-digit', month: 'long', year: 'numeric' })}</span>}
                          {n.event_location && <span>📍 {n.event_location}</span>}
                        </div>
                      )}
                      {resources.length > 0 && (
                        <div className="nc-links">
                          {resources.map(r => (
                            <a
                              key={r.href}
                              href={r.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                            >
                              {r.icon} {r.icon === '✍️' ? 'Inscripción' : r.icon === '📂' ? 'Fotos' : 'Más info'}
                            </a>
                          ))}
                        </div>
                      )}
                      <div className="nc-toolbar">
                        <ShareButton
                          title={n.title}
                          text={n.subtitle || (n.body || '').substring(0, 120)}
                          url={typeof window !== 'undefined' ? `${window.location.origin}/?page=noticias` : '/'}
                          label="Compartir"
                        />
                      </div>
                      <span className="nc-more">Leer más <i>→</i></span>
                    </article>
                  );
                })}

                {newsRest.length === 0 && liveNews.length > 0 && (
                  <div className="pjl-empty-state" style={{ gridColumn: '1 / -1' }}>
                    <div className="empty-icon">🔍</div>
                    <h4 className="empty-title">Sin coincidencias</h4>
                    <p className="empty-desc">Ninguna noticia coincide con «{newsSearch}». Probá con otra palabra.</p>
                  </div>
                )}
                {liveNews.length === 0 && (
                  <div className="pjl-empty-state" style={{ gridColumn: '1 / -1' }}>
                    <div className="empty-icon">📰</div>
                    <h4 className="empty-title">El boletín está en preparación</h4>
                    <p className="empty-desc">Todavía no hay noticias publicadas. Mientras tanto, podés visitar la agenda o seguirnos en nuestras redes sociales.</p>
                  </div>
                )}
              </div>

              {/* INFORMACIÓN DEL VATICANO · AL FINAL */}
              <div className="vband">
                <div className="vb-head">
                  <div className="vb-tit">
                    <h4>🕊️ Noticias del Vaticano</h4>
                    <p>La información global de la Santa Sede, en vivo desde Vatican News.</p>
                  </div>
                  <span className="vb-src">vaticannews.va</span>
                </div>
                <div className="vb-widget">
                  {/* @ts-ignore */}
                  <vaticannews-widget lang="es" fontSize="18"></vaticannews-widget>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* --- PAGE: DOCUMENTOS --- */}
        {currentPage === 'documentos' && (
          <section className="section-pjl section-tint tint-green" id="documentos-public">
            <div className="container">
              <div className="section-head reveal" onClick={() => navigate('documentos')}>
                <span className="premium-label">RECURSOS</span>
                <h3>Centro de <i>Documentos y Descargas</i></h3>
                <p style={{ color: 'var(--text-muted)', maxWidth: '600px', margin: '10px auto 0', fontSize: '15px' }}>
                  Accede a los boletines mensuales, planes pastorales, currículos y materiales de formación oficiales para su lectura o descarga.
                </p>
                <div className="line"></div>
              </div>

              {/* SEARCH & FILTERS PANEL */}
              <div className="reveal" style={{
                background: 'var(--white)',
                padding: '25px',
                borderRadius: '20px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.04)',
                border: '1px solid var(--gold-pale)',
                marginBottom: '40px',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px'
              }}>
                <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '280px', position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
                    <input
                      type="text"
                      className="pjl-input"
                      style={{ paddingLeft: '45px', width: '100%' }}
                      placeholder="Buscar por nombre o descripción de archivo..."
                      value={docSearch}
                      onChange={e => setDocSearch(e.target.value)}
                    />
                  </div>
                  {docSearch && (
                    <button className="btn-premium btn-premium-outline" onClick={() => setDocSearch('')} style={{ padding: '10px 20px' }}>
                      Limpiar
                    </button>
                  )}
                </div>

                {/* DYNAMIC CATEGORY FILTER */}
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--navy)', marginRight: '10px', textTransform: 'uppercase', letterSpacing: '1px' }}>Categorías:</span>
                  <button
                    onClick={() => setDocCategory('all')}
                    className={`btn-premium ${docCategory === 'all' ? 'btn-premium-gold' : 'btn-premium-outline'}`}
                    style={{ padding: '6px 16px', fontSize: '12px', borderRadius: '20px' }}
                  >
                    TODOS
                  </button>
                  {Array.from(new Set(liveDocs.map(d => d.category || 'Otros'))).filter(Boolean).map(cat => (
                    <button
                      key={cat}
                      onClick={() => setDocCategory(cat)}
                      className={`btn-premium ${docCategory === cat ? 'btn-premium-gold' : 'btn-premium-outline'}`}
                      style={{ padding: '6px 16px', fontSize: '12px', borderRadius: '20px' }}
                    >
                      {cat.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* CARD GRID */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '30px' }}>
                {liveDocs
                  .filter(d => {
                    const matchQuery = d.name.toLowerCase().includes(docSearch.toLowerCase()) || (d.description || '').toLowerCase().includes(docSearch.toLowerCase());
                    const matchCat = docCategory === 'all' || d.category === docCategory;
                    return matchQuery && matchCat;
                  })
                  .map((doc, idx) => {
                    const isPdf = doc.type?.toLowerCase() === 'pdf' || doc.name.toLowerCase().endsWith('.pdf');
                    return (
                      <div
                        key={doc.id || idx}
                        className="reveal"
                        style={{
                          background: 'var(--white)',
                          borderRadius: '20px',
                          border: '1px solid var(--gold-pale)',
                          padding: '25px',
                          display: 'flex',
                          flexDirection: 'column',
                          boxShadow: '0 8px 25px rgba(0,0,0,0.02)',
                          transition: 'all 0.3s ease',
                          animationDelay: `${idx * 0.05}s`,
                          position: 'relative',
                          overflow: 'hidden'
                        }}
                      >
                        {/* CATEGORY & ICON */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                          <span style={{
                            padding: '4px 12px',
                            background: 'var(--gold-pale)',
                            color: 'var(--navy)',
                            borderRadius: '20px',
                            fontSize: '11px',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                          }}>
                            {doc.category || 'General'}
                          </span>
                          <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            background: isPdf ? 'rgba(239,68,68,0.08)' : 'rgba(59,130,246,0.08)',
                            color: isPdf ? '#ef4444' : '#3b82f6',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 900,
                            fontSize: '12px'
                          }}>
                            {doc.type || 'DOC'}
                          </div>
                        </div>

                        {/* DOCUMENT META */}
                        <h4 className="serif" style={{ fontSize: '1.25rem', color: 'var(--navy)', margin: '0 0 10px', lineHeight: 1.3 }}>{doc.name}</h4>
                        <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.6, flex: 1, marginBottom: '20px' }}>
                          {doc.description || 'Sin descripción disponible.'}
                        </p>

                        {/* FOOTER METADATA */}
                        <div style={{
                          borderTop: '1px solid #f3ebd7',
                          paddingTop: '15px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '12px',
                          color: 'var(--text-muted)',
                          marginBottom: '20px'
                        }}>
                          <span>Tamaño: <strong>{doc.size || 'N/A'}</strong></span>
                          <span>Descargas: <strong>{doc.downloads || 0}</strong></span>
                        </div>

                        {/* DOWNLOAD TRIGGER */}
                        <button
                          className="btn-premium btn-premium-gold"
                          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px' }}
                          onClick={() => {
                            if (!doc.url) return;
                            // Increment downloads count locally & sync
                            const updatedDocs = liveDocs.map(d => d.id === doc.id ? { ...d, downloads: (d.downloads || 0) + 1 } : d);
                            store.docs.set(updatedDocs);
                            setLiveDocs(updatedDocs);
                            // Download
                            handleDownload(doc.url, doc.name);
                          }}
                        >
                          <span>📥 Descargar Archivo</span>
                        </button>
                      </div>
                    );
                  })}
              </div>

              {(() => {
                const visibleDocs = liveDocs.filter(d => {
                  const matchQuery = d.name.toLowerCase().includes(docSearch.toLowerCase()) || (d.description || '').toLowerCase().includes(docSearch.toLowerCase());
                  const matchCat = docCategory === 'all' || d.category === docCategory;
                  return matchQuery && matchCat;
                });
                if (visibleDocs.length > 0) return null;
                if (liveDocs.length === 0) {
                  return (
                    <div className="pjl-empty-state" style={{ marginTop: '10px' }}>
                      <div className="empty-icon">📁</div>
                      <h4 className="empty-title">Biblioteca en preparación</h4>
                      <p className="empty-desc">Los estatutos, materiales formativos y documentos institucionales estarán disponibles aquí muy pronto.</p>
                    </div>
                  );
                }
                return (
                  <div className="pjl-empty-state" style={{ marginTop: '10px' }}>
                    <div className="empty-icon">🔍</div>
                    <h4 className="empty-title">Sin resultados</h4>
                    <p className="empty-desc">No encontramos documentos que coincidan con tu búsqueda. Probá con otro término o cambiá la categoría.</p>
                    <button className="btn-premium btn-premium-gold" onClick={() => { setDocSearch(''); setDocCategory('all'); }}>Limpiar filtros</button>
                  </div>
                );
              })()}
            </div>
          </section>
        )}

        {/* --- PAGE: FAQ --- */}
        {currentPage === 'faq' && (
          <section className="section-pjl section-tint tint-rose" id="preguntas">
            <div className="container" style={{ maxWidth: '900px' }}>
              <div className="section-head reveal" onClick={() => navigate('faq')}>
                <span className="premium-label">AYUDA</span>
                <h3>Preguntas <i>Frecuentes</i></h3>
                <div className="line"></div>
              </div>
              <div className="faq-container">
                {liveFaq.map((f, i) => (
                  <div key={f.id} className={`faq-item ${openFaq === i ? 'active' : ''}`}>
                    <button className="faq-q" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                      {f.question}
                      <span>{openFaq === i ? '−' : '+'}</span>
                    </button>
                    <div className="faq-a">
                      <p>{f.answer}</p>
                    </div>
                  </div>
                ))}
                {liveFaq.length === 0 && (
                  <div className="pjl-empty-state">
                    <div className="empty-icon">💬</div>
                    <h4 className="empty-title">Todavía no hay preguntas cargadas</h4>
                    <p className="empty-desc">Si tenés alguna consulta, escribinos por nuestras redes o desde la sección de contacto.</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* --- PAGE: CONTACTO --- */}
        {currentPage === 'contacto' && (
          <section className="section-pjl section-tint tint-violet" id="contacto">
            <div className="container">
              <div className="section-head reveal" onClick={() => navigate('contacto')}>
                <span className="premium-label">CONÉCTATE</span>
                <h3>Canales de <i>Comunicación</i></h3>
                <div className="line"></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '30px', marginBottom: '60px' }}>
                <div className="contact-card reveal" style={{ animationDelay: '0.1s' }}>
                  <div className="icon-box">📱</div>
                  <h4 className="serif">Redes Sociales</h4>
                  <p style={{ color: 'var(--text-muted)', marginBottom: '25px', fontSize: '14px' }}>Síguenos para estar al día con todas nuestras actividades.</p>
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                    <a href={liveSocial.instagram} target="_blank" rel="noreferrer" className="btn-premium btn-premium-outline" style={{ padding: '10px 20px' }}>IG</a>
                    <a href={liveSocial.facebook} target="_blank" rel="noreferrer" className="btn-premium btn-premium-outline" style={{ padding: '10px 20px' }}>FB</a>
                  </div>
                </div>
                
                <div className="contact-card reveal" style={{ animationDelay: '0.2s' }}>
                  <div className="icon-box">💬</div>
                  <h4 className="serif">WhatsApp</h4>
                  <p style={{ color: 'var(--text-muted)', marginBottom: '25px', fontSize: '14px' }}>Escríbenos directamente para consultas rápidas.</p>
                  <a href={`https://wa.me/${liveSocial.whatsapp.replace(/\D/g,'')}`} target="_blank" rel="noreferrer" className="btn-premium btn-premium-gold" style={{ width: '100%', padding: '15px' }}>ENVIAR MENSAJE</a>
                </div>

                <div className="contact-card reveal" style={{ animationDelay: '0.3s' }}>
                  <div className="icon-box">📍</div>
                  <h4 className="serif">Presencial</h4>
                  <p style={{ color: 'var(--text-muted)', marginBottom: '15px', fontSize: '14px' }}>Catedral Virgen del Rosario - Luque</p>
                  <p style={{ fontSize: '13px', fontStyle: 'italic', color: 'var(--gold)' }}>Sábados de 15:00 a 18:00 hs</p>
                </div>
              </div>

              <div className="mvv-card reveal" style={{ maxWidth: '800px', margin: '0 auto', padding: '60px', animationDelay: '0.4s' }}>
                <h4 className="serif" style={{ marginBottom: '30px', textAlign: 'center', fontSize: '24px' }}>Envíanos un Correo</h4>
                <form className="pjl-form" onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  const nombre = String(data.get('nombre') || '').trim();
                  const email = String(data.get('email') || '').trim();
                  const mensaje = String(data.get('mensaje') || '').trim();
                  const texto = encodeURIComponent(`Hola, soy ${nombre} (${email}). ${mensaje}`);
                  const waNumber = liveSocial.whatsapp.replace(/\D/g, '');
                  if (waNumber) {
                    window.open(`https://wa.me/${waNumber}?text=${texto}`, '_blank', 'noopener');
                  } else {
                    window.location.href = `mailto:pjl.luque@gmail.com?subject=${encodeURIComponent('Contacto web PJL')}&body=${texto}`;
                  }
                }}>
                  <div className="contact-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div className="form-group">
                      <label className="premium-label" style={{ fontSize: '10px', marginBottom: '8px', display: 'block' }}>TU NOMBRE</label>
                      <input type="text" name="nombre" placeholder="Ej: Juan Pérez" required className="pjl-input" />
                    </div>
                    <div className="form-group">
                      <label className="premium-label" style={{ fontSize: '10px', marginBottom: '8px', display: 'block' }}>TU EMAIL</label>
                      <input type="email" name="email" placeholder="ejemplo@correo.com" required className="pjl-input" />
                    </div>
                  </div>
                  <div className="form-group" style={{ marginTop: '20px' }}>
                    <label className="premium-label" style={{ fontSize: '10px', marginBottom: '8px', display: 'block' }}>MENSAJE</label>
                    <textarea name="mensaje" placeholder="¿En qué podemos ayudarte?" rows={6} required className="pjl-input"></textarea>
                  </div>
                  <button type="submit" className="btn-premium btn-premium-gold" style={{ marginTop: '30px', width: '100%', padding: '20px', fontSize: '1rem' }}>ENVIAR MENSAJE A SECRETARÍA</button>
                </form>
              </div>
            </div>
          </section>
        )}

      </main>

      {/* PROFILE DETAIL MODAL */}
      {selectedProfile && (
        <div className="pm-overlay" onClick={() => setSelectedProfile(null)}>
          <div className="pm-modal modal-scroll" onClick={e => e.stopPropagation()}>
            <div className="pm-head">
              <button type="button" className="pm-close" onClick={() => setSelectedProfile(null)} aria-label="Cerrar detalle">×</button>
              <div className="pm-photo-wrap">
                <span className="pm-photo-ring" aria-hidden="true"></span>
                <span className="pm-halo" aria-hidden="true"></span>
                <img
                  className="pm-photo"
                  src={selectedProfile.photo || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'}
                  alt={`Detalle de Perfil: ${selectedProfile.name}`}
                />
              </div>
              <h3 className="pm-name">{selectedProfile.name}</h3>
              <p className="pm-role">{selectedProfile.role}</p>
              <div className="pm-divider" aria-hidden="true"></div>
            </div>

            <div className="pm-body">
              <div className="pm-bio">
                {selectedProfile.bio || 'Sin descripción adicional.'}
              </div>

              {selectedProfile.quote && selectedProfile.quote !== '' && (
                <div className="pm-quote">
                  <span className="pm-quote-mark" aria-hidden="true">“</span>
                  <p>{selectedProfile.quote.replace(/"/g, '')}</p>
                </div>
              )}

              {selectedProfile.cvUrl && (
                <button
                  type="button"
                  onClick={() => handleDownload(selectedProfile.cvUrl!, `CV_${selectedProfile.name}.pdf`)}
                  className="btn-cv-pjl pm-cv"
                >
                  <span>📄</span> Descargar Currículum Pastoral
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* HISTORY DETAIL MODAL */}
      {selectedHistoryItem && (
        <div
          onClick={() => setSelectedHistoryItem(null)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(14, 22, 50, 0.9)',
            backdropFilter: 'blur(15px)',
            zIndex: 1000000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px',
            animation: 'fadeOverlay 0.3s ease both',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: '24px',
              maxWidth: '800px',
              width: '100%',
              maxHeight: '85vh',
              overflowY: 'auto',
              overflowX: 'hidden',
              boxShadow: '0 40px 80px rgba(0,0,0,0.4)',
              animation: 'slideUpModal 0.35s cubic-bezier(0.2,0.8,0.2,1) both',
              position: 'relative',
              padding: '60px 50px',
            }}
            className="modal-scroll"
          >
            <button
              onClick={() => setSelectedHistoryItem(null)}
              style={{ position: 'absolute', top: '24px', right: '24px', background: 'var(--cream)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', color: 'var(--navy)', fontSize: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: '0.2s' }}
            >×</button>
            <div style={{ textAlign: 'center' }}>
              <span style={{ color: selectedHistoryItem.accentColor || 'var(--gold)', fontWeight: 700, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '3px', display: 'block', marginBottom: '15px' }}>NUESTRA HISTORIA</span>
              <h2 className="serif" style={{ fontSize: '2.5rem', color: 'var(--navy)', marginBottom: '20px' }}>{selectedHistoryItem.title}</h2>
              <div className="line" style={{ margin: '0 auto 30px', background: selectedHistoryItem.accentColor || 'var(--gold)' }}></div>
              {selectedHistoryItem.image && (
                <div style={{ borderRadius: '22px', overflow: 'hidden', marginBottom: '28px', boxShadow: '0 18px 40px rgba(0,0,0,0.12)' }}>
                  <img src={selectedHistoryItem.image} alt={selectedHistoryItem.title} style={{ width: '100%', maxHeight: '320px', objectFit: 'cover', display: 'block' }} />
                </div>
              )}
              <p style={{ color: 'var(--navy)', lineHeight: '1.8', fontSize: '1.1rem', textAlign: 'justify', whiteSpace: 'pre-line', overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                {selectedHistoryItem.text}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* NEWS DETAIL MODAL */}
      {selectedNews && (
        <div
          onClick={() => setSelectedNews(null)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(14, 22, 50, 0.9)',
            backdropFilter: 'blur(15px)',
            zIndex: 9500,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px',
            animation: 'fadeOverlay 0.3s ease both',
            pointerEvents: 'auto',
            overscrollBehavior: 'contain',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            onWheel={e => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: '24px',
              maxWidth: '800px',
              width: '100%',
              maxHeight: '85vh',
              overflowY: 'auto',
              overflowX: 'hidden',
              boxShadow: '0 40px 80px rgba(0,0,0,0.4)',
              animation: 'slideUpModal 0.35s cubic-bezier(0.2,0.8,0.2,1) both',
              position: 'relative',
              padding: '60px 50px',
            }}
            className="modal-scroll"
          >
            <button
              onClick={() => setSelectedNews(null)}
              style={{ position: 'absolute', top: '24px', right: '24px', background: 'var(--cream)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', color: 'var(--navy)', fontSize: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: '0.2s' }}
            >×</button>
            {selectedNews.featured_image_url && (
              <div style={{ margin: '-20px -10px 32px', borderRadius: '20px', overflow: 'hidden', border: '1px solid rgba(200, 151, 58, 0.22)', background: 'linear-gradient(135deg, rgba(26, 39, 68, 0.06), rgba(200, 151, 58, 0.08))', aspectRatio: '16 / 9', minHeight: '220px', maxHeight: '360px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img
                  src={selectedNews.featured_image_url}
                  alt={selectedNews.title}
                  style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center center' }}
                />
              </div>
            )}
            <div style={{ textAlign: 'center' }}>
              <span style={{ color: 'var(--gold)', fontWeight: 700, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '3px', display: 'block', marginBottom: '15px' }}>{new Date(selectedNews.date).toLocaleDateString('es-PY', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
              <h2 className="serif" style={{ fontSize: '2.5rem', color: 'var(--navy)', marginBottom: selectedNews.subtitle ? '18px' : '30px', lineHeight: 1.2 }}>{selectedNews.title}</h2>
              {selectedNews.subtitle && (
                <p style={{ color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1.7, margin: '0 auto 24px', maxWidth: '620px' }}>
                  {selectedNews.subtitle}
                </p>
              )}
              {selectedNews.event_date && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '18px', padding: '8px 14px', borderRadius: '999px', background: 'rgba(200, 151, 58, 0.12)', color: 'var(--navy)', fontSize: '0.95rem', fontWeight: 600 }}>
                  <span>📅</span>
                  <span>{new Date(selectedNews.event_date).toLocaleDateString('es-PY', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                </div>
              )}
              {selectedNews.event_location && (
                <div style={{ margin: '0 auto 24px', maxWidth: '620px', padding: '12px 16px', borderRadius: '14px', background: 'var(--cream)', color: 'var(--navy)', fontSize: '0.95rem' }}>
                  📍 {selectedNews.event_location}
                </div>
              )}
              <div className="line" style={{ margin: '0 auto 32px' }}></div>
              <div style={{ color: 'var(--navy)', lineHeight: '1.8', fontSize: '1.1rem', textAlign: 'justify', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                <TextWithLinks text={selectedNews.body} />
              </div>
              {(() => {
                const resources = getNewsResources(selectedNews);
                if (resources.length === 0) return null;

                return (
                  <div style={{ marginTop: '34px', padding: '22px', borderRadius: '18px', background: 'var(--cream)', border: '1px solid rgba(200, 151, 58, 0.2)', textAlign: 'left' }}>
                    <h3 className="serif" style={{ margin: '0 0 14px', color: 'var(--navy)', fontSize: '1.25rem' }}>Recursos de la noticia</h3>
                    <div style={{ display: 'grid', gap: '10px' }}>
                      {resources.map((resource) => (
                        <a
                          key={resource.href}
                          href={resource.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '13px 14px',
                            borderRadius: '14px',
                            background: '#fff',
                            border: resource.tone === 'gold' ? '1px solid rgba(200, 151, 58, 0.35)' : resource.tone === 'blue' ? '1px solid rgba(29, 78, 216, 0.2)' : '1px solid rgba(26, 39, 68, 0.1)',
                            color: 'var(--navy)',
                            textDecoration: 'none',
                          }}
                        >
                          <span style={{ width: '38px', height: '38px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: resource.tone === 'gold' ? 'rgba(200, 151, 58, 0.14)' : resource.tone === 'blue' ? '#eef4ff' : '#f5f5f5', flexShrink: 0 }}>{resource.icon}</span>
                          <span style={{ minWidth: 0, flex: 1 }}>
                            <strong style={{ display: 'block', fontSize: '0.95rem' }}>{resource.label}</strong>
                            <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.8rem', overflowWrap: 'break-word' }}>{resource.detail}</span>
                          </span>
                          <span style={{ color: resource.tone === 'gold' ? 'var(--gold)' : resource.tone === 'blue' ? '#1d4ed8' : 'var(--text-muted)', fontWeight: 800 }}>→</span>
                        </a>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* 4. FOOTER INSTITUCIONAL REFINADO */}
      {(() => {
        const realTel = siteContent.contactoTel || '';
        const hoursTrim = [
          { ico: '🕐', label: 'ENCUENTROS', val: siteContent.horariosEncuentro || '' },
          { ico: '🎓', label: 'FORMACIÓN', val: siteContent.horariosFormacion || '' },
          { ico: '⛪', label: 'MISAS', val: siteContent.horariosMisaLocal || '' }
        ].filter(h => h.val);
        return (
      <footer className="footer-pjl">
        <div className="footer-ornament" aria-hidden="true"><span></span><span></span><span></span></div>
        <div className="container">
          <div className="footer-topline"><span></span><i>†</i><span></span></div>
          <div className="footer-grid">

            {/* Columna 1: Branding y Redes */}
            <div className="footer-col footer-col-brand">
              <div className="logo-area footer-brand-row" style={{ cursor: 'pointer', marginBottom: '20px' }} onClick={() => navigate('home')}>
                <span className="footer-logo-badge">
                  {branding.mainLogo && <img src={branding.mainLogo} className="logo-img-circular" style={{ height: '100%', width: '100%', objectFit: 'cover' }} alt="Logo Footer PJL" loading="lazy" decoding="async" />}
                </span>
                <div>
                  <h2 className="serif" style={{ color: '#fff', fontSize: '26px', margin: 0, lineHeight: 1 }}>PJL</h2>
                  <p style={{ color: 'var(--gold)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '2px', margin: 0 }}>Pastoral Juvenil Luqueña</p>
                </div>
              </div>
              <p className="footer-about">
                Jóvenes de Luque que caminan en la fe, crecen en comunidad y transforman el mundo desde el amor de Cristo.
              </p>

              <div className="footer-social-wrap">
                <span className="footer-social-title">Seguinos</span>
                <div className="footer-social">
                  <a href={liveSocial.instagram} target="_blank" rel="noreferrer" className="fs-badge" data-label="Instagram" aria-label="Instagram"><span>📸</span></a>
                  <a href={liveSocial.facebook} target="_blank" rel="noreferrer" className="fs-badge" data-label="Facebook" aria-label="Facebook"><span>👍</span></a>
                  <a href={liveSocial.youtube} target="_blank" rel="noreferrer" className="fs-badge" data-label="YouTube" aria-label="YouTube"><span>▶️</span></a>
                  <a href={`https://wa.me/${liveSocial.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="fs-badge" data-label="WhatsApp" aria-label="WhatsApp"><span>💬</span></a>
                </div>
              </div>
            </div>

            {/* Columna 2: Navegación */}
            <div className="footer-col">
              <h4 className="footer-title">🧭 Navegación</h4>
              <ul className="footer-links">
                <li><button className="footer-link-btn" onClick={() => navigate('home')}>Inicio</button></li>
                <li><button className="footer-link-btn" onClick={() => navigate('institucional')}>Institucional</button></li>
                <li><button className="footer-link-btn" onClick={() => navigate('consejo')}>Consejo PJL</button></li>
                <li><button className="footer-link-btn" onClick={() => navigate('zonas')}>Zonas</button></li>
                <li><button className="footer-link-btn" onClick={() => navigate('estatuto')}>Estatuto</button></li>
              </ul>
            </div>

            {/* Columna 3: Comunidad */}
            <div className="footer-col">
              <h4 className="footer-title">🌍 Comunidad</h4>
              <ul className="footer-links">
                <li><button className="footer-link-btn" onClick={() => navigate('agenda')}>Agenda Pastoral</button></li>
                <li><button className="footer-link-btn" onClick={() => navigate('noticias')}>Últimas Noticias</button></li>
                <li><button className="footer-link-btn" onClick={() => navigate('documentos')}>Documentos</button></li>
                <li><button className="footer-link-btn" onClick={() => navigate('preguntas')}>Preguntas Frecuentes</button></li>
                <li><button className="footer-link-btn" onClick={() => navigate('contacto')}>Contacto</button></li>
              </ul>
            </div>

            {/* Columna 4: Contacto y Horarios */}
            <div className="footer-col">
              <h4 className="footer-title">📍 Contacto</h4>
              <ul className="footer-contact">
                <li className="fc-item">
                  <span className="fc-ico">⛪</span>
                  <div><p className="fc-label">SEDE</p><p className="fc-val">{siteContent.contactoSede || 'Catedral Virgen del Rosario'}</p></div>
                </li>
                <li className="fc-item">
                  <span className="fc-ico">📍</span>
                  <div><p className="fc-label">DIRECCIÓN</p><p className="fc-val">{siteContent.contactoDireccion || 'Luque - Paraguay'}</p></div>
                </li>
                <li className="fc-item">
                  <span className="fc-ico">📧</span>
                  <div><p className="fc-label">EMAIL</p><p className="fc-val">pjl.luque@gmail.com</p></div>
                </li>
                {realTel && (
                  <li className="fc-item">
                    <span className="fc-ico">📞</span>
                    <div><p className="fc-label">TELÉFONO</p><p className="fc-val">{realTel}</p></div>
                  </li>
                )}
              </ul>
            </div>

            {/* Columna 5: Suscríbete / Horarios */}
            <div className="footer-col footer-col-news">
              <h4 className="footer-title">✉️ Boletín Pastoral</h4>
              <p className="footer-news-note">Recibí novedades, retiros y celebraciones en tu correo.</p>
              {newsSubscribed ? (
                <div className="footer-news-ok">✓ ¡Gracias por suscribirte! Te avisaremos de cada novedad.</div>
              ) : (
                <form className="footer-news-form" onSubmit={(e) => { e.preventDefault(); if (newsEmail.includes('@')) { setNewsSubscribed(true); } }}>
                  <input
                    type="email"
                    className="footer-news-input"
                    placeholder="tucorreo@ejemplo.com"
                    value={newsEmail}
                    onChange={(e) => setNewsEmail(e.target.value)}
                    aria-label="Correo electrónico"
                    required
                  />
                  <button type="submit" className="footer-news-btn">Suscribirme</button>
                </form>
              )}
              <div className="footer-hours">
                <h4 className="footer-title" style={{ marginTop: '26px' }}>🕐 Encuentros</h4>
                <ul className="footer-contact">
                  {hoursTrim.length ? hoursTrim.map((h, i) => (
                    <li key={i} className="fc-item fc-item-mini"><span className="fc-ico">{h.ico}</span><div><p className="fc-label">{h.label}</p><p className="fc-val">{h.val}</p></div></li>
                  )) : (
                    <li className="fc-item fc-item-mini"><span className="fc-ico">🕐</span><div><p className="fc-label">ENCUENTROS</p><p className="fc-val">Escribinos por WhatsApp</p></div></li>
                  )}
                </ul>
              </div>
            </div>

          </div>

          <div className="footer-bottom">
            <button
              type="button"
              className="fb-copy"
              onClick={() => { window.location.href = '/admin'; }}
              style={{ background: 'none', border: 'none', padding: 0, margin: 0, font: 'inherit', fontSize: 'inherit', color: 'inherit', cursor: 'default', textAlign: 'inherit', lineHeight: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit' }}
            >© {new Date().getFullYear()} Pastoral Juvenil Luqueña · Hecho con fe ❤</button>
            <span className="fb-faith">† &ldquo;Caminamos juntos hacia el cielo&rdquo;</span>
          </div>
        </div>
      </footer>
        );
      })()}

      {/* ===== MODAL EVANGELIO DEL DÍA ===== */}
      {hasEvangelio && evangelioOpen && (
        <div className="evg-overlay" onClick={closeEvangelio} role="dialog" aria-modal="true" aria-label="Evangelio del día">
          <div className="evg-card" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="evg-close" onClick={closeEvangelio} aria-label="Cerrar Evangelio del día">✕</button>
            {siteContent.evangelioFoto && (
              <div className="evg-imgwrap">
                <img src={siteContent.evangelioFoto} alt="Imagen del Evangelio del día" />
              </div>
            )}
            <div className="evg-body">
              <span className="evg-badge">✝️ Evangelio del día</span>
              <h3 className="serif evg-ref">{evgHoyTitle}</h3>
              {evgHoyDate && <p className="evg-date">{evgHoyDate}</p>}
              <div className="evg-sections">{renderEvangelioSections()}</div>
              <div className="evg-actions">
                <button type="button" className="evg-btn evg-btn-copy" onClick={copyEvangelio}>Copiar el texto</button>
                <button type="button" className="evg-btn evg-btn-wa" onClick={shareEvangelio}>
                  <svg viewBox="0 0 448 512" width="19" height="19" fill="currentColor" aria-hidden="true" focusable="false"><path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.5c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.1L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/></svg>
                  WhatsApp
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NUBECITA "Texto copiado" */}
      {evangelioToast && (
        <div className="evg-toast" role="status" aria-live="polite">
          <span className="evg-toast-cloud" aria-hidden="true">☁️</span>
          <span className="evg-toast-msg">¡Texto copiado!</span>
        </div>
      )}
      
      {/* Styles inline for footer links just to keep it clean */}
      <style dangerouslySetInnerHTML={{__html: `
        /* ===== FOOTER ENRIQUECIDO ===== */
        .footer-pjl { position: relative; overflow: hidden; background: radial-gradient(1200px 600px at 15% -10%, rgba(200,151,58,0.14), transparent 60%), linear-gradient(180deg, var(--navy-dark) 0%, #1A2744 55%, #0f1527 100%); }

        .footer-ornament { position: absolute; inset: 0; pointer-events: none; opacity: .5; }
        .footer-ornament span { position: absolute; border-radius: 50%; filter: blur(60px); }
        .footer-ornament span:nth-child(1) { width: 420px; height: 420px; left: -120px; top: -120px; background: radial-gradient(circle, rgba(200,151,58,.25), transparent 70%); animation: footDrift 14s ease-in-out infinite alternate; }
        .footer-ornament span:nth-child(2) { width: 380px; height: 380px; right: -100px; bottom: -120px; background: radial-gradient(circle, rgba(46,94,74,.3), transparent 70%); animation: footDrift 18s ease-in-out infinite alternate-reverse; }
        .footer-ornament span:nth-child(3) { width: 200px; height: 200px; left: 55%; top: 40%; background: radial-gradient(circle, rgba(200,151,58,.18), transparent 70%); animation: footDrift 22s ease-in-out infinite alternate; }
        @keyframes footDrift { to { transform: translate(60px, 40px) scale(1.15); } }

        .footer-topline { display: flex; align-items: center; justify-content: center; gap: 16px; margin-bottom: 56px; }
        .footer-topline span { height: 2px; width: 90px; background: linear-gradient(90deg, transparent, var(--gold)); }
        .footer-topline span:last-child { background: linear-gradient(90deg, var(--gold), transparent); }
        .footer-topline i { color: var(--gold); font-style: normal; animation: footCross 3s ease-in-out infinite; display: inline-block; }
        @keyframes footCross { 0%,100%{ transform: rotate(0) scale(1); } 50%{ transform: rotate(180deg) scale(1.25); } }

        .footer-grid { display: grid; grid-template-columns: 1.8fr 1fr 1fr 1.2fr 1.3fr; gap: 40px; margin-bottom: 70px; }
        .footer-col { padding-top: 4px; }

        .footer-title { color: var(--gold); margin: 0 0 22px; letter-spacing: 2px; font-size: 13px; text-transform: uppercase; position: relative; display: inline-flex; align-items: center; gap: 8px; }
        .footer-title::after { content: ''; position: absolute; left: 0; bottom: -9px; width: 34px; height: 3px; border-radius: 3px; background: linear-gradient(90deg, var(--gold), transparent); animation: footLine 3s ease-in-out infinite; }
        @keyframes footLine { 0%,100%{ width: 26px; opacity:.7; } 50%{ width: 44px; opacity:1; } }

        /* Branding */
        .footer-brand-row { display: flex; align-items: center; gap: 14px; }
        .footer-logo-badge { width: 62px; height: 62px; border-radius: 50%; overflow: hidden; display: inline-flex; align-items: center; justify-content: center; background: linear-gradient(145deg, #fff, #efe3c4); border: 2px solid var(--gold); box-shadow: 0 8px 24px rgba(200,151,58,.35); flex-shrink: 0; transition: transform .4s cubic-bezier(.34,1.56,.64,1); }
        .footer-brand-row:hover .footer-logo-badge { transform: rotate(6deg) scale(1.06); }
        .footer-about { color: rgba(255,255,255,.62); font-size: 14px; line-height: 1.85; margin: 22px 0 26px; max-width: 300px; }

        .footer-social-title { display: block; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: rgba(255,255,255,.45); margin-bottom: 12px; }
        .footer-social { display: flex; gap: 12px; }
        .fs-badge { position: relative; width: 44px; height: 44px; border-radius: 13px; display: flex; align-items: center; justify-content: center; font-size: 19px; color: #fff; text-decoration: none; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.06); transition: transform .35s cubic-bezier(.34,1.56,.64,1), background .3s, box-shadow .3s, border-color .3s; }
        .fs-badge:hover { transform: translateY(-5px) rotate(-6deg) scale(1.08); background: var(--gold); border-color: var(--gold); box-shadow: 0 10px 22px rgba(200,151,58,.45); }
        .fs-badge::after { content: attr(data-label); position: absolute; bottom: -32px; left: 50%; transform: translateX(-50%) translateY(4px); background: var(--navy); color: #fff; font-size: 11px; font-weight: 700; letter-spacing: .5px; padding: 4px 9px; border-radius: 8px; white-space: nowrap; opacity: 0; pointer-events: none; transition: .25s; border: 1px solid rgba(200,151,58,.35); }
        .fs-badge:hover::after { opacity: 1; transform: translateX(-50%) translateY(0); }

        /* Links */
        .footer-links { list-style: none; padding: 0; margin: 0; display: grid; gap: 13px; }
        .footer-link-btn { background: none; border: none; color: rgba(255,255,255,.66); font-family: inherit; font-size: 14px; cursor: pointer; padding: 0; text-align: left; transition: .3s; display: inline-flex; align-items: center; gap: 8px; position: relative; }
        .footer-link-btn::before { content: '›'; color: var(--gold); opacity: 0; transform: translateX(-6px); transition: .3s; }
        .footer-link-btn:hover { color: #fff; transform: translateX(6px); }
        .footer-link-btn:hover::before { opacity: 1; transform: translateX(0); }

        /* Contacto */
        .footer-contact { list-style: none; padding: 0; margin: 0; display: grid; gap: 15px; }
        .fc-item { display: flex; gap: 12px; align-items: flex-start; transition: transform .3s; }
        .fc-item:hover { transform: translateX(5px); }
        .fc-item-mini .fc-val { color: rgba(255,255,255,.55); }
        .fc-ico { flex: 0 0 34px; width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 15px; background: rgba(200,151,58,.12); border: 1px solid rgba(200,151,58,.25); }
        .fc-item:hover .fc-ico { background: rgba(200,151,58,.22); transform: rotate(-8deg) scale(1.08); }
        .fc-label { margin: 0; font-size: 10px; letter-spacing: 1.5px; color: var(--gold); text-transform: uppercase; }
        .fc-val { margin: 3px 0 0; font-size: 13.5px; color: rgba(255,255,255,.8); line-height: 1.45; }

        /* Boletín */
        .footer-news-note { color: rgba(255,255,255,.62); font-size: 13px; line-height: 1.6; margin: 0 0 16px; }
        .footer-news-form { display: flex; flex-direction: column; gap: 10px; }
        .footer-news-input { width: 100%; box-sizing: border-box; padding: 13px 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.06); color: #fff; font-family: inherit; font-size: 14px; outline: none; transition: .3s; }
        .footer-news-input::placeholder { color: rgba(255,255,255,.35); }
        .footer-news-input:focus { border-color: var(--gold); background: rgba(255,255,255,.1); box-shadow: 0 0 0 3px rgba(200,151,58,.15); }
        .footer-news-btn { position: relative; overflow: hidden; width: 100%; padding: 13px 16px; border-radius: 12px; border: none; cursor: pointer; font-family: var(--font-display); font-weight: 700; font-size: 15px; letter-spacing: .5px; color: var(--navy); background: linear-gradient(120deg, #f0d9a6, var(--gold) 55%, #e8c36a); transition: transform .3s cubic-bezier(.34,1.56,.64,1), box-shadow .3s; }
        .footer-news-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 26px rgba(200,151,58,.4); }
        .footer-news-btn::after { content: ''; position: absolute; top: 0; bottom: 0; left: -80%; width: 45%; background: linear-gradient(105deg, transparent, rgba(255,255,255,.6), transparent); transition: left .55s ease; }
        .footer-news-btn:hover::after { left: 130%; }
        .footer-news-ok { padding: 14px 16px; border-radius: 12px; background: rgba(46,204,113,.12); border: 1px solid rgba(46,204,113,.4); color: #7ee3a8; font-size: 13px; line-height: 1.5; animation: footOk .5s cubic-bezier(.34,1.56,.64,1); }
        @keyframes footOk { 0%{ opacity:0; transform: scale(.9); } 100%{ opacity:1; transform: scale(1); } }

        /* Bottom */
        .footer-bottom { margin-top: 30px; padding: 28px 0 0; border-top: 1px solid rgba(255,255,255,.08); display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
        .fb-copy { color: rgba(255,255,255,.5); font-size: 13px; }
        .fb-faith { color: rgba(200,151,58,.9); font-size: 13px; font-style: italic; font-family: var(--font-display); letter-spacing: .5px; }

        @media (max-width: 1100px) { .footer-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 768px) { .footer-grid { grid-template-columns: repeat(2, 1fr); gap: 34px; } .footer-bottom { flex-direction: column; text-align: center; } }
        @media (max-width: 520px) { .footer-grid { grid-template-columns: 1fr; } }

        /* El copyright no debe desbordar la pantalla en móvil/tablet
           (los botones llevan white-space: nowrap global en ≤1024px) */
        @media (max-width: 1024px) {
          .fb-copy {
            white-space: normal !important;
            overflow-wrap: anywhere !important;
            word-break: normal !important;
            width: 100%;
            max-width: 100%;
            line-height: 1.5;
            text-align: center;
          }
        }

        /* Custom Scrollbar for Modals */
        .modal-scroll::-webkit-scrollbar { width: 6px; }
        .modal-scroll::-webkit-scrollbar-track { background: rgba(0,0,0,0.05); border-radius: 10px; }
        .modal-scroll::-webkit-scrollbar-thumb { background: var(--gold-pale); border-radius: 10px; }
        .modal-scroll::-webkit-scrollbar-thumb:hover { background: var(--gold); }

        @media (prefers-reduced-motion: reduce) {
          .footer-ornament span, .footer-topline i, .footer-title::after, .fs-badge, .footer-news-btn::after, .footer-link-btn, .fc-item { animation: none !important; transition: none !important; }
        }

        /* ===== EVANGELIO DEL DÍA ===== */
        .evg-overlay { position: fixed; inset: 0; z-index: 100050; display: flex; align-items: center; justify-content: center; padding: 20px; background: rgba(10,16,32,.66); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); overscroll-behavior: contain; animation: evgFade .35s ease both; }
        @keyframes evgFade { from { opacity: 0; } to { opacity: 1; } }

        .evg-card { position: relative; width: 100%; max-width: 560px; max-height: calc(100dvh - 40px); overflow-y: auto; overscroll-behavior: contain; border-radius: 24px; background: linear-gradient(170deg, #ffffff 0%, #fffdf6 100%); border: 1px solid var(--gold-pale); box-shadow: 0 34px 90px rgba(5,10,25,.5), 0 0 0 1px rgba(255,255,255,.08) inset; animation: evgPop .5s cubic-bezier(.34,1.56,.64,1) both; -webkit-overflow-scrolling: touch; }
        @keyframes evgPop { from { opacity: 0; transform: translateY(26px) scale(.94); } to { opacity: 1; transform: translateY(0) scale(1); } }

        .evg-close { position: absolute; top: 14px; right: 14px; z-index: 2; width: 40px; height: 40px; border-radius: 50%; border: 1px solid rgba(255,255,255,.35); background: rgba(10,16,32,.55); color: #fff; font-size: 16px; cursor: pointer; display: grid; place-items: center; backdrop-filter: blur(4px); transition: transform .3s cubic-bezier(.34,1.56,.64,1), background .3s; }
        .evg-close:hover { transform: rotate(90deg) scale(1.08); background: rgba(10,16,32,.78); }
        .evg-close:active { transform: scale(.92); }

        .evg-imgwrap { width: 100%; background: #000; }
        .evg-imgwrap img { width: 100%; height: auto; max-height: 60vh; object-fit: contain; display: block; background: #0c1226; }

        .evg-body { padding: 24px 28px 30px; }
        .evg-badge { display: inline-flex; align-items: center; gap: 6px; background: var(--gold); color: #fff; font-size: 10.5px; font-weight: 800; letter-spacing: 1.6px; text-transform: uppercase; padding: 6px 13px; border-radius: 999px; margin-bottom: 14px; box-shadow: 0 8px 20px rgba(200,151,58,.35); }
        .evg-ref { margin: 0 0 14px; color: var(--navy); font-size: clamp(1.2rem, 4.5vw, 1.7rem); line-height: 1.28; overflow-wrap: break-word; text-wrap: balance; }
        .evg-date { margin: -6px 0 14px; font-size: 12px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; color: var(--gold); }
        .evg-sections .evh-secs { max-height: 44vh; padding-right: 6px; }
        .evg-sections .evh-sec p { font-size: 14px; }
        .evg-sections .evh-kicker { font-size: 10px; padding: 4px 10px; }
        .evg-text { margin: 0; font-size: 15.5px; line-height: 1.85; color: #2c3450; white-space: pre-line; }
        .evg-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 26px; padding-top: 22px; border-top: 1px dashed rgba(200,151,58,.4); }
        .evg-btn { display: inline-flex; align-items: center; gap: 8px; border: none; cursor: pointer; padding: 13px 20px; border-radius: 14px; font-family: var(--font-display); font-weight: 700; font-size: 14px; letter-spacing: .3px; transition: transform .3s cubic-bezier(.34,1.56,.64,1), box-shadow .3s; }
        .evg-btn:active { transform: scale(.96); }
        .evg-btn-copy { background: linear-gradient(120deg, #f0d9a6, var(--gold) 55%, #e8c36a); color: var(--navy); box-shadow: 0 12px 28px rgba(200,151,58,.4); }
        .evg-btn-copy:hover { transform: translateY(-2px); box-shadow: 0 16px 34px rgba(200,151,58,.5); }
        .evg-btn-wa { background: linear-gradient(120deg, #128c55, #25D366 60%, #128c55); color: #fff; box-shadow: 0 12px 28px rgba(37,211,102,.3); }
        .evg-btn-wa:hover { transform: translateY(-2px); box-shadow: 0 16px 34px rgba(37,211,102,.4); }

        .evg-toast { position: fixed; bottom: 110px; left: 50%; transform: translateX(-50%); z-index: 100060; display: inline-flex; align-items: center; gap: 10px; background: rgba(10,16,32,.92); border: 1px solid rgba(200,151,58,.5); color: #fff; padding: 12px 22px; border-radius: 999px; font-size: 14px; font-weight: 700; box-shadow: 0 18px 44px rgba(5,10,25,.45); animation: evgToast .45s cubic-bezier(.34,1.56,.64,1) both; }
        @keyframes evgToast { from { opacity: 0; transform: translate(-50%, 18px) scale(.9); } to { opacity: 1; transform: translate(-50%, 0) scale(1); } }
        .evg-toast-cloud { font-size: 18px; animation: evgCloud 1.4s ease-in-out infinite; }
        @keyframes evgCloud { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }

        /* Botón de reapertura en la barra de navegación */
        .evangelio-nav-btn { position: relative; }
        .evangelio-nav-item .nav-btn { background: linear-gradient(135deg, rgba(200,151,58,.16), rgba(200,151,58,.06)); border: 1px solid rgba(200,151,58,.35); border-radius: 12px; }
        .evangelio-nav-item .nav-txt { font-size: 11.5px; }
        @media (hover: hover) and (pointer: fine) {
          .evangelio-nav-item .nav-btn:hover { background: linear-gradient(135deg, rgba(200,151,58,.28), rgba(200,151,58,.1)); border-color: var(--gold); }
        }
      `}} />
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}
