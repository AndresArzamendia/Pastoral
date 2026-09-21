// ─── SHARED PJL STORE ────────────────────────────────────────────────────────
// Admin writes here → main page reads here.
// All keys are stored in localStorage so changes persist across pages.
import { fetchAllStoreValues, subscribeStoreChanges, upsertStoreValue } from './supabaseStore';

export interface NewsItem     { id: number; title: string; body: string; date: string; published: boolean; calendarUrl?: string; calendarEventId?: string; calendarSyncStatus?: 'pending' | 'synced' | 'error'; }
export interface Activity     { id: number; title: string; date: string; category: string; active: boolean; inscription: boolean; description?: string; calendarUrl?: string; calendarEventId?: string; calendarSyncStatus?: 'pending' | 'synced' | 'error'; icsUid?: string; }
export interface FaqItem      { id: number; question: string; answer: string; }
export interface DocItem      { id: number; name: string; type: string; size: string; downloads: number; url?: string; description?: string; category?: string; previewImage?: string; uploadedAt?: string; }
export interface GalleryItem  { id: number; name: string; src: string; }
export interface SocialLinks  { instagram: string; facebook: string; youtube: string; whatsapp: string; }
export interface TimelineEvent { id: string; title: string; text: string; image?: string; accentColor?: string; }
export interface Chapel { 
  id: string; 
  name: string; 
  locationUrl: string; 
  address?: string;
  lat?: number;
  lng?: number;
  comunidadNombre: string; 
  estadoComunidad: 'Activo' | 'Nucleación'; 
  zonaId: number; 
  photo?: string;
  logoUrl?: string;
  markerColor?: string;
  polygon?: [number, number][]; // Para dibujar el territorio
}

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  authUid?: string;
  role: 'desarrollador' | 'superadmin' | 'editor' | 'viewer';
  status: 'activo' | 'inactivo' | 'pendiente';
  lastActive?: string;
  createdAt?: string;
  avatar?: string;
  permissions?: string[]; // Array of module IDs
}

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  module: string;
  timestamp: string;
  details?: string;
}

