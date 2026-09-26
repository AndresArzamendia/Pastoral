import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';
import { requireAdminWriter } from '@/lib/requireAdmin';

const GEMINI_MODEL = 'gemini-3.7-flash';

export async function POST(req: Request) {
  // Operacion del panel: exige sesion iniciada.
  const auth = await requireAdminWriter(req);
  if (!auth.ok) return auth.response;
  try {
    const { prompt, apiKey } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'El prompt es requerido' }, { status: 400 });
    }

    const key: string | undefined = apiKey || process.env.GEMINI_API_KEY;
    if (!key) {
      return NextResponse.json(
        { error: 'Configura tu clave de Gemini en el panel (Asistente IA → Conexión Gemini).' },
        { status: 500 }
      );
    }

    const ai = new GoogleGenerativeAI(key);
    const model = ai.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction:
        'Eres el asistente de comunicación de la Pastoral Juvenil Luqueña (Paraguay), ' +
        'un movimiento pastoral católico. Escribes siempre en español, con tono cercano, ' +
        'esperanzador y profesional, usando emojis con moderación cuando el formato lo permita. ' +
        'Prioriza un lenguaje inclusivo, juvenil y fiel a la fe católica.',
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 2048,
      },
    });

    const result = await model.generateContent(prompt);

    return NextResponse.json({ text: result.response.text() });
  } catch (error: unknown) {
    console.error('Error generating AI content:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Error al generar contenido con IA.' }, { status: 500 });
  }
}
