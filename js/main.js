(function () {
  "use strict";

  var header = document.querySelector(".site-header");
  var menuToggle = document.querySelector(".menu-toggle");
  var body = document.body;

  if (menuToggle) {
    menuToggle.addEventListener("click", function () {
      var isOpen = body.classList.toggle("nav-open");
      menuToggle.setAttribute("aria-expanded", String(isOpen));
    });

    document.querySelectorAll(".site-nav__links a").forEach(function (link) {
      link.addEventListener("click", function () {
        body.classList.remove("nav-open");
        menuToggle.setAttribute("aria-expanded", "false");
      });
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && body.classList.contains("nav-open")) {
        body.classList.remove("nav-open");
        menuToggle.setAttribute("aria-expanded", "false");
        menuToggle.focus();
      }
    });
  }

  /* Header adaptativo: solo en paginas con foto clara en el primer
     viewport (Home). El resto de paginas usa fondo negro desde el inicio,
     por lo que el header ya nace en su variante solida (fondo negro,
     texto blanco). En Home, el header nace transparente (se ve la foto
     detras, texto negro) y pasa a fondo negro solido + texto blanco en
     cuanto el usuario hace el primer scroll, en vez de esperar a que la
     foto del hero quede tapada del todo - asi el menu nunca se confunde
     con la imagen mientras se sigue viendo. */
  var lightZone = document.querySelector("[data-header-light-zone]");
  if (header && lightZone) {
    var SCROLL_THRESHOLD = 10;
    var setHeaderState = function () {
      header.classList.toggle("is-on-light", window.scrollY < SCROLL_THRESHOLD);
    };
    setHeaderState();
    window.addEventListener("scroll", setHeaderState, { passive: true });
    window.addEventListener("resize", setHeaderState);
  }

  /* CR-02 (peticion de cliente, ver client-feedback/header-scroll-behavior-spec.md):
     el hero de Home reduce su tamano y se reposiciona hacia la esquina
     superior izquierda a medida que se hace scroll (corregido 2026-06-25,
     dos veces: primero la esquina, luego el desplazamiento extra para que
     el header no tape la miniatura - ver --hero-progress mas abajo),
     dejando ver el texto principal (.hero-scroll__content). Sin librerias
     externas: se calcula un progreso 0-1 en cada frame de scroll (rAF)
     segun la posicion actual dentro de .hero-scroll, y se expone como
     variables CSS (--hero-progress, --hero-media-scale,
     --hero-content-opacity) que pages.css usa para interpolar
     transform/opacity - el JS no toca estilos directamente salvo esas 3
     variables y la clase is-content-visible (solo para pointer-events).
     Si el usuario prefiere menos movimiento (prefers-reduced-motion), no
     se ejecuta este calculo en absoluto: el fallback estatico de pages.css
     (media query prefers-reduced-motion, cualquier ancho) se encarga de
     mostrar un layout simple sin transformaciones.

     Historial 2026-06-29: este guard tambien excluia movil real (<=860px,
     variable isMobileViewport) y, brevemente, tablet (<=1279px). El mismo
     dia, el usuario pidio el efecto de escritorio en tablet (revertido) y
     despues pidio EXPLICITAMENTE un efecto de scroll para movil tambien -
     pero distinto al de escritorio: imagen a pantalla completa al cargar
     y que desaparezca POR COMPLETO (fade) al hacer scroll, no que se
     encoja/reposicione. Se quita la exclusion de movil aqui: el calculo
     de progreso (--hero-progress) ya es el mismo para todos los anchos,
     solo cambia como lo interpreta pages.css para .hero-scroll__media
     (opacity en movil via @media max-width:860px, scale+translate en
     escritorio/tablet). isMobileViewport se mantiene declarada porque
     CR-03 (mas abajo) SI sigue excluyendo movil - no se ha pedido cambiar
     el panel de Proyectos en movil. */
  var heroScroll = document.querySelector(".hero-scroll");
  var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var isMobileViewport = window.matchMedia("(max-width: 860px)").matches;

  if (heroScroll && !prefersReducedMotion) {
    var HERO_MIN_SCALE = 0.22;
    var heroTicking = false;

    var updateHeroProgress = function () {
      var scrollDistance = heroScroll.offsetHeight - window.innerHeight;
      var progress = scrollDistance > 0 ? window.scrollY / scrollDistance : 0;
      progress = Math.max(0, Math.min(1, progress));

      var scale = 1 - progress * (1 - HERO_MIN_SCALE);
      heroScroll.style.setProperty("--hero-progress", progress.toFixed(4));
      heroScroll.style.setProperty("--hero-media-scale", scale.toFixed(4));
      heroScroll.style.setProperty("--hero-content-opacity", progress.toFixed(4));
      heroScroll.classList.toggle("is-content-visible", progress > 0.6);

      heroTicking = false;
    };

    var onHeroScroll = function () {
      if (!heroTicking) {
        heroTicking = true;
        window.requestAnimationFrame(updateHeroProgress);
      }
    };

    updateHeroProgress();
    window.addEventListener("scroll", onHeroScroll, { passive: true });
    window.addEventListener("resize", onHeroScroll);
  }

  /* CR-03 (peticion de cliente, ver client-feedback/projects-scroll-showcase-spec.md):
     en la seccion Proyectos de Home, "Proyectos" queda fijo mientras se
     hace scroll; la columna de imagenes (.project-entry__media) se
     desplaza de forma continua; la columna de texto (primer <div> de cada
     .project-entry) no se desplaza, solo aparece/desaparece (crossfade)
     mostrando el proyecto activo. Referencia citada: koto.com ("Our
     Work"). Misma tecnica/guardas que CR-02 (prefers-reduced-motion,
     movil real <=860px - se reutiliza isMobileViewport, ver historial en
     el comentario de CR-02 mas arriba), pero con un progreso CONTINUO
     (--project-track-progress, 0 a N-1, no 0-1) para que las imagenes se
     desplacen de forma fluida entre posiciones, no a saltos. El indice
     activo (para el crossfade de texto) si es discreto: se redondea al
     proyecto mas cercano. */
  var projectShowcase = document.querySelector(".project-showcase");
  var projectPin = projectShowcase ? projectShowcase.querySelector(".project-showcase__pin") : null;
  var projectEntries = projectShowcase
    ? Array.prototype.slice.call(projectShowcase.querySelectorAll(".project-entry"))
    : [];

  if (projectShowcase && projectPin && projectEntries.length && !prefersReducedMotion && !isMobileViewport) {
    var PROJECT_COUNT = projectEntries.length;
    var projectTicking = false;
    var firstProjectMedia = projectEntries[0].querySelector(".project-entry__media");

    /* Peticion cliente 2026-07-10: el boton "Ver todos los proyectos"
       (.btn-bar) y las imagenes del carrusel (.project-entry__media)
       deben compartir el mismo margen derecho. Ese margen sale de que la
       imagen tiene un ancho propio via aspect-ratio, mas estrecho que su
       columna de grid (1.9fr de 1fr/1.9fr, gap 64px = var(--space-xl) -
       ver .project-entry en components.css) - es dinamico, varia segun
       el alto de imagen resultante, que depende del alto real de
       pantalla, asi que se mide en tiempo real en vez de hardcodear un
       valor. Reducido despues un 20% mas a peticion del cliente (el
       hueco completo quedaba demasiado grande).
       Se calcula el ancho de la columna de imagen a partir del ancho
       TOTAL de la ficha (entryRect.width), no midiendo la posicion
       actual de la imagen - importante: si se midiera
       "entryRect.right - mediaRect.right" en vez del ancho, el resultado
       dependeria de donde este posicionada la imagen AHORA MISMO, y como
       la imagen usa este mismo valor para reposicionarse (justify-self:
       end + margin-right, ver components.css), cada recalculo iria
       encogiendo el margen mas y mas (bucle inestable). Midiendo el
       ANCHO en vez de la posicion, el resultado es siempre el mismo
       hueco "natural" (columna menos imagen), sin importar donde este
       colocada la imagen en ese momento - se expone como
       --project-media-right-gap en :root, tanto .btn-bar como
       .project-entry__media lo usan como margin-right. Las 4 fichas
       miden lo mismo, basta medir la primera. */
    var updateProjectMediaGap = function () {
      if (!firstProjectMedia) return;
      var entryRect = projectEntries[0].getBoundingClientRect();
      var mediaRect = firstProjectMedia.getBoundingClientRect();
      var mediaColumnWidth = (entryRect.width - 64) * 1.9 / 2.9;
      var rawGap = Math.max(0, mediaColumnWidth - mediaRect.width);
      // Peticion cliente 2026-07-10: el margen resultante quedaba
      // demasiado grande - se reduce un 20% (se usa el 80% del hueco
      // medido, no el hueco completo).
      var gap = rawGap * 0.8;
      document.documentElement.style.setProperty("--project-media-right-gap", gap.toFixed(2) + "px");
    };

    var updateProjectProgress = function () {
      var rect = projectShowcase.getBoundingClientRect();
      var scrollableDistance = projectShowcase.offsetHeight - projectPin.offsetHeight;
      var rawProgress = scrollableDistance > 0 ? (-rect.top) / scrollableDistance : 0;
      rawProgress = Math.max(0, Math.min(1, rawProgress));

      var trackProgress = rawProgress * (PROJECT_COUNT - 1);
      var activeIndex = Math.min(PROJECT_COUNT - 1, Math.round(trackProgress));

      projectShowcase.style.setProperty("--project-track-progress", trackProgress.toFixed(4));
      projectEntries.forEach(function (entry, index) {
        entry.classList.toggle("is-active", index === activeIndex);
      });
      updateProjectMediaGap();

      projectTicking = false;
    };

    var onProjectScroll = function () {
      if (!projectTicking) {
        projectTicking = true;
        window.requestAnimationFrame(updateProjectProgress);
      }
    };

    updateProjectProgress();
    window.addEventListener("scroll", onProjectScroll, { passive: true });
    window.addEventListener("resize", onProjectScroll);
  }

  /* Peticion del cliente (2026-06-29, ampliacion de CR-07): en movil, el
     titulo de fila de Servicios ("Estrategia"/"Sistemas de Diseño"/
     "Experiencias y Ejecucion") tambien queda fijo bajo el header (antes
     solo el titulo de cada bloque, .service-group__title, quedaba fijo en
     movil). Para que el titulo de bloque se fije justo debajo de la barra
     del titulo de fila (apilados, sin solape ni hueco), necesita un offset
     = altura real de esa barra - y esa altura NO es la misma en las 3
     filas: "Estrategia" es una sola linea pero "Sistemas<br>de Diseño" y
     "Experiencias<br>y Ejecucion" tienen un <br> fijo en el HTML (2 lineas
     siempre), y las 3 taglines tienen longitudes distintas (la de la fila
     3 es una frase larga que puede ocupar 2 lineas en viewports estrechos).
     No hay un valor fijo en CSS que sirva para las 3 filas a la vez - se
     mide con JS (offsetHeight real del bloque titulo+tagline) y se expone
     como variable CSS (--row-title-h) en cada .service-row, heredada por
     su .service-group__title (ver pages.css/components.css mobile).

     El titulo de fila usa la tipografia Lora (@font-face local, ver
     tokens.css) - si esta funcion corre antes de que esa fuente termine
     de cargar, offsetHeight mide la altura con la fuente de fallback
     (mas baja) y --row-title-h queda corto una vez Lora aplica,
     desalineando el titulo de bloque unos px. Por eso se re-sincroniza
     tambien en document.fonts.ready, no solo al cargar y al redimensionar.

     El titulo del ULTIMO bloque de cada fila NO sigue este patron sticky
     (ver `.service-group:last-child .service-group__title` en
     components.css mobile): comparte limite de contencion con el propio
     titulo de fila (el final de la fila es el final de ese bloque) y se
     verifico con Playwright que se suelta antes, quedando superpuesto un
     tramo de scroll - se prueba a corregir con padding/margin compensado
     pero el sticky de este motor no sigue el calculo teorico una vez hay
     margin negativo de por medio, asi que se deja en flujo normal en vez
     de un ajuste poco fiable. */
  var serviceRows = Array.prototype.slice.call(document.querySelectorAll(".service-row"));
  if (serviceRows.length) {
    var syncServiceRowTitleHeights = function () {
      serviceRows.forEach(function (row) {
        var titleBlock = row.querySelector(":scope > div:first-child");
        if (titleBlock) {
          row.style.setProperty("--row-title-h", titleBlock.offsetHeight + "px");
        }
      });
    };
    syncServiceRowTitleHeights();
    window.addEventListener("resize", syncServiceRowTitleHeights);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(syncServiceRowTitleHeights);
    }
  }

})();
