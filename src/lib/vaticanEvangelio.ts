export type EvgHoyResponse = {
  ok: boolean;
  title?: string;
  link?: string;
  pubDate?: string;
  paragraphs?: string[];
};

export type EvgHoySection = {
  label: string;
  heading: string;
  reference: string;
  body: string[];
};

export const EVH_BASE_URL = 'https://www.vaticannews.va/es/evangelio-de-hoy.html';

export const evgHoyDecode = (s: string): string => {
  if (typeof DOMParser === 'undefined') {
    return s.replace(/<[^>]*>/g, '').trim();
  }
  const doc = new DOMParser().parseFromString(`<div>${s}</div>`, 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
};

export const evgHoyClassify = (paragraphs?: string[]): EvgHoySection[] => {
  if (!paragraphs) return [];
  const txts = paragraphs.map(evgHoyDecode).filter(Boolean);
  const out: EvgHoySection[] = [];
  let cur: EvgHoySection | null = null;
  for (const para of txts) {
    const short = para.length <= 120;
    if (short && /^(lectura de la|lectura del santo evangelio|salmo|lectio)/i.test(para)) {
      const label = /^salmo/i.test(para) ? 'Salmo' : /^lectura del santo evangelio/i.test(para) ? 'Evangelio' : 'Lectura';
      cur = { label, heading: para, reference: '', body: [] };
      out.push(cur);
    } else if (cur && cur.body.length === 0 && cur.reference === '' && short) {
      cur.reference = para;
    } else if (cur && cur.label === 'Evangelio' && cur.body.length > 0 && /(francisco|homil[íi]a|santa marta|catequesis del santo padre)/i.test(para)) {
      const pens: EvgHoySection = { label: 'Pensamiento del día', heading: '', reference: '', body: [para] };
      out.push(pens);
      cur = pens;
    } else if (cur) {
      cur.body.push(para);
    }
  }
  if (out.length === 0 && txts.length) {
    out.push({ label: 'Lectura', heading: '', reference: '', body: txts });
  }
  return out;
};