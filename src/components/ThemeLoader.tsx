'use client';

import { useEffect } from 'react';
import { store } from '@/lib/pjlStore';
import { fetchStoreValue, subscribeStoreChanges } from '@/lib/supabaseStore';
import { liturgicalColor, LIT_COLORS } from '@/lib/liturgy';

function hexToRgb(hex: string): [number, number, number] {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return [26, 39, 68];
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
function clamp255(n: number): number { return Math.max(0, Math.min(255, Math.round(n))); }
function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(c => clamp255(c).toString(16).padStart(2, '0')).join('').toUpperCase();
}
function mixColor(a: string, b: string, t: number): string {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
function tint(hex: string, amount: number): string { return mixColor(hex, '#ffffff', amount); }
function shade(hex: string, amount: number): string { return mixColor(hex, '#000000', amount); }
function readableTextOn(hex: string): string {
  const c = hexToRgb(hex);
  const lum = 0.2126 * c[0] / 255 + 0.7152 * c[1] / 255 + 0.0722 * c[2] / 255;
  return lum > 0.42 ? '#1c1a16' : '#ffffff';
}

type ThemeLike = { gold: string; navy: string; mode?: 'auto' | 'manual'; litPreview?: string | null } | null;

export default function ThemeLoader() {
  useEffect(() => {
    const applyTheme = (themeOverride?: ThemeLike) => {
      const theme = themeOverride || store.theme.get();
      const palette = theme || null;
      const auto = !!(palette && palette.mode === 'auto');

      // Preview litúrgico: primero el sincronizado (viene de cualquier
      // dispositivo vía el tema guardado); el localStorage cubre configs viejas.
      let previewKey: string | null = null;
      if (palette && typeof palette.litPreview === 'string' && palette.litPreview) {
        previewKey = palette.litPreview;
      } else {
        try { previewKey = localStorage.getItem('pjl_lit_preview'); } catch { /* ignore */ }
      }

      const root = document.documentElement.style;

      let navy: string;
      let gold: string;
      let cream: string;
      let surface: string;
      let white: string;
      let ink: string;
      let muted: string;

      if (auto) {
        /* Auto: esquema del color litúrgico del día (o de la vista previa
           sincronizada desde el panel, en cualquier dispositivo). */
        const previewCol = previewKey ? LIT_COLORS[previewKey as keyof typeof LIT_COLORS] : undefined;
        const col = previewCol || liturgicalColor(new Date()).color;
        navy = col.chrome;
        gold = col.gold;
        cream = col.cream;
        surface = col.surface;
        white = col.white;
        ink = col.ink;
        muted = col.muted;
      } else {
        /* Manual: los colores elegidos en el panel (los temas guardados sin
           'mode' se tratan como manual para respetar personalizaciones). */
        navy = palette?.navy || '#1A2744';
        gold = palette?.gold || '#C8973A';
        ink = '#1C1A16';
        muted = '#5C5444';
        cream = tint(mixColor(navy, gold, 0.08), 0.84);
        surface = tint(cream, 0.65);
        white = tint(cream, 0.9);
      }

      /* Colores base */
      root.setProperty('--gold', gold);
      root.setProperty('--navy', navy);
      root.setProperty('--cream', cream);
      root.setProperty('--surface', surface);
      root.setProperty('--white', white);

      /* Texto con auto-contraste: legible sobre cualquier color */
      root.setProperty('--on-navy', readableTextOn(navy));
      root.setProperty('--on-gold', readableTextOn(gold));
      root.setProperty('--on-cream', readableTextOn(cream));
      root.setProperty('--text', ink);
      root.setProperty('--text-muted', muted);
      root.setProperty('--accent', ink);

      /* Paleta derivada: sombras y tintes armoniosos que siguen el color del tiempo */
      root.setProperty('--navy-mid', mixColor(navy, '#ffffff', 0.12));
      root.setProperty('--navy-light', mixColor(navy, '#ffffff', 0.22));
      root.setProperty('--navy-dark', shade(navy, 0.18));
      root.setProperty('--gold-light', tint(gold, 0.28));
      root.setProperty('--gold-pale', tint(gold, 0.86));
      root.setProperty('--gold-deep', shade(gold, 0.22));

      /* Etiquetas del tiempo litúrgico para depuración y estilos puntuales */
      const el = document.documentElement;
      const lit = auto ? (() => {
        const today = liturgicalColor(new Date());
        return previewKey && LIT_COLORS[previewKey as keyof typeof LIT_COLORS]
          ? { key: previewKey, name: `Vista previa: ${LIT_COLORS[previewKey as keyof typeof LIT_COLORS].label}` }
          : { key: today.color.key, name: today.name };
      })() : null;
      if (lit) {
        el.setAttribute('data-lit-color', lit.key);
        el.setAttribute('data-lit-label', lit.name);
      } else {
        el.removeAttribute('data-lit-color');
        el.removeAttribute('data-lit-label');
      }
    };

    const syncTheme = (theme: ThemeLike) => {
      if (!theme) return;
      try {
        localStorage.setItem('pjl_theme', JSON.stringify(theme));
      } catch {
        // ignore localStorage write failures
      }
      applyTheme(theme);
    };

    applyTheme();

    // Sincronización remota: trae el tema guardado y lo re-aplica si cambió.
    // También sirve de red de seguridad si Realtime no entrega el evento.
    let lastRemote: string | null = (() => {
      try { return localStorage.getItem('pjl_theme'); } catch { return null; }
    })();
    const pollRemote = () => {
      void fetchStoreValue<ThemeLike>('theme')
        .then(theme => {
          if (!theme || typeof theme !== 'object') return;
          const raw = JSON.stringify(theme);
          if (raw !== lastRemote) {
            lastRemote = raw;
            syncTheme(theme);
          }
        })
        .catch(() => {});
    };
    pollRemote();
    // Realtime de Supabase no está activo en este proyecto, así que el polling
    // es el puente de sincronización entre dispositivos: 8s mantiene el cambio
    // casi instantáneo sin martillar la API.
    const remoteTimer = window.setInterval(pollRemote, 8000);
    const refreshOnVisible = () => {
      if (document.visibilityState === 'visible') pollRemote();
    };
    document.addEventListener('visibilitychange', refreshOnVisible);
    window.addEventListener('focus', pollRemote);

    // En modo auto, recalcula al cambiar de día (medianoche) o de color litúrgico.
    let lastKey = liturgicalColor(new Date()).color.key + '|' + new Date().toDateString();
    const dayTimer = window.setInterval(() => {
      const key = liturgicalColor(new Date()).color.key + '|' + new Date().toDateString();
      if (key !== lastKey) {
        lastKey = key;
        applyTheme();
      }
    }, 60000);

    // Listen to localStorage changes across tabs, or custom events from admin panel
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'pjl_theme') {
        applyTheme();
      }
    };

    // Custom event to handle in-tab immediate updates
    const handleCustomChange = () => applyTheme();
    const unsubscribeRemote = subscribeStoreChanges((key, value) => {
      if (key === 'theme' && value && typeof value === 'object') {
        syncTheme(value as ThemeLike);
      }
    });

    window.addEventListener('storage', handleStorage);
    window.addEventListener('pjl_theme_update', handleCustomChange);

    // pjlStore normaliza los cambios remotos en localStorage y dispara este evento;
    // re-aplicamos por si la suscripción directa no llegó.
    const handleStoreUpdate = (e: Event) => {
      const detail = (e as CustomEvent<{ key?: string }>).detail;
      if (detail?.key === 'theme') applyTheme();
    };
    window.addEventListener('pjl_store_update', handleStoreUpdate);

    return () => {
      unsubscribeRemote();
      window.clearInterval(dayTimer);
      window.clearInterval(remoteTimer);
      document.removeEventListener('visibilitychange', refreshOnVisible);
      window.removeEventListener('focus', pollRemote);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('pjl_theme_update', handleCustomChange);
      window.removeEventListener('pjl_store_update', handleStoreUpdate);
    };
  }, []);

  return null;
}