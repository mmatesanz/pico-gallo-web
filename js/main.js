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
     Si el usuario prefiere menos movimiento, o el viewport es de movil
     (<=860px, mismo breakpoint que el resto del sitio), no se ejecuta
     este calculo en absoluto: el fallback estatico de pages.css (media
     query prefers-reduced-motion/max-width:860px) se encarga de mostrar
     un layout simple sin transformaciones. */
  var heroScroll = document.querySelector(".hero-scroll");
  var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var isMobileHeroViewport = window.matchMedia("(max-width: 860px)").matches;

  if (heroScroll && !prefersReducedMotion && !isMobileHeroViewport) {
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
     mobile <=860px - se reutiliza isMobileHeroViewport, mismo breakpoint),
     pero con un progreso CONTINUO (--project-track-progress, 0 a N-1, no
     0-1) para que las imagenes se desplacen de forma fluida entre
     posiciones, no a saltos. El indice activo (para el crossfade de
     texto) si es discreto: se redondea al proyecto mas cercano. */
  var projectShowcase = document.querySelector(".project-showcase");
  var projectPin = projectShowcase ? projectShowcase.querySelector(".project-showcase__pin") : null;
  var projectEntries = projectShowcase
    ? Array.prototype.slice.call(projectShowcase.querySelectorAll(".project-entry"))
    : [];

  if (projectShowcase && projectPin && projectEntries.length && !prefersReducedMotion && !isMobileHeroViewport) {
    var PROJECT_COUNT = projectEntries.length;
    var projectTicking = false;

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

  /* Toggle EN/ES decorativo: el Figma solo define el control visual,
     sin contenido en ingles aprobado todavia. Se deja el estado activo
     marcado y se evita prometer un cambio de idioma que no existe. */
  document.querySelectorAll(".lang-toggle button").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".lang-toggle button").forEach(function (b) {
        b.setAttribute("aria-pressed", "false");
      });
      btn.setAttribute("aria-pressed", "true");
    });
  });
})();