export interface SiteContent  { 
  mision: string; 
  vision: string; 
  valores: string; 
  estatuto: string;
  objetivoGeneral: string;
  lineasAccion: string;
  organigrama: string;
  decanato: string;
  parroquia: string;
  horariosMisa: string;
  atencionSacerdotal: string;
  confesiones: string;
  horariosSecretaria: string;
  statsZonas: string;
  statsComunidades: string;
  statsJovenes: string;
  statsAnos: string;
  googleCalendarUrl: string;
  googleCalendarClientId: string;
  googleCalendarClientSecret: string;
  googleCalendarOptions?: {
    showTitle: boolean;
    showNav: boolean;
    showPrint: boolean;
    showTabs: boolean;
    showCalendars: boolean;
    showTz: boolean;
    showAgenda: boolean;
    mode: 'MONTH' | 'WEEK' | 'AGENDA';
  };
  historiaTimeline: TimelineEvent[];
  instiTitulo: string;
  instiSubtitle: string;
  instiDesc: string;
  instiAltText: string;
  instiFoto: string;
  instiCards: { title: string; text: string; icon: string }[];
  heroTag: string;
  heroTitle: string;
  heroText: string;
  heroBtnText?: string;
  heroBtnLink?: string;
  equiposTag: string;
  equiposTitle: string;
  zonasTag: string;
  zonasTitle: string;
  newsTag: string;
  newsTitle: string;
  agendaTag: string;
  agendaTitle: string;
  contactEmail: string;
  contactAddress: string;
  googleAnalyticsId: string;
  metaPixelId: string;
  siteTitle?: string;
  siteDescription?: string;
  whatsappNumber?: string;
  maintenanceMode?: boolean;
  maintenanceMessage?: string;
  /* ── NUEVOS CAMPOS: «Nosotros» ampliado ── */
  nosotrosIntro: string;
  nosotrosHistoria: string;
  nosotrosLema: string;
  contactoDireccion: string;
  contactoTel: string;
  contactoWeb: string;
  contactoSede: string;
  horariosEncuentro: string;
  horariosFormacion: string;
  horariosMisaLocal: string;
  servicios: { id: string; title: string; desc: string; icon: string }[];
  logros: { id: string; valor: string; label: string; icon: string }[];
  /* ── EVANGELIO DEL DÍA ── */
  evangelioRef: string;
  evangelioTexto: string;
  evangelioFoto: string;
}
export interface ActiveSections { zonas: boolean; consejo: boolean; agenda: boolean; institucional: boolean; faq: boolean; contacto: boolean; }
export interface Branding { 
  [key: string]: string | boolean | number | [number, number][] | undefined;
  mainLogo: string;
  androidLogo: string;
  adminIconDashboard: string;
  adminIconIdentidad: string;
  adminIconCarrusel: string;
  adminIconApariencia: string;
  adminIconContenido: string;
  adminIconNoticias: string;
  adminIconActividades: string;
  adminIconCapillas: string;
  adminIconPerfiles: string;
  adminIconDocumentos: string;
  adminIconUsuarios: string;
  adminIconLogs: string;
  adminIconConfiguracion: string;
  adminIconAsistente: string;
  zona1Logo: string;
  zona2Logo: string;
  zona3Logo: string; 
  zona4Logo: string; 
  zona1Map: string;
  zona2Map: string;
  zona3Map: string;
  zona4Map: string;
  zona1Color: string;
  zona2Color: string;
  zona3Color: string;
  zona4Color: string;
  logoWatermark: boolean;
  showAllZones: boolean;
  mapCenterLat?: number;
  mapCenterLng?: number;
  mapZoom?: number;
  zona1Polygon?: [number, number][];
  zona2Polygon?: [number, number][];
  zona3Polygon?: [number, number][];
  zona4Polygon?: [number, number][];
}
export interface ThemePalette {
  gold: string;
  navy: string;
}

export interface PageStat { 
  page: string; 
  label: string; 
  visits: number; 
  interactions: number; 
  desktopVisits?: number;
  tabletVisits?: number;
  mobileVisits?: number;
}

// ── Curriculum Profiles ────────────────────────────────────────────────────────
export interface MemberProfile {
  id: number;
  teamKey: string;
  name: string;
  role: string;
  bio: string;
  quote: string;   // personal message shown on card
  photo?: string;
  cvUrl?: string;
  birthday?: string; // YYYY-MM-DD (opcional) → notificación de cumpleaños
}

const TEAM_KEYS = ['coordinacion', 'efo', 'ecomu', 'eli', 'mmpjl', 'zona1', 'zona2', 'zona3', 'zona4'];

export const DEFAULT_PROFILES: MemberProfile[] = TEAM_KEYS.flatMap((key, ti) => {
  const roles = key.startsWith('zona')
    ? ['COORDINADOR/A', 'SUB-COORDINADOR/A', 'MIEMBRO', 'MIEMBRO', 'MIEMBRO', 'MIEMBRO']
    : key === 'coordinacion'
      ? ['COORDINADOR/A', 'SUB-COORDINADOR/A', 'SECRETARIO/A']
      : ['COORDINADOR/A', 'SUB-COORDINADOR/A', 'MIEMBRO', 'MIEMBRO', 'MIEMBRO', 'MIEMBRO'];
  return roles.map((role, i) => ({
    id: ti * 10 + i + 1,
    teamKey: key,
    name: `[${role} ${key.toUpperCase()}]`,
    role,
    bio: 'Historia pastoral pendiente de completar.',
    quote: '"Mi camino de fe comienza aquí, con cada joven."',
    photo: '',
    cvUrl: '',
  }));
});

