/**
 * Jeltoqsan — mobile-first interactions
 */
(function () {
  "use strict";

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasGsap =
    typeof gsap !== "undefined" &&
    typeof ScrollTrigger !== "undefined" &&
    typeof ScrollToPlugin !== "undefined";

  if (hasGsap) {
    gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);
  }

  function getScrollOffset() {
    const nav = document.getElementById("site-nav");
    let h = nav ? nav.offsetHeight : 52;
    const jumpWrap = document.querySelector(".timeline-jump-wrap");
    if (jumpWrap && window.getComputedStyle(jumpWrap).position === "sticky") {
      h += jumpWrap.offsetHeight;
    }
    return h + 10;
  }

  function scrollToTarget(target, options = {}) {
    const offset = options.offset ?? getScrollOffset();
    const duration = options.duration ?? (prefersReducedMotion ? 0 : 0.7);

    const el = typeof target === "string" ? document.querySelector(target) : target;
    if (!el) return;

    if (hasGsap && duration > 0) {
      gsap.to(window, {
        scrollTo: { y: el, offsetY: offset, autoKill: true },
        duration,
        ease: "power2.inOut",
        onComplete: options.onComplete,
      });
      return;
    }

    const y = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: Math.max(0, y), behavior: prefersReducedMotion ? "auto" : "smooth" });
    options.onComplete?.();
  }

  function hideLoader() {
    document.getElementById("app-loader")?.classList.add("is-hidden");
  }

  function showLegacyContent() {
    document.querySelectorAll(".legacy-reveal").forEach((el) => {
      el.style.opacity = "1";
      el.style.transform = "none";
    });
  }

  function setActiveSection(sectionId) {
    document.querySelectorAll(".nav-link, .mobile-tab").forEach((el) => {
      const active = el.dataset.section === sectionId;
      el.classList.toggle("is-active", active);
      if (active) el.setAttribute("aria-current", "true");
      else el.removeAttribute("aria-current");
    });
  }

  function scrollChipIntoView(index) {
    const chip = document.querySelector(`.jump-chip[data-index="${index}"]`);
    const container = document.getElementById("timeline-jump");
    if (!chip || !container) return;

    const chipLeft = chip.offsetLeft;
    const chipWidth = chip.offsetWidth;
    const containerWidth = container.clientWidth;
    const scrollLeft = chipLeft - containerWidth / 2 + chipWidth / 2;

    container.scrollTo({
      left: Math.max(0, scrollLeft),
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }

  function highlightMilestone(index) {
    document.querySelectorAll(".milestone-row").forEach((row, i) => {
      row.classList.toggle("is-highlight", i === index);
    });
    document.querySelectorAll(".jump-chip").forEach((chip, i) => {
      const active = i === index;
      chip.classList.toggle("is-active", active);
      chip.setAttribute("aria-pressed", active ? "true" : "false");
    });
    scrollChipIntoView(index);
  }

  function bindAnchorScroll() {
    document.querySelectorAll('a[href^="#"]:not(.sr-only)').forEach((anchor) => {
      const href = anchor.getAttribute("href");
      if (!href || href === "#") return;

      anchor.addEventListener("click", (e) => {
        const target = document.querySelector(href);
        if (!target) return;
        e.preventDefault();
        const section = anchor.dataset.section;
        if (section) setActiveSection(section);
        scrollToTarget(target);
      });
    });
  }

  function initNav() {
    const progress = document.getElementById("scroll-progress");

    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? window.scrollY / max : 0;
      if (progress) {
        progress.style.width = `${ratio * 100}%`;
        progress.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    if (!hasGsap) return;

    ["hero", "timeline", "legacy"].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;

      ScrollTrigger.create({
        trigger: el,
        start: "top 58%",
        end: "bottom 42%",
        onEnter: () => setActiveSection(id),
        onEnterBack: () => setActiveSection(id),
      });
    });
  }

  function initBackToTop() {
    const btn = document.getElementById("back-top");
    if (!btn) return;

    const toggle = () => btn.classList.toggle("is-visible", window.scrollY > 280);
    window.addEventListener("scroll", toggle, { passive: true });
    toggle();

    btn.addEventListener("click", () => scrollToTarget("#hero"));
  }

  function initHero() {
    const items = document.querySelectorAll("[data-hero-animate]");
    if (prefersReducedMotion || !hasGsap) {
      items.forEach((el) => {
        el.style.opacity = "1";
        el.style.transform = "none";
      });
      return;
    }

    gsap.from(items, {
      opacity: 0,
      y: 18,
      duration: 0.55,
      stagger: 0.08,
      ease: "power2.out",
      clearProps: "transform",
    });
  }

  function initTimeline() {
    const rows = document.querySelectorAll(".milestone-row");
    const chips = document.querySelectorAll(".jump-chip");

    if (!rows.length) return;

    highlightMilestone(0);

    const onRowActive = (index) => highlightMilestone(index);

    if (hasGsap && !prefersReducedMotion) {
      rows.forEach((row, index) => {
        ScrollTrigger.create({
          trigger: row,
          start: "top 75%",
          end: "bottom 25%",
          onEnter: () => onRowActive(index),
          onEnterBack: () => onRowActive(index),
        });

        gsap.from(row, {
          opacity: 0,
          y: 20,
          duration: 0.5,
          ease: "power2.out",
          scrollTrigger: {
            trigger: row,
            start: "top 92%",
            toggleActions: "play none none none",
          },
        });
      });
    } else {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const index = parseInt(entry.target.dataset.index, 10);
            if (!Number.isNaN(index)) onRowActive(index);
          });
        },
        { rootMargin: "-30% 0px -40% 0px", threshold: 0 }
      );
      rows.forEach((row) => observer.observe(row));
    }

    chips.forEach((chip) => {
      const activate = () => {
        const index = parseInt(chip.dataset.index, 10);
        const row = rows[index];
        if (!row) return;
        highlightMilestone(index);
        scrollToTarget(row, {
          onComplete: () => highlightMilestone(index),
        });
      };

      chip.addEventListener("click", activate);

      chip.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      });
    });

    document.getElementById("btn-explore-timeline")?.addEventListener("click", () => {
      scrollToTarget("#timeline");
      setActiveSection("timeline");
    });
  }

  function initLegacy() {
    if (prefersReducedMotion || !hasGsap) {
      showLegacyContent();
      return;
    }

    gsap.utils.toArray(".legacy-reveal").forEach((el) => {
      gsap.to(el, {
        opacity: 1,
        y: 0,
        duration: 0.5,
        ease: "power2.out",
        scrollTrigger: {
          trigger: el,
          start: "top 93%",
          toggleActions: "play none none none",
        },
      });
    });
  }

  function handleInitialHash() {
    const hash = window.location.hash;
    if (!hash) return;

    const target = document.querySelector(hash);
    if (!target) return;

    window.setTimeout(() => {
      const m = hash.match(/^#milestone-(\d+)$/);
      if (m) highlightMilestone(parseInt(m[1], 10));
      scrollToTarget(target, { duration: prefersReducedMotion ? 0 : 0.5 });
    }, 200);
  }

  function init() {
    bindAnchorScroll();
    initNav();
    initBackToTop();
    initHero();
    initTimeline();
    initLegacy();
    handleInitialHash();

    if (hasGsap) {
      ScrollTrigger.addEventListener("refresh", () => {
        /* recalc after mobile chrome resize */
      });
      ScrollTrigger.refresh();
    }
  }

  function onReady() {
    hideLoader();
    init();
  }

  if (document.readyState === "complete") {
    onReady();
  } else {
    window.addEventListener("load", onReady);
  }

  let resizeTimer;
  window.addEventListener(
    "resize",
    () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (hasGsap) ScrollTrigger.refresh();
      }, 200);
    },
    { passive: true }
  );

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => {
      if (hasGsap) ScrollTrigger.refresh();
    });
  }
})();
