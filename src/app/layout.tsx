import type { Metadata, Viewport } from "next";
import Script from "next/script";
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
              /* El navbar nace oculto (opacity:0 en globals.css) y SOLO se
                 revela cuando 'nav-entered' dispara su animación escalonada.
                 El velo del splash lo mantiene oculto hasta entonces, y el
                 useLayoutEffect de page.tsx siempre añade 'nav-entered', por
                 lo que no existe ventana sin menú: un único fundido de entrada.
                 Nada de sobreescribir opacity a 1 aquí (causaba doble refresco:
                 flash visible -> re-animación desde 0). */
              'html.show-splash:not(.pjl-reveal) body>*:not(#splash-pjl):not(script):not(style):not(noscript){visibility:hidden!important}',
              'html.pjl-reveal body>*:not(#splash-pjl):not(script):not(style):not(noscript){visibility:visible!important;animation:pjlPageIn .55s ease-out both}',
              /* IMPORTANTE: el navbar NO debe heredar pjlPageIn. Si lo recibe,
                 entraría con el fundido del contenido y LUEGO otra vez con su
                 propia animación nav-entered -> doble refresco. Se le quita la
                 animación de pjlPageIn y queda solamente con su fundido único. */
              'html.pjl-reveal body>.top-nav{animation:none!important;visibility:visible!important}',
              '@keyframes pjlPageIn{from{opacity:0}to{opacity:1}}',
              'html.show-splash body:not(:has(> #splash-pjl))>*{visibility:visible!important}',
              '@media (prefers-reduced-motion:reduce){#splash-pjl{display:none!important}html.show-splash body>*:not(#splash-pjl){visibility:visible!important}}',
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
        <script dangerouslySetInnerHTML={{ __html: `(function(){if(location.pathname!=='/')return;var skip=false;try{var ne=performance&&performance.getEntriesByType&&performance.getEntriesByType('navigation');var nt=ne&&ne[0]?ne[0].type:'';var isReload=(nt==='reload')||(performance.navigation&&performance.navigation.type===1);if(!isReload){var ts=parseInt(sessionStorage.getItem('pjl_skip_splash')||'',10);if(ts&&Date.now()-ts<8000)skip=true;}}catch(e){skip=false;}if(!skip){document.documentElement.className+=' show-splash';}})();` }} />
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var h=location.hash;if(h&&h.indexOf('type=recovery')!==-1&&location.pathname.indexOf('/reset-password/recover')===-1){location.replace('/reset-password/recover'+h);}}catch(e){}})();` }} />
        {/* Pantalla de carga estática: vive FUERA del árbol que React intercambia,
            por eso se ve desde el primer pintado y sobrevive a la hidratación. */}
        <div id="splash-pjl" className="splash-screen" role="status" aria-label="Cargando Pastoral Juvenil Luqueña">
          <div className="splash-bg" aria-hidden="true">
            <span className="splash-orb splash-orb-1"></span>
            <span className="splash-orb splash-orb-2"></span>
            <span className="splash-orb splash-orb-3"></span>
            {Array.from({ length: 14 }).map((_, i) => (
              <span key={i} className="splash-ember" style={{ left: `${(i * 7.3 + 4) % 96}%`, animationDelay: `${(i * 0.37) % 3.2}s`, animationDuration: `${3.4 + (i % 5) * 0.55}s` }} />
            ))}
                        {/* Fondo estelar "Cielo de Fe": reemplaza las siluetas line-art con
                puntos dorados por un cielo nocturno vivo. Estrellas que
                titilan, la constelacion de la Cruz que se dibuja sola al
                recibir art-on, estrellas fugaces doradas y destellos de
                esperanza. Todo solo CSS, sin JS de por medio. */}
            <span className="splash-stars splash-stars-1" aria-hidden="true"></span>
            <span className="splash-stars splash-stars-2" aria-hidden="true"></span>
            <span className="splash-galaxy" aria-hidden="true"></span>
            <svg className="splash-constellation" viewBox="0 0 220 220" aria-hidden="true" focusable="false">
              <defs>
                <linearGradient id="pjlConsG" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#f5dfae" />
                  <stop offset="100%" stopColor="#c8973a" />
                </linearGradient>
              </defs>
              {/* constelacion de la Cruz: trazos que se dibujan + nodos-estrella */}
              <path className="x-p" style={{ '--d': '3.1s', '--dl': '0.2s' } as React.CSSProperties} d="M26 118 H194" />
              <path className="x-p" style={{ '--d': '3.4s', '--dl': '0.55s' } as React.CSSProperties} d="M110 22 V206" />
              <circle className="x-n" style={{ '--i': '0.5s' } as React.CSSProperties} cx="26" cy="118" r="4" />
              <circle className="x-n" style={{ '--i': '0.9s' } as React.CSSProperties} cx="194" cy="118" r="4" />
              <circle className="x-n" style={{ '--i': '1.15s' } as React.CSSProperties} cx="110" cy="22" r="4.4" />
              <circle className="x-n" style={{ '--i': '1.6s' } as React.CSSProperties} cx="110" cy="206" r="4" />
              <circle className="x-n x-n-center" style={{ '--i': '0.4s' } as React.CSSProperties} cx="110" cy="118" r="5" />
              <circle className="x-s" style={{ '--i': '0s' } as React.CSSProperties} cx="158" cy="64" r="2" />
              <circle className="x-s" style={{ '--i': '0.6s' } as React.CSSProperties} cx="66" cy="172" r="2.2" />
              <circle className="x-s" style={{ '--i': '1.1s' } as React.CSSProperties} cx="150" cy="150" r="1.6" />
              <circle className="x-s" style={{ '--i': '0.35s' } as React.CSSProperties} cx="80" cy="48" r="1.5" />
            </svg>
            <span className="splash-shoot splash-shoot-1" aria-hidden="true"></span>
            <span className="splash-shoot splash-shoot-2" aria-hidden="true"></span>
            <span className="splash-glints" aria-hidden="true">
              <i className="gl g-a" style={{ '--i': '0.4s' } as React.CSSProperties}></i>
              <i className="gl g-b" style={{ '--i': '1s' } as React.CSSProperties}></i>
              <i className="gl g-c" style={{ '--i': '1.6s' } as React.CSSProperties}></i>
              <i className="gl g-d" style={{ '--i': '2.2s' } as React.CSSProperties}></i>
            </span>

            {/* Obra de la Creación: planeta anillado, astro menor y la luna creciente */}
            <svg className="splash-creation" viewBox="0 0 220 220" aria-hidden="true" focusable="false" style={{ '--i': '0.4s' } as React.CSSProperties}>
              <defs>
                <radialGradient id="plSphere" cx="35%" cy="28%" r="80%">
                  <stop offset="0%" stopColor="#6d8fc7" />
                  <stop offset="55%" stopColor="#33466f" />
                  <stop offset="100%" stopColor="#17233f" />
                </radialGradient>
                <linearGradient id="plRing" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#c8973a" stopOpacity="0.55" />
                  <stop offset="45%" stopColor="#f6e2ae" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#a97b22" stopOpacity="0.55" />
                </linearGradient>
                <radialGradient id="plMini" cx="35%" cy="30%" r="75%">
                  <stop offset="0%" stopColor="#fff2d4" />
                  <stop offset="70%" stopColor="#e6cf98" />
                  <stop offset="100%" stopColor="#a9863f" />
                </radialGradient>
              </defs>
              {/* anillo parte trasera */}
              <g transform="rotate(-16 150 150)">
                <path className="pl-ring pl-ring-back" d="M70 150 A80 20 0 0 1 230 150" fill="none" stroke="url(#plRing)" strokeWidth="7" />
              </g>
              {/* esfera del planeta */}
              <circle cx="150" cy="150" r="46" fill="url(#plSphere)" />
              <circle cx="133" cy="133" r="21" fill="#ffffff" opacity="0.07" />
              <path className="pl-night" d="M150 104 A46 46 0 0 1 150 196 A34 34 0 1 0 150 104 Z" fill="#0d1526" opacity="0.5" />
              {/* anillo parte frontal */}
              <g transform="rotate(-16 150 150)">
                <path className="pl-ring pl-ring-front" d="M70 150 A80 20 0 0 0 230 150" fill="none" stroke="url(#plRing)" strokeWidth="7.5" />
              </g>
              {/* astro menor con su propio anillo */}
              <circle cx="62" cy="60" r="10" fill="url(#plMini)" opacity=".92" />
              <ellipse cx="62" cy="60" rx="20" ry="5" fill="none" stroke="url(#plRing)" strokeWidth="2.2" transform="rotate(-20 62 60)" opacity=".85" />
              {/* lunita compañera */}
              <circle cx="192" cy="96" r="6.5" fill="#22334f" />
              <circle cx="190" cy="94" r="2.2" fill="#8fb0e0" opacity=".8" />
            </svg>

            <svg className="splash-moon" viewBox="0 0 100 100" aria-hidden="true" focusable="false" style={{ '--i': '0.9s' } as React.CSSProperties}>
              <defs>
                <radialGradient id="moonGrad" cx="35%" cy="28%" r="80%">
                  <stop offset="0%" stopColor="#fff8e6" />
                  <stop offset="70%" stopColor="#eddca8" />
                  <stop offset="100%" stopColor="#c3a56b" />
                </radialGradient>
              </defs>
              <path d="M55 8 A38 38 0 1 0 55 92 A30 30 0 1 1 55 8 Z" fill="url(#moonGrad)" />
              <circle cx="36" cy="40" r="4" fill="#caa86a" opacity=".55" />
              <circle cx="28" cy="62" r="3" fill="#caa86a" opacity=".45" />
              <circle cx="44" cy="72" r="2" fill="#caa86a" opacity=".4" />
            </svg>
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
            <p className="splash-tagline">
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
        <Script
          src="https://www.vaticannews.va/etc/designs/vaticannews/widget/widget.js"
          strategy="lazyOnload"
          id="vaticannews-widget"
        />
      </body>
    </html>
  );
}
