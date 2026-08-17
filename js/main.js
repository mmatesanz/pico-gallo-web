(function () {
  "use strict";

  /* Bug encontrado 2026-07-31 (reportado por el usuario en el tema
     WordPress: "Proyectos"/"Servicios" de Home y "Manifiesto" en
     Nosotros con los paneles superpuestos/colapsados). Causa: las 5
     funciones que miden altura real de texto para exponerla como
     variable CSS ya se recalculaban tras document.fonts.ready para
     evitar medir contra la fuente de fallback (FOUT), pero en el sitio
     real, con mas CSS/JS cargando a la vez (plugins de WordPress ajenos
     al tema), se reproduce de forma intermitente (confirmado con
     Playwright, no reproducible el 100% de las veces con el mismo
     codigo) que document.fonts.ready se resuelve antes de que el
     navegador termine el reflow/paint del texto ya con la fuente
     definitiva - la medida queda basada en metricas de fallback, mas
     pequeña que la real, y como ese recalculo no se repite despues, el
     valor incorrecto se queda fijado. Portado aqui tambien (no solo en
     el tema) para que prototipo y tema no diverjan en este fix.
     Fix: scheduleRecomputeAfterLoad anade una pasada adicional (no
     sustituye la de fonts.ready, es un cinturon y tirantes) tras el
     evento "load" de window mas doble requestAnimationFrame (espera a
     que el navegador complete un ciclo de layout+paint real antes de
     medir) - se aplica a las mismas 5 funciones que ya usaban
     fonts.ready, sin tocar ninguna otra logica. */
  var scheduleRecomputeAfterLoad = function (fn) {
    var run = function () {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(fn);
      });
    };
    if (document.readyState === "complete") {
      run();
    } else {
      window.addEventListener("load", run);
    }
  };

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
    /* 2026-07-28 (auditoria responsive): antes hardcodeaba la proporcion
       1:1.9 de .project-entry (grid-template-columns) para derivar el
       ancho de la columna de imagen. Desde que existe un breakpoint de
       tablet (861-1279px) con una proporcion distinta (ver components.css,
       bug de descripcion cortada), ese hardcode daba un ancho de columna
       incorrecto ahi. getComputedStyle().gridTemplateColumns devuelve los
       valores YA resueltos a px por el navegador (fr converitod a px real),
       asi que leerlo en vivo funciona con cualquier proporcion presente o
       futura, sin depender de que este calculo se actualice cada vez que
       cambie un breakpoint en CSS. */
    var updateProjectMediaGap = function () {
      if (!firstProjectMedia) return;
      var mediaRect = firstProjectMedia.getBoundingClientRect();
      var columns = getComputedStyle(projectEntries[0]).gridTemplateColumns.split(" ").map(parseFloat);
      var mediaColumnWidth = columns.length ? columns[columns.length - 1] : 0;
      var rawGap = Math.max(0, mediaColumnWidth - mediaRect.width);
      // Peticion cliente 2026-07-10: el margen resultante quedaba
      // demasiado grande - se reduce un 20% (se usa el 80% del hueco
      // medido, no el hueco completo).
      var gap = rawGap * 0.8;
      document.documentElement.style.setProperty("--project-media-right-gap", gap.toFixed(2) + "px");
    };

    /* Peticion cliente 2026-07-20: ventana fija para la persiana de
       titulo+categoria (ver .project-entry__heading-window en
       components.css) - alto en px que quepa el titulo+categoria de CADA
       proyecto (no le afecta su propio transform ni el overflow:hidden
       del padre, que solo recorta lo que se PINTA, no lo que se MIDE).
       Mismo patron que --row-title-h en Servicios.

       Peticion del usuario 2026-07-30: antes --project-heading-h era una
       UNICA variable global = el titulo mas alto de los 4 (Abu Dhabi, 2
       lineas por su <br> fijo) - los proyectos de 1 linea (Wanderlust,
       Warner, Devcon) heredaban esa misma ventana mas alta que su propio
       contenido, y el aire sobrante (112px ventana - 77px contenido) caia
       POR CASUALIDAD entre categoria y descripcion (margin-top:0 en
       ambas). Abu Dhabi, al llenar la ventana entera con sus 2 lineas, se
       quedaba sin ese aire - de ahi la inconsistencia reportada ("108
       Wanderlust" con espacio, "Abu Dhabi" sin espacio). Solucion: la
       propiedad ya no se fija en :root (global) sino en cada
       .project-entry (hereda a sus .heading-window/.heading), con la
       altura REAL de su propio titulo+categoria mas GAP_AFTER_HEADING fijo
       - el mismo aire para los 4, se adapte a 1 o 2 lineas. Sin riesgo de
       recorte (ya no depende del contenido de los otros 3 proyectos). */
    var GAP_AFTER_HEADING = 35;
    var updateProjectHeadingHeight = function () {
      projectEntries.forEach(function (entry) {
        var heading = entry.querySelector(".project-entry__heading");
        if (!heading) return;
        entry.style.setProperty("--project-heading-h", (heading.offsetHeight + GAP_AFTER_HEADING) + "px");
      });
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
        // Persiana de titulo+categoria (ver components.css, 2026-07-21):
        // is-past marca los proyectos ya dejados atras (encima de la
        // ventana) para distinguirlos de los que aun no llegan (debajo,
        // el estado por defecto sin clase) - necesario para que la
        // persiana entre/salga por el lado correcto segun la direccion.
        entry.classList.toggle("is-past", index < activeIndex);
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

    updateProjectHeadingHeight();
    updateProjectProgress();
    window.addEventListener("scroll", onProjectScroll, { passive: true });
    window.addEventListener("resize", function () {
      updateProjectHeadingHeight();
      onProjectScroll();
    });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(updateProjectHeadingHeight);
    }
    scheduleRecomputeAfterLoad(updateProjectHeadingHeight);
  }

  /* Peticion cliente 2026-07-10: mismo mecanismo de carrusel que
     Proyectos (CR-03, arriba) aplicado a Servicios - "Servicios" fijo,
     3 slides (Estrategia/Sistemas de Diseño/Experiencia y Ejecución) en
     crossfade segun el scroll. Bloque deliberadamente independiente del
     de Proyectos (variables, selectores y nombres de funcion propios) -
     ningun estado compartido entre los 2 carruseles, para que un cambio
     futuro en uno no pueda afectar al otro por accidente. A diferencia
     de Proyectos, aqui no hay columna de imagen con desplazamiento
     continuo, asi que el indice activo (para el crossfade) se calcula
     con un simple redondeo, sin necesitar una variable de progreso
     continuo para eso.
     2026-07-11 (peticion del cliente: indicar el avance del scroll en el
     carrusel): se añade --service-scroll-progress (0 a 1, sin redondear)
     solo para alimentar la barra visual .service-showcase__progress-bar
     - no tiene relacion con --project-track-progress de Proyectos (esa
     anima la imagen; esta unicamente es un indicador visual de scroll). */
  var serviceShowcase = document.querySelector(".service-showcase");
  var servicePin = serviceShowcase ? serviceShowcase.querySelector(".service-showcase__pin") : null;
  var serviceEntries = serviceShowcase
    ? Array.prototype.slice.call(serviceShowcase.querySelectorAll(".service-entry"))
    : [];

  /* Peticion cliente 2026-07-13: a diferencia de Proyectos (CR-03, que SI
     sigue excluyendo movil real - ver isMobileViewport mas arriba), el
     carrusel de Servicios debia tener el MISMO comportamiento de scroll en
     movil que en escritorio/tablet (mismo pin + crossfade + barra de
     progreso) - solo cambiaban los ESTILOS (ver el fallback de solo-ancho
     en components.css, que no desactiva el pin, unicamente ajusta margen y
     oculta los sub-items). Superado 2026-07-13->2026-07-30: ver nota
     siguiente - ese comportamiento compartido ahora solo aplica a movil. */
  /* Peticion cliente 2026-07-30: el bloque de arriba (pin+crossfade+barra
     de progreso vertical) se limita ahora a MOVIL REAL (isMobileViewport) -
     en escritorio/tablet el cliente pidio quitar ese efecto y sustituirlo
     por un reveal-on-scroll (ver bloque nuevo justo debajo, despues de
     este if). Antes de esta fecha corria en cualquier ancho (ver nota
     2026-07-13 unas lineas mas arriba); movil se deja intacto porque la
     peticion del cliente fue explicita ("en la version desktop"). */
  if (serviceShowcase && servicePin && serviceEntries.length && !prefersReducedMotion && isMobileViewport) {
    var SERVICE_COUNT = serviceEntries.length;
    var serviceTicking = false;

    /* Bug encontrado 2026-07-26 (reportado por el usuario: en movil, al
       pasar del slide 2 al 3 del carrusel de Servicios de Home "pasa algo
       raro" que no pasa del 1 al 2). Causa: .service-showcase__pin en
       movil usa height:auto (components.css) - cada slide mide lo que
       necesita su propio contenido, mismo criterio que en servicios.html
       (el cliente no permite cortar texto). El pin sigue siendo
       position:sticky en movil (mismo comportamiento que escritorio/
       tablet, peticion expresa del cliente) - un elemento sticky que
       cambia de alto en el mismo frame en que cambia el slide activo
       (mas abajo, display:none/block) empuja de golpe el resto de la
       pagina, y el salto es mas notorio cuanto mayor es la diferencia de
       alto entre el slide saliente y el entrante. De los 3 slides,
       "Sistemas de Diseño" (4 items) es el mas alto y "Experiencia y
       Ejecución" (3 items) el mas bajo - la mayor diferencia entre
       cualquier par consecutivo cae justo en la transicion 2->3, por eso
       se nota ahi y no en la 1->2.
       Solucion: se mide con JS la altura natural de los 3 slides (mismo
       patron que --row-title-h en servicios.html - visibility:hidden en
       vez de display:none, para medir sin pintarse ni afectar el layout
       real gracias a position:absolute) y se fija el pin movil a la
       altura del mas alto de los 3 via variable CSS. El pin ya no cambia
       de alto al cambiar de slide activo (elimina el salto); los slides
       mas bajos simplemente dejan aire debajo, dentro de la misma caja -
       ningun texto se recorta (overflow:visible en el pin movil, ver
       components.css). */
    var syncServicePinMobileHeight = function () {
      if (window.innerWidth > 860) {
        servicePin.style.removeProperty("--service-pin-mobile-h");
        return;
      }
      var listEl = serviceShowcase.querySelector(".service-showcase__list");
      if (!listEl) return;
      var width = listEl.clientWidth;
      var maxHeight = 0;
      serviceEntries.forEach(function (entry) {
        var original = entry.style.cssText;
        entry.style.cssText = "display:block;position:absolute;visibility:hidden;top:0;left:0;width:" + width + "px;";
        maxHeight = Math.max(maxHeight, entry.offsetHeight);
        entry.style.cssText = original;
      });
      if (maxHeight > 0) {
        servicePin.style.setProperty("--service-pin-mobile-h", maxHeight + "px");
      }
    };
    syncServicePinMobileHeight();
    window.addEventListener("resize", syncServicePinMobileHeight);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(syncServicePinMobileHeight);
    }
    scheduleRecomputeAfterLoad(syncServicePinMobileHeight);

    var updateServiceProgress = function () {
      var rect = serviceShowcase.getBoundingClientRect();
      var scrollableDistance = serviceShowcase.offsetHeight - servicePin.offsetHeight;
      var rawProgress = scrollableDistance > 0 ? (-rect.top) / scrollableDistance : 0;
      rawProgress = Math.max(0, Math.min(1, rawProgress));

      /* Peticion cliente 2026-07-14: cada slide debe consumir la MISMA
         distancia de scroll ("dos movimientos de raton" para cualquier
         transicion, no solo para las de los extremos). Con
         round(rawProgress*(N-1)) (formula anterior) el slide del MEDIO
         ocupa el doble de distancia que los de los extremos: al repartir
         N puntos (0, 1/(N-1), 2/(N-1)...) sobre el rango 0-1 y redondear
         al mas cercano, los slides interiores "heredan" medio segmento de
         cada lado (segmento completo), mientras los de los extremos solo
         heredan medio segmento (la otra mitad se sale del rango 0-1) - la
         mitad de ancho, la mitad de scroll. floor(rawProgress*N) reparte
         el rango 0-1 en N segmentos iguales (uno por slide) en vez de N-1
         "huecos entre puntos", sin ese sesgo. */
      var activeIndex = Math.min(SERVICE_COUNT - 1, Math.floor(rawProgress * SERVICE_COUNT));

      serviceEntries.forEach(function (entry, index) {
        entry.classList.toggle("is-active", index === activeIndex);
      });
      serviceShowcase.style.setProperty("--service-scroll-progress", rawProgress.toFixed(4));

      serviceTicking = false;
    };

    var onServiceScroll = function () {
      if (!serviceTicking) {
        serviceTicking = true;
        window.requestAnimationFrame(updateServiceProgress);
      }
    };

    updateServiceProgress();
    window.addEventListener("scroll", onServiceScroll, { passive: true });
    window.addEventListener("resize", onServiceScroll);
  }

  /* ---------- Reveal-on-scroll de Servicios en Home (parallax vertical, solo escritorio/tablet) ---------- */
  /* Peticion cliente 2026-07-30: sustituye el pin+crossfade+barra de
     progreso de arriba (updateServiceProgress) EN ESCRITORIO/TABLET - el
     cliente ya no queria el indicador de linea vertical ni el
     scroll-jacking del pin; en su lugar cada .service-entry debe
     "revelarse" de forma progresiva segun entra en el viewport,
     respetando el orden que ya tenian (Estrategia / Sistemas de Diseño /
     Experiencia y Ejecucion), con una transicion fluida (fade +
     deslizamiento vertical - ver .is-revealed en components.css) para dar
     sensacion de continuidad durante el desplazamiento. Movil real
     (isMobileViewport) NO se toca - sigue con el bloque de arriba sin
     cambios, por peticion expresa del cliente ("en la version desktop").
     IntersectionObserver en vez de un listener de scroll con matematicas
     de progreso continuo (patron ya usado arriba en
     updateServiceProgress, el carrusel de mas arriba que este bloque
     sustituye en escritorio/tablet): este efecto solo necesita un
     disparador on/off por bloque, no un valor continuo, y evita el
     historial de bugs de scroll-math ya documentado en ese otro bloque.
     Una vez revelado un bloque se deja de observar
     (reveal-on-scroll clasico, no vuelve a ocultarse al subir) - evita
     parpadeos si el usuario sube y baja repetidamente cerca del limite. */
  if (serviceShowcase && serviceEntries.length && !prefersReducedMotion && !isMobileViewport) {
    if ("IntersectionObserver" in window) {
      var serviceRevealObserver = new IntersectionObserver(
        function (revealEntries) {
          revealEntries.forEach(function (revealEntry) {
            if (revealEntry.isIntersecting) {
              revealEntry.target.classList.add("is-revealed");
              serviceRevealObserver.unobserve(revealEntry.target);
            }
          });
        },
        { threshold: 0.2, rootMargin: "0px 0px -10% 0px" }
      );
      serviceEntries.forEach(function (entry) {
        serviceRevealObserver.observe(entry);
      });
    } else {
      serviceEntries.forEach(function (entry) {
        entry.classList.add("is-revealed");
      });
    }
  }

  /* Peticion cliente 2026-07-30: sustituye el carrusel de scroll-jacking
     que tenia este bloque (pin+persiana+barra de progreso+spacer de
     despegue, ver git history) por un reveal-on-scroll, mismo patron ya
     aplicado el mismo dia al carrusel de Servicios de Home (ver
     "Reveal-on-scroll de Servicios en Home" mas arriba). "Manifiesto"
     (titulo+ojo, .manifesto__pin) sigue fijo (sticky, ver @media
     (min-width:861px) de pages.css) mientras .manifesto__text (ahora
     hermano del pin, no su hijo) pasa por detras y se oculta - eso ya
     pasaba antes, pero como parte de un mismo bloque fijo con crossfade
     interno; ahora es un scroll-past real, sin necesitar el calculo de
     progreso/indice activo (updateManifestoProgress) que el viejo
     mecanismo usaba. Quedan 3 tareas:
     1) Sincronizar los offsets sticky que YA existian (statement y pin,
        ambos anclados por JS porque dependen de la altura real del
        statement y de .about-page__divider, no de un valor fijo) - sin
        cambios sobre como se calculaban antes. Se añade la medicion del
        rect de .manifesto__pin para la cortina (tarea 3).
     2) Revelar cada parrafo (fade+deslizamiento, ver .is-revealed en
        pages.css) segun entra en el viewport, via IntersectionObserver -
        mismo enfoque que Servicios, en vez del index continuo con
        persiana que usaba este bloque.
     3) Bug reportado por el cliente 2026-07-30 ("el texto ya no se debe
        ver cuando se oculta detras de Manifiesto"): .manifesto__pin se
        pega mas abajo que el header (debajo del statement + un hueco
        visual de 100px, ver pages.css) - el texto, al seguir subiendo
        DESPUES de ocultarse detras del pin, pasa fisicamente por esa
        franja superior antes de desaparecer del todo por arriba del
        viewport, y ahi no hay fondo opaco continuo que lo tape (a
        diferencia de Servicios/Proyectos, cuyo titulo se pega justo en
        top:header-height, sin hueco por encima). .manifesto__curtain
        (fixed, ver pages.css) tapa exactamente esa franja.
        Bug encontrado 2026-07-30 sobre el primer intento de esta misma
        tarea 3 (reportado por el cliente: "aparece un rectangulo negro
        arriba a la derecha" al empezar a verse "Manifiesto"): ese primer
        intento medía el rect de .manifesto__pin (mas corto que el texto -
        solo tiene que caber la palabra "Manifiesto") y le daba
        background:var(--color-bg) al PROPIO pin para tapar su propia
        franja - pero el pin no tiene ancho propio (ocupa toda la columna
        de contenido, ~600-900px), asi que ese fondo se veia como un
        rectangulo negro solido a la derecha del titulo. Corregido: se
        mide el rect de .manifesto__text (el ancho real que hay que
        tapar) en vez del pin, y la cortina crece en altura para cubrir
        tambien la franja del pin (0 a pinTop+altoPin, no solo 0 a
        pinTop) - el pin ya no necesita su propio background (ver esa
        regla en pages.css).
        Segundo bug encontrado 2026-07-30 (reportado por el cliente:
        "sigo viendo el rectangulo... es el div manifesto__curtain
        is-visible"), verificado con Playwright (capturas en varios
        puntos del scroll): el primer intento de ESTE mecanismo hacia
        visible la cortina con un IntersectionObserver sobre
        .manifesto__showcase entero (contenedor de pin+texto) - se activa
        en cuanto CUALQUIER parte de ese contenedor toca el viewport, lo
        que incluye el tramo en que .manifesto__showcase todavia esta
        entrando desde abajo y el pin NI SIQUIERA se ha pegado (sticky)
        todavia. Durante ese tramo la cortina ya pintaba su franja opaca
        (0 a pinTop+altoPin) encima de lo que hubiera en esa zona del
        viewport en ese momento - en la practica, la foto del estudio
        (.manifesto__media, mucho mas arriba en el HTML/scroll), todavia
        visible en pantalla en ese instante. Corregido: en vez de vigilar
        el contenedor entero, la cortina se activa/desactiva comparando
        en cada scroll la posicion REAL de .manifesto__pin (getBoundingClientRect)
        contra --manifesto-pin-top (el valor exacto en el que el sticky se
        engancha) - visible solo mientras el pin esta efectivamente pegado
        (rect.top === pinTop, ni antes ni bastante despues de soltarse),
        no durante todo el tiempo que el contenedor anda cerca del
        viewport. Mismo patron de listener de scroll+rAF que el resto de
        efectos de este archivo (ver updateServiceProgress mas arriba),
        en vez de IntersectionObserver - aqui si hace falta la posicion
        exacta, no solo un on/off aproximado.
        4) Peticion cliente 2026-07-30 (siguiente turno): el titulo de
        Manifiesto y la imagen tienen que desaparecer - primer intento:
        "por debajo del texto 'Somos el ingrediente...'" (el pin viajaba
        hasta alcanzar el borde de ese statement antes de ocultarse, con
        .manifesto__eye-spacer/.manifesto__release-spacer reservando el
        hueco de scroll necesario para llegar hasta ahi - ver commits
        anteriores). Corregido el mismo dia (peticion aclaratoria del
        cliente): el titulo+ojo tienen que desaparecer A LA VEZ que
        desaparece el texto del manifiesto (los 3 parrafos), no mas tarde
        - es decir, justo en el instante en que el pin se despega de su
        sticky nativo (eso solo ocurre una vez el ultimo parrafo ha
        terminado de ocultarse, ver el mecanismo de .manifesto__curtain
        arriba), no cuando alcanza el statement mas arriba en pantalla.
        Se quita por tanto la necesidad de viajar ninguna distancia
        concreta despues del despegue - .manifesto__pin gana la clase
        .is-releasing (opacity, transicion corta, ver pages.css) en el
        mismo instante del despegue nativo (rect.top dejando de coincidir
        con --manifesto-pin-top), reutilizando el mismo pinRect que ya
        medía updateManifestoCurtain para la cortina. Sin distancia que
        recorrer, ya no hace falta NINGUN hueco de scroll reservado -
        .manifesto__release-spacer se quita del HTML/CSS/aqui (los ~79px
        de scroll que ya quedaban de forma natural despues del despegue,
        sin ningun spacer, sobran de sobra para que la transicion de
        0.25s tenga tiempo de jugarse). */
  var manifestoRoot = document.querySelector(".manifesto");
  var manifestoShowcase = document.querySelector(".manifesto__showcase");
  var manifestoPin = manifestoShowcase ? manifestoShowcase.querySelector(".manifesto__pin") : null;
  var manifestoEye = manifestoPin ? manifestoPin.querySelector(".manifesto__eye") : null;
  var manifestoEyeFrame = manifestoPin ? manifestoPin.querySelector(".manifesto__eye-frame") : null;
  var manifestoTextEl = manifestoShowcase ? manifestoShowcase.querySelector(".manifesto__text") : null;
  var manifestoStatement = document.querySelector(".manifesto__statement");
  var manifestoCurtain = document.querySelector(".manifesto__curtain");
  var manifestoReleaseSpacer = document.querySelector(".manifesto__release-spacer");
  var manifestoParagraphs = manifestoTextEl
    ? Array.prototype.slice.call(manifestoTextEl.querySelectorAll("p"))
    : [];
  var manifestoPinTopValue = 0;
  /* Peticion cliente 2026-07-30 (tarea 8, sustituye a la tarea 5 - ver
     comentario grande mas abajo en updateManifestoCurtain): px que la
     imagen necesita recorrer para terminar de salir de su marco
     (.manifesto__eye-frame.offsetHeight, medido en syncManifestoStickyOffsets
     mas abajo, no un numero fijo - el ojo ya cambio de tamaño una vez en
     este mismo archivo, ver historial de .manifesto__eye en pages.css).
     Declarado aqui arriba (no dentro del bloque donde se usa) por el
     mismo motivo que antes: syncManifestoStickyOffsets, definida y
     llamada mas abajo, tambien lo necesita para calcular el hueco de
     .manifesto__release-spacer, y se ejecuta ANTES de llegar a la parte
     del codigo que originalmente lo declaraba - con var (hoisting de
     function, no de bloque) hubiera quedado "undefined" en esa primera
     llamada. */
  var manifestoEyeTravelPx = 0;

  if (manifestoShowcase && manifestoPin && manifestoTextEl && manifestoParagraphs.length && !prefersReducedMotion) {
    /* window.innerWidth (no isMobileViewport): igual que antes de este
       cambio, sigue siendo un valor en vivo (no fijado solo al cargar la
       pagina) porque re-sincroniza en cada resize (ver mas abajo) - el
       offset del statement depende de .about-page__divider, cuyo `top`
       real puede cambiar de breakpoint. */
    var syncManifestoStickyOffsets = function () {
      if (window.innerWidth <= 860) {
        if (manifestoRoot) {
          manifestoRoot.style.removeProperty("--manifesto-statement-top");
          manifestoRoot.style.removeProperty("--manifesto-pin-top");
        }
        if (manifestoReleaseSpacer) {
          manifestoReleaseSpacer.style.removeProperty("--manifesto-release-spacer-h");
        }
        return;
      }
      /* Peticion cliente 2026-07-26 (ajuste sobre el intento anterior, que
         anclaba el statement justo debajo del header): "Somos el
         ingrediente..." debe quedar fijo ~50px ANTES de llegar al div
         .about-page__divider (la linea bajo "Nosotros", sticky durante
         toda la pagina - ver .about-page__divider en este mismo archivo).
         Se lee el "top"+alto reales YA RESUELTOS del divider (en vez de
         reconstruir su formula calc aqui, con riesgo de desincronizarse
         si esa formula cambia). El pin de "Manifiesto" se ancla justo
         debajo del statement. Todo en un UNICO valor en px por variable
         (no un calc() con varias variables distintas en el "top" de cada
         elemento) - mas facil de depurar.
         Se expone en .manifesto (el ancestro comun de .manifesto__statement
         y .manifesto__pin, ver pages.css), no en el propio statement: una
         variable CSS solo hereda hacia sus DESCENDIENTES, y .manifesto__pin
         no es descendiente de .manifesto__statement (son hermanos). */
      if (manifestoStatement && manifestoRoot) {
        var dividerEl = document.querySelector(".about-page__divider");
        var dividerBottom = 0;
        if (dividerEl) {
          dividerBottom = (parseFloat(getComputedStyle(dividerEl).top) || 0) + dividerEl.offsetHeight;
        }
        var statementTop = dividerBottom + 50;
        /* Peticion cliente 2026-07-26 (6a): 100px de interlineado entre
           el statement y lo que viene despues (el pin de "Manifiesto")
           en escritorio/tablet tambien. Mismo valor que el margin-top de
           .manifesto__body en movil (ver pages.css), por coherencia. */
        manifestoPinTopValue = statementTop + manifestoStatement.offsetHeight + 100;
        manifestoRoot.style.setProperty("--manifesto-statement-top", statementTop + "px");
        manifestoRoot.style.setProperty("--manifesto-pin-top", manifestoPinTopValue + "px");
      }

      /* Peticion cliente 2026-07-30 (tarea 3, ver comentario grande de
         arriba): .manifesto__curtain (pages.css) es position:fixed (para
         no aportar altura al documento, a diferencia de sticky), asi que
         no puede heredar el left/width/height por CSS normal - se miden
         en JS (fijos mientras no cambie el ancho de viewport/columna, por
         eso se recalcula aqui, en sync, no en cada scroll).
         left/width: rect de .manifesto__text, NO de .manifesto__pin (bug
         corregido el mismo dia, ver comentario grande de arriba) - la
         cortina tiene que ser tan ancha como el TEXTO que tapa, no como
         el titulo, mucho mas corto.
         height: pinTopValue (calculado arriba) + el alto real del pin
         (offsetHeight, ya resuelto en el DOM en este punto) - cubre desde
         el techo del viewport hasta el borde INFERIOR del pin, no solo
         hasta su borde superior, ya que el pin dejo de tener su propio
         background (ver esa regla en pages.css) y ahora depende de la
         cortina tambien para su propia franja.
         +4px de margen de seguridad, por si el alto medido de
         .manifesto__pin (offsetHeight) queda un pixel corto frente al
         alto real que pinta el navegador - no se nota (mismo color solido
         que el fondo de la pagina).
         Verificado con Playwright (2026-07-30): en cualquier scroll
         concreto donde el borde de un renglon de texto caiga justo sobre
         el borde inferior de la cortina, ese renglon se vera "cortado" a
         medias (mitad tapada, mitad visible) - es el mismo comportamiento
         que produce cualquier cabecera sticky sobre el contenido que pasa
         por debajo (incluida cualquier cabecera sticky de un sitio web
         real), no un bug de este mecanismo concreto - no se puede evitar
         del todo sin recortar cada linea a un multiplo exacto de su
         propio alto, algo que aqui no se ha pedido. */
      if (manifestoCurtain) {
        var textRect = manifestoTextEl.getBoundingClientRect();
        manifestoCurtain.style.setProperty("--manifesto-curtain-left", textRect.left + "px");
        manifestoCurtain.style.setProperty("--manifesto-curtain-width", textRect.width + "px");
        manifestoCurtain.style.setProperty("--manifesto-curtain-height", (manifestoPinTopValue + manifestoPin.offsetHeight + 4) + "px");
      }

      /* Peticion cliente 2026-07-30 (tarea 8, ver comentario grande en
         updateManifestoCurtain mas abajo): distancia real (px) que
         .manifesto__eye tiene que recorrer para terminar de salir de su
         marco - el alto real del marco (offsetHeight), no un numero fijo,
         para que siga funcionando si el SVG (y por tanto el marco) vuelve
         a cambiar de tamaño en el futuro. */
      manifestoEyeTravelPx = manifestoEyeFrame ? manifestoEyeFrame.offsetHeight : 0;

      /* Peticion cliente 2026-07-30 (tarea 4, ver comentario grande de
         arriba): .manifesto__release-spacer garantiza que, para
         CUALQUIER alto de viewport, .manifesto__text llegue a terminar
         de pasar por detras de .manifesto__pin (el cruce de posiciones
         que updateManifestoCurtain usa para disparar .is-releasing) antes
         de que la pagina se quede sin mas alto que recorrer.
         Se resetea a 0 antes de medir (mismo motivo que la cortina de
         arriba): este spacer SI aporta altura real al documento, medir
         con el valor anterior todavia aplicado se sumaria sobre si mismo
         en cada resize/carga de fuente en vez de estabilizarse.
         Formula (coordenadas de documento, no de viewport, para que no
         dependa de por donde ande el scroll ahora mismo):
         - showcaseBottomDoc: donde termina .manifesto__showcase en el
           documento (scrollY + su rect.bottom actual) - es tambien donde
           termina .manifesto__text, su ultimo hijo.
         - Para que el texto termine de pasar por detras del pin hace
           falta poder scrollear hasta que showcaseBottomDoc - scrollY
           (la posicion del final del texto en pantalla) baje hasta
           pinTop + altoPin (el borde inferior del pin) - es decir, hasta
           scrollY = showcaseBottomDoc - pinTop - altoPin.
         - scrollMax disponible, con el spacer en 0 = docHeight -
           viewportH (viewportH entra aqui - por eso este spacer, a
           diferencia de otros calculos de esta pagina, SI depende del
           alto de la ventana y se recalcula en cada resize).
         - spacer necesario = lo que hace falta menos lo que ya hay
           disponible, con manifestoEyeTravelPx (mas 20px de margen
           adicional) de sobra: no basta con llegar justo al punto en el
           que la ultima linea queda tapada - el ojo (ver
           updateManifestoCurtain mas abajo), que ahora se desplaza
           alineado 1:1 con esa ultima linea EMPEZANDO justo en ese punto
           (tarea 8), necesita poder recorrer tambien esos px de DESPUES
           para terminar de salir de su marco. */
      if (manifestoReleaseSpacer) {
        manifestoReleaseSpacer.style.setProperty("--manifesto-release-spacer-h", "0px");
        var showcaseRectForSpacer = manifestoShowcase.getBoundingClientRect();
        var showcaseBottomDoc = window.scrollY + showcaseRectForSpacer.bottom;
        var scrollNeeded = showcaseBottomDoc - manifestoPinTopValue - manifestoPin.offsetHeight + manifestoEyeTravelPx + 20;
        var scrollAvailable = document.documentElement.scrollHeight - window.innerHeight;
        var spacerNeeded = Math.ceil(scrollNeeded - scrollAvailable);
        manifestoReleaseSpacer.style.setProperty("--manifesto-release-spacer-h", Math.max(0, spacerNeeded) + "px");
      }
    };

    syncManifestoStickyOffsets();
    window.addEventListener("resize", syncManifestoStickyOffsets);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(syncManifestoStickyOffsets);
    }
    scheduleRecomputeAfterLoad(syncManifestoStickyOffsets);

    if (!isMobileViewport) {
      if ("IntersectionObserver" in window) {
        var manifestoRevealObserver = new IntersectionObserver(
          function (revealEntries) {
            revealEntries.forEach(function (revealEntry) {
              if (revealEntry.isIntersecting) {
                revealEntry.target.classList.add("is-revealed");
                manifestoRevealObserver.unobserve(revealEntry.target);
              }
            });
          },
          { threshold: 0.2, rootMargin: "0px 0px -10% 0px" }
        );
        manifestoParagraphs.forEach(function (p) {
          manifestoRevealObserver.observe(p);
        });
      } else {
        manifestoParagraphs.forEach(function (p) {
          p.classList.add("is-revealed");
        });
      }

      /* Peticion cliente 2026-07-30 (tarea 3, corregida el mismo dia - ver
         comentario grande al inicio de este bloque, "Segundo bug..."):
         la cortina solo debe estar visible mientras .manifesto__pin esta
         REALMENTE pegado (sticky activo) - ni antes (todavia en flujo
         normal, mas abajo en pantalla, sin nada que ocultar detras suyo
         a la altura de la cortina) ni mucho despues de soltarse (ya
         scrolleado fuera de la zona que la cortina cubre). rect.top del
         pin es la señal exacta: mientras el navegador lo mantiene pegado,
         vale siempre lo mismo, --manifesto-pin-top (el sticky lo clava
         ahi); antes de engancharse vale MAS (el pin todavia esta mas
         abajo, en su posicion de flujo normal); justo tras soltarse
         empieza a valer MENOS (retoma el scroll normal, sube por encima
         de ese punto) - rect.bottom>=0 acota el otro extremo (una vez el
         pin entero ha desaparecido por arriba del viewport, ya no hay
         nada mas que la cortina necesite tapar). 1px de margen en el
         primer chequeo por redondeo de subpixel.
         Tarea 4 (mismo dia, ver comentario grande al inicio de este
         bloque): ademas de la cortina, esta misma funcion decide cuando
         .manifesto__pin (titulo+ojo) se oculta (clase .is-releasing,
         opacity, ver pages.css) - peticion aclaratoria del cliente: debe
         desaparecer A LA VEZ que el texto del manifiesto, no mas tarde.
         Bug encontrado 2026-07-30 (reportado por el cliente: "el ojo
         sigue quedando por encima del footer") sobre el primer intento de
         esta tarea 4: ese intento disparaba el ocultamiento con
         "pinRect.top < pinTop" (el pin ya no esta pegado = se ha
         despegado de su sticky nativo) - funcionaba en las alturas de
         viewport probadas en su momento, pero verificado con Playwright
         en un rango mas amplio (700 a 1080px de alto) que en viewports
         altos (>=~980px con las medidas actuales) la pagina no tiene
         suficiente alto TOTAL para que el sticky nativo llegue a
         despegarse nunca - el pin se queda pegado (visible) hasta el
         final real del scroll, sin que "pinRect.top < pinTop" se cumpla
         jamas, y el ojo (mucho mas alto que el pin) queda montado sobre
         el footer permanentemente en esos viewports. Corregido: el
         disparador ya no depende de si el sticky nativo se ha despegado
         (una condicion de la que no hay garantia de que llegue a
         cumplirse) sino de si .manifesto__text YA HA TERMINADO de pasar
         por detras del pin (textRect.bottom <= borde inferior actual del
         pin) - cierto siempre que se haya scrolleado lo suficiente, tanto
         si el pin sigue tecnicamente pegado (viewports altos) como si ya
         se ha despegado (viewports bajos/medios), porque .manifesto__text
         sigue en flujo normal y se mueve con el scroll 1:1 pase lo que
         pase con el sticky del pin.
         5) Peticion cliente 2026-07-30 (siguiente turno): "que la imagen
         de .manifesto__eye vaya desapareciendo junto con la ultima linea
         del manifiesto". El intento anterior (clase .is-releasing + CSS
         transition de 0.25s en .manifesto__pin) era un fundido de tiempo
         fijo disparado por un umbral binario (cruza o no cruza) - se
         notaba desincronizado del scroll real (el fundido tarda lo mismo
         sean 60fps o el usuario haciendo scroll muy rapido/lento) y no
         "acompañaba" a la ultima linea, solo reaccionaba una vez ya habia
         desaparecido del todo. MANIFESTO_PIN_FADE_PX (px de scroll que
         dura el fundido) sustituyo el on/off por una interpolacion
         continua atada directamente al recorrido real de textBottom (el
         borde inferior de .manifesto__text, que ES la ultima linea)
         contra el borde inferior del pin.
         6) Peticion cliente 2026-07-30 (aclaracion sobre la tarea 5): "la
         imagen tiene que desaparecer por debajo de 'Manifiesto'" - hasta
         ahora el fundido se aplicaba a TODO .manifesto__pin (titulo+ojo
         juntos, ya que el ojo hereda su opacity al ser descendiente) -
         pero el titulo en si nunca fue la causa del problema original
         (footer tapado): eso lo causaba unicamente el ojo, mucho mas alto
         que el pin que lo contiene (ver .manifesto__eye en pages.css).
         "Manifiesto" no necesita ocultarse - puede comportarse igual que
         "Servicios"/"Proyectos" (sticky normal, sin fundido propio,
         simplemente se desplaza fuera de vista de forma nativa al
         terminar su rango de scroll). Se mueve el fundido continuo del
         pin al ojo directamente (--manifesto-eye-fade en vez de
         --manifesto-pin-fade, aplicado a .manifesto__eye en pages.css) -
         el ojo desaparece "por debajo" del titulo (que se queda visible,
         fijo) en vez de que ambos se desvanezcan juntos.
         7) Peticion cliente 2026-07-30 (aclaracion sobre la tarea 6): un
         fundido de opacity en el sitio no se leia como "desaparecer hacia
         arriba por debajo de 'Manifiesto'" - se sustituye por un
         translateY continuo sobre .manifesto__eye, recortado por su
         nuevo wrapper .manifesto__eye-frame (overflow:hidden, ver
         pages.css), de forma que la imagen se desplaza hacia arriba y
         "sale" por el borde superior del marco en vez de desvanecerse en
         el sitio. Variable renombrada --manifesto-eye-fade ->
         --manifesto-eye-progress (ya no es una opacity).
         8) Peticion cliente 2026-07-30 (aclaracion sobre la tarea 7): la
         tarea 7 normalizaba textBottom-pinBottom a un rango 0-1 sobre una
         ventana fija de scroll (antes MANIFESTO_PIN_FADE_PX, 40px) y
         estiraba ese 0-1 a los 276px de alto del marco - en la practica
         eso hacia que la imagen recorriera 276px de desplazamiento visual
         en solo 40px de scroll real (~7x mas rapido que el texto), asi
         que NO iba "alineada" con la ultima linea real (se adelantaba,
         llegaba arriba mucho antes de que la ultima linea hubiera
         terminado de desaparecer). Corregido: en vez de normalizar a 0-1,
         --manifesto-eye-progress pasa a ser un desplazamiento en PX
         (renombrado --manifesto-eye-offset en pages.css/main.js) igual,
         pixel a pixel, a lo que la ultima linea ya se ha movido MAS ALLA
         del punto en que empieza a ocultarse (textBottom === pinBottom):
         0 mientras textBottom >= pinBottom (todavia no ha llegado ese
         punto - la imagen se queda quieta, visible del todo) y creciendo
         1:1 con cada px que textBottom sigue bajando por debajo de
         pinBottom (la ultima linea, ya oculta detras de la cortina, sigue
         subiendo en pantalla con el scroll - la imagen ahora "acompaña"
         ese mismo movimiento en vez de tener su propio ritmo). Tope en
         manifestoEyeTravelPx (alto real del marco, ver
         syncManifestoStickyOffsets mas arriba): una vez alcanzado ese
         desplazamiento la imagen ya salio entera de su marco, seguir
         creciendo el valor no cambiaria nada visualmente.
         9) Peticion cliente 2026-07-30 (aclaracion sobre la tarea 8, tarea
         12): "alineada 1:1" en la tarea 8 sincronizaba el RITMO (mismo px
         de recorrido que de scroll) pero no el ARRANQUE - el disparador
         seguia siendo textBottom===pinBottom, el instante exacto en que
         la ultima linea YA ha terminado de desaparecer del todo detras de
         la cortina (su borde inferior, el ultimo en cruzar, llega al
         borde de la cortina). Resultado: la imagen se quedaba quieta
         mientras la ultima linea se ocultaba (ese tramo, ~1 altura de
         linea de scroll) y solo empezaba a moverse justo cuando la linea
         YA habia desaparecido del todo - "cuando el texto desaparece es
         cuando la imagen empieza a subir" (peticion cliente), no antes,
         no a la vez. Corregido: el origen del recorrido se adelanta
         exactamente manifestoLastLineHeightPx (alto de una linea al
         tamaño de fuente actual, medido en syncManifestoStickyOffsets)
         - eyeOffset pasa a valer 0 mientras textBottom >= pinBottom +
         manifestoLastLineHeightPx (el borde SUPERIOR de la ultima linea,
         no el inferior, todavia no ha alcanzado la cortina - la linea
         entera sigue completamente visible) y empieza a crecer 1:1 desde
         ahi: durante el tramo en que la ultima linea esta fisicamente
         ocultandose (su propio alto de linea de scroll), la imagen ya
         esta subiendo a la vez, en el mismo ritmo de siempre (1:1, sin
         tocar esa parte) - ambas cosas ahora ocurren juntas desde el
         mismo instante, no una detras de la otra. La imagen sigue
         recorriendo el resto de manifestoEyeTravelPx despues de que la
         linea haya desaparecido del todo (fisicamente no le cabe recorrer
         sus 276px enteros en solo 1 altura de linea de scroll, ~19-23px) -
         eso no cambia respecto a la tarea 8, sigue siendo necesario para
         que la imagen no se corte de golpe al llegar al final.
         10) Intento fallido 2026-07-30 (siguiente turno, mismo dia): para
         que el recorrido completo (no solo el arranque) se sintiera
         "junto", se probo repartir manifestoEyeTravelPx (0 a 1) sobre la
         ventana de scroll en que la ultima linea se oculta
         (manifestoLastLineHeightPx, ~19-23px) en vez de 1:1 - la imagen
         llegaba a su posicion final EXACTAMENTE cuando la linea terminaba
         de ocultarse, pero para ello tenia que recorrer sus 276px enteros
         en esos mismos ~19-23px de scroll: ritmo ~12-14x mas rapido que el
         texto. Descartado por el cliente en el siguiente mensaje: "quiero
         que vayan subiendo y bajando a la misma altura, no el texto antes
         que la imagen y viceversa" - un ritmo distinto (por mucho que
         arranquen y terminen juntos) sigue sin leerse como "juntos", igual
         que la tarea 7 (ventana fija, descartada por el mismo motivo).
         11) Con la peticion de la tarea 10 aclarada ("misma altura" =
         mismo ritmo real, 1px de imagen por cada 1px de texto, en todo
         momento, no solo al arrancar) se ve el limite fisico de la tarea 9:
         su formula YA era 1:1 en ritmo, pero el disparador de arranque
         estaba solo manifestoLastLineHeightPx (~19-23px) antes del punto
         de ocultado total - con 1:1, en esos ~19-23px de scroll la imagen
         solo alcanza a recorrer esos mismos ~19-23px de sus 276px totales
         (~7-8% del marco), y sigue subiendo ELLA SOLA el 92% restante ya
         con la ultima linea invisible - exactamente el "primero el texto,
         despues la imagen" original, pese al ritmo 1:1 correcto. No es un
         bug de ritmo, es que la ventana de arranque era demasiado corta
         para el recorrido que la imagen necesita. Corregido: el
         disparador se adelanta a manifestoEyeTravelPx (276px, el recorrido
         COMPLETO del marco, ya no al alto de una sola linea) antes del
         punto de ocultado total, manteniendo el ritmo 1:1 sin cambios -
         asi la imagen completa sus 276px de recorrido usando exactamente
         los mismos 276px de scroll que preceden al instante en que la
         ultima linea termina de ocultarse del todo: en CUALQUIER punto de
         ese tramo, imagen y texto han recorrido siempre la misma distancia
         en px (misma altura), y ambas llegan a su posicion final exacto en
         el mismo instante - reversible igual al hacer scroll hacia arriba
         (baja imagen y reaparece texto a la vez, al mismo ritmo).
         manifestoLastLineHeightPx (medicion del alto de una linea,
         introducida en la tarea 9 para este mismo disparador) queda sin
         uso con este cambio y se elimina. */
      var manifestoCurtainTicking = false;
      var updateManifestoCurtain = function () {
        var pinRect = manifestoPin.getBoundingClientRect();
        if (manifestoCurtain) {
          var isStuckOrJustPast = pinRect.top <= manifestoPinTopValue + 1;
          var stillOnScreen = pinRect.bottom >= 0;
          manifestoCurtain.classList.toggle("is-visible", isStuckOrJustPast && stillOnScreen);
        }
        if (manifestoEye) {
          var textBottom = manifestoTextEl.getBoundingClientRect().bottom;
          var pinBottom = pinRect.top + pinRect.height;
          var eyeOffset = Math.max(0, Math.min((pinBottom + manifestoEyeTravelPx) - textBottom, manifestoEyeTravelPx));
          manifestoEye.style.setProperty("--manifesto-eye-offset", eyeOffset.toFixed(1) + "px");
        }
        /* Tarea 10 (ver .manifesto__pin.is-hidden-behind-statement en
           pages.css): el pin entero (titulo, ya que el ojo para entonces
           deberia estar oculto por su propio --manifesto-eye-offset) se
           oculta en cuanto termina de pasar por detras de "Somos el
           ingrediente..." (pinRect.bottom, su borde inferior, llega al
           borde inferior del statement).
           Tarea 11 (correccion sobre la tarea 10, mismo dia): el primer
           intento usaba un "trinquete" (una vez oculto, ya no se volvia a
           comprobar, quedaba oculto para siempre pasara lo que pasara con
           el scroll despues) - el cliente probo a scrollear hacia atras
           (arriba) hasta ANTES de ese punto y luego hacia adelante (abajo)
           otra vez, y "Manifiesto"/el ojo ya no volvian a aparecer nunca,
           ni siquiera en la zona donde deberian verse con normalidad. El
           trinquete deshacia el comportamiento reversible normal de
           position:sticky (que SI vuelve a engancharse solo con el
           scroll). Corregido: se quita el trinquete, la condicion se
           recalcula en cada frame igual que el resto de efectos de esta
           funcion (isStuckOrJustPast/is-visible de la cortina, unas
           lineas mas arriba, sigue el mismo patron) - se oculta/muestra
           en vivo segun la posicion real actual, reversible en cualquier
           direccion de scroll. */
        if (manifestoStatement) {
          var statementRectForHide = manifestoStatement.getBoundingClientRect();
          manifestoPin.classList.toggle("is-hidden-behind-statement", pinRect.bottom <= statementRectForHide.bottom);
        }
        manifestoCurtainTicking = false;
      };
      var onManifestoCurtainScroll = function () {
        if (!manifestoCurtainTicking) {
          manifestoCurtainTicking = true;
          window.requestAnimationFrame(updateManifestoCurtain);
        }
      };
      updateManifestoCurtain();
      window.addEventListener("scroll", onManifestoCurtainScroll, { passive: true });
      window.addEventListener("resize", onManifestoCurtainScroll);
    }
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
    scheduleRecomputeAfterLoad(syncServiceRowTitleHeights);

    /* Peticion cliente 2026-07-14: en la pagina de Servicios (no la home),
       una imagen de proyecto (una por servicio, ver .services-media en
       components.css) vive bajo "Servicios" en la columna sticky de la
       izquierda - no repetida en cada fila - y va cambiando "a medida
       que hagas scroll down o up". Aqui no hay pin/scroll-jacking (CR-01
       en Home): cada fila vive en flujo de pagina normal con SOLO su
       titulo fijo por sticky (`.service-row > div:first-child`). Por eso
       primero hay que decidir CUAL de las 3 filas esta "activa" en cada
       momento del scroll (la que tiene su titulo actualmente fijo), y
       solo despues calcular el progreso DENTRO de esa fila para elegir
       la imagen - mismo patron de 2 niveles que activeIndex/
       segmentProgress en el carrusel de Home, pero "cual fila" viene del
       scroll normal en vez de un indice de slide con pin.

       Progreso SIN acotar a 0-1 (a diferencia del resto del sitio): una
       fila solo cuenta como "activa" mientras su titulo esta realmente
       fijo (0 <= progreso <= 1); fuera de ese rango (la fila aun no ha
       llegado o ya la paso el scroll) no debe poder "ganar" la imagen
       compartida. En el hueco de margin-top entre filas (29-42px, ver
       .service-row:nth-of-type) ninguna fila cae en rango - se deja tal
       cual (no se actualiza name grupo activo) en vez de ocultar la
       imagen, un parpadeo por un hueco de menos de 50px no aporta nada.

       getComputedStyle(titleBlock).top da el valor de anclaje sticky
       resuelto en px (calc(header+2xl+87px) en escritorio, header en
       movil via media query) sin tener que duplicar ese calculo aqui -
       es un valor estable, no la posicion visual actual del elemento. */
    var serviceMediaGroups = Array.prototype.slice.call(document.querySelectorAll(".services-media__group"));
    var serviceRowTitleBlocks = Array.prototype.slice.call(document.querySelectorAll(".service-row__title-block"));

    var updateServiceRowMedia = function () {
      var activeRowIndex = -1;
      var activeRawProgress = 0;

      serviceRows.forEach(function (row, index) {
        var titleBlock = row.querySelector(":scope > div:first-child");
        if (!titleBlock) return;

        var stickyTop = parseFloat(getComputedStyle(titleBlock).top) || 0;
        var rowRect = row.getBoundingClientRect();
        var scrollableDistance = row.offsetHeight - titleBlock.offsetHeight;
        var rawProgress = scrollableDistance > 0 ? (stickyTop - rowRect.top) / scrollableDistance : 0;

        if (rawProgress >= 0 && rawProgress <= 1) {
          activeRowIndex = index;
          activeRawProgress = rawProgress;
        }
      });

      if (activeRowIndex === -1) return;

      /* Peticion cliente 2026-07-16: el titulo de fila (Estrategia/Sistemas
         de Diseño/Experiencia y Ejecución) aparece/desaparece directamente
         segun este mismo activeRowIndex, en vez de deslizarse con el scroll
         normal al soltar su sticky (ver .service-row__title-block en
         components.css, solo escritorio/tablet) - reutiliza el indice ya
         calculado arriba para la imagen compartida, sin logica nueva.
         Este toggle NO depende de .services-media__group (a diferencia del
         resto de la funcion, ver early-return de abajo): en el tema de
         WordPress la imagen compartida todavia no esta migrada (ver
         page-servicios.php) y si el early-return original se dejaba al
         principio de la funcion, ninguna fila salvo la primera (activa por
         defecto desde PHP) llegaba a mostrar su titulo/tagline.
         2026-07-29: components.css cruza la opacidad entre estados (mismo
         efecto que #home-servicios .service-showcase__list .service-entry
         en Home, pedido explicitamente por el cliente) - aqui solo hace
         falta el binario is-active, sin estado adicional para "ya pasado". */
      serviceRowTitleBlocks.forEach(function (block, index) {
        block.classList.toggle("is-active", index === activeRowIndex);
      });

      if (!serviceMediaGroups.length) return;

      serviceMediaGroups.forEach(function (group, index) {
        group.classList.toggle("is-active", index === activeRowIndex);
      });

      var activeGroup = serviceMediaGroups[activeRowIndex];
      var activeImgs = Array.prototype.slice.call(activeGroup.querySelectorAll("img"));
      if (!activeImgs.length) return;

      var mediaIndex = Math.min(activeImgs.length - 1, Math.floor(activeRawProgress * activeImgs.length));
      serviceMediaGroups.forEach(function (group) {
        Array.prototype.slice.call(group.querySelectorAll("img")).forEach(function (img, i) {
          img.classList.toggle("is-active", group === activeGroup && i === mediaIndex);
        });
      });
    };

    var serviceRowMediaTicking = false;
    var onServiceRowMediaScroll = function () {
      if (!serviceRowMediaTicking) {
        serviceRowMediaTicking = true;
        window.requestAnimationFrame(function () {
          updateServiceRowMedia();
          serviceRowMediaTicking = false;
        });
      }
    };

    updateServiceRowMedia();
    window.addEventListener("scroll", onServiceRowMediaScroll, { passive: true });
    window.addEventListener("resize", onServiceRowMediaScroll);
  }

  /* Peticion cliente 2026-07-14: al volver a la pagina de Proyectos
     (desde la ficha de un proyecto - nav, footer, boton "Ver todos los
     proyectos" o el boton "atras" del navegador) la pagina debe quedar
     donde estaba el proyecto pulsado, no en la parte de arriba. Los
     enlaces del mosaico son navegacion normal (<a href>, sin SPA), asi
     que un carga nueva de proyectos.html siempre empieza en scrollY:0
     por defecto - sessionStorage es el unico sitio donde puede
     persistir "que proyecto pulse" entre 2 cargas de pagina distintas.
     Se guarda el href al pulsar (antes de que el navegador abandone la
     pagina) y se consume UNA sola vez al cargar proyectos.html (se borra
     nada mas leerlo): asi solo salta al proyecto justo despues de volver
     de su ficha, no en cualquier visita futura a Proyectos.

     `[href]` en el selector excluye a proposito los mosaicos "estaticos"
     sin proyecto real (Sweet Candy Studios, Rise Melbourne - ver
     .project-mosaic__frame--static en proyectos.html), que son <div>,
     no <a>, y no participan de esta navegacion.

     No hace falta esperar a que carguen las imagenes lazy antes de
     hacer scrollIntoView: cada .project-mosaic__item ya reserva su
     tamano final con aspect-ratio (ver pages.css), no hay salto de
     layout pendiente que pueda desplazar el objetivo despues del
     scroll. */
  var PROJECT_LAST_VIEWED_KEY = "pdg:lastProjectHref";
  var projectMosaicLinks = Array.prototype.slice.call(document.querySelectorAll(".project-mosaic__frame[href]"));
  if (projectMosaicLinks.length) {
    projectMosaicLinks.forEach(function (link) {
      link.addEventListener("click", function () {
        sessionStorage.setItem(PROJECT_LAST_VIEWED_KEY, link.getAttribute("href"));
      });
    });

    var lastProjectHref = sessionStorage.getItem(PROJECT_LAST_VIEWED_KEY);
    if (lastProjectHref) {
      sessionStorage.removeItem(PROJECT_LAST_VIEWED_KEY);
      var lastProjectLink = document.querySelector('.project-mosaic__frame[href="' + lastProjectHref + '"]');
      if (lastProjectLink) {
        lastProjectLink.scrollIntoView({ block: "center" });
      }
    }
  }

  /* Bug encontrado 2026-07-25 (reportado por el usuario, version tablet
     desplegada: el boton "Ver todos los proyectos" del Home no llevaba al
     inicio de Proyectos). Causa: el mecanismo de arriba (2026-07-14)
     recuerda EN QUE PROYECTO se hizo clic desde el propio mosaico de
     Proyectos, para restaurar esa posicion de scroll al volver - pero
     sessionStorage sigue vivo mientras dure la pestaña, no solo durante
     esa "vuelta" inmediata. Si el usuario ya habia visitado un proyecto
     desde el mosaico en algun momento anterior de la sesion, y LUEGO
     (sin haber vuelto a Proyectos todavia, asi que el valor seguia sin
     consumir) navega Home -> "Ver todos los proyectos", proyectos.html
     encontraba ese valor antiguo y saltaba a el en vez de quedarse
     arriba - el mecanismo no distingue "vengo de ver un proyecto" de
     "vengo de cualquier otro sitio". El boton de Home (.btn-bar) es
     siempre una entrada "fresca" a Proyectos (nunca un "volver de la
     ficha de un proyecto" - eso ya lo cubre .project-detail__nav-all,
     sin tocar), asi que aqui se limpia el valor guardado ANTES de
     navegar, para que proyectos.html cargue siempre desde arriba
     cuando se llega por este boton en concreto. */
  var homeProjectsBtnBar = document.querySelector(".btn-bar");
  if (homeProjectsBtnBar) {
    homeProjectsBtnBar.addEventListener("click", function () {
      sessionStorage.removeItem(PROJECT_LAST_VIEWED_KEY);
    });
  }

  /* Peticion cliente 2026-07-22: el margen que .project-mosaic__item gana
     en hover (pages.css, ".project-mosaic__item:has(...)") para dejar
     hueco al caption de abajo era un valor fijo (28px), ajustado solo
     para un titulo de una linea. Con titulos largos (p.ej. "Executive
     Office of the Ministry of Defence", "Expo 2025 Osaka Panamá") el
     texto envuelve a 2 lineas y el caption crece mas de lo que ese hueco
     fijo reservaba, pisando la imagen de la pieza siguiente. Se mide la
     altura real del caption de cada pieza (siempre presente en el DOM,
     con opacity:0 en reposo pero con layout real - measurable) y se
     guarda como variable CSS por pieza; la regla de hover en pages.css
     usa esa variable, con el 28px original como fallback si por lo que
     sea no llega a ejecutarse este script. Se recalcula en resize
     (el ancho de columna cambia el punto donde el titulo envuelve) y
     tras cargar las fuentes (su metrica tambien afecta el envuelto). */
  var projectMosaicItems = document.querySelectorAll(".project-mosaic__item");
  if (projectMosaicItems.length) {
    var updateProjectMosaicCaptionSpacing = function () {
      projectMosaicItems.forEach(function (item) {
        var caption = item.querySelector(".project-mosaic__caption");
        if (!caption) return;
        item.style.setProperty("--mosaic-hover-margin", (caption.offsetHeight + 4) + "px");
      });
    };

    updateProjectMosaicCaptionSpacing();

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(updateProjectMosaicCaptionSpacing);
    }
    scheduleRecomputeAfterLoad(updateProjectMosaicCaptionSpacing);

    var mosaicCaptionResizeTicking = false;
    window.addEventListener("resize", function () {
      if (mosaicCaptionResizeTicking) return;
      mosaicCaptionResizeTicking = true;
      window.requestAnimationFrame(function () {
        updateProjectMosaicCaptionSpacing();
        mosaicCaptionResizeTicking = false;
      });
    });
  }

  /* Formulario de Contacto (contacto.html, nodo Figma 487:1052-487:1061,
     re-auditado 2026-07-20): prototipo estatico sin backend - marcado
     con data-form-state="static" en el <form> (ver PROTOTYPE_AGENT.md,
     "formularios sin backend deben marcarse como placeholder/static").
     preventDefault evita la navegacion real del navegador al enviar
     (que intentaria un GET a la propia URL, perdiendo los datos escritos
     sin avisar); en su lugar se muestra un mensaje de confirmacion
     minimo y se resetea el formulario. No hay llamada a ningun endpoint
     ni almacenamiento de los datos - nada se envia a ningun sitio. */
  var contactForm = document.querySelector('.contact-form[data-form-state="static"]');
  if (contactForm) {
    var isEnglishPage = document.documentElement.lang === "en";
    var contactFormSubmittedNote = isEnglishPage
      ? "Thanks - this prototype doesn't submit the form anywhere yet."
      : "Gracias - este prototipo aun no envia el formulario a ningun sitio.";
    contactForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var note = contactForm.querySelector(".contact-form__note");
      if (note) {
        note.textContent = contactFormSubmittedNote;
      }
      contactForm.reset();
    });
  }

})();
