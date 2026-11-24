(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ChurchDisplayLib = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function normalize(value) {
    return String(value == null ? "" : value)
      .normalize("NFKC")
      .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .toLocaleLowerCase("ar")
      .replace(/\s+/g, " ")
      .trim();
  }

  function naturalCompare(left, right) {
    const a = String(left);
    const b = String(right);
    const aParts = a.match(/\d+|\D+/g) || [];
    const bParts = b.match(/\d+|\D+/g) || [];
    const length = Math.min(aParts.length, bParts.length);
    for (let index = 0; index < length; index += 1) {
      const ap = aParts[index];
      const bp = bParts[index];
      if (/^\d+$/.test(ap) && /^\d+$/.test(bp)) {
        const an = BigInt(ap);
        const bn = BigInt(bp);
        if (an !== bn) return an < bn ? -1 : 1;
        if (ap.length !== bp.length) return ap.length - bp.length;
      } else {
        const comparison = ap.localeCompare(bp, "ar", {
          sensitivity: "base",
          numeric: false,
        });
        if (comparison) return comparison;
      }
    }
    return aParts.length - bParts.length || a.localeCompare(b, "ar");
  }

  function naturalSort(values, getName) {
    const nameOf = typeof getName === "function" ? getName : (value) => value;
    return [...values].sort((a, b) => naturalCompare(nameOf(a), nameOf(b)));
  }

  function visibleSlides(deck, showHidden) {
    const slides = Array.isArray(deck && deck.slides) ? deck.slides : [];
    return slides.filter((slide) => showHidden || !slide.hidden);
  }

  function navigateVisible(deck, currentNumber, delta, showHidden) {
    const slides = visibleSlides(deck, showHidden);
    if (!slides.length) return null;
    let index = slides.findIndex((slide) => Number(slide.n) === Number(currentNumber));
    if (index < 0) {
      index = slides.findIndex((slide) => Number(slide.n) > Number(currentNumber));
      if (index < 0) index = slides.length - 1;
    }
    const nextIndex = Math.max(0, Math.min(slides.length - 1, index + delta));
    return slides[nextIndex];
  }

  function slideByNumber(deck, number, showHidden) {
    const slides = visibleSlides(deck, showHidden);
    const requested = Number(number);
    return (
      slides.find((slide) => Number(slide.n) === requested) ||
      slides.find((slide) => Number(slide.n) > requested) ||
      slides[slides.length - 1] ||
      null
    );
  }

  function searchLibrary(decks, query) {
    const needle = normalize(query);
    if (!needle) return [];
    const results = [];
    for (const deck of Array.isArray(decks) ? decks : []) {
      const titleMatches = normalize(deck.title).includes(needle);
      for (const slide of Array.isArray(deck.slides) ? deck.slides : []) {
        const text = [slide.text, slide.ocrText].filter(Boolean).join(" ");
        if (titleMatches || normalize(text).includes(needle)) {
          results.push({
            deck,
            slide,
            fromImage: Boolean(slide.ocrText && normalize(slide.ocrText).includes(needle)),
          });
        }
      }
    }
    return results;
  }

  function buildLibraryTree(decks) {
    const rootNode = { name: "", folders: [], decks: [], items: [] };
    const folderByPath = new Map([["", rootNode]]);
    for (const deck of Array.isArray(decks) ? decks : []) {
      const parts = String(deck.source || deck.title || "")
        .replace(/\\/g, "/")
        .split("/")
        .filter(Boolean);
      const deckName = parts.pop() || deck.title || "عرض";
      let path = "";
      let parent = rootNode;
      for (const part of parts) {
        path = path ? path + "/" + part : part;
        let folder = folderByPath.get(path);
        if (!folder) {
          folder = { name: part, path, folders: [], decks: [], items: [] };
          folderByPath.set(path, folder);
          parent.folders.push(folder);
          parent.items.push({ kind: "folder", name: part, folder });
        }
        parent = folder;
      }
      const item = { kind: "deck", name: deckName, deck };
      parent.decks.push(item);
      parent.items.push(item);
    }
    const sortRecursively = (node) => {
      node.folders = naturalSort(node.folders, (folder) => folder.name);
      node.decks = naturalSort(node.decks, (item) => item.name);
      node.items = naturalSort(node.items, (item) => item.name);
      node.folders.forEach(sortRecursively);
    };
    sortRecursively(rootNode);
    return rootNode;
  }

  function loadLibrary(candidate) {
    if (!candidate || !Array.isArray(candidate.decks)) {
      throw new Error("ملف المكتبة غير صالح أو لا يحتوي على عروض.");
    }
    return {
      generatedAt: candidate.generatedAt || "",
      decks: candidate.decks.filter(
        (deck) =>
          deck &&
          typeof deck.source === "string" &&
          Array.isArray(deck.slides),
      ),
    };
  }

  function slideAssetPath(deck, slide) {
    return [String(deck.source || "").replace(/\\/g, "/"), String(slide.file || "")]
      .filter(Boolean)
      .join("/");
  }

  return {
    normalize,
    naturalCompare,
    naturalSort,
    visibleSlides,
    navigateVisible,
    slideByNumber,
    searchLibrary,
    buildLibraryTree,
    loadLibrary,
    slideAssetPath,
  };
});
