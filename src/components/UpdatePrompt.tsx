'use client';
import { useEffect, useState } from 'react';

export default function UpdatePrompt() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [waitingSw, setWaitingSw] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    function onControllerChange() {
      // La recarga SOLO ocurre cuando el usuario toca "Actualizar ahora".
      // Nunca se recarga sola al entrar: el cambio de controlador del SW
      // (activación/claim) solo limpia el estado, sin recargar la página.
      setUpdateAvailable(false);
      setWaitingSw(null);
    }

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });

        navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

        const check = async () => {
          if (reg.waiting) {
            setUpdateAvailable(true);
            setWaitingSw(reg.waiting);
            return;
          }
          const freshReg = await navigator.serviceWorker.getRegistration('/');
          if (freshReg?.waiting) {
            setUpdateAvailable(true);
            setWaitingSw(freshReg.waiting);
          }
        };

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // Nueva versión instalada mientras había una activa => hay actualización lista
              setUpdateAvailable(true);
              setWaitingSw(newWorker);
            }
          });
        });

        check();
      } catch {}
    };

    if (navigator.serviceWorker.controller) {
      register();
    } else {
      navigator.serviceWorker.ready.then(() => register());
    }

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  if (!updateAvailable) return null;

  const applyUpdate = () => {
    if (waitingSw) {
      let reloaded = false;
      const doReload = () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      };
      navigator.serviceWorker.addEventListener('controllerchange', doReload, { once: true });
      setTimeout(doReload, 2500);
      waitingSw.postMessage({ type: 'SKIP_WAITING' });
    } else {
      window.location.reload();
    }
  };

  return (
    <div className="pjl-update-banner" role="status" aria-live="polite">
      <div className="pjl-update-content">
        <span className="pjl-update-icon" aria-hidden="true">✨</span>
        <div className="pjl-update-text">
          <strong>¡Hay una nueva actualización!</strong>
          <span>Ya está disponible una versión mejorada. Actualizá para ver los cambios.</span>
        </div>
        <div className="pjl-update-actions">
          <button className="pjl-update-btn" onClick={applyUpdate}>Actualizar ahora</button>
          <button className="pjl-update-close" onClick={() => setUpdateAvailable(false)} aria-label="Cerrar">✕</button>
        </div>
      </div>
    </div>
  );
}
