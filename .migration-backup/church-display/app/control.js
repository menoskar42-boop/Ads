(function () {
  "use strict";
  const L = window.ChurchDisplayLib;
  const $ = (id) => document.getElementById(id);
  const PATH_KEY = "church-display.library-path.v1";
  const SERVICE_KEY = "church-display.today-service.v1";
  let library = { generatedAt: "", decks: [] };
  let libraryScript = null;
  let assetBase = "";
  let selectedDeck = null;
  let selectedSlide = null;
  let displayWindow = null;
  let serviceItems = [];
  let showHidden = false;
  let generatedDecks = [];
  let activeRange = null;

  function safeGet(key) {
    try { return window.localStorage.getItem(key); } catch (_) { return null; }
  }
  function safeSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (_) {}
  }
  function safeJsonGet(key, fallback) {
    try {
      const value = JSON.parse(window.localStorage.getItem(key) || "null");
      return value == null ? fallback : value;
    } catch (_) { return fallback; }
  }
  function localAssetUrl(deck, slide) {
    return new URL(L.slideAssetPath(deck, slide), assetBase).href;
  }
  function setStatus(message) { $("displayStatus").textContent = message; }

  function loadLibraryScript(path) {
    window.dispatchEvent(new CustomEvent("church-library-loading"));
    let libraryUrl;
    try {
      libraryUrl = new URL(path, window.location.href);
    } catch (_) {
      setStatus("مسار المكتبة غير صالح.");
      window.dispatchEvent(new CustomEvent("church-library-error"));
      return;
    }
    if (libraryUrl.protocol !== "file:") {
      setStatus("المكتبة لازم تكون ملفاً محلياً على الجهاز.");
      window.dispatchEvent(new CustomEvent("church-library-error"));
      return;
    }
    if (libraryScript) libraryScript.remove();
    window.CHURCH_LIBRARY = undefined;
    const script = document.createElement("script");
    libraryScript = script;
    script.src = libraryUrl.href;
    script.onload = () => {
      try {
        library = L.loadLibrary(window.CHURCH_LIBRARY);
        assetBase = new URL(".", script.src).href;
        safeSet(PATH_KEY, path);
        renderTree();
        renderSearch();
        renderService();
        setStatus(`اتحمّلت ${library.decks.length} عروض`);
        window.dispatchEvent(new CustomEvent("church-library-loaded"));
      } catch (error) {
        library = { generatedAt: "", decks: [] };
        renderTree();
        setStatus(error.message || "تعذر قراءة ملف المكتبة.");
        window.dispatchEvent(new CustomEvent("church-library-error"));
      }
    };
    script.onerror = () => {
      library = { generatedAt: "", decks: [] };
      renderTree();
      setStatus("تعذر فتح library.js. راجع المسار والصلاحيات.");
      window.dispatchEvent(new CustomEvent("church-library-error"));
    };
    document.head.appendChild(script);
  }

  function titleFor(deck) {
    return deck.title || L.slideAssetPath(deck, { file: "" }).split("/").slice(-2, -1)[0] || "عرض";
  }

  function renderTree() {
    const host = $("libraryTree");
    host.replaceChildren();
    if (!library.decks.length) {
      host.textContent = "لم يتم تحميل عروض.";
      host.classList.add("muted");
      return;
    }
    host.classList.remove("muted");
    const tree = L.buildLibraryTree(library.decks);
    const renderNode = (node, parent) => {
      for (const item of node.items) {
        if (item.kind === "folder") {
          const details = document.createElement("details");
          details.className = "tree-folder";
          const summary = document.createElement("summary");
          summary.textContent = item.name;
          details.appendChild(summary);
          const children = document.createElement("div");
          children.className = "tree-children";
          renderNode(item.folder, children);
          details.appendChild(children);
          parent.appendChild(details);
          continue;
        }
        const button = document.createElement("button");
        button.className = "tree-deck";
        button.textContent = item.name;
        button.addEventListener("click", () => selectDeck(item.deck));
        parent.appendChild(button);
      }
    };
    renderNode(tree, host);
  }

  function renderSearch() {
    const host = $("searchResults");
    const query = $("searchInput").value;
    host.replaceChildren();
    const results = L.searchLibrary(library.decks, query)
      .filter((result) => showHidden || !result.slide.hidden)
      .slice(0, 80);
    if (!L.normalize(query)) return;
    if (!results.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "مفيش نتيجة مطابقة.";
      host.appendChild(empty);
      return;
    }
    for (const result of results) {
      const button = document.createElement("button");
      button.className = "search-result";
      const title = document.createElement("span");
      title.textContent = `${titleFor(result.deck)} — شريحة ${result.slide.n}`;
      const detail = document.createElement("small");
      detail.textContent = result.fromImage
        ? "من صورة — ممكن فيها غلط"
        : String(result.slide.text || "").trim().slice(0, 120);
      button.append(title, detail);
      button.addEventListener("click", () => selectDeck(result.deck, result.slide.n));
      host.appendChild(button);
    }
  }

  function allDecks() {
    return library.decks.concat(generatedDecks);
  }

  function slidesFor(deck, range) {
    let slides = L.visibleSlides(deck, showHidden);
    if (range) slides = slides.filter((slide) => Number(slide.n) >= range.start && Number(slide.n) <= range.end);
    return slides;
  }

  function selectDeck(deck, preferredNumber, range) {
    selectedDeck = deck;
    activeRange = range && Number.isFinite(range.start) && Number.isFinite(range.end) ? range : null;
    const slides = slidesFor(deck, activeRange);
    selectedSlide = preferredNumber
      ? slides.find((slide) => Number(slide.n) === Number(preferredNumber)) || slides.find((slide) => Number(slide.n) > Number(preferredNumber)) || slides[slides.length - 1] || null
      : slides[0] || null;
    renderSelection();
    sendState("slide");
  }

  function renderSelection() {
    const slides = selectedDeck ? slidesFor(selectedDeck, activeRange) : [];
    const index = selectedSlide
      ? slides.findIndex((slide) => Number(slide.n) === Number(selectedSlide.n))
      : -1;
    $("deckTitle").textContent = selectedDeck ? titleFor(selectedDeck) : "لم يتم اختيار عرض";
    $("slideNumber").value = selectedSlide ? selectedSlide.n : "";
    $("slideCount").textContent = index >= 0 ? `${index + 1} / ${slides.length}` : "— / —";
    $("slideText").textContent = selectedSlide
      ? String(selectedSlide.text || selectedSlide.ocrText || "").trim().slice(0, 240) || "لا يوجد نص مستخرج."
      : "اختر عرضاً من المكتبة.";
    renderThumbnails(slides);
  }

  function renderThumbnails(slides) {
    const host = $("thumbnails");
    host.replaceChildren();
    if (!selectedDeck) return;
    for (const slide of slides) {
      const button = document.createElement("button");
      button.className = "thumb";
      button.setAttribute("aria-label", `افتح الشريحة ${slide.n}`);
      const image = document.createElement("img");
      if (slide.generated) {
        image.remove();
        const text = document.createElement("span");
        text.className = "thumb-text";
        text.textContent = String(slide.text || "").slice(0, 100);
        button.appendChild(text);
      } else {
        image.loading = "lazy";
        image.decoding = "async";
        image.alt = "";
        image.src = localAssetUrl(selectedDeck, slide);
        button.appendChild(image);
      }
      const number = document.createElement("span");
      number.textContent = slide.n;
      button.append(number);
      button.addEventListener("click", () => {
        selectedSlide = slide;
        renderSelection();
        sendState("slide");
      });
      host.appendChild(button);
    }
  }

  function changeSlide(delta) {
    if (!selectedDeck || !selectedSlide) return;
    const slides = slidesFor(selectedDeck, activeRange);
    let index = slides.findIndex((slide) => Number(slide.n) === Number(selectedSlide.n));
    index = Math.max(0, Math.min(slides.length - 1, index + delta));
    selectedSlide = slides[index] || null;
    renderSelection();
    sendState("slide");
  }

  function sendState(mode) {
    if (!displayWindow || displayWindow.closed) return;
    displayWindow.postMessage({
      channel: "church-display-control",
      type: "state",
      mode: mode || "slide",
      deck: selectedDeck,
      slideNumber: selectedSlide ? selectedSlide.n : null,
      showHidden,
      assetBase,
      range: activeRange,
    }, "*");
  }

  function renderService() {
    const host = $("serviceList");
    host.replaceChildren();
    serviceItems.forEach((storedItem, index) => {
      const serviceItem = typeof storedItem === "string" ? { source: storedItem } : storedItem;
      const deck = allDecks().find((item) => item.source === serviceItem.source);
      if (!deck) return;
      const row = document.createElement("li");
      const actions = document.createElement("div");
      actions.className = "service-item";
      const open = document.createElement("button");
      open.textContent = `${serviceItem.label || titleFor(deck)}${serviceItem.start && serviceItem.end ? ` — ${serviceItem.start}–${serviceItem.end}` : ""}${deck.generated ? " — من بياناتنا" : ""}`;
      open.addEventListener("click", () => selectDeck(deck, serviceItem.start, serviceItem.start && serviceItem.end ? { start: Number(serviceItem.start), end: Number(serviceItem.end) } : null));
      const up = document.createElement("button");
      up.className = "mini";
      up.textContent = "↑";
      up.setAttribute("aria-label", "قدّم في ترتيب الخدمة");
      up.disabled = index === 0;
      up.addEventListener("click", () => moveService(index, -1));
      const down = document.createElement("button");
      down.className = "mini";
      down.textContent = "↓";
      down.setAttribute("aria-label", "أخّر في ترتيب الخدمة");
      down.disabled = index === serviceItems.length - 1;
      down.addEventListener("click", () => moveService(index, 1));
      const remove = document.createElement("button");
      remove.className = "mini";
      remove.textContent = "حذف";
      remove.setAttribute("aria-label", "احذف من خدمة النهارده");
      remove.addEventListener("click", () => {
        serviceItems.splice(index, 1);
        persistService();
      });
      actions.append(open, up, down, remove);
      row.appendChild(actions);
      host.appendChild(row);
    });
    if (!host.children.length) {
      const empty = document.createElement("li");
      empty.className = "muted";
      empty.textContent = "أضف العروض بالترتيب المطلوب.";
      host.appendChild(empty);
    }
  }

  function persistService() {
    safeSet(SERVICE_KEY, JSON.stringify(serviceItems));
    renderService();
  }

  function addServiceItem(item) {
    if (!item || typeof item.source !== "string") return false;
    const duplicate = serviceItems.some((value) => {
      const current = typeof value === "string" ? { source: value } : value;
      return current.source === item.source && Number(current.start || 0) === Number(item.start || 0) &&
        Number(current.end || 0) === Number(item.end || 0);
    });
    if (duplicate) return false;
    serviceItems.push(item);
    persistService();
    return true;
  }

  function openGeneratedDeck(deck) {
    if (!deck || !deck.generated || !deck.slides.length) return;
    registerGeneratedDeck(deck);
    addServiceItem({
      source: deck.source,
      start: 1,
      end: deck.slides.length,
      label: deck.title,
      generated: true,
      reading: deck.reading,
      generatedDate: deck.generatedDate,
    });
    selectDeck(deck, 1, { start: 1, end: deck.slides.length });
  }

  function registerGeneratedDeck(deck) {
    if (!deck || !deck.generated) return;
    if (!generatedDecks.some((item) => item.source === deck.source)) generatedDecks.push(deck);
    renderService();
  }

  function setServiceItems(items) {
    serviceItems = Array.isArray(items) ? items : [];
    persistService();
  }

  function moveService(index, delta) {
    const destination = index + delta;
    if (destination < 0 || destination >= serviceItems.length) return;
    [serviceItems[index], serviceItems[destination]] = [serviceItems[destination], serviceItems[index]];
    persistService();
  }

  function jumpToNumber() {
    if (!selectedDeck) return;
    const target = Number($("slideNumber").value);
    const slides = slidesFor(selectedDeck, activeRange);
    selectedSlide = slides.find((slide) => Number(slide.n) === target) ||
      slides.find((slide) => Number(slide.n) > target) || slides[slides.length - 1] || null;
    renderSelection();
    sendState("slide");
  }

  $("loadLibrary").addEventListener("click", () => loadLibraryScript($("libraryPath").value.trim()));
  $("libraryPath").value = safeGet(PATH_KEY) || "../out/library.js";
  $("openDisplay").addEventListener("click", () => {
    displayWindow = window.open("./display.html", "church-display", "width=1280,height=720");
    if (!displayWindow) {
      setStatus("المتصفح منع النافذة؛ اسمح بفتح النوافذ لهذا الملف.");
      return;
    }
    setStatus("مستني نافذة العرض…");
  });
  $("searchInput").addEventListener("input", renderSearch);
  $("prevSlide").addEventListener("click", () => changeSlide(-1));
  $("nextSlide").addEventListener("click", () => changeSlide(1));
  $("slideNumber").addEventListener("keydown", (event) => {
    if (event.key === "Enter") jumpToNumber();
  });
  $("showHidden").addEventListener("change", (event) => {
    showHidden = event.target.checked;
    if (selectedDeck && selectedSlide && selectedSlide.hidden && !showHidden) {
      const slides = slidesFor(selectedDeck, activeRange);
      selectedSlide = slides.find((slide) => Number(slide.n) > Number(selectedSlide.n)) || slides[slides.length - 1] || null;
    }
    renderSelection();
    sendState("slide");
  });
  $("blackScreen").addEventListener("click", () => sendState("black"));
  $("whiteScreen").addEventListener("click", () => sendState("white"));
  $("addToService").addEventListener("click", () => {
    if (!selectedDeck) return;
    addServiceItem({
      source: selectedDeck.source,
      ...(activeRange ? { start: activeRange.start, end: activeRange.end } : {}),
      label: titleFor(selectedDeck),
    });
  });
  window.addEventListener("message", (event) => {
    if (!displayWindow || event.source !== displayWindow || !event.data) return;
    if (event.data.channel === "church-display" && event.data.type === "ready") {
      setStatus("شاشة العرض متصلة");
      sendState("slide");
    } else if (event.data.channel === "church-display" && event.data.type === "key") {
      handleKey(event.data.key);
    }
  });

  function handleKey(key) {
    if (key === "ArrowRight" || key === "PageDown" || key === " " || key === "Enter") changeSlide(1);
    else if (key === "ArrowLeft" || key === "PageUp") changeSlide(-1);
    else if (String(key).toLowerCase() === "b") sendState("black");
    else if (String(key).toLowerCase() === "w") sendState("white");
  }
  document.addEventListener("keydown", (event) => {
    if (!L.shouldRouteControlKey(event.target && event.target.tagName)) return;
    if (["ArrowRight", "ArrowLeft", "PageDown", "PageUp", " "].includes(event.key)) event.preventDefault();
    handleKey(event.key);
  });

  const storedService = safeJsonGet(SERVICE_KEY, []);
  serviceItems = Array.isArray(storedService)
    ? storedService.filter((item) => typeof item === "string" || item && typeof item.source === "string")
    : [];
  renderService();
  loadLibraryScript($("libraryPath").value);
  window.ChurchControl = {
    getLibrary: () => library,
    getServiceItems: () => serviceItems.slice(),
    setServiceItems,
    addServiceItem,
    selectDeck,
    openGeneratedDeck,
    registerGeneratedDeck,
  };
})();
