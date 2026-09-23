/* Tiempo litúrgico católico: cálculo local (sin red) del tiempo actual y su
   paleta de colores para el tema automático del sitio. */

export type LitSeasonKey = 'adviento' | 'navidad' | 'cuaresma' | 'pascua' | 'ordinario';

export interface LitSeason {
  key: LitSeasonKey;
  label: string;
  gold: string;
  navy: string;
}

export const LIT_SEASONS: Record<LitSeasonKey, LitSeason> = {
  adviento:  { key: 'adviento',  label: 'Adviento',         gold: '#C9A96F', navy: '#2E2150' },
  navidad:   { key: 'navidad',   label: 'Navidad',          gold: '#D9BC5B', navy: '#12352B' },
  cuaresma:  { key: 'cuaresma',  label: 'Cuaresma',         gold: '#C7A878', navy: '#3A2140' },
  pascua:    { key: 'pascua',    label: 'Pascua',           gold: '#E0B33C', navy: '#1E2A57' },
  ordinario: { key: 'ordinario', label: 'Tiempo Ordinario', gold: '#C8973A', navy: '#1B3B2A' },
};

const NOON = 12;

const addDays = (d: Date, n: number): Date => {
  const nd = new Date(d.getTime());
  nd.setDate(nd.getDate() + n);
  return nd;
};

const sundayOnOrAfter = (d: Date): Date => addDays(d, (7 - d.getDay()) % 7);

/** Domingo de Pascua del año (algoritmo de Meeus/Jones/Butcher). */
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

/** Tiempo litúrgico del día para la fecha dada (hora local). */
export function liturgicalSeason(date: Date): LitSeason {
  const y = date.getFullYear();
  const t = new Date(date.getFullYear(), date.getMonth(), date.getDate(), NOON);
  const easter = easterSunday(y);
  const ashWed = addDays(easter, -46);
  const pentecost = addDays(easter, 49);
  const advent = sundayOnOrAfter(new Date(y, 10, 27));
  const baptism = sundayOnOrAfter(new Date(y, 0, 6));
  const xmas = new Date(y, 11, 25, NOON);

  if (t >= advent && t < xmas) return LIT_SEASONS.adviento;
  if (t >= xmas || t < baptism) return LIT_SEASONS.navidad;
  if (t >= ashWed && t < easter) return LIT_SEASONS.cuaresma;
  if (t >= easter && t <= pentecost) return LIT_SEASONS.pascua;
  return LIT_SEASONS.ordinario;
}