// ── Defaults ──────────────────────────────────────────────────────────────────
export const DEFAULT_NEWS: NewsItem[] = [
  { id: 1, title: 'Inicio de actividades 2026', body: 'La Pastoral Juvenil Luqueña arranca el año con renovadas energías y nuevas propuestas para todos los jóvenes.', date: '2026-03-01', published: true },
  { id: 2, title: 'Convocatoria Retiro Diocesano', body: 'Todos los jóvenes de la diócesis están invitados al gran retiro de Semana Santa organizado por la PJL.', date: '2026-03-15', published: true },
  { id: 3, title: 'Nueva coordinación electa', body: 'Bienvenida a la nueva coordinación general que asumirá a partir de abril 2026.', date: '2026-03-20', published: false },
];

export const DEFAULT_ACTIVITIES: Activity[] = [
  { id: 1, title: 'Retiro Cuaresmal Juvenil', date: '2026-04-05', category: 'Formación', active: true, inscription: true, description: 'Un espacio de encuentro profundo con el Señor previo a la Semana Santa.' },
  { id: 2, title: 'Vía Crucis Juvenil', date: '2026-04-10', category: 'Liturgia', active: true, inscription: false, description: 'Caminamos por las calles de Luque meditando la pasión de Cristo.' },
  { id: 3, title: 'Asamblea Zonal', date: '2026-04-18', category: 'Organización', active: false, inscription: false, description: 'Reunión de líderes para coordinar los trabajos del trimestre.' },
  { id: 4, title: 'Encuentro Diocesano de Jóvenes', date: '2026-05-08', category: 'Formación', active: true, inscription: true, description: 'Gran jornada de hermandad con jóvenes de toda la Diócesis de San Lorenzo.' },
];

export const DEFAULT_FAQ: FaqItem[] = [
  { id: 1, question: '¿Cómo puedo unirme a la PJL?', answer: 'Contactanos por nuestras redes sociales o acercate a tu capilla zonal.' },
  { id: 2, question: '¿Cuándo son las reuniones?', answer: 'Cada zona tiene su cronograma. Consultá la agenda pastoral.' },
  { id: 3, question: '¿Qué edad se requiere?', answer: 'Jóvenes de 15 a 35 años son bienvenidos.' },
  { id: 4, question: '¿Hay formación para los jóvenes?', answer: 'Sí, el EFO organiza talleres, retiros y procesos de formación integral durante todo el año.' },
];

export const DEFAULT_DOCS: DocItem[] = [
  { id: 1, name: 'Boletín Pastoral Marzo 2026', type: 'PDF', size: '1.2 MB', downloads: 214, category: 'Boletines', description: 'Resumen pastoral del mes con avisos, agenda y reflexiones.', uploadedAt: '2026-03-01' },
  { id: 2, name: 'Plan Pastoral 2026', type: 'PDF', size: '3.4 MB', downloads: 87, category: 'Planificación', description: 'Documento marco con los objetivos y líneas de acción del año.', uploadedAt: '2026-02-10' },
  { id: 3, name: 'Currículo Pastoral – Coord. Gral', type: 'PDF', size: '0.8 MB', downloads: 32, category: 'Currículos', description: 'Presentación del perfil pastoral y experiencia de coordinación.', uploadedAt: '2026-01-22' },
];

