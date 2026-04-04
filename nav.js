/* nav.js — hamburger drawer toggle + transparent-nav scroll */
(function () {
  'use strict';

  var ham    = document.getElementById('hamburger');
  var drawer = document.getElementById('mobileMenu');
  if (!ham || !drawer) return;

  var links = drawer.querySelectorAll('.drawer-link');

  function openDrawer() {
    ham.setAttribute('aria-expanded', 'true');
    drawer.setAttribute('aria-hidden', 'false');
    drawer.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    ham.setAttribute('aria-expanded', 'false');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  ham.addEventListener('click', function () {
    ham.getAttribute('aria-expanded') === 'false' ? openDrawer() : closeDrawer();
  });

  links.forEach(function (link) {
    link.addEventListener('click', closeDrawer);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && ham.getAttribute('aria-expanded') === 'true') {
      closeDrawer();
      ham.focus();
    }
  });

  /* Transparent nav scroll — only active on pages with data-transparent nav */
  var nav = document.getElementById('mainNav');
  if (nav && nav.hasAttribute('data-transparent')) {
    window.addEventListener('scroll', function () {
      nav.classList.toggle('scrolled', window.scrollY > 55);
    }, { passive: true });
  }
}());
