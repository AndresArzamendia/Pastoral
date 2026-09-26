import { NextRequest, NextResponse } from 'next/server';
import {
  buildGoogleCalendarEventResource,
  deleteGoogleCalendarEvent,
  refreshGoogleCalendarAccessToken,
  insertGoogleCalendarEvent,
  updateGoogleCalendarEvent,
} from '@/lib/googleCalendar';
import { resolveGoogleCalendarCredentials } from '@/lib/googleCalendarServer';
import { requireAdminWriter } from '@/lib/requireAdmin';

type GoogleCalendarEventAction = 'create' | 'update' | 'delete';

export async function POST(request: NextRequest) {
  // Operacion del panel: exige sesion iniciada.
  const auth = await requireAdminWriter(request);
  if (!auth.ok) return auth.response;
  const credentials = await resolveGoogleCalendarCredentials();
  const clientId = credentials?.clientId;
  const clientSecret = credentials?.clientSecret;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { ok: false, message: 'Faltan configurar Google Client ID o Google Client Secret en el panel de Configuración.' },
      { status: 500 }
    );
  }

  const refreshToken = request.cookies.get('pjl_google_calendar_refresh_token')?.value;
  if (!refreshToken) {
    return NextResponse.json(
      { ok: false, message: 'Google Calendar no está conectado.' },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const action = (body?.action || 'create') as GoogleCalendarEventAction;
  const title = typeof body?.title === 'string' ? body.title : '';
  const date = typeof body?.date === 'string' ? body.date : '';
  const description = typeof body?.description === 'string' ? body.description : '';
  const category = typeof body?.category === 'string' ? body.category : '';
  const eventId = typeof body?.eventId === 'string' ? body.eventId : '';

  try {
    const accessToken = await refreshGoogleCalendarAccessToken({
      refreshToken,
      clientId,
      clientSecret,
    });

    if (action === 'delete') {
      if (!eventId) {
        return NextResponse.json({ ok: true, deleted: false, message: 'No había evento remoto para borrar.' });
      }

      await deleteGoogleCalendarEvent({ accessToken, eventId });
      return NextResponse.json({ ok: true, deleted: true });
    }

    const event = buildGoogleCalendarEventResource({ title, date, description, category });
    if (!event) {
      return NextResponse.json(
        { ok: false, message: 'Faltan datos válidos de título o fecha para crear el evento.' },
        { status: 400 }
      );
    }

    if (action === 'update' && eventId) {
      const result = await updateGoogleCalendarEvent({ accessToken, eventId, event });
      return NextResponse.json({ ok: true, eventId: result?.id || eventId, htmlLink: result?.htmlLink || '' });
    }

    const result = await insertGoogleCalendarEvent({ accessToken, event });
    return NextResponse.json({ ok: true, eventId: result?.id || '', htmlLink: result?.htmlLink || '' });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : 'No se pudo sincronizar con Google Calendar.' },
      { status: 500 }
    );
  }
}
