import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Fraunces, Manrope, Libre_Baskerville } from "next/font/google";
import ThemeLoader from "../components/ThemeLoader";
import PwaInstallPrompt from "../components/PwaInstallPrompt";
import PwaIconSync from "../components/PwaIconSync";
import InstalledToast from "../components/InstalledToast";
import UpdatePrompt from "../components/UpdatePrompt";
import "./globals.css";
import "./responsive-fix.css";

const displayFont = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "600", "700"],
});

const bodyFont = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["300", "400", "500", "600", "700"],
});

const accentFont = Libre_Baskerville({
  subsets: ["latin"],
  variable: "--font-accent",
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Pastoral Juvenil Luqueña | PJL",
  description: "Sitio oficial de la Pastoral Juvenil Luqueña. Comunidad, fe y misión para la juventud de Luque.",
  applicationName: "Pastoral Juvenil Luqueña",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Pastoral Juvenil Luqueña",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#1A2744",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${displayFont.variable} ${bodyFont.variable} ${accentFont.variable}`} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preload" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400&display=swap" as="style" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400&display=swap" media="print" />
        {/* Favicon dinámico: SIEMPRE el logo del panel (favLogo > androidLogo > mainLogo).
            La ruta /api/favicon resuelve en el servidor para TODOS los visitantes,
            sin depender del localStorage de cada dispositivo. */}
        <link rel="icon" href="/api/favicon" sizes="any" />
        <link rel="apple-touch-icon" href="/api/favicon" />
        <script dangerouslySetInnerHTML={{ __html: "var pf=document.querySelector('link[href*=\"Playfair\"][media=\"print\"]');if(pf)pf.onload=function(){this.media='all'};" }} />
        {/* Captura TEMPRANA del beforeinstallprompt (antes de la hidratación).
            Chrome lo dispara al cargar si la web es instalable; si React no lo
            escucha a tiempo el evento se pierde y nunca habría instalación
            nativa. Lo guardamos en una variable global para que el hook lo
            recupere cuando se monte. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
  try{
    if(!window.__pjlpwa) window.__pjlpwa={deferredPrompt:null,hasPrompt:false,captured:false};
    function capture(e){
      if(e && e.preventDefault) e.preventDefault();
      window.__pjlpwa.captured=true;
      window.__pjlpwa.deferredPrompt=e;
      window.__pjlpwa.hasPrompt=true;
      try{window.dispatchEvent(new CustomEvent('pjl_beforeinstall',{detail:e}))}catch(_){}
    }
    window.addEventListener('beforeinstallprompt',capture);
    window.addEventListener('appinstalled',function(){try{window.__pjlpwa.hasPrompt=false;window.__pjlpwa.deferredPrompt=null}catch(_){}});
  }catch(e){}
})();`,
          }}
        />
        {/* Critical CSS anti-destello, en DOS fases:
            1) La navbar nace oculta y SOLO su animación la revela.
            2) Mientras el splash corre SIN clase pjl-reveal, TODO el
               contenido queda oculto: primero se ve la intro completa.
            3) page.tsx añade pjl-reveal a mitad de la salida del splash:
               el contenido aparece con su PROPIO fundido suave cruzándose
               con el resto del fundido del splash.
               La regla con :has() auto-expira al eliminarse el nodo del
               splash (red de seguridad si la clase quedara huérfana).
            4) Con movimiento reducido no hay intro ni velo. */}
        <style
          dangerouslySetInnerHTML={{
            __html: [
              /* El splash nace VISIBLE POR DEFECTO (sin depender de ninguna
                 clase ni de que el JS corra): el icono de notificaciones y el
                 contenido quedan ocultos desde el primer pintado hasta que
                 page.tsx levanta el velo con 'pjl-reveal' o elimina el nodo.
                 Así no puede aparecer contenido (campana, navbar) antes de la
                 intro, ni existe una carga previa de ~1s mientras el bundle se
                 descarga/hidrata. */
              'body>*:not(#splash-pjl):not(script):not(style):not(noscript){visibility:hidden!important}',
              /* show-splash: estado explícito (igual que el default), se mantiene
                 para compatibilidad con el código existente. */
              'html.show-splash body>*:not(#splash-pjl):not(script):not(style):not(noscript){visibility:hidden!important}',
              /* no-splash: rutas sin intro (admin, instalar, internas) — el
                 splash sale de escena y el contenido se muestra al instante. */
              'html.no-splash #splash-pjl{display:none!important}',
              'html.no-splash body>*:not(#splash-pjl):not(script):not(style):not(noscript){visibility:visible!important}',
              /* pjl-reveal: el contenido aparece con su propio fundido suave,
                 cruzándose con el fundido de salida del splash. */
              'html.pjl-reveal body>*:not(#splash-pjl):not(script):not(style):not(noscript){visibility:visible!important;animation:pjlPageIn .55s ease-out both}',
              /* IMPORTANTE: el navbar NO debe heredar pjlPageIn. Si lo recibe,
                 entraría con el fundido del contenido y LUEGO otra vez con su
                 propia animación nav-entered -> doble refresco. Se le quita la
                 animación de pjlPageIn y queda solamente con su fundido único. */
              'html.pjl-reveal body>.top-nav{animation:none!important;visibility:visible!important}',
              '@keyframes pjlPageIn{from{opacity:0}to{opacity:1}}',
              /* Seguridad: si el nodo del splash ya no está en el DOM, el
                 contenido se muestra aunque el velo quedara huérfano. */
              'body:not(:has(> #splash-pjl))>*:not(script):not(style):not(noscript){visibility:visible!important}',
              /* La campana de notificaciones se auto-fuerza visible en móvil
                 (visibility/opacity !important en globals.css). Se oculta SOLO
                 mientras el splash cubre la pantalla (nodo presente y sin
                 'is-leaving'); en cuanto empieza la salida de la intro vuelve a
                 mostrarse junto a las 3 barras, aunque el nodo tarde en borrarse.
                 Con movimiento reducido nunca se oculta. */
              '@media (prefers-reduced-motion: no-preference){body:has(> #splash-pjl:not(.is-leaving)) .nav-content .notif-bell{visibility:hidden!important;opacity:0!important}}',
              '@media (prefers-reduced-motion:reduce){#splash-pjl{display:none!important}body>*:not(#splash-pjl):not(script):not(style):not(noscript){visibility:visible!important}}',
              '@media (prefers-reduced-motion:reduce){.top-nav .brand-logo-wrap,.top-nav .brand-text,.top-nav .nav-links .nav-item{opacity:1 !important}}',
            ].join(''),
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
  function setFavicon(u){var l=document.querySelectorAll('link[rel="icon"],link[rel="apple-touch-icon"]');for(var i=0;i<l.length;i++)l[i].remove();var c=document.createElement('link');c.rel='icon';c.type='image/png';c.href=u;document.head.insertBefore(c,document.head.firstChild);var a=document.createElement('link');a.rel='apple-touch-icon';a.href=u;document.head.appendChild(a)}
  function pickLogo(b){if(!b)return null;var u=b.favLogo||b.androidLogo||b.mainLogo;return typeof u==='string'&&u.length>0?u:null}
  function drawCircle(imgUrl){var img=new Image();img.onload=function(){var s=256,ca=document.createElement('canvas');ca.width=s;ca.height=s;var x=ca.getContext('2d');if(!x)return;var m=Math.min(img.width,img.height);if(!m||m<8){setFavicon(imgUrl);return}x.beginPath();x.arc(s/2,s/2,s/2,0,Math.PI*2);x.closePath();x.clip();x.drawImage(img,(img.width-m)/2,(img.height-m)/2,m,m,0,0,s,s);setFavicon(ca.toDataURL('image/png'));try{if(navigator.serviceWorker&&navigator.serviceWorker.controller)navigator.serviceWorker.controller.postMessage({type:'FAVICON_UPDATED'})}catch(e){}};img.onerror=function(){};img.src=imgUrl+(imgUrl.indexOf('data:')===0?'':'?ts='+Date.now())}
  function loadLogo(){try{var r=localStorage.getItem('pjl_branding');if(!r)return;var u=pickLogo(JSON.parse(r));if(!u)return;drawCircle(u)}catch(e){}}
  setTimeout(loadLogo,50);
  function onStore(e){try{var d=e.detail||{};if(d.key==='branding')setTimeout(loadLogo,50)}catch(ex){}}
  if(typeof window!=='undefined'){window.addEventListener('pjl_store_update',onStore);window.addEventListener('storage',function(e){if(e.key==='pjl_branding')setTimeout(loadLogo,50)})}
})();`,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        {/* Marca <html> ANTES de pintar el splash: solo en la home ('/').
            El velo de contenido se gestiona junto con la intro; otras rutas
            no deben depender de ella. */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){var h=document.documentElement;if(location.pathname!=='/'){h.classList.add('no-splash');return;}var skip=false;try{var ne=performance&&performance.getEntriesByType&&performance.getEntriesByType('navigation');var nt=ne&&ne[0]?ne[0].type:'';var isReload=(nt==='reload')||(performance.navigation&&performance.navigation.type===1);if(!isReload){var ts=parseInt(sessionStorage.getItem('pjl_skip_splash')||'',10);if(ts&&Date.now()-ts<8000)skip=true;}}catch(e){skip=false;}if(skip){h.classList.add('no-splash');return;}h.classList.add('show-splash');})();` }} />
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var h=location.hash;if(h&&h.indexOf('type=recovery')!==-1&&location.pathname.indexOf('/reset-password/recover')===-1){location.replace('/reset-password/recover'+h);}}catch(e){}})();` }} />
        {/* Pantalla de carga estática: vive FUERA del árbol que React intercambia,
            por eso se ve desde el primer pintado y sobrevive a la hidratación. */}
<div id="splash-pjl" className="splash-screen" role="status" aria-label="Cargando Pastoral Juvenil Luqueña">
          {/* Fondo vivo "Noche de luz": aurora + destellos dorados + haz,
              sincronizado con la barra de carga. Logo, frase y barra viven
              en .splash-content (por encima, z-index 3). */}
          <div className="sx-scene" aria-hidden="true">
            <span className="sx-aura-1"></span>
            <span className="sx-aura-2"></span>
            <span className="sx-beams"></span>
            <span className="sx-rise"></span>
            <span className="sx-stars">
              {Array.from({ length: 20 }).map((_, i) => (
                <i key={i} className="sx-star" style={{
                  left: `${((i * 23 + 7) % 96) + 2}%`,
                  top: `${((i * 41 + 13) % 86) + 4}%`,
                  ['--s' as any]: String((i % 3) + 1),
                  ['--fl' as any]: (0.55 + (i % 5) * 0.1).toFixed(2),
                  animationDelay: `${(i % 7) * 0.55}s`,
                  animationDuration: `${3.4 + (i % 5) * 0.9}s`,
                }} />
              ))}
            </span>
          </div>
          <div className="splash-content">
            <div className="splash-logo-wrap">
              <span className="splash-ring" aria-hidden="true"></span>
              <span className="splash-halo" aria-hidden="true"></span>
              <span className="splash-logo-fallback">⛪</span>
            </div>
            <h1 className="splash-title" aria-label="Pastoral Juvenil Luqueña">
              {['PASTORAL', 'JUVENIL', 'LUQUEÑA'].map((word, w) => (
                <span key={word} className="splash-word" aria-hidden="true">
                  {word.split('').map((ch, i) => (
                    <span key={i} className="splash-letter" style={{ animationDelay: `${0.75 + ([0, 8, 15][w] + i) * 0.045}s` }}>{ch}</span>
                  ))}
                </span>
              ))}
            </h1>
            <p className="splash-tagline splash-motto">
              <span className="splash-flame" aria-hidden="true">🔥</span>
              <em>«Avivando la llama de Cristo en tu corazón»</em>
            </p>
            <div className="splash-loader">
              <div className="splash-bar"><span className="splash-bar-fill"></span><span className="splash-bar-shine"></span></div>
              <p className="splash-loading-text">Cargando<span className="splash-dots"><i>.</i><i>.</i><i>.</i></span></p>
            </div>
          </div>
        </div>
        <noscript><style>{"#splash-pjl{display:none!important}"}</style></noscript>
        {/* Inyecta el logo oficial en el splash ANTES de la hidratación para
            evitar que se vea el logo por defecto un instante. */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){function inject(){try{var r=localStorage.getItem('pjl_branding');if(!r)return;var b=JSON.parse(r);var u=b&&b.mainLogo;if(!u)return;var f=document.querySelector('.splash-logo-fallback');if(!f)return;if(f.querySelector('img'))return;var img=document.createElement('img');img.src=u;img.alt='Logotipo de la Pastoral Juvenil Luqueña';img.className='splash-logo-img';img.onload=function(){if(f.isConnected)f.replaceWith(img)};img.onerror=function(){};if(img.complete&&img.naturalWidth>0)setTimeout(function(){if(f.isConnected)f.replaceWith(img)},0)}catch(e){}}inject();setTimeout(inject,300);setTimeout(inject,1200);window.addEventListener('load',inject);window.addEventListener('pjl_store_update',function(){setTimeout(inject,50)});window.addEventListener('storage',function(e){if(e.key==='pjl_branding')setTimeout(inject,50)})})();` }} />
        <ThemeLoader />
        <PwaIconSync />
        {/* Registro del Service Worker (PWA instalable / offline shell).
            Se registra en producción/*seguro y con soporte del navegador.
            Registro TEMPRANO (no espera window.load) para que Chrome
            evalúe la web como instalable lo antes posible. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1')){navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(function(r){r.update()}).catch(function(){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).catch(function(){})});});}})();` }}
        />
        <PwaInstallPrompt />
        <InstalledToast />
        <UpdatePrompt />
        {children}
        <SpeedInsights />
        <Script
          src="https://www.vaticannews.va/etc/designs/vaticannews/widget/widget.js"
          strategy="lazyOnload"
          id="vaticannews-widget"
        />
      </body>
    </html>
  );
}
