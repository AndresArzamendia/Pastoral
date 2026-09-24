// ─── ICS / iCal helpers (RFC 5545 subset) ────────────────────────────────────

export interface IcsItem {
  title: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM cuando el evento tiene horario
  description?: string;
  location?: string;
}

export interface ParsedIcsEvent extends IcsItem {
  uid?: string;
  category?: string;
}

const unescapeText = (value: string): string =>
  value
    .replace(/\\[nN]/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');

const escapeText = (value: string): string =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');

const foldLine = (line: string): string => {
  if (line.length <= 75) return line;
  const out: string[] = [];
  for (let i = 0; i < line.length; i += 66) out.push(line.slice(i, i + 66));
  return out.join('\r\n ');
};

const toIcsDate = (isoDate: string): string => isoDate.replace(/-/g, '');

const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const toIcsDateTimeStamp = (d: Date): string =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(
    d.getUTCDate()
  ).padStart(2, '0')}T${String(d.getUTCHours()).padStart(2, '0')}${String(
    d.getUTCMinutes()
  ).padStart(2, '0')}${String(d.getUTCSeconds()).padStart(2, '0')}Z`;

const timeFromIcs = (raw: string): string | undefined => {
  const match = raw.match(/T(\d{2})(\d{2})/);
  if (!match) return undefined;
  return `${match[1]}:${match[2]}`;
};

interface IcsComponent {
  type: string;
  lines: string[];
}

interface IcsProp {
  value: string;
  params: Record<string, string>;
}

const unfold = (text: string): string => text.replace(/\r?\n[ \t]/g, '');

const extractComponents = (text: string): IcsComponent[] => {
  const lines = unfold(text).split(/\r?\n/);
  const components: IcsComponent[] = [];
  let current: IcsComponent | null = null;
  for (const line of lines) {
    if (/^BEGIN:/i.test(line)) {
      current = { type: line.slice(6).trim().toUpperCase(), lines: [] };
    } else if (/^END:/i.test(line) && current) {
      components.push(current);
      current = null;
    } else if (current) {
      current.lines.push(line);
    }
  }
  return components;
};

const parseProps = (lines: string[]): Record<string, IcsProp | undefined> => {
  const props: Record<string, IcsProp | undefined> = {};
  for (const line of lines) {
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const head = line.slice(0, colon).trim();
    const value = line.slice(colon + 1);
    if (!head) continue;
    const parts = head.split(';');
    const name = (parts.shift() || '').toUpperCase();
    const params: Record<string, string> = {};
    for (const p of parts) {
      const eq = p.indexOf('=');
      if (eq === -1) continue;
      const key = p.slice(0, eq).toUpperCase();
      let val = p.slice(eq + 1);
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      params[key] = val;
    }
    props[name] = { value, params };
  }
  return props;
};

export function parseIcs(text: string): ParsedIcsEvent[] {
  const events: ParsedIcsEvent[] = [];
  for (const component of extractComponents(text)) {
    if (component.type !== 'VEVENT') continue;
    const props = parseProps(component.lines);

    const status = (props['STATUS']?.value || '').toUpperCase();
    if (status === 'CANCELLED' || status === 'CANCELED') continue;

    const start = props['DTSTART'];
    if (!start || !start.value) continue;

    const dateMatch = start.value.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!dateMatch) continue;

    const date = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
    const hasTime = /T\d{6}/.test(start.value) || /T\d{4}/.test(start.value);

    const title = unescapeText(props['SUMMARY']?.value || '').trim() || 'Evento';
    const description = unescapeText(props['DESCRIPTION']?.value || '').trim();
    const location = unescapeText(props['LOCATION']?.value || '').trim();
    const categories = unescapeText(props['CATEGORIES']?.value || '').trim();

    const details = [
      description,
      hasTime ? `🕒 Horario: ${timeFromIcs(start.value)}` : '',
      location ? `📍 Lugar: ${location}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    events.push({
      uid: props['UID']?.value,
      title,
      date,
      time: hasTime ? timeFromIcs(start.value) : undefined,
      description: details || undefined,
      category: categories || undefined,
      location: location || undefined,
    });
  }
  return events;
}

