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
    /* Watery morph animation — restart each click */
    ham.classList.remove('is-animating');
    void ham.offsetWidth;
    ham.classList.add('is-animating');
    setTimeout(function () { ham.classList.remove('is-animating'); }, 620);

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

  /* Transparent nav — turns solid when "Who We Are" section hits the top.
     Falls back to scroll offset if the section isn't found.
     Only active on pages with data-transparent nav. */
  var nav = document.getElementById('mainNav');
  if (nav && nav.hasAttribute('data-transparent')) {
    var trigger = document.getElementById('brand');
    if (trigger && 'IntersectionObserver' in window) {
      var navObs = new IntersectionObserver(function (entries) {
        /* scrolled = true when the brand section is no longer intersecting
           from the top (i.e. its top edge has passed the viewport top) */
        nav.classList.toggle('scrolled', !entries[0].isIntersecting);
      }, { threshold: 0, rootMargin: '0px 0px 0px 0px' });
      navObs.observe(trigger);
    } else {
      window.addEventListener('scroll', function () {
        nav.classList.toggle('scrolled', window.scrollY > 55);
      }, { passive: true });
    }
  }
}());
