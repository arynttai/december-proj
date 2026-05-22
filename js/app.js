/**
 * Jeltoqsan — immersive longread
 */
(function () {
  "use strict";

  const MILESTONE_COUNT = 5;
  const MILESTONE_META = [
    { time: "Dec 16, 22:00", chapter: "The Spark", mood: "spark" },
    { time: "Dec 17, 09:00", chapter: "Peaceful Gathering", mood: "gathering" },
    { time: "Dec 17, 14:00", chapter: "The Cordon", mood: "cordon" },
    { time: "Dec 18, 02:00", chapter: "Operation Blizzard", mood: "blizzard" },
    { time: "Dec 19+", chapter: "The Aftermath", mood: "aftermath" },
  ];

  const SHARE = {
    title: "Jeltoqsan: December 1986",
    text: "The student uprising in Alma-Ata that reshaped Kazakhstan",
  };

  const PROGRESS_KEY = "jeltoqsan-progress-v1";
  const RESUME_DISMISS_KEY = "jeltoqsan-resume-dismissed";

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasGsap =
    typeof gsap !== "undefined" &&
    typeof ScrollTrigger !== "undefined" &&
    typeof ScrollToPlugin !== "undefined";

  if (hasGsap) {
    gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);
  }

  let activeMilestone = 0;
  let toastTimer = null;
  let cinemaBuilt = false;
  let cinemaOpen = false;
  let soundEnabled = false;

  const isTouchDevice =
    "ontouchstart" in window || navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches;

  const ambientSound = (() => {
    let ctx = null;
    let master = null;
    const sources = [];

    const MOOD_LEVELS = {
      spark: isTouchDevice ? 0.2 : 0.12,
      gathering: isTouchDevice ? 0.26 : 0.16,
      cordon: isTouchDevice ? 0.3 : 0.19,
      blizzard: isTouchDevice ? 0.42 : 0.28,
      aftermath: isTouchDevice ? 0.22 : 0.14,
    };

    function getAudioContextClass() {
      return window.AudioContext || window.webkitAudioContext;
    }

    function brownNoiseBuffer(context, seconds) {
      const n = Math.floor(context.sampleRate * seconds);
      const buf = context.createBuffer(1, n, context.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < n; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        d[i] = last * (isTouchDevice ? 16 : 12);
      }
      return buf;
    }

    function playSilentUnlock(context) {
      const buffer = context.createBuffer(1, 1, context.sampleRate);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.start(0);
      source.stop(context.currentTime + 0.05);
    }

    function tearDownSources() {
      sources.forEach((node) => {
        try {
          node.stop();
          node.disconnect();
        } catch {
          /* already stopped */
        }
      });
      sources.length = 0;
      master = null;
    }

    function ensureContext() {
      const Ctx = getAudioContextClass();
      if (!Ctx) return false;
      if (!ctx || ctx.state === "closed") {
        ctx = new Ctx({ latencyHint: "interactive" });
        playSilentUnlock(ctx);
      }
      return true;
    }

    function buildGraph() {
      if (!ensureContext()) throw new Error("Web Audio not supported");
      tearDownSources();

      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);

      const noise = ctx.createBufferSource();
      noise.buffer = brownNoiseBuffer(ctx, 4);
      noise.loop = true;

      const highpass = ctx.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 100;

      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = isTouchDevice ? 1100 : 900;

      const noiseGain = ctx.createGain();
      noiseGain.gain.value = isTouchDevice ? 0.65 : 0.5;

      noise.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(noiseGain);
      noiseGain.connect(master);
      noise.start(0);
      sources.push(noise);

      const rumble = ctx.createOscillator();
      rumble.type = "sine";
      rumble.frequency.value = 48;
      const rumbleGain = ctx.createGain();
      rumbleGain.gain.value = isTouchDevice ? 0.18 : 0.12;
      rumble.connect(rumbleGain);
      rumbleGain.connect(master);
      rumble.start(0);
      sources.push(rumble);
    }

    function primeFromGesture() {
      if (!ensureContext()) return false;
      playSilentUnlock(ctx);
      if (ctx.state === "suspended") {
        ctx.resume();
      }
      return true;
    }

    function applyMasterLevel(mood) {
      if (!master || !ctx) return;
      const level = MOOD_LEVELS[mood] || MOOD_LEVELS.spark;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(level, ctx.currentTime, 0.35);
    }

    return {
      primeFromGesture,

      startFromGesture() {
        return new Promise((resolve) => {
          try {
            if (!primeFromGesture()) {
              resolve(false);
              return;
            }

            const afterResume = () => {
              try {
                if (!master || !sources.length) buildGraph();
                applyMasterLevel("spark");
                resolve(ctx.state === "running");
              } catch (err) {
                console.warn("Ambient build failed:", err);
                resolve(false);
              }
            };

            if (ctx.state === "running") {
              afterResume();
              return;
            }

            ctx.resume().then(afterResume).catch(() => resolve(false));
          } catch (err) {
            console.warn("Ambient sound failed:", err);
            resolve(false);
          }
        });
      },

      stop() {
        tearDownSources();
        if (master && ctx && ctx.state === "running") {
          try {
            master.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
          } catch {
            /* ignore */
          }
        }
        if (ctx && ctx.state === "running") {
          try {
            ctx.suspend();
          } catch {
            /* ignore */
          }
        }
      },

      setMood(mood) {
        if (!soundEnabled) return;
        applyMasterLevel(mood);
      },

      resumeIfNeeded() {
        if (!ctx || !soundEnabled || ctx.state === "closed") return;
        primeFromGesture();
        if (ctx.state === "suspended") ctx.resume();
      },

      isActive: () => soundEnabled && !!ctx && ctx.state !== "closed",
    };
  })();

  function getScrollOffset() {
    const nav = document.getElementById("site-nav");
    let h = nav ? nav.offsetHeight : 52;
    const jumpWrap = document.getElementById("timeline-sticky") || document.querySelector(".timeline-jump-wrap");
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

  function showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
      window.setTimeout(() => {
        toast.hidden = true;
      }, 280);
    }, 2400);
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

  function updateTimelineProgress(index) {
    document.querySelectorAll(".progress-seg").forEach((seg, i) => {
      seg.classList.toggle("is-active", i === index);
      seg.classList.toggle("is-done", i < index);
    });

    const counter = document.getElementById("milestone-counter");
    if (counter) counter.textContent = `${index + 1} / ${MILESTONE_COUNT}`;

    const prev = document.getElementById("milestone-prev");
    const next = document.getElementById("milestone-next");
    if (prev) prev.disabled = index <= 0;
    if (next) next.disabled = index >= MILESTONE_COUNT - 1;
  }

  function updateStoryClock(index) {
    const meta = MILESTONE_META[index];
    const timeEl = document.getElementById("clock-time");
    const chapterEl = document.getElementById("clock-chapter");
    if (!meta) return;
    if (timeEl) timeEl.textContent = meta.time;
    if (chapterEl) chapterEl.textContent = meta.chapter;
  }

  function setStoryMood(index) {
    const mood = MILESTONE_META[index]?.mood || "spark";
    document.body.dataset.mood = mood;
    if (soundEnabled) ambientSound.setMood(mood);
  }

  function saveReadingProgress(index) {
    if (index < 1) return;
    try {
      localStorage.setItem(
        PROGRESS_KEY,
        JSON.stringify({ milestone: index, chapter: MILESTONE_META[index]?.chapter, ts: Date.now() })
      );
    } catch {
      /* storage full / private mode */
    }
  }

  function hideResumeBar() {
    const bar = document.getElementById("resume-bar");
    if (!bar) return;
    bar.hidden = true;
    bar.setAttribute("aria-hidden", "true");
  }

  function dismissResumeBar(permanent = true) {
    hideResumeBar();
    if (permanent) {
      try {
        localStorage.setItem(RESUME_DISMISS_KEY, "1");
      } catch {
        /* ignore */
      }
    }
  }

  function updateMapActive(index) {
    document.querySelectorAll(".map-jump, .map-dot").forEach((el) => {
      const m = parseInt(el.dataset.milestone, 10);
      el.classList.toggle("is-active", m === index);
    });
  }

  function pulseMilestone(row) {
    if (!row || prefersReducedMotion) return;
    row.classList.add("is-pulse");
    window.setTimeout(() => row.classList.remove("is-pulse"), 600);
  }

  function updateMilestoneHash(index, replace = true) {
    const hash = `#milestone-${index}`;
    const url = `${window.location.pathname}${window.location.search}${hash}`;
    if (replace) history.replaceState({ milestone: index }, "", url);
    else history.pushState({ milestone: index }, "", url);
  }

  function highlightMilestone(index, options = {}) {
    const { updateHash = true } = options;
    activeMilestone = index;

    document.querySelectorAll(".milestone-row").forEach((row, i) => {
      row.classList.toggle("is-highlight", i === index);
    });

    document.querySelectorAll(".jump-chip").forEach((chip, i) => {
      const active = i === index;
      chip.classList.toggle("is-active", active);
      chip.setAttribute("aria-pressed", active ? "true" : "false");
    });

    scrollChipIntoView(index);
    updateTimelineProgress(index);
    updateStoryClock(index);
    setStoryMood(index);
    updateMapActive(index);
    if (updateHash) updateMilestoneHash(index);
    saveReadingProgress(index);
    if (cinemaOpen) syncCinemaSlide(index);
  }

  function goToMilestone(index, options = {}) {
    const { scroll = true, updateHash = true } = options;
    const i = Math.max(0, Math.min(MILESTONE_COUNT - 1, index));
    const row = document.querySelector(`.milestone-row[data-index="${i}"]`);
    if (!row) return;

    highlightMilestone(i, { updateHash });

    if (scroll) {
      scrollToTarget(row, {
        onComplete: () => {
          highlightMilestone(i, { updateHash: false });
          pulseMilestone(row);
        },
      });
    } else {
      pulseMilestone(row);
    }
  }

  function getMilestoneShareUrl(index) {
    const base = window.location.href.split("#")[0];
    return `${base}#milestone-${index}`;
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  }

  async function shareStory(url) {
    const shareUrl = url || window.location.href.split("#")[0];
    const payload = { ...SHARE, url: shareUrl };

    if (navigator.share) {
      try {
        await navigator.share(payload);
        return;
      } catch (err) {
        if (err.name === "AbortError") return;
      }
    }

    const ok = await copyText(shareUrl);
    showToast(ok ? "Link copied to clipboard" : "Could not copy link");
  }

  function initIntroEmbers() {
    const container = document.getElementById("intro-embers");
    if (!container || prefersReducedMotion) return;

    const count = window.innerWidth < 480 ? 16 : 28;
    for (let i = 0; i < count; i++) {
      const ember = document.createElement("span");
      ember.className = "ember";
      ember.style.left = `${Math.random() * 100}%`;
      ember.style.animationDuration = `${4 + Math.random() * 6}s`;
      ember.style.animationDelay = `${Math.random() * 5}s`;
      container.appendChild(ember);
    }
  }

  function animateIntroCount(targetEl) {
    if (!targetEl) return;
    const end = parseInt(targetEl.dataset.introCount || "16", 10);
    const duration = prefersReducedMotion ? 0 : 900;
    const start = performance.now();

    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      const val = Math.round(eased * end);
      targetEl.textContent = String(val).padStart(2, "0");
      if (t < 1) requestAnimationFrame(tick);
      else targetEl.textContent = String(end);
    };

    if (duration === 0) targetEl.textContent = String(end);
    else requestAnimationFrame(tick);
  }

  function playIntroEntrance(curtain) {
    curtain.classList.add("is-ready");
    const dayEl = curtain.querySelector(".intro-day");
    animateIntroCount(dayEl);

    if (!hasGsap || prefersReducedMotion) {
      curtain.querySelectorAll(".intro-line").forEach((el) => {
        el.style.opacity = "1";
        el.style.transform = "none";
      });
      return;
    }

    gsap.to(".intro-line", {
      opacity: 1,
      y: 0,
      duration: 0.75,
      stagger: 0.1,
      ease: "power3.out",
      delay: 0.15,
    });

    gsap.from(".intro-bg img", {
      scale: 1.25,
      duration: 2.2,
      ease: "power2.out",
    });
  }

  function initIntroCurtain(onReady) {
    const curtain = document.getElementById("intro-curtain");
    const skipStored = sessionStorage.getItem("jeltoqsan-intro");
    const hasDeepLink = !!window.location.hash;

    const finish = () => {
      document.body.classList.remove("intro-lock");
      onReady();
    };

    if (!curtain || skipStored || hasDeepLink) {
      curtain?.classList.add("is-dismissed");
      finish();
      return;
    }

    if (prefersReducedMotion) {
      curtain.classList.add("is-dismissed");
      finish();
      return;
    }

    document.body.classList.add("intro-lock");
    initIntroEmbers();

    let dismissed = false;

    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      sessionStorage.setItem("jeltoqsan-intro", "1");
      curtain.classList.add("is-exiting");

      const done = () => {
        curtain.classList.add("is-dismissed");
        finish();
      };

      if (hasGsap) {
        const tl = gsap.timeline({ onComplete: done });
        tl.to(
          ".intro-curtain-inner",
          { opacity: 0, y: -40, duration: 0.45, ease: "power2.in" },
          0
        )
          .to(
            ".intro-bg img",
            { scale: 1.3, filter: "brightness(0.9) grayscale(0.6)", duration: 0.7, ease: "power2.inOut" },
            0
          )
          .to(curtain, { opacity: 0, duration: 0.5, ease: "power2.in" }, 0.25);
      } else {
        window.setTimeout(done, 400);
      }
    };

    playIntroEntrance(curtain);

    document.getElementById("intro-enter")?.addEventListener("click", dismiss, { once: true });
    document.getElementById("intro-skip")?.addEventListener("click", dismiss, { once: true });

    const onKey = (e) => {
      if (e.key === "Enter" && !e.target.closest("dialog")) {
        e.preventDefault();
        dismiss();
        document.removeEventListener("keydown", onKey);
      }
    };
    document.addEventListener("keydown", onKey);
  }

  function initAtmosphere() {
    const layer = document.getElementById("snow-layer");
    const toggle = document.getElementById("atmo-toggle");
    if (!layer || !toggle) return;

    if (prefersReducedMotion) {
      toggle.hidden = true;
      return;
    }

    const count = window.innerWidth < 768 ? 22 : 36;
    for (let i = 0; i < count; i++) {
      const flake = document.createElement("span");
      flake.className = "snowflake";
      flake.style.left = `${Math.random() * 100}%`;
      flake.style.animationDuration = `${5 + Math.random() * 9}s`;
      flake.style.animationDelay = `${Math.random() * 6}s`;
      flake.style.opacity = String(0.25 + Math.random() * 0.45);
      layer.appendChild(flake);
    }

    toggle.addEventListener("click", () => {
      const on = document.body.classList.toggle("atmo-snow");
      toggle.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function initStoryClockVisibility() {
    const clock = document.getElementById("story-clock");
    const timeline = document.getElementById("timeline");
    if (!clock || !timeline) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const show = entry.isIntersecting;
        clock.hidden = !show;
        clock.classList.toggle("is-visible", show);
      },
      { threshold: 0.04 }
    );
    observer.observe(timeline);
  }

  function revealBlockIfVisible(el) {
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.92 && rect.bottom > 0) {
      el.classList.add("is-revealed");
      return true;
    }
    return false;
  }

  function revealAllPassedBlocks() {
    document.querySelectorAll(".reveal-block").forEach((el) => {
      if (el.classList.contains("is-revealed")) return;
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.95) {
        el.classList.add("is-revealed");
      }
    });
    document.querySelectorAll("[data-figure]").forEach((el) => {
      el.style.opacity = "1";
      el.style.transform = "none";
    });
  }

  function initRevealBlocks() {
    const blocks = document.querySelectorAll(".reveal-block");
    if (!blocks.length) return;

    if (prefersReducedMotion) {
      blocks.forEach((el) => el.classList.add("is-revealed"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-revealed");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.05, rootMargin: "0px 0px 0px 0px" }
    );

    blocks.forEach((el) => {
      if (!revealBlockIfVisible(el)) observer.observe(el);
    });

    window.addEventListener("scroll", revealAllPassedBlocks, { passive: true });
    revealAllPassedBlocks();
  }

  function initFigures() {
    const cards = document.querySelectorAll("[data-figure]");
    if (!cards.length) return;

    cards.forEach((card) => {
      card.style.opacity = "1";
      card.style.transform = "none";
    });

    if (!hasGsap || prefersReducedMotion) return;

    cards.forEach((card, i) => {
      gsap.from(card, {
        opacity: 1,
        y: 28,
        duration: 0.55,
        delay: i * 0.08,
        ease: "power2.out",
        scrollTrigger: {
          trigger: card,
          start: "top 96%",
          toggleActions: "play none none none",
        },
      });
    });
  }

  function initStoryMap() {
    document.querySelectorAll(".map-jump, .map-dot").forEach((el) => {
      const activate = () => {
        const index = parseInt(el.dataset.milestone, 10);
        if (Number.isNaN(index)) return;
        setActiveSection("timeline");
        goToMilestone(index);
      };

      if (el.classList.contains("map-dot")) {
        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
      }

      el.addEventListener("click", activate);
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      });
    });
  }

  function initSpineFill() {
    const fill = document.getElementById("spine-fill");
    const track = document.querySelector(".timeline-track");
    if (!fill || !track) return;

    const update = () => {
      const rect = track.getBoundingClientRect();
      const viewMid = window.innerHeight * 0.45;
      const traveled = viewMid - rect.top;
      const range = rect.height + window.innerHeight * 0.25;
      const ratio = Math.max(0, Math.min(1, traveled / range));
      fill.style.height = `${ratio * 100}%`;
    };

    window.addEventListener("scroll", update, { passive: true });
    update();
  }

  function initSwipe() {
    const list = document.getElementById("milestone-list");
    if (!list || prefersReducedMotion) return;

    let startX = 0;
    let startY = 0;

    list.addEventListener(
      "touchstart",
      (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      },
      { passive: true }
    );

    list.addEventListener(
      "touchend",
      (e) => {
        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;
        if (Math.abs(dx) < 55 || Math.abs(dy) > Math.abs(dx) * 0.9) return;
        if (dx < 0 && activeMilestone < MILESTONE_COUNT - 1) goToMilestone(activeMilestone + 1);
        if (dx > 0 && activeMilestone > 0) goToMilestone(activeMilestone - 1);
      },
      { passive: true }
    );
  }

  function initReadingTime() {
    const el = document.getElementById("reading-time");
    const main = document.getElementById("main-content");
    if (!el || !main) return;

    const words = main.innerText.trim().split(/\s+/).filter(Boolean).length;
    const mins = Math.max(1, Math.round(words / 200));
    el.textContent = `~${mins} min read`;
  }

  function initShare() {
    ["btn-share-nav", "btn-share-footer"].forEach((id) => {
      document.getElementById(id)?.addEventListener("click", () => shareStory());
    });
  }

  function initCopyLinks() {
    document.querySelectorAll(".btn-link-copy").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const index = parseInt(btn.dataset.milestone, 10);
        const url = getMilestoneShareUrl(index);
        const ok = await copyText(url);
        if (ok) {
          btn.classList.add("is-copied");
          btn.textContent = "Copied!";
          showToast("Milestone link copied");
          window.setTimeout(() => {
            btn.classList.remove("is-copied");
            btn.textContent = "Copy link";
          }, 2000);
        } else {
          showToast("Could not copy link");
        }
      });
    });
  }

  function initLightbox() {
    const dialog = document.getElementById("lightbox");
    const img = document.getElementById("lightbox-img");
    const caption = document.getElementById("lightbox-caption");
    const closeBtn = document.getElementById("lightbox-close");
    if (!dialog || !img) return;

    let lastFocus = null;

    const open = (src, cap, alt) => {
      lastFocus = document.activeElement;
      img.src = src;
      img.alt = alt || cap || "Archival photograph";
      if (caption) caption.textContent = cap || "";
      document.body.classList.add("is-lightbox-open");
      if (dialog.showModal) dialog.showModal();
      else dialog.setAttribute("open", "");
      closeBtn?.focus();
    };

    const close = () => {
      document.body.classList.remove("is-lightbox-open");
      if (dialog.close) dialog.close();
      else dialog.removeAttribute("open");
      img.src = "";
      lastFocus?.focus?.();
    };

    document.querySelectorAll(".img-zoom").forEach((btn) => {
      btn.addEventListener("click", () => {
        const src = btn.dataset.lightbox;
        const cap = btn.dataset.caption;
        const innerImg = btn.querySelector("img");
        if (src) open(src, cap, innerImg?.alt);
      });
    });

    closeBtn?.addEventListener("click", close);
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) close();
    });
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      close();
    });
    dialog.addEventListener("close", () => {
      document.body.classList.remove("is-lightbox-open");
    });
  }

  function initImageFallback() {
    document.querySelectorAll("img").forEach((img) => {
      if (img.complete && img.naturalWidth === 0) img.classList.add("img-error");
      img.addEventListener("error", () => img.classList.add("img-error"), { once: true });
    });
  }

  function initMilestoneNav() {
    document.getElementById("milestone-prev")?.addEventListener("click", () => {
      goToMilestone(activeMilestone - 1);
    });
    document.getElementById("milestone-next")?.addEventListener("click", () => {
      goToMilestone(activeMilestone + 1);
    });
  }

  function initKeyboardNav() {
    document.addEventListener("keydown", (e) => {
      if (cinemaOpen || e.target.closest("dialog, input, textarea, [contenteditable]")) return;

      const timeline = document.getElementById("timeline");
      if (!timeline) return;

      const rect = timeline.getBoundingClientRect();
      const inView = rect.top < window.innerHeight * 0.6 && rect.bottom > window.innerHeight * 0.2;
      if (!inView) return;

      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        if (activeMilestone < MILESTONE_COUNT - 1) {
          e.preventDefault();
          goToMilestone(activeMilestone + 1);
        }
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        if (activeMilestone > 0) {
          e.preventDefault();
          goToMilestone(activeMilestone - 1);
        }
      }
    });
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

        const m = href.match(/^#milestone-(\d+)$/);
        if (m) {
          goToMilestone(parseInt(m[1], 10), { updateHash: false });
          return;
        }

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

    btn.addEventListener("click", () => {
      history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      scrollToTarget("#hero");
      setActiveSection("hero");
    });
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

    const heroBg = document.querySelector(".hero-bg img");
    const hero = document.getElementById("hero");
    if (heroBg && hero) {
      gsap.to(heroBg, {
        scale: 1.08,
        yPercent: 12,
        ease: "none",
        scrollTrigger: {
          trigger: hero,
          start: "top top",
          end: "bottom top",
          scrub: true,
        },
      });
    }

    const title = document.querySelector(".hero-title");
    if (title) {
      gsap.from(title, {
        letterSpacing: "0.2em",
        duration: 1.1,
        ease: "power2.out",
      });
    }
  }

  function createMilestoneObserver(rows, onRowActive) {
    const visibility = new Array(rows.length).fill(0);

    return new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const i = parseInt(entry.target.dataset.index, 10);
          if (Number.isNaN(i)) return;
          visibility[i] = entry.isIntersecting ? entry.intersectionRatio : 0;
        });

        let bestI = activeMilestone;
        let bestR = 0;
        visibility.forEach((r, i) => {
          if (r > bestR) {
            bestR = r;
            bestI = i;
          }
        });
        if (bestR > 0.1) onRowActive(bestI);
      },
      { threshold: [0, 0.15, 0.3, 0.5, 0.7, 1], rootMargin: "-22% 0px -38% 0px" }
    );
  }

  function initTimeline() {
    const rows = document.querySelectorAll(".milestone-row");
    const chips = document.querySelectorAll(".jump-chip");

    if (!rows.length) return;

    const onRowActive = (index) => highlightMilestone(index, { updateHash: true });

    highlightMilestone(0, { updateHash: false });

    if (hasGsap && !prefersReducedMotion) {
      rows.forEach((row, index) => {
        ScrollTrigger.create({
          trigger: row,
          start: "top 72%",
          end: "bottom 28%",
          onEnter: () => onRowActive(index),
          onEnterBack: () => onRowActive(index),
        });

        gsap.from(row, {
          opacity: 0,
          x: -12,
          duration: 0.55,
          ease: "power2.out",
          scrollTrigger: {
            trigger: row,
            start: "top 90%",
            toggleActions: "play none none none",
          },
        });

        const quote = row.querySelector(".milestone-quote");
        if (quote) {
          gsap.from(quote, {
            opacity: 0,
            x: 8,
            duration: 0.45,
            delay: 0.1,
            scrollTrigger: {
              trigger: row,
              start: "top 85%",
              toggleActions: "play none none none",
            },
          });
        }
      });
    } else {
      const observer = createMilestoneObserver(rows, onRowActive);
      rows.forEach((row) => observer.observe(row));
    }

    chips.forEach((chip) => {
      const activate = () => goToMilestone(parseInt(chip.dataset.index, 10));
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

    document.querySelectorAll(".progress-seg").forEach((seg) => {
      const jump = () => {
        const step = parseInt(seg.dataset.step, 10);
        if (!Number.isNaN(step)) goToMilestone(step);
      };
      seg.addEventListener("click", jump);
      seg.setAttribute("role", "button");
      seg.setAttribute("tabindex", "0");
      seg.setAttribute("aria-label", `Go to milestone ${parseInt(seg.dataset.step, 10) + 1}`);
      seg.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          jump();
        }
      });
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

    const chapterBreak = document.querySelector(".chapter-break-text");
    if (chapterBreak) {
      gsap.from(chapterBreak, {
        scale: 0.92,
        opacity: 0,
        duration: 0.8,
        ease: "power2.out",
        scrollTrigger: {
          trigger: ".chapter-break",
          start: "top 80%",
          toggleActions: "play none none none",
        },
      });
    }

  }

  function handleInitialHash() {
    const hash = window.location.hash;
    if (!hash) return;

    const target = document.querySelector(hash);
    if (!target) return;

    window.setTimeout(() => {
      const m = hash.match(/^#milestone-(\d+)$/);
      if (m) {
        const index = parseInt(m[1], 10);
        highlightMilestone(index, { updateHash: false });
        scrollToTarget(target, { duration: prefersReducedMotion ? 0 : 0.5 });
      } else {
        scrollToTarget(target, { duration: prefersReducedMotion ? 0 : 0.5 });
      }
      window.setTimeout(revealAllPassedBlocks, 500);
      window.setTimeout(revealAllPassedBlocks, 1200);
    }, 300);
  }

  function initHashNavigation() {
    window.addEventListener("popstate", () => {
      const m = window.location.hash.match(/^#milestone-(\d+)$/);
      if (m) goToMilestone(parseInt(m[1], 10), { updateHash: false, scroll: true });
    });
  }

  function buildCinemaSlides() {
    if (cinemaBuilt) return;
    const track = document.getElementById("cinema-track");
    const dots = document.getElementById("cinema-dots");
    if (!track || !dots) return;

    document.querySelectorAll(".milestone-row").forEach((row) => {
      const i = parseInt(row.dataset.index, 10);
      const img = row.querySelector(".milestone-media img");
      const slide = document.createElement("article");
      slide.className = "cinema-slide";
      slide.dataset.index = String(i);

      const bg = img
        ? `<img src="${img.src}" alt="${(img.alt || "").replace(/"/g, "&quot;")}" />`
        : "";
      const indexTxt = row.querySelector(".milestone-index")?.textContent || "";
      const dateTxt = row.querySelector(".milestone-date")?.textContent || "";
      const title = row.querySelector(".milestone-title")?.textContent || "";
      const quote = row.querySelector(".milestone-quote")?.textContent || "";
      const text = row.querySelector(".milestone-text")?.textContent || "";

      slide.innerHTML = `
        <div class="cinema-slide-bg">${bg}</div>
        <div class="cinema-slide-body">
          <div class="cinema-slide-meta">
            <span class="meta-index">${indexTxt}</span>
            <span class="meta-date">${dateTxt}</span>
          </div>
          <h3>${title}</h3>
          <blockquote class="cinema-slide-quote">${quote}</blockquote>
          <p class="cinema-slide-text">${text}</p>
        </div>
      `;
      track.appendChild(slide);

      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "cinema-dot";
      dot.dataset.index = String(i);
      dot.setAttribute("aria-label", `Go to ${MILESTONE_META[i]?.chapter || "chapter"}`);
      dot.addEventListener("click", () => cinemaGoTo(i));
      dots.appendChild(dot);
    });

    cinemaBuilt = true;
  }

  function syncCinemaSlide(index) {
    const track = document.getElementById("cinema-track");
    if (!track) return;

    track.style.transform = `translateX(-${index * 100}%)`;
    document.querySelectorAll(".cinema-dot").forEach((dot, j) => {
      dot.classList.toggle("is-active", j === index);
    });

    const counter = document.getElementById("cinema-counter");
    const title = document.getElementById("cinema-title");
    if (counter) counter.textContent = `${String(index + 1).padStart(2, "0")} / ${MILESTONE_COUNT}`;
    if (title) title.textContent = MILESTONE_META[index]?.chapter || "";

    const prev = document.getElementById("cinema-prev");
    const next = document.getElementById("cinema-next");
    if (prev) prev.disabled = index <= 0;
    if (next) next.disabled = index >= MILESTONE_COUNT - 1;
  }

  function cinemaGoTo(index) {
    const i = Math.max(0, Math.min(MILESTONE_COUNT - 1, index));
    syncCinemaSlide(i);
    highlightMilestone(i, { updateHash: true });
  }

  function openCinema(startIndex) {
    buildCinemaSlides();
    const el = document.getElementById("cinema-mode");
    if (!el) return;

    cinemaOpen = true;
    el.hidden = false;
    el.setAttribute("aria-hidden", "false");
    document.body.classList.add("cinema-open");
    cinemaGoTo(startIndex ?? activeMilestone);
    document.getElementById("cinema-close")?.focus();
  }

  function closeCinema() {
    const el = document.getElementById("cinema-mode");
    if (!el) return;

    cinemaOpen = false;
    el.hidden = true;
    el.setAttribute("aria-hidden", "true");
    document.body.classList.remove("cinema-open");

    const row = document.querySelector(`.milestone-row[data-index="${activeMilestone}"]`);
    if (row) scrollToTarget(row, { duration: prefersReducedMotion ? 0 : 0.5 });
  }

  function initCinema() {
    document.getElementById("btn-cinema")?.addEventListener("click", () => {
      setActiveSection("timeline");
      openCinema(activeMilestone);
    });

    document.getElementById("cinema-close")?.addEventListener("click", closeCinema);
    document.getElementById("cinema-prev")?.addEventListener("click", () => {
      if (activeMilestone > 0) cinemaGoTo(activeMilestone - 1);
    });
    document.getElementById("cinema-next")?.addEventListener("click", () => {
      if (activeMilestone < MILESTONE_COUNT - 1) cinemaGoTo(activeMilestone + 1);
    });

    document.addEventListener("keydown", (e) => {
      if (!cinemaOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        closeCinema();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (activeMilestone < MILESTONE_COUNT - 1) cinemaGoTo(activeMilestone + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (activeMilestone > 0) cinemaGoTo(activeMilestone - 1);
      }
    });

    const viewport = document.getElementById("cinema-viewport");
    if (!viewport || prefersReducedMotion) return;

    let startX = 0;
    viewport.addEventListener(
      "touchstart",
      (e) => {
        startX = e.touches[0].clientX;
      },
      { passive: true }
    );
    viewport.addEventListener(
      "touchend",
      (e) => {
        const dx = e.changedTouches[0].clientX - startX;
        if (Math.abs(dx) < 50) return;
        if (dx < 0 && activeMilestone < MILESTONE_COUNT - 1) cinemaGoTo(activeMilestone + 1);
        if (dx > 0 && activeMilestone > 0) cinemaGoTo(activeMilestone - 1);
      },
      { passive: true }
    );
  }

  function initAmbientSound() {
    const btn = document.getElementById("sound-toggle");
    if (!btn) return;

    const setPressed = (on) => {
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.setAttribute("aria-label", on ? "Ambient sound (on)" : "Ambient sound (off)");
    };

    let toggling = false;

    const toggleSound = () => {
      if (toggling) return;
      toggling = true;

      if (soundEnabled) {
        soundEnabled = false;
        ambientSound.stop();
        setPressed(false);
        showToast("Sound off");
        toggling = false;
        return;
      }

      ambientSound.startFromGesture().then((ok) => {
        toggling = false;
        if (ok) {
          soundEnabled = true;
          setPressed(true);
          ambientSound.setMood(MILESTONE_META[activeMilestone]?.mood || "spark");
          showToast(
            isTouchDevice
              ? "Sound on — check volume & silent switch"
              : "Sound on — winter ambience"
          );
        } else {
          showToast("Tap ♪ again · allow audio in browser");
        }
      });
    };

    btn.addEventListener(
      "pointerdown",
      () => {
        if (!soundEnabled) ambientSound.primeFromGesture();
      },
      { passive: true }
    );

    btn.addEventListener("pointerup", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      toggleSound();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && soundEnabled) {
        ambientSound.resumeIfNeeded();
      }
    });
  }

  function initResume() {
    const bar = document.getElementById("resume-bar");
    if (!bar) return;

    hideResumeBar();

    if (window.location.hash) return;

    try {
      if (localStorage.getItem(RESUME_DISMISS_KEY) === "1") return;
    } catch {
      return;
    }

    let data = null;
    try {
      data = JSON.parse(localStorage.getItem(PROGRESS_KEY));
    } catch {
      return;
    }

    if (!data || typeof data.milestone !== "number" || data.milestone < 1) return;

    const label = document.getElementById("resume-label");
    if (label) {
      label.textContent = data.chapter || MILESTONE_META[data.milestone]?.chapter || "Timeline";
    }

    const showBar = () => {
      const hero = document.getElementById("hero");
      if (!hero) return;
      const heroBottom = hero.getBoundingClientRect().bottom;
      if (heroBottom > window.innerHeight * 0.35) {
        hideResumeBar();
        return;
      }
      bar.hidden = false;
      bar.setAttribute("aria-hidden", "false");
    };

    const onContinue = () => {
      dismissResumeBar(false);
      goToMilestone(data.milestone);
      setActiveSection("timeline");
    };

    document.getElementById("resume-go")?.addEventListener("click", onContinue);
    document.getElementById("resume-dismiss")?.addEventListener("click", () => dismissResumeBar(true));
    document.getElementById("resume-close")?.addEventListener("click", () => dismissResumeBar(true));

    window.addEventListener("scroll", showBar, { passive: true });
    showBar();
  }

  function init() {
    initReadingTime();
    initImageFallback();
    initRevealBlocks();
    initFigures();
    initAtmosphere();
    initStoryClockVisibility();
    initStoryMap();
    initSpineFill();
    initSwipe();
    bindAnchorScroll();
    initNav();
    initBackToTop();
    initHero();
    initTimeline();
    initMilestoneNav();
    initKeyboardNav();
    initLegacy();
    initShare();
    initCopyLinks();
    initLightbox();
    initHashNavigation();
    initCinema();
    initAmbientSound();
    initResume();
    handleInitialHash();

    if (hasGsap) ScrollTrigger.refresh();
    revealAllPassedBlocks();
  }

  function onReady() {
    hideLoader();
    initIntroCurtain(init);
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
    window.visualViewport.addEventListener(
      "resize",
      () => {
        if (hasGsap) ScrollTrigger.refresh();
      },
      { passive: true }
    );
  }
})();
