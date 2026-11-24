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
    let libraryUrl;
    try {
      libraryUrl = new URL(path, window.location.href);
    } catch (_) {
      setStatus("مسار المكتبة غير صالح.");
      return;
    }
    if (libraryUrl.protocol !== "file:") {
      setStatus("المكتبة لازم تكون ملفاً محلياً على الجهاز.");
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
        setStatus(`اتحمّلت ${library.decks.length} عروض`);
      } catch (error) {
        library = { generatedAt: "", decks: [] };
        renderTree();
        setStatus(error.message || "تعذر قراءة ملف المكتبة.");
      }
    };
    script.onerror = () => {
      library = { generatedAt: "", decks: [] };
      renderTree();
      setStatus("تعذر فتح library.js. راجع المسار والصلاحيات.");
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

  function slidesFor(deck) {
    return L.visibleSlides(deck, showHidden);
  }

  function selectDeck(deck, preferredNumber) {
    selectedDeck = deck;
    const slides = slidesFor(deck);
    selectedSlide = preferredNumber
      ? L.slideByNumber(deck, preferredNumber, showHidden)
      : slides[0] || null;
    renderSelection();
    sendState("slide");
  }

  function renderSelection() {
    const slides = selectedDeck ? slidesFor(selectedDeck) : [];
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
      image.loading = "lazy";
      image.decoding = "async";
      image.alt = "";
      image.src = localAssetUrl(selectedDeck, slide);
      const number = document.createElement("span");
      number.textContent = slide.n;
      button.append(image, number);
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
    selectedSlide = L.navigateVisible(selectedDeck, selectedSlide.n, delta, showHidden);
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
    }, "*");
  }

  function renderService() {
    const host = $("serviceList");
    host.replaceChildren();
    serviceItems.forEach((source, index) => {
      const deck = library.decks.find((item) => item.source === source);
      if (!deck) return;
      const row = document.createElement("li");
      const actions = document.createElement("div");
      actions.className = "service-item";
      const open = document.createElement("button");
      open.textContent = titleFor(deck);
      open.addEventListener("click", () => selectDeck(deck));
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

  function moveService(index, delta) {
    const destination = index + delta;
    if (destination < 0 || destination >= serviceItems.length) return;
    [serviceItems[index], serviceItems[destination]] = [serviceItems[destination], serviceItems[index]];
    persistService();
  }

  function jumpToNumber() {
    if (!selectedDeck) return;
    selectedSlide = L.slideByNumber(selectedDeck, $("slideNumber").value, showHidden);
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
      selectedSlide = L.slideByNumber(selectedDeck, selectedSlide.n, false);
    }
    renderSelection();
    sendState("slide");
  });
  $("blackScreen").addEventListener("click", () => sendState("black"));
  $("whiteScreen").addEventListener("click", () => sendState("white"));
  $("addToService").addEventListener("click", () => {
    if (!selectedDeck || serviceItems.includes(selectedDeck.source)) return;
    serviceItems.push(selectedDeck.source);
    persistService();
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
  serviceItems = Array.isArray(storedService) ? storedService.filter((item) => typeof item === "string") : [];
  renderService();
  loadLibraryScript($("libraryPath").value);
})();
