(function () {
  "use strict";
  const imageElement = document.getElementById("slideImage");
  const blankScreen = document.getElementById("blankScreen");
  let deck = null;
  let slides = [];
  let currentNumber = null;
  let showHidden = false;
  let assetBase = "";
  let imageCache = new Map();
  let mode = "slide";

  function visibleSlides() {
    return (Array.isArray(deck && deck.slides) ? deck.slides : [])
      .filter((slide) => showHidden || !slide.hidden);
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
  function preload(index, centerIndex) {
    if (index < 0 || index >= slides.length || imageCache.has(index)) return;
    const image = new Image();
    image.decoding = "async";
    imageCache.set(index, image);
    image.onload = () => {
      if (mode !== "slide" || index !== centerIndex || currentNumber !== Number(slides[index].n)) return;
      imageElement.src = image.src;
      imageElement.hidden = false;
    };
    image.onerror = () => {
      if (index === centerIndex) {
        imageElement.hidden = true;
        blankScreen.hidden = false;
      }
    };
    image.src = assetUrl(slides[index]);
  }
  function render() {
    if (mode === "black") {
      imageElement.hidden = true;
      blankScreen.hidden = true;
      document.body.style.background = "#000";
      return;
    }
    if (mode === "white") {
      imageElement.hidden = true;
      blankScreen.hidden = false;
      return;
    }
    blankScreen.hidden = true;
    document.body.style.background = "#000";
    const index = slides.findIndex((slide) => Number(slide.n) === Number(currentNumber));
    if (index < 0) {
      imageElement.hidden = true;
      return;
    }
    imageElement.hidden = false;
    const existing = imageCache.get(index);
    if (existing && existing.complete && existing.naturalWidth > 0) {
      imageElement.src = existing.src;
    } else {
      imageElement.removeAttribute("src");
      preload(index, index);
    }
    preload(index - 1, index);
    preload(index + 1, index);
    releaseOutsideWindow(index);
  }

  window.addEventListener("message", (event) => {
    if (!window.opener || event.source !== window.opener || !event.data) return;
    if (event.data.channel !== "church-display-control" || event.data.type !== "state") return;
    const nextDeck = event.data.deck;
    if (!nextDeck) {
      deck = null;
      slides = [];
      currentNumber = null;
      imageCache.clear();
      imageElement.removeAttribute("src");
      imageElement.hidden = true;
      blankScreen.hidden = true;
      return;
    }
    if (deck && deck.source !== nextDeck.source) {
      for (const image of imageCache.values()) image.src = "";
      imageCache.clear();
      imageElement.removeAttribute("src");
    }
    deck = nextDeck;
    showHidden = Boolean(event.data.showHidden);
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