export function buildIcs(items: IcsItem[], calendarName = 'Pastoral Juvenil Luqueña - Agenda'): string {
  const now = toIcsDateTimeStamp(new Date());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Pastoral Juvenil Luqueña//Agenda//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];

  items.forEach((item, index) => {
    const start = toIcsDate(item.date);
    const end = toIcsDate(addDays(item.date, 1));
    lines.push(
      'BEGIN:VEVENT',
      `UID:pjl-${Date.now()}-${index}-${start}`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${escapeText(item.title)}`
    );
    if (item.description) lines.push(foldLine(`DESCRIPTION:${escapeText(item.description)}`));
    lines.push(`LOCATION:${escapeText(item.location || 'Pastoral Juvenil Luqueña')}`, 'END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

// ── Auto-clasificación por tipo (Formación | Liturgia | Organización | Social) ──
export type ActivityCategory = 'Formación' | 'Liturgia' | 'Organización' | 'Social';

const CATEGORY_RULES: Array<{ cat: ActivityCategory; re: RegExp }> = [
  // Liturgia: prácticas y celebraciones litúrgicas concretas.
  { cat: 'Liturgia', re: /(biblioteca-se?sion|santo rosario|rosario|misa|eucarist|adoraci|v[ií]a crucis|procesi|vigilia|oraci|confesi|novena|peregrinaci|liturgia|celebraci(ón|on)|besamanos|tr[ií]duo|quincena|v[ií]a lucis|crisma|v[ií]acrucis)/i },
  // Formación: retiros, talleres, cursos, escuelas, charlas.
  { cat: 'Formación', re: /(retiro|campamento|curso|taller|charla|cateques|seminario|escuela|capacitac|formaci|jornada( de| institucional)?|jornada de formaci|estudio|biblioteca|catecumenado)/i },
  // Organización: reuniones, asambleas, coordinación, planificación.
  { cat: 'Organización', re: /(asamblea|reum|reuni|coordin|consejo|planificac|evaluaci|junta|directiva|convocatoria|comisi|sesi[óo]n|equipo|lanzamiento|preparac|secretar[ií]a|tesorer|organiz)/i },
  // Social: acción social, misión, campamentos, festivales, convivencias.
  { cat: 'Social', re: /(social|solidar|mis[ióo]n|misionero|voluntari|visita|campa[ií]a|convivencia|festival|deporte|kerm|bazar|colecta|ayuda|donac|merienda|comedor|recreativ|aniversario|encuentro|fiesta|pe[ií]a|salida|paseo|gala|concierto|pollada|empanada|compartir)/i },
];

export function classifyActivity(title: string, description?: string, googleCategory?: string): ActivityCategory {
  const haystack = `${title || ''} ${description || ''} ${googleCategory || ''}`;
  // Si Google ya categoriza con uno de nuestros tipos, respetar.
  if (googleCategory) {
    const base = googleCategory.toLowerCase().replace(/[^a-záéíóúñ]/gi, '');
    const match = (['Formación' as const, 'Liturgia' as const, 'Organización' as const, 'Social' as const]).find(c =>
      c.toLowerCase().replace(/[^a-záéíóúñ]/gi, '') === base
    );
    if (match) return match;
  }
  for (const rule of CATEGORY_RULES) {
    if (rule.re.test(haystack)) return rule.cat;
  }
  // Prioridad de la categoría de Google, o un término clave, o por defecto Formación.
  if (googleCategory) {
    const gc = googleCategory.toLowerCase();
    if (/formac|curso|taller|retiro|escuela/i.test(gc)) return 'Formación';
    if (/misa|liturgia|oraci|celebra/i.test(gc)) return 'Liturgia';
    if (/organiz|reuni|asamblea|consejo/i.test(gc)) return 'Organización';
    if (/social|mision|solidar|campa/i.test(gc)) return 'Social';
  }
  return 'Formación';
}