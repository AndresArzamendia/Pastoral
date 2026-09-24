/**
 * API Route: POST /api/calendar/import
 * Importa un archivo .ics descargado de Google Calendar y lo fusiona con las
 * actividades actuales del sitio (sin duplicar: usa UID o fecha+título).
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseIcs, classifyActivity, type ActivityCategory } from '@/lib/ics';
import type { Activity } from '@/lib/pjlStore';

const VALID_CATS: readonly string[] = ['Formación', 'Liturgia', 'Organización', 'Social'];

const pickCategory = (title: string, description: string | undefined, googleCategory: string | undefined): ActivityCategory => {
  if (typeof googleCategory === 'string' && VALID_CATS.includes(googleCategory)) {
    return googleCategory as ActivityCategory;
  }
  return classifyActivity(title, description, googleCategory);
};

export async function POST(request: NextRequest) {
  try {
    let body: { text?: unknown; activities?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Cuerpo de la petición inválido.' },
        { status: 400 }
      );
    }

    const text = typeof body?.text === 'string' ? body.text : '';
    if (!/BEGIN:VCALENDAR/i.test(text)) {
      return NextResponse.json(
        { success: false, error: 'El archivo no parece ser un calendario válido (.ics).' },
        { status: 400 }
      );
    }

    const parsed = parseIcs(text);
    if (parsed.length === 0) {
      return NextResponse.json(
        { success: false, error: 'El archivo no contiene eventos válidos para importar.' },
        { status: 400 }
      );
    }

    const base: Activity[] = Array.isArray(body?.activities)
      ? (body.activities as Activity[]).map((a) => ({ ...a }))
      : [];

    const byUid = new Map<string, number>();
    const byTitleDate = new Map<string, number>();
    base.forEach((activity, index) => {
      if (activity.icsUid) byUid.set(activity.icsUid, index);
      const key = `${activity.date}::${activity.title.trim().toLowerCase()}`;
      if (!byTitleDate.has(key)) byTitleDate.set(key, index);
    });

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let nextId = -1;

    const toActivityKey = (date: string, title: string) => `${date}::${title.trim().toLowerCase()}`;

    for (const event of parsed) {
      if (!event.title || !event.date) {
        skipped++;
        continue;
      }

      let index =
        event.uid && byUid.has(event.uid)
          ? (byUid.get(event.uid) as number)
          : -1;

      if (index === -1) {
        index = byTitleDate.get(toActivityKey(event.date, event.title)) ?? -1;
      }

      if (index !== -1) {
        const existing = base[index];
        const isExistingValidCat = typeof existing.category === 'string' && VALID_CATS.includes(existing.category);
        existing.title = event.title;
        existing.date = event.date;
        existing.category = isExistingValidCat
          ? existing.category
          : pickCategory(event.title, event.description, event.category);
        existing.description = event.description || existing.description;
        existing.active = true;
        if (event.uid) existing.icsUid = event.uid;
        updated++;
        continue;
      }

      const activity: Activity = {
        id: nextId--,
        title: event.title,
        date: event.date,
        category: pickCategory(event.title, event.description, event.category),
        active: true,
        inscription: false,
        description: event.description,
      };
      if (event.uid) activity.icsUid = event.uid;

      base.push(activity);
      if (event.uid) byUid.set(event.uid, base.length - 1);
      byTitleDate.set(toActivityKey(event.date, event.title), base.length - 1);
      created++;
    }

    base.sort(
      (a, b) =>
        a.date === b.date
          ? a.title.localeCompare(b.title)
          : a.date.localeCompare(b.date)
    );

    return NextResponse.json({
      success: true,
      imported: parsed.length,
      created,
      updated,
      skipped,
      activities: base,
    });
  } catch (error) {
    console.error('Error importando calendario:', error);
    return NextResponse.json(
      { success: false, error: 'No se pudo importar el archivo de calendario.' },
      { status: 500 }
    );
  }
}