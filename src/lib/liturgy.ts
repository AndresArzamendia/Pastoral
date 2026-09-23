/* Colores y tiempo litúrgico católico (rito romano).
   Cálculo local (sin red): colores oficiales del Vaticano aplicados por fecha,
   siguiendo el Calendario Litúrgico General. */

export type LitColorKey = 'verde' | 'morado' | 'blanco' | 'rojo' | 'rosa' | 'oro' | 'azul';

export interface LitColor {
  key: LitColorKey;
  label: string;      // nombre corto del color
  feast: string;      // qué se celebra / en qué tiempo se usa
  lit: string;        // color litúrgico oficial (hex provisto)
  chrome: string;     // tono profundo para "--navy" (chrome oscuro con texto blanco legible)
  gold: string;       // acento para "--gold"
  cream: string;      // fondo claro de página (--cream)
  surface: string;    // tarjetas (--surface)
  white: string;      // --white (fondo del body)
  ink: string;        // texto principal sobre claro
  muted: string;      // texto secundario
}

export const LIT_COLORS: Record<LitColorKey, LitColor> = {
  verde: {
    key: 'verde', label: 'Verde', feast: 'Tiempo Ordinario',
    lit: '#186420',
    chrome: '#0F5019', gold: '#C8973A',
    cream: '#EAF3E9', surface: '#F6FAF4', white: '#FCFEFB',
    ink: '#16331E', muted: '#527057',
  },
  morado: {
    key: 'morado', label: 'Morado', feast: 'Adviento · Cuaresma',
    lit: '#7D287D',
    chrome: '#4D1A4D', gold: '#C8973A',
    cream: '#F4EAF6', surface: '#F9F2FA', white: '#FDF9FC',
    ink: '#41264A', muted: '#77527E',
  },
  blanco: {
    key: 'blanco', label: 'Blanco', feast: 'Navidad · Pascua',
    lit: '#FFFFFF',
    chrome: '#16233D', gold: '#C9972B',
    cream: '#FFFFFF', surface: '#FFFFFF', white: '#FFFFFF',
    ink: '#1B2747', muted: '#5A668A',
  },
  rojo: {
    key: 'rojo', label: 'Rojo', feast: 'Pentecostés · Mártires',
    lit: '#C82F25',
    chrome: '#971F18', gold: '#C8973A',
    cream: '#FDEEEC', surface: '#FEF7F5', white: '#FEFCFB',
    ink: '#5F1610', muted: '#8A4A45',
  },
  rosa: {
    key: 'rosa', label: 'Rosa', feast: 'Gaudete · Laetare',
    lit: '#F485BA',
    chrome: '#9C2F66', gold: '#C8973A',
    cream: '#FDEFF6', surface: '#FEF8FB', white: '#FEFBFC',
    ink: '#6E2150', muted: '#96617F',
  },
  oro: {
    key: 'oro', label: 'Oro', feast: 'Solemnidades del Señor',
    lit: '#D4AF37',
    chrome: '#5F430F', gold: '#D4AF37',
    cream: '#FBF3DE', surface: '#FDF9EE', white: '#FEFCF5',
    ink: '#5A471B', muted: '#8A7752',
  },
  azul: {
    key: 'azul', label: 'Azul', feast: 'Inmaculada Concepción',
    lit: '#0047AB',
    chrome: '#00337F', gold: '#D4AF37',
    cream: '#E8F0FC', surface: '#F4F8FD', white: '#FBFDFF',
    ink: '#12315F', muted: '#56709B',
  },
};

const NOON = 12;
const addDays = (d: Date, n: number): Date => {
  const nd = new Date(d.getTime());
  nd.setDate(nd.getDate() + n);
  return nd;
};
const sundayOnOrAfter = (d: Date): Date => addDays(d, (7 - d.getDay()) % 7);

/** Domingo de Pascua del año (cómputo gregoriano, algoritmo de Meeus/Jones/Butcher). */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day, NOON);
}

export interface LitDay {
  color: LitColor;
  code: string;    // clave corta para atributos/data (ej: "tord", "adv", "pent")
  name: string;    // etiqueta completa del día (ej: "Tiempo Ordinario", "3º Domingo de Adviento")
}

/** Color litúrgico del día dado (hora local), según el Calendario General romano. */
export function liturgicalColor(date: Date): LitDay {
  const y = date.getFullYear();
  const t = new Date(y, date.getMonth(), date.getDate(), NOON);
  const md = (date.getMonth() + 1) * 100 + date.getDate();

  const easter = easterSunday(y);
  const ash = addDays(easter, -46);
  const laetare = addDays(easter, -21);             // 4º Domingo de Cuaresma
  const goodFriday = addDays(easter, -2);
  const pent = addDays(easter, 49);                 // Pentecostés
  const pentOct = addDays(pent, 6);                 // octava de Pentecostés
  const asc = sundayOnOrAfter(addDays(easter, 39)); // Ascensión
  const corpus = sundayOnOrAfter(addDays(easter, 60)); // Corpus Christi
  const advent = sundayOnOrAfter(new Date(y, 10, 27, NOON)); // 1º de Adviento
  const gaudete = addDays(advent, 14);              // 3º Domingo de Adviento
  const baptism = sundayOnOrAfter(new Date(y, 0, 6, NOON)); // Bautismo del Señor
  const xmas = new Date(y, 11, 25, NOON);

  const same = (a: Date, b: Date): boolean =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const day = (c: LitColorKey, name: string): LitDay => ({ color: LIT_COLORS[c], code: c, name });

  /* Azul: Inmaculada Concepción (8 dic) */
  if (md === 1208) return day('azul', 'Inmaculada Concepción');

  /* Rosa: Gaudete (3º Adviento) y Laetare (4º Cuaresma) */
  if (same(t, gaudete)) return day('rosa', '3º Domingo de Adviento (Gaudete)');
  if (same(t, laetare)) return day('rosa', '4º Domingo de Cuaresma (Laetare)');

  /* Rojo: Viernes Santo, Pentecostés y su octava, Pedro y Pablo (29 jun) */
  if (same(t, goodFriday)) return day('rojo', 'Viernes Santo');
  if (t >= pent && t <= pentOct) return day('rojo', t.getDate() === pent.getDate() ? 'Pentecostés' : 'Octava de Pentecostés');
  if (md === 629) return day('rojo', 'San Pedro y San Pablo');

  /* Oro: solemnidades del Señor (sustituto de solemnidades) */
  if (same(t, xmas)) return day('oro', 'Natividad del Señor');
  if (md === 106) return day('oro', 'Epifanía del Señor');
  if (same(t, easter)) return day('oro', 'Domingo de Resurrección');
  if (same(t, asc)) return day('oro', 'Ascensión del Señor');
  if (same(t, corpus)) return day('oro', 'Corpus Christi');

  /* Blanco: tiempo de Navidad y tiempo pascual */
  if ((t >= xmas && t <= new Date(y, 11, 31, NOON)) || t <= baptism) return day('blanco', 'Tiempo de Navidad');
  if (t >= easter && t < pent) return day('blanco', 'Tiempo Pascual');

  /* Morado: Adviento y Cuaresma */
  if ((t >= advent && t < xmas) || (t >= ash && t < easter)) return day('morado', t >= advent ? 'Adviento' : 'Cuaresma');

  /* Verde: Tiempo Ordinario */
  return day('verde', 'Tiempo Ordinario');
}