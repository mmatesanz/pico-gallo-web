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

    /* Peticion cliente 2026-07-20: ventana fija para la persiana de
       titulo+categoria (ver .project-entry__heading-window en
       components.css) - necesita un alto en px que quepa el titulo MAS
       ALTO de los 4 (Abu Dhabi ocupa 2 lineas por su <br> fijo, el resto
       1), o esos proyectos se recortarian. Mismo patron que
       --row-title-h en Servicios: se mide el offsetHeight real de cada
       .project-entry__heading (no le afecta su propio transform ni el
       overflow:hidden del padre, que solo recorta lo que se PINTA, no lo
       que se MIDE) y se usa el mayor de los 4. */
    var projectHeadings = Array.prototype.slice.call(projectShowcase.querySelectorAll(".project-entry__heading"));
    var updateProjectHeadingHeight = function () {
      if (!projectHeadings.length) return;
      var tallest = projectHeadings.reduce(function (max, heading) {
        return Math.max(max, heading.offsetHeight);
      }, 0);
      document.documentElement.style.setProperty("--project-heading-h", tallest + "px");
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
     carrusel de Servicios debe tener el MISMO comportamiento de scroll en
     movil que en escritorio/tablet (mismo pin + crossfade + barra de
     progreso) - solo cambian los ESTILOS (ver el fallback de solo-ancho
     en components.css, que ya no desactiva el pin, unicamente ajusta
     margen y oculta los sub-items). Por eso aqui no se excluye movil con
     isMobileViewport (solo prefers-reduced-motion, por accesibilidad). */
  if (serviceShowcase && servicePin && serviceEntries.length && !prefersReducedMotion) {
    var SERVICE_COUNT = serviceEntries.length;
    var serviceTicking = false;

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
         defecto desde PHP) llegaba a mostrar su titulo/tagline. */
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