export const DEFAULT_CONTENT: SiteContent = {
  mision: 'Anunciar el Evangelio de Jesucristo a los jóvenes, acompañándolos en su crecimiento integral a través de la comunidad eclesial y el servicio.',
  vision: 'Ser una pastoral viva, misionera y profética que transforma la realidad de Luque desde los valores del Evangelio, formando líderes comprometidos.',
  valores: 'Fe, Comunidad, Servicio, Formación, Alegría.',
  estatuto: 'El Estatuto de la Pastoral Juvenil Luqueña establece las normas y fundamentos de nuestra organización.',
  objetivoGeneral: 'Propiciar procesos de evangelización que lleven a los jóvenes a un encuentro personal con Cristo.',
  lineasAccion: 'Formación Integral, Misión Permanente, Espiritualidad Juvenil, Compromiso Social.',
  organigrama: '',
  decanato: '',
  parroquia: '',
  horariosMisa: '',
  atencionSacerdotal: '',
  confesiones: '',
  horariosSecretaria: '',
  statsZonas: '4',
  statsComunidades: '12+',
  statsJovenes: '300+',
  statsAnos: '20',
  googleCalendarUrl: '',
  googleCalendarClientId: '',
  googleCalendarClientSecret: '',
  googleCalendarOptions: {
    showTitle: false,
    showNav: true,
    showPrint: false,
    showTabs: false,
    showCalendars: false,
    showTz: false,
    showAgenda: false,
    mode: 'MONTH',
  },
  historiaTimeline: [
    { id: '1', title: 'Inicios', text: 'La Pastoral Juvenil Luqueña nació con la misión de acompañar a los jóvenes de la ciudad de Luque en su camino de fe.', accentColor: '#C8973A' },
    { id: '2', title: 'Presente', text: 'Hoy en día, la PJL Luque se consolida como un referente diocesano de organización y fe activa.', accentColor: '#1A2744' }
  ],
  instiTitulo: 'Nuestra Identidad',
  instiSubtitle: 'Una red pastoral joven que hace de la fe una experiencia comunitaria',
  instiDesc: 'Somos una pastoral joven que camina de la mano de María, buscando ser luz en el mundo.',
  instiAltText: 'Jóvenes en comunidad pastoral conocedores y comprometidos',
  instiFoto: '',
  instiCards: [
    { title: 'Liderazgo Compartido', text: 'Coordinadores, equipos zonales y comunidades trabajan juntos para construir una pastoral fuerte y cercana.', icon: '🤝' },
    { title: 'Presencia Territorial', text: 'Cuatro zonas pastorales con identidad propia, unidas por el servicio, la formación y la misión juvenil.', icon: '📍' },
    { title: 'Firma Pastoral', text: 'Tradición, acompañamiento y alegría en cada acción pastoral que transforma la realidad de Luque.', icon: '🌟' }
  ],
  heroTag: 'Diócesis de San Lorenzo',
  heroTitle: 'Caminando con la <br/> <span style="color: var(--gold)">Juventud Luqueña</span>',
  heroText: 'Somos una comunidad de jóvenes comprometidos con el anuncio del Evangelio y la transformación social a través de la fe, la esperanza y la caridad.',
  heroBtnText: '',
  heroBtnLink: '',
  equiposTag: 'ESTRUCTURA',
  equiposTitle: 'Equipos y <i style="color: var(--gold); font-family: var(--font-display); font-weight: 400">Consejo</i>',
  zonasTag: 'TERRITORIO',
  zonasTitle: 'Nuestras <i>Zonas Pastorales</i>',
  newsTag: 'NOVEDADES',
  newsTitle: 'Últimas Noticias',
  agendaTag: 'CALENDARIO',
  agendaTitle: 'Próximos Eventos',
  contactEmail: 'info@pjlluque.org',
  contactAddress: 'Santuario Virgen del Rosario, Luque',
  googleAnalyticsId: '',
  metaPixelId: '',
  nosotrosIntro: 'Somos la Pastoral Juvenil Luqueña (PJL), una comunidad eclesial viva que camina junto a los jóvenes de la ciudad de Luque desde hace más de dos décadas. Nuestra casa es la iglesia y nuestro motor es el servicio.',
  nosotrosHistoria: 'Nacimos del deseo de reunir a la juventud luqueña alrededor de la fe, creciendo de una pequeña comunidad a una pastoral con presencia en las cuatro zonas pastorales de la diócesis. Cada año sumamos nuevos jóvenes que encuentran en la PJL un espacio de amistad, formación y compromiso.',
  nosotrosLema: '«Avivando la llama de Cristo en tu corazón»',
  contactoDireccion: '',
  contactoTel: '',
  contactoWeb: '',
  contactoSede: '',
  horariosEncuentro: '',
  horariosFormacion: '',
  horariosMisaLocal: '',
  servicios: [
    { id: 's1', title: 'Formación Integral', desc: 'Talleres, jornadas y procesos de acompañamiento para el crecimiento humano y espiritual.', icon: '🎓' },
    { id: 's2', title: 'Misión y Evangelización', desc: 'Acciones misioneras que llevan la alegría del Evangelio a toda la ciudad de Luque.', icon: '✝️' },
    { id: 's3', title: 'Acción Solidaria', desc: 'Servicio a los más necesitados a través de campañas, visitas y obras de caridad.', icon: '🤲' },
    { id: 's4', title: 'Encuentros y Comunidad', desc: 'Convivencias, retiros y celebraciones que fortalecen los lazos de hermandad.', icon: '🔥' },
  ],
  logros: [
    { id: 'l1', valor: '20', label: 'Años de fe', icon: '⏳' },
    { id: 'l2', valor: '300+', label: 'Jóvenes activos', icon: '👥' },
    { id: 'l3', valor: '4', label: 'Zonas pastorales', icon: '🗺️' },
    { id: 'l4', valor: '12+', label: 'Comunidades', icon: '🏛️' },
  ],
  /* ── EVANGELIO DEL DÍA ── */
  evangelioRef: '',
  evangelioTexto: '',
  evangelioFoto: '',
};

