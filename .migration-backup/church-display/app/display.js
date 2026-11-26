(function () {
  "use strict";
  const imageElement = document.getElementById("slideImage");
  const generatedText = document.getElementById("generatedText");
  const blankScreen = document.getElementById("blankScreen");
  const missingSlideMessage = document.getElementById("missingSlideMessage");
  const ONLINE_TRIAL = /^\/liturgy-slides(?:\/|$)/.test(window.location.pathname);
  let deck = null;
  let slides = [];
  let currentNumber = null;
  let showHidden = false;
  let assetBase = "";
  let imageCache = new Map();
  let mode = "slide";

  function visibleSlides() {
    return (Array.isArray(deck && deck.slides) ? deck.slides : [])
      .filter((slide) => !slide.error && (showHidden || !slide.hidden));
  }
  function assetUrl(slide) {
    const source = String(deck.source || "").replace(/\\/g, "/");
    const file = String(slide.file || "");
    return new URL([source, file].filter(Boolean).join("/"), assetBase).href;
  }
  function releaseOutsideWindow(centerIndex) {
    const keep = new Set([centerIndex - 1, centerIndex, centerIndex + 1]);
    for (const [index, image] of imageCache) {
      if (keep.has(index)) continue;
      image.onload = null;
      image.onerror = null;
      image.src = "";
      imageCache.delete(index);
    }
  }
  function clearImageCache() {
    for (const image of imageCache.values()) {
      image.onload = null;
      image.onerror = null;
      image.src = "";
    }
    imageCache.clear();
  }
  function preload(index) {
    if (index < 0 || index >= slides.length || imageCache.has(index)) return;
    const image = new Image();
    image.decoding = "async";
    imageCache.set(index, image);
    image.onload = () => {
      const currentIndex = slides.findIndex((slide) => Number(slide.n) === Number(currentNumber));
      if (mode !== "slide" || index !== currentIndex) return;
      imageElement.src = image.src;
      imageElement.hidden = false;
      blankScreen.hidden = true;
      missingSlideMessage.hidden = true;
    };
    image.onerror = () => {
      const currentIndex = slides.findIndex((slide) => Number(slide.n) === Number(currentNumber));
      if (index === currentIndex) {
        imageElement.hidden = true;
        blankScreen.hidden = false;
        if (mode === "slide" && ONLINE_TRIAL) {
          missingSlideMessage.hidden = false;
          if (window.opener) {
            window.opener.postMessage({
              channel: "church-display",
              type: "image-error",
              slideNumber: Number(slides[index].n),
            }, "*");
          }
        }
      }
    };
    image.src = assetUrl(slides[index]);
  }
  function render() {
    if (mode === "black") {
      imageElement.hidden = true;
      generatedText.hidden = true;
      blankScreen.hidden = true;
      missingSlideMessage.hidden = true;
      document.body.style.background = "#000";
      return;
    }
    if (mode === "white") {
      imageElement.hidden = true;
      generatedText.hidden = true;
      blankScreen.hidden = false;
      missingSlideMessage.hidden = true;
      return;
    }
    blankScreen.hidden = true;
    missingSlideMessage.hidden = true;
    document.body.style.background = "#000";
    const index = slides.findIndex((slide) => Number(slide.n) === Number(currentNumber));
    if (index < 0) {
      clearImageCache();
      imageElement.hidden = true;
      generatedText.hidden = true;
      return;
    }
    releaseOutsideWindow(index);
    if (slides[index].generated) {
      clearImageCache();
      imageElement.removeAttribute("src");
      imageElement.hidden = true;
      generatedText.textContent = String(slides[index].text || "");
      generatedText.hidden = false;
      return;
    }
    generatedText.hidden = true;
    imageElement.hidden = false;
    const existing = imageCache.get(index);
    if (existing && existing.complete && existing.naturalWidth > 0) {
      imageElement.src = existing.src;
    } else {
      imageElement.removeAttribute("src");
      preload(index);
    }
    preload(index - 1);
    preload(index + 1);
  }

  window.addEventListener("message", (event) => {
    if (!window.opener || event.source !== window.opener || !event.data) return;
    if (event.data.channel !== "church-display-control" || event.data.type !== "state") return;
    const nextDeck = event.data.deck;
    if (!nextDeck) {
      deck = null;
      slides = [];
      currentNumber = null;
      clearImageCache();
      imageElement.removeAttribute("src");
      imageElement.hidden = true;
      generatedText.hidden = true;
      blankScreen.hidden = true;
      return;
    }
    const nextShowHidden = Boolean(event.data.showHidden);
    if (deck && (deck.source !== nextDeck.source || showHidden !== nextShowHidden)) {
      clearImageCache();
      imageElement.removeAttribute("src");
    }
    deck = nextDeck;
    showHidden = nextShowHidden;
    slides = visibleSlides();
    currentNumber = event.data.slideNumber;
    assetBase = event.data.assetBase || "";
    mode = ["black", "white"].includes(event.data.mode) ? event.data.mode : "slide";
    render();
  });

  document.addEventListener("keydown", (event) => {
    if (["ArrowRight", "ArrowLeft", "PageDown", "PageUp", " ", "Enter", "b", "B", "w", "W"].includes(event.key)) {
      if (event.key === " " || event.key.startsWith("Arrow") || event.key.startsWith("Page")) event.preventDefault();
      if (window.opener) {
        window.opener.postMessage({
          channel: "church-display",
          type: "key",
          key: event.key,
        }, "*");
      }
    }
  });

  if (window.opener) {
    window.opener.postMessage({ channel: "church-display", type: "ready" }, "*");
  }
})();
