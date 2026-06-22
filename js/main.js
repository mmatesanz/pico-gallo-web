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
     por lo que el header ya nace en su variante clara (blanca). */
  var lightZone = document.querySelector("[data-header-light-zone]");
  if (header && lightZone) {
    var setHeaderState = function () {
      var zoneBottom = lightZone.getBoundingClientRect().bottom;
      header.classList.toggle("is-on-light", zoneBottom > header.offsetHeight);
    };
    setHeaderState();
    window.addEventListener("scroll", setHeaderState, { passive: true });
    window.addEventListener("resize", setHeaderState);
  }

  /* Toggle EN/ES decorativo: todavia no hay contenido en ingles aprobado.
     Se deja el estado activo marcado y se evita prometer un cambio de
     idioma que no existe. */
  document.querySelectorAll(".lang-toggle button").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".lang-toggle button").forEach(function (b) {
        b.setAttribute("aria-pressed", "false");
      });
      btn.setAttribute("aria-pressed", "true");
    });
  });

  /* Formulario de contacto: prototipo sin backend. No se envia a ningun
     servicio real; solo confirma visualmente la interaccion. */
  var contactForm = document.querySelector(".contact-form");
  if (contactForm) {
    contactForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var status = contactForm.querySelector(".form-status");
      if (status) {
        status.textContent = "Gracias. Este formulario es parte del prototipo y aun no envia datos reales.";
      }
      contactForm.reset();
    });
  }
})();