export const DEFAULT_CHAPELS: Chapel[] = [
  { id: '1', name: 'Sagrado Corazón', locationUrl: '', address: 'Calle Principal 123', comunidadNombre: 'Corazones Valientes', estadoComunidad: 'Activo', zonaId: 1, photo: '' },
  { id: '2', name: 'San Miguel', locationUrl: '', address: 'Av. San Miguel 456', comunidadNombre: 'Arcángeles', estadoComunidad: 'Activo', zonaId: 1, photo: '' },
  { id: '3', name: 'San José', locationUrl: '', address: 'Ruta 1 Km 20', comunidadNombre: 'Carpinteros de Fe', estadoComunidad: 'Nucleación', zonaId: 2, photo: '' },
  { id: '4', name: 'Santa María', locationUrl: '', address: 'Calle 8 de Diciembre', comunidadNombre: 'Legión de María', estadoComunidad: 'Activo', zonaId: 4, photo: '' },
];

export const DEFAULT_SOCIAL: SocialLinks = { instagram: '@pjl_luque', facebook: 'PJL Luque', youtube: 'PJL Luque', whatsapp: '+595 981 000000' };
export const DEFAULT_SECTIONS: ActiveSections = { zonas: true, consejo: true, agenda: true, institucional: true, faq: true, contacto: true };
export const DEFAULT_GALLERY: GalleryItem[] = [];

export const DEFAULT_BRANDING: Branding = { 
  mainLogo: '/android-chrome-512.png', 
  androidLogo: '/android-chrome-512.png',
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
  zona1Logo: '', 
  zona2Logo: '', 
  zona3Logo: '', 
  zona4Logo: '',
  zona1Map: '',
  zona2Map: '',
  zona3Map: '',
  zona4Map: '',
  zona1Color: '#3B82F6', // Blue
  zona2Color: '#10B981', // Green
  zona3Color: '#F59E0B', // Yellow
  zona4Color: '#EF4444', // Red
  logoWatermark: true,
  showAllZones: false,
  mapCenterLat: -25.2722, // Luque coords
  mapCenterLng: -57.4867,
  mapZoom: 13,
};

