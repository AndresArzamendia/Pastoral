'use client';

import { useEffect } from 'react';
import { store } from '@/lib/pjlStore';
import { fetchStoreValue, subscribeStoreChanges } from '@/lib/supabaseStore';
import { liturgicalSeason, LIT_SEASONS } from '@/lib/liturgy';

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
  return lum > 0.45 ? '#1c1a16' : '#ffffff';
}

export default function ThemeLoader() {
  useEffect(() => {
    const applyTheme = (themeOverride?: { gold: string; navy: string; mode?: 'auto' | 'manual' } | null) => {
      const theme = themeOverride || store.theme.get();
      const palette = theme || null;

      /* Auto: el sitio se tiñe según el tiempo litúrgico actual. Manual:
         usa los colores elegidos en el panel (los temas guardados sin
         'mode' se tratan como manual para respetar personalizaciones). */
      let previewKey: string | null = null;
      try { previewKey = localStorage.getItem('pjl_lit_preview'); } catch { /* ignore */ }
      const realSeason = liturgicalSeason(new Date());
      const season = previewKey && LIT_SEASONS[previewKey as keyof typeof LIT_SEASONS]
        ? LIT_SEASONS[previewKey as keyof typeof LIT_SEASONS]
        : realSeason;
      const naval = palette && palette.mode === 'auto' ? season : null;
      const gold = palette && palette.mode !== 'auto' ? palette.gold : naval ? naval.gold : '#C8973A';
      const navy = palette && palette.mode !== 'auto' ? palette.navy : naval ? naval.navy : '#1A2744';

      const root = document.documentElement.style;

      /* Colores base */
      root.setProperty('--gold', gold);
      root.setProperty('--navy', navy);

      /* Texto que se lee bien sobre cada superficie (auto-contraste) */
      root.setProperty('--on-navy', readableTextOn(navy));
      root.setProperty('--on-gold', readableTextOn(gold));
      root.setProperty('--on-cream', '#1c1a16');

      /* Paleta derivada automáticamente: sombras y tintes armoniosos */
      root.setProperty('--navy-mid', mixColor(navy, '#ffffff', 0.12));
      root.setProperty('--navy-light', mixColor(navy, '#ffffff', 0.22));
      root.setProperty('--navy-dark', shade(navy, 0.18));
      root.setProperty('--gold-light', tint(gold, 0.28));
      root.setProperty('--gold-pale', tint(gold, 0.86));
      root.setProperty('--gold-deep', shade(gold, 0.22));

      /* Superficies neutrales derivadas del navy+gold para que todo sea cohesivo */
      const cream = tint(mixColor(navy, gold, 0.08), 0.84);
      root.setProperty('--cream', cream);
      root.setProperty('--surface', tint(cream, 0.65));
      root.setProperty('--white', tint(cream, 0.9));

      /* Etiqueta del tiempo litúrgico activo, para el panel y depuración */
      const el = document.documentElement;
      if (naval) {
        el.setAttribute('data-lit-season', naval.key);
        el.setAttribute('data-lit-label', naval.label);
      } else {
        el.removeAttribute('data-lit-season');
        el.removeAttribute('data-lit-label');
      }
    };

const syncTheme = (theme: { gold: string; navy: string; mode?: 'auto' | 'manual' } | null) => {
      if (!theme) return;
      try {
        localStorage.setItem('pjl_theme', JSON.stringify(theme));
      } catch {
        // ignore localStorage write failures
      }
      applyTheme(theme);
    };

    applyTheme();

void fetchStoreValue<{ gold: string; navy: string; mode?: 'auto' | 'manual' }>('theme')
      .then(theme => syncTheme(theme))
      .catch(() => {});

    // En modo auto, recalcula al cambiar de día (medianoche) o de tiempo litúrgico.
    let lastKey = liturgicalSeason(new Date()).key + '|' + new Date().toDateString();
    const dayTimer = window.setInterval(() => {
      const key = liturgicalSeason(new Date()).key + '|' + new Date().toDateString();
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
        syncTheme(value as { gold: string; navy: string; mode?: 'auto' | 'manual' });
      }
    });

    window.addEventListener('storage', handleStorage);
    window.addEventListener('pjl_theme_update', handleCustomChange);

    return () => {
      unsubscribeRemote();
      window.clearInterval(dayTimer);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('pjl_theme_update', handleCustomChange);
    };
  }, []);

  return null;
}
