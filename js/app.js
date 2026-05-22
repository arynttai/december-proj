/**
 * Jeltoqsan — app bootstrap with GSAP + native fallbacks
 */
(function () {
  "use strict";

  const NAV_OFFSET = 52;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasGsap =
    typeof gsap !== "undefined" &&
    typeof ScrollTrigger !== "undefined" &&
    typeof ScrollToPlugin !== "undefined";

  if (hasGsap) {
    gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);
  }

  /** Smooth or instant scroll to element or selector */
  function scrollToTarget(target, options = {}) {
    const offset = options.offset ?? NAV_OFFSET;
    const duration = options.duration ?? (prefersReducedMotion ? 0 : 0.75);

    let el =
      typeof target === "string"
        ? document.querySelector(target)
        : target;

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
    window.scrollTo({ top: y, behavior: prefersReducedMotion ? "auto" : "smooth" });
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

  function setActiveNav(sectionId) {
    document.querySelectorAll(".nav-link").forEach((link) => {
      link.classList.toggle("is-active", link.dataset.section === sectionId);
    });
  }

  function highlightMilestone(index) {
    document.querySelectorAll(".milestone-row").forEach((row, i) => {
      row.classList.toggle("is-highlight", i === index);
    });
    document.querySelectorAll(".jump-chip").forEach((chip, i) => {
      chip.classList.toggle("is-active", i === index);
      chip.setAttribute("aria-pressed", i === index ? "true" : "false");
    });
  }

  function bindAnchorScroll() {
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      const href = anchor.getAttribute("href");
      if (!href || href === "#") return;

      anchor.addEventListener("click", (e) => {
        const target = document.querySelector(href);
        if (!target) return;
        e.preventDefault();
        scrollToTarget(target);
      });
    });
  }

  function initNav() {
    const nav = document.getElementById("site-nav");
    const progress = document.getElementById("scroll-progress");

    nav?.classList.add("is-visible");

    const onScroll = () => {
      const scrollY = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? scrollY / max : 0;
      if (progress) progress.style.width = `${ratio * 100}%`;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    if (!hasGsap) return;

    ["hero", "timeline", "legacy"].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;

      ScrollTrigger.create({
        trigger: el,
        start: "top 55%",
        end: "bottom 45%",
        onEnter: () => setActiveNav(id),
        onEnterBack: () => setActiveNav(id),
      });
    });
  }

  function initBackToTop() {
    const btn = document.getElementById("back-top");
    if (!btn) return;

    const toggle = () => {
      btn.classList.toggle("is-visible", window.scrollY > 320);
    };

    window.addEventListener("scroll", toggle, { passive: true });
    toggle();

    btn.addEventListener("click", () => scrollToTarget(document.getElementById("hero") || 0));
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
      y: 14,
      duration: 0.55,
      stagger: 0.07,
      ease: "power2.out",
      clearProps: "transform",
    });
  }

  function initTimeline() {
    const rows = document.querySelectorAll(".milestone-row");
    const chips = document.querySelectorAll(".jump-chip");

    if (!rows.length) return;

    highlightMilestone(0);

    rows.forEach((row, index) => {
      if (hasGsap && !prefersReducedMotion) {
        ScrollTrigger.create({
          trigger: row,
          start: "top 70%",
          end: "bottom 30%",
          onEnter: () => highlightMilestone(index),
          onEnterBack: () => highlightMilestone(index),
        });
      }
    });

    if (!hasGsap || prefersReducedMotion) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const index = parseInt(entry.target.dataset.index, 10);
              if (!Number.isNaN(index)) highlightMilestone(index);
            }
          });
        },
        { rootMargin: "-35% 0px -45% 0px", threshold: 0 }
      );
      rows.forEach((row) => observer.observe(row));
    }

    chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        const index = parseInt(chip.dataset.index, 10);
        const row = rows[index];
        if (row) {
          highlightMilestone(index);
          scrollToTarget(row, { onComplete: () => highlightMilestone(index) });
        }
      });

      chip.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        chip.click();
      });
    });

    document.getElementById("btn-explore-timeline")?.addEventListener("click", () => {
      scrollToTarget("#timeline");
    });

    document.addEventListener("keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
      const active = document.activeElement;
      if (!active?.classList?.contains("jump-chip")) return;

      const chipsArr = Array.from(chips);
      let idx = chipsArr.indexOf(active);
      if (idx < 0) return;

      if (e.key === "ArrowRight" || e.key === "ArrowDown") idx = Math.min(idx + 1, chipsArr.length - 1);
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") idx = Math.max(idx - 1, 0);

      chipsArr[idx].focus();
      chipsArr[idx].click();
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
        duration: 0.45,
        ease: "power2.out",
        scrollTrigger: {
          trigger: el,
          start: "top 94%",
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
      const milestoneMatch = hash.match(/^#milestone-(\d+)$/);
      if (milestoneMatch) {
        highlightMilestone(parseInt(milestoneMatch[1], 10));
      }
      scrollToTarget(target, { duration: prefersReducedMotion ? 0 : 0.5 });
    }, 150);
  }

  function init() {
    bindAnchorScroll();
    initNav();
    initBackToTop();
    initHero();
    initTimeline();
    initLegacy();

    if (hasGsap) {
      ScrollTrigger.refresh();
    }

    handleInitialHash();
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

  window.addEventListener("resize", () => {
    if (hasGsap) ScrollTrigger.refresh();
  });
})();