export const DEFAULT_USERS: User[] = [
  { id: '1', name: 'Desarrollador', email: 'admin@pjl.org', password: 'admin', role: 'desarrollador', status: 'activo', lastActive: new Date().toISOString() },
  { id: '2', name: 'Editor de Contenido', email: 'editor@pjl.org', password: 'editor', role: 'editor', status: 'activo', lastActive: new Date().toISOString(), permissions: ['dashboard', 'contenido', 'noticias', 'actividades', 'perfiles', 'documentos'] },
  { id: '3', name: 'Lector / Invitado', email: 'viewer@pjl.org', password: 'viewer', role: 'viewer', status: 'activo', lastActive: new Date().toISOString() }
];

export const DEFAULT_THEME_PALETTE: ThemePalette = {
  gold: '#C8973A',
  navy: '#1A2744',
};

export const DEFAULT_STATS: PageStat[] = [
  { page: '/',             label: 'Página Principal',    visits: 0, interactions: 0, desktopVisits: 0, tabletVisits: 0, mobileVisits: 0 },
  { page: '/agenda',       label: 'Agenda / Calendario', visits: 0, interactions: 0, desktopVisits: 0, tabletVisits: 0, mobileVisits: 0 },
  { page: '/noticias',     label: 'Noticias',            visits: 0, interactions: 0, desktopVisits: 0, tabletVisits: 0, mobileVisits: 0 },
  { page: '/zonas',        label: 'Zonas Pastorales',    visits: 0, interactions: 0, desktopVisits: 0, tabletVisits: 0, mobileVisits: 0 },
  { page: '/curriculos',   label: 'Currículos',          visits: 0, interactions: 0, desktopVisits: 0, tabletVisits: 0, mobileVisits: 0 },
  { page: '/documentos',   label: 'Documentos',          visits: 0, interactions: 0, desktopVisits: 0, tabletVisits: 0, mobileVisits: 0 },
  { page: '/mision',       label: 'Misión / Visión',     visits: 0, interactions: 0, desktopVisits: 0, tabletVisits: 0, mobileVisits: 0 },
  { page: '/contacto',     label: 'Contacto',            visits: 0, interactions: 0, desktopVisits: 0, tabletVisits: 0, mobileVisits: 0 },
];

export function mergePageStats(base: PageStat[] = [], incoming: PageStat[] = []): PageStat[] {
  const byPage = new Map<string, PageStat>();

  [...base, ...incoming].forEach((stat) => {
    if (!stat?.page) return;
    const current = byPage.get(stat.page);
    if (!current) {
      byPage.set(stat.page, {
        page: stat.page,
        label: stat.label || stat.page,
        visits: stat.visits || 0,
        interactions: stat.interactions || 0,
        desktopVisits: stat.desktopVisits || 0,
        tabletVisits: stat.tabletVisits || 0,
        mobileVisits: stat.mobileVisits || 0,
      });
      return;
    }

    byPage.set(stat.page, {
      ...current,
      ...stat,
      label: stat.label || current.label,
      visits: Math.max(current.visits || 0, stat.visits || 0),
      interactions: Math.max(current.interactions || 0, stat.interactions || 0),
      desktopVisits: Math.max(current.desktopVisits || 0, stat.desktopVisits || 0),
      tabletVisits: Math.max(current.tabletVisits || 0, stat.tabletVisits || 0),
      mobileVisits: Math.max(current.mobileVisits || 0, stat.mobileVisits || 0),
    });
  });

  return Array.from(byPage.values());
}

export interface HeroSlide {
  id: string;
  imageUrl: string;
  title: string;
  subtitle: string;
  buttonText: string;
  buttonLink: string;
  mobilePosition: string;
  desktopPosition: string;
}

export const DEFAULT_HERO_SLIDES: HeroSlide[] = [];

export const TEAM_LABELS: Record<string, string> = {
  coordinacion: 'Coordinación General',
  efo:          'Equipo de Formación (EFO)',
  ecomu:        'Equipo de Comunicación (ECOMU)',
  eli:          'Equipo de Liturgia (ELI)',
  mmpjl:        'Ministerio de Música (MMPJL)',
  zona1:        'Zona 1',
  zona2:        'Zona 2',
  zona3:        'Zona 3',
  zona4:        'Zona 4',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const STORE_KEYS = [
  'news', 'activities', 'faq', 'docs', 'gallery', 'content', 'social', 'sections', 'profiles',
  'branding', 'theme', 'users', 'hero', 'heroInterval', 'chapels', 'stats', 'logs', 'meta_updated'
];

// Journal de "última actualización" por clave del store. Cada save() registra
// cuándo cambió cada clave; el panel de notificaciones lo usa para avisar
// "se actualizó X" de manera global (sin importar desde qué navegador).
const META_KEY = 'meta_updated';
const META_COALESCE_MS = 45_000;

function journalUpdate(key: string) {
  try {
    const prevRaw = localStorage.getItem('pjl_' + META_KEY);
    const prev: Record<string, string> = prevRaw ? JSON.parse(prevRaw) : {};
    const last = prev[key];
    // Evita martillar Supabase: un cambio por clave cada 45 s, máximo.
    if (last && Date.now() - new Date(last).getTime() < META_COALESCE_MS) return;
    prev[key] = new Date().toISOString();
    localStorage.setItem('pjl_' + META_KEY, JSON.stringify(prev));
    upsertStoreValue(META_KEY, prev).catch(() => {
      // Si Supabase no está disponible, seguimos guardando localmente.
    });
  } catch { /* ignore */ }
}

function save<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('pjl_' + key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent('pjl_store_update', { detail: { key } }));
  upsertStoreValue(key, value).catch(() => {
    // Si Supabase no está disponible, seguimos guardando localmente.
  });
  journalUpdate(key);
}

async function syncRemoteValues() {
  if (typeof window === 'undefined') return;
  try {
    const remoteValues = await fetchAllStoreValues<unknown>(STORE_KEYS);
    Object.entries(remoteValues).forEach(([key, value]) => {
      if (value === null || value === undefined) return;
      const current = localStorage.getItem('pjl_' + key);
      let nextValue = value;
      if (key === 'stats' && Array.isArray(value)) {
        try {
          const localStats = current ? JSON.parse(current) : DEFAULT_STATS;
          nextValue = mergePageStats(Array.isArray(localStats) ? localStats : DEFAULT_STATS, value as PageStat[]);
        } catch {
          nextValue = mergePageStats(DEFAULT_STATS, value as PageStat[]);
        }
      }
      const payload = JSON.stringify(nextValue);
      if (current !== payload) {
        localStorage.setItem('pjl_' + key, payload);
        window.dispatchEvent(new CustomEvent('pjl_store_update', { detail: { key } }));
      }
    });
  } catch (error) {
    console.error('Error sincronizando datos desde Supabase:', error);
  }
}

function initializeRemoteStoreSync() {
  if (typeof window === 'undefined') return;
  setTimeout(syncRemoteValues, 200);
  const unsubscribe = subscribeStoreChanges((key, value) => {
    if (!key) return;
    try {
      const current = localStorage.getItem('pjl_' + key);
      let nextValue = value;
      if (key === 'stats' && Array.isArray(value)) {
        const localStats = current ? JSON.parse(current) : DEFAULT_STATS;
        nextValue = mergePageStats(Array.isArray(localStats) ? localStats : DEFAULT_STATS, value as PageStat[]);
      }
      const payload = JSON.stringify(nextValue);
      if (current !== payload) {
        localStorage.setItem('pjl_' + key, payload);
        window.dispatchEvent(new CustomEvent('pjl_store_update', { detail: { key } }));
      }
    } catch {
      // Ignorar fallos de parseo.
    }
  });

  window.addEventListener('beforeunload', () => unsubscribe());
}

initializeRemoteStoreSync();

function load<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem('pjl_' + key);
    if (!raw || raw === 'null') return fallback;
    
    const parsed = JSON.parse(raw);

    // ── RESTABLECER PERMISOS PARA LA CUENTA ADMIN ──
    if (key === 'users' && Array.isArray(parsed)) {
      return parsed.map((user: any) => {
        if (user.email === 'admin' || user.email === 'admin@pjl.org') {
          return { 
            ...user, 
            password: 'admin', 
            role: 'desarrollador', 
            status: 'activo' 
          };
        }
        return user;
      }) as unknown as T;
    }
    // ───────────────────────────────────────────────

    return parsed as T;
  } catch { return fallback; }
}

// ── Public API ────────────────────────────────────────────────────────────────
export const store = {
  news:      { get: () => load<NewsItem[]>('news',           DEFAULT_NEWS),       set: (v: NewsItem[])      => save('news', v) },
  activities:{ get: () => load<Activity[]>('activities',     DEFAULT_ACTIVITIES), set: (v: Activity[])      => save('activities', v) },
  faq:       { get: () => load<FaqItem[]>('faq',             DEFAULT_FAQ),        set: (v: FaqItem[])       => save('faq', v) },
  docs:      { get: () => load<DocItem[]>('docs',            DEFAULT_DOCS),       set: (v: DocItem[])       => save('docs', v) },
  gallery:   { get: () => load<GalleryItem[]>('gallery',     DEFAULT_GALLERY),    set: (v: GalleryItem[])   => save('gallery', v) },
  content:   { get: () => load<SiteContent>('content',       DEFAULT_CONTENT),    set: (v: SiteContent)     => save('content', v) },
  social:    { get: () => load<SocialLinks>('social',        DEFAULT_SOCIAL),     set: (v: SocialLinks)     => save('social', v) },
  sections:  { get: () => load<ActiveSections>('sections',   DEFAULT_SECTIONS),   set: (v: ActiveSections)  => save('sections', v) },
  profiles:  { get: () => load<MemberProfile[]>('profiles',  DEFAULT_PROFILES),   set: (v: MemberProfile[]) => save('profiles', v) },
  branding:  { get: () => load<Branding>('branding',         DEFAULT_BRANDING),  set: (v: Branding)        => save('branding', v) },
  theme:     { get: () => load<ThemePalette>('theme',        DEFAULT_THEME_PALETTE), set: (v: ThemePalette) => save('theme', v) },
  users:     { get: () => load<User[]>('users',              DEFAULT_USERS),       set: (v: User[])          => save('users', v) },
  hero:      { 
    get: () => {
      const raw = load<any[]>('hero', DEFAULT_HERO_SLIDES);
      return raw.map((r, i) => {
        if (typeof r === 'string') {
          return { id: Date.now().toString() + i, imageUrl: r, title: '', subtitle: '', buttonText: '', buttonLink: '', mobilePosition: 'Centro (Default)', desktopPosition: 'Centro (Default)' } as HeroSlide;
        }
        return r as HeroSlide;
      });
    }, 
    set: (v: HeroSlide[]) => save('hero', v) 
  },
  heroInterval: { get: () => load<number>('heroInterval', 3), set: (v: number) => save('heroInterval', v) },
  chapels:   { get: () => load<Chapel[]>('chapels',          DEFAULT_CHAPELS),    set: (v: Chapel[])        => save('chapels', v) },
  stats:     { get: () => load<PageStat[]>('stats',          DEFAULT_STATS),      set: (v: PageStat[])      => save('stats', v) },
  logs:      { get: () => load<ActivityLog[]>('logs',        []),                 set: (v: ActivityLog[])   => save('logs', v) },
  aiHistory: { get: () => load<{ id: string; mode: string; prompt: string; text: string; at: number }[]>('aiHistory', []), set: (v: { id: string; mode: string; prompt: string; text: string; at: number }[]) => save('aiHistory', v) },
  aiKey:     { get: () => load<string>('aiKey', ''), set: (v: string) => save('aiKey', v) },
};
