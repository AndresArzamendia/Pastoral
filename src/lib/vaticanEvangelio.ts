export type EvgHoyResponse = {
  ok: boolean;
  title?: string;
  link?: string;
  pubDate?: string;
  paragraphs?: string[];
};

export type EvgHoySectionLabel = 'Lectura' | 'Segunda' | 'Salmo' | 'Evangelio' | 'Pensamiento del día';

export type EvgHoySection = {
  label: EvgHoySectionLabel;
  heading: string;
  reference: string;
  body: string[];
};

export const EVH_BASE_URL = 'https://www.vaticannews.va/es/evangelio-de-hoy.html';

const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const evgHoyDecode = (s: string): string => {
  if (typeof DOMParser === 'undefined') {
    return s.replace(/<[^>]*>/g, '').trim();
  }
  const doc = new DOMParser().parseFromString(`<div>${s}</div>`, 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
};

// Fecha litúrgica en hora de Roma: el feed publica a las 00:00 +0200, por lo que
// convertir a la zona horaria del visitante (p. ej. América) podía mostrar el día
// anterior (14 en vez de 15). Se prefiere la fecha explícita del título del feed.
export const evgHoyDateLabel = (title?: string, pubDate?: string): string => {
  if (title) {
    const m = title.match(/d[íi]a\s+(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de\s+(\d{4})/i);
    if (m) {
      const month = MESES_ES.findIndex((x) => x.toLowerCase() === m[2].toLowerCase());
      if (month >= 0) return `${parseInt(m[1], 10)} de ${MESES_ES[month]} de ${m[3]}`;
    }
  }
  if (pubDate) {
    try {
      const d = new Date(pubDate);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' });
      }
    } catch { /* fallback vacío */ }
  }
  return '';
};

const REF_RE = /^[0-9]{0,2}\s*[A-ZÁÉÍÓÚÑ][a-záéíóúñü]+(?:[,.\s][A-ZÁÉÍÓÚÑa-záéíóúñü-]+)*\b\s*[0-9]{1,3}(?:\s*[,;:.–-]\s*[0-9IVXL]+)*\s*$/;

const GOSPEL_BOOK_RE = /^[0-9]?\s*(Juan|Mateo|Marcos|Lucas|Jn|Mt|Mc|Lc)\b/i;

const isReference = (t: string): boolean => {
  if (t.length > 60 || /^en aquel/i.test(t)) return false;
  return REF_RE.test(t);
};

const isPopeWords = (t: string): boolean => {
  if (/^pensamiento del d[íi]a/i.test(t)) return true;
  // El comentario de los Papas suele cerrar con la atribución "(Papa - …, fecha)".
  return /\([^()]*(?:Francisco|Benedicto|Le[oó]n XIV|Juan Pablo|Pablo VI|Santo Padre|Papa|Ángelus|Homil[íi]a|Catequesis|Santa Marta)[^()]*\)\s*$/i.test(t);
};

export const evgHoyClassify = (paragraphs?: string[]): EvgHoySection[] => {
  if (!paragraphs) return [];
  const txts = paragraphs.map(evgHoyDecode).filter(Boolean);
  const out: EvgHoySection[] = [];
  let cur: EvgHoySection | null = null;

  const pushSec = (label: EvgHoySectionLabel, heading = ''): EvgHoySection => {
    const sec: EvgHoySection = { label, heading, reference: '', body: [] };
    out.push(sec);
    return sec;
  };

  for (const para of txts) {
    const t = para.trim();
    const short = t.length <= 120;

    // 1) Encabezados explícitos de la liturgia.
    if (short && /^primera lectura\b/i.test(t)) { cur = pushSec('Lectura'); continue; }
    if (short && /^segunda lectura\b/i.test(t)) { cur = pushSec('Segunda'); continue; }
    // "Salmo responsorial" / "Salmo" como etiqueta; si lleva cita ("Salmo 89, 2-3")
    // lo trataremos como referencia en el paso 2.
    if (short && /^salmo responsorial\b/i.test(t)) { cur = pushSec('Salmo'); continue; }
    if (short && /^salmo\s*$/i.test(t)) { cur = pushSec('Salmo'); continue; }
    if (short && /^lectura del santo evangelio/i.test(t)) { cur = pushSec('Evangelio', t); continue; }
    // "Lectura del libro de…" puede ser el título de la sección actual (caso dominical:
    // "Primera lectura" → "Lectura del libro del Eclesiástico") o encabezar una lectura
    // nueva. Si la sección actual sigue vacía, se conserva como título; si lo que está
    // abierto ya tiene texto (feria/solemnidad sin etiqueta "Segunda lectura"),
    // se detecta automáticamente una segunda lectura.
    if (short && /^lectura\s+(del|de la|de los|de las)/i.test(t)) {
      const c = cur;
      if (c && (c.label === 'Lectura' || c.label === 'Segunda') && !c.heading && !c.reference && c.body.length === 0) {
        c.heading = t;
      } else {
        const hasPrimera = out.some((s) => s.label === 'Lectura') || out.some((s) => s.label === 'Segunda');
        cur = pushSec(hasPrimera && !out.some((s) => s.label === 'Segunda') && !out.some((s) => s.label === 'Evangelio') ? 'Segunda' : 'Lectura', t);
      }
      continue;
    }
    if (short && /^lectio\b/i.test(t)) {
      const c = cur;
      if (c && (c.label === 'Lectura' || c.label === 'Segunda') && !c.heading && !c.reference && c.body.length === 0) {
        c.heading = t;
      } else {
        const hasPrimera = out.some((s) => s.label === 'Lectura');
        cur = pushSec(hasPrimera ? 'Segunda' : 'Lectura', t);
      }
      continue;
    }

    // 2) Referencia bíblica (ej. "Hebreos 5, 7-9", "Salmo 89, 2-3" o "Juan 19, 25-27"
    //    sin encabezado previo).
    if (short && isReference(t)) {
      if (/^(salmo|sal\.)\s*\d/i.test(t)) {
        if (!cur || cur.label !== 'Salmo' || cur.body.length > 0) cur = pushSec('Salmo');
        cur.reference = t;
        continue;
      }
      const mustOpen = !cur
        || cur.label === 'Pensamiento del día'
        || (cur.reference !== '' && cur.body.length > 0)
        || (cur.reference === '' && cur.body.length > 0 && GOSPEL_BOOK_RE.test(t));
      if (mustOpen) {
        if (GOSPEL_BOOK_RE.test(t)) {
          cur = pushSec('Evangelio');
        } else if (cur?.label === 'Salmo' || (cur?.label === 'Lectura' && cur.reference !== '')) {
          const hasPrimera = out.some((s) => s.label === 'Lectura') || out.some((s) => s.label === 'Segunda');
          cur = pushSec(hasPrimera && !out.some((s) => s.label === 'Segunda') ? 'Segunda' : 'Lectura');
        } else {
          const hasPrimera = out.some((s) => s.label === 'Lectura');
          cur = pushSec(hasPrimera ? 'Segunda' : 'Lectura');
        }
      }
      cur!.reference = t;
      continue;
    }

    // 3) Palabras del Papa: sólo después de iniciado el Evangelio y con cuerpo.
    if (cur && cur.label === 'Evangelio' && cur.body.length > 0 && isPopeWords(t)) {
      cur = pushSec('Pensamiento del día');
      cur.body.push(t);
      continue;
    }

    // 4) Cuerpo del texto.
    if (!cur) cur = pushSec('Lectura');
    cur.body.push(t);
  }

  if (out.length === 0 && txts.length) {
    out.push({ label: 'Lectura', heading: '', reference: '', body: txts });
  }
  return out;
};