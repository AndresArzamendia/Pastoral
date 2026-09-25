'use client';
import { useCallback, useEffect, useState } from 'react';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = typeof window !== 'undefined' ? window.atob(base64) : '';
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function applicationServerKey(publicKey: string): Uint8Array<ArrayBuffer> {
  const arr = urlBase64ToUint8Array(publicKey);
  const buf = arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength) as ArrayBuffer;
  return new Uint8Array(buf);
}

function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function useNotifications() {
  const [supported] = useState<boolean>(isPushSupported());
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [subscribed, setSubscribed] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [backendReady, setBackendReady] = useState(false);

  const refreshState = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    setPermission(Notification.permission);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(!!sub);
    } catch {
      setSubscribed(false);
    }
  }, []);

  useEffect(() => {
    if (!supported) return;
    // Esperamos a que el service worker esté activo.
    if (!navigator.serviceWorker.controller) {
      navigator.serviceWorker.addEventListener('controllerchange', () => refreshState(), { once: true });
    }
    refreshState();

    const checkKeys = async () => {
      try {
        const res = await fetch('/api/push/keys', { cache: 'no-store' });
        const json = await res.json();
        setBackendReady(!!json?.publicKey);
      } catch {
        setBackendReady(false);
      }
    };
    checkKeys();
  }, [supported, refreshState]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!supported) return false;
    if (Notification.permission === 'denied') return false;
    setIsSubscribing(true);
    try {
      // Pedir permiso en el gesto del usuario.
      if (Notification.permission === 'default') {
        const p = await Notification.requestPermission();
        setPermission(p);
        if (p !== 'granted') return false;
      }
      if (!navigator.serviceWorker.controller) {
        await navigator.serviceWorker.ready;
      }
      const keysRes = await fetch('/api/push/keys', { cache: 'no-store' });
      const keysJson = await keysRes.json();
      if (!keysJson?.publicKey) {
        throw new Error('Web Push no configurado');
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey(keysJson.publicKey),
        });
      }
      const payload = sub.toJSON();
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: payload }),
      });
      const json = await res.json();
      if (!json?.success) throw new Error('No se pudo guardar la suscripción');
      setSubscribed(true);
      return true;
    } catch (e) {
      console.error('Push subscribe error:', e);
      return false;
    } finally {
      setIsSubscribing(false);
    }
  }, [supported]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!supported) return false;
    setIsSubscribing(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return true;
      // Quitarla del servidor (best effort) y después dar de baja local.
      try {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
      } catch {}
      await sub.unsubscribe();
      setSubscribed(false);
      return true;
    } catch (e) {
      console.error('Push unsubscribe error:', e);
      return false;
    } finally {
      setIsSubscribing(false);
    }
  }, [supported]);

  return { supported, permission, subscribed, isSubscribing, backendReady, subscribe, unsubscribe, refreshState };
}
