(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ChurchReadingMatcher = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  const normalize = (value) => root.ChurchDisplayLib.normalize(value);
  const compact = (value) => normalize(value).replace(/[^\p{L}\p{N}]/gu, "");

  const READING_DECK_HINTS = ["قراءات", "القراءات", "القرائات", "قطمارس", "سنكسار"];
  const READING_LABELS = {
    pauline: ["البولس"],
    catholic: ["الكاثوليكون", "الكاثوليكون"],
    acts: ["الإبركسيس", "الابركسيس", "الإبركسيس"],
    synaxarium: ["السنكسار"],
    psalm: ["المزمور", "مزمور"],
    gospel: ["الإنجيل", "الانجيل"],
    prophecy: ["النبوة", "النبوات"],
  };
  const ALL_LABELS = Object.values(READING_LABELS).flat();
  const toArabicDigits = (value) => String(value).replace(/\d/g, (digit) => "٠١٢٣٤٥٦٧٨٩"[Number(digit)]);
  const toLatinDigits = (value) => String(value).replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));

  function isReadingDeck(deck) {
    const haystack = normalize(`${deck.source || ""} ${deck.title || ""}`);
    return READING_DECK_HINTS.some((hint) => haystack.includes(normalize(hint)));
  }

  function dayHeadingTerms(plan) {
    const terms = [plan.title, plan.periodInfo];
    const date = plan.coptic;
    const arabicDigits = (value) => String(value).replace(/\d/g, (digit) => "٠١٢٣٤٥٦٧٨٩"[Number(digit)]);
    terms.push(`${date.day} ${date.monthName}`);
    terms.push(`${arabicDigits(date.day)} ${date.monthName}`);
    terms.push(`اليوم ${date.day} من الشهر ${date.monthName}`);
    terms.push(`اليوم ${arabicDigits(date.day)} من الشهر ${date.monthName}`);
    const match = /^great-lent:(\d+)-(\d+)$/.exec(plan.source || "");
    if (match) {
      const week = Number(match[1]);
      const day = Number(match[2]);
      terms.push(`الأسبوع ${week} من الصوم الكبير`);
      if (day === 0) terms.push(`الأحد ${week} من الصوم الكبير`, "أحد الصوم الكبير");
    }
    const pentecost = /^pentecost:(\d+)-(\d+)$/.exec(plan.source || "");
    if (pentecost) {
      const week = Number(pentecost[1]);
      const day = Number(pentecost[2]);
      terms.push(`الأسبوع ${week} من الخماسين`);
      if (day === 0) terms.push(`الأحد ${week} من الخماسين`, "أحد الخماسين");
    }
    return [...new Set(terms.filter((value) => normalize(value).length >= 3).map(normalize))];
  }

  function labelTerms(reading) {
    const labels = READING_LABELS[reading.type] || [];
    if (reading.type === "psalm" || reading.type === "gospel") {
      const scope = reading.title || "";
      if (scope.includes("العشية")) return labels.concat(["العشية"]);
      if (scope.includes("باكر")) return labels.concat(["باكر"]);
      if (scope.includes("القداس")) return labels.concat(["القداس", "قداس"]);
    }
    return labels;
  }

  function findReadingCandidates(library, plan, reading) {
    const engine = root.ChurchKatameros;
    const headings = dayHeadingTerms(plan);
    const references = reading.type === "synaxarium"
      ? [reading.title]
      : engine.referenceLabels(reading.reference).map(normalize);
    const referenceCompacts = [...new Set(references.flatMap((term) => [term, toArabicDigits(term), toLatinDigits(term)]).map(compact))]
      .filter((term) => term.length >= 4);
    const typeLabels = labelTerms(reading).map(normalize).filter((term) => term.length >= 2);
    const candidates = [];

    for (const deck of Array.isArray(library && library.decks) ? library.decks : []) {
      if (!isReadingDeck(deck)) continue;
      const slides = Array.isArray(deck.slides) ? deck.slides.filter((slide) => !slide.error && !slide.hidden) : [];
      const texts = slides.map((slide) => normalize(`${slide.text || ""} ${slide.ocrText || ""}`));
      const compactTexts = texts.map(compact);
      const headingIndexes = texts.flatMap((text, index) => headings.some((term) => text.includes(term)) ? [index] : []);
      const refIndexes = compactTexts.flatMap((text, index) =>
        referenceCompacts.some((term) => text.includes(term)) ? [index] : [],
      );

      for (const refIndex of refIndexes) {
        const nearbyHeadings = headingIndexes
          .filter((index) => index <= refIndex && refIndex - index <= 12)
          .sort((a, b) => b - a);
        const headingIndex = nearbyHeadings[0] ?? null;
        const matchingLabels = texts.flatMap((text, index) =>
          index <= refIndex && refIndex - index <= 4 && typeLabels.some((term) => text.includes(term))
            ? [index]
            : [],
        );
        const startIndex = matchingLabels.length ? Math.max(...matchingLabels) : refIndex;
        const nextSectionIndexes = texts.flatMap((text, index) =>
          index > refIndex && ALL_LABELS.some((label) => text.includes(normalize(label))) ? [index] : [],
        );
        const nextSection = nextSectionIndexes.length ? Math.min(...nextSectionIndexes) : null;
        const endIndex = nextSection == null ? refIndex : Math.max(startIndex, nextSection - 1);
        const headerMatch = headingIndex != null;
        const typeMatch = matchingLabels.length > 0;
        const bounded = nextSection != null;
        candidates.push({
          source: deck.source,
          title: deck.title,
          start: Number(slides[startIndex].n),
          end: Number(slides[endIndex].n),
          referenceSlide: Number(slides[refIndex].n),
          headingSlide: headingIndex == null ? null : Number(slides[headingIndex].n),
          headerMatch,
          typeMatch,
          bounded,
          score: (headerMatch ? 4 : 0) + (typeMatch ? 2 : 0) + (bounded ? 1 : 0),
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score || a.source.localeCompare(b.source, "ar") || a.start - b.start);
    const unique = [];
    const seen = new Set();
    for (const candidate of candidates) {
      const key = `${candidate.source}|${candidate.start}|${candidate.end}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(candidate);
      }
    }
    const confident = unique.length === 1 &&
      unique[0].headerMatch && unique[0].typeMatch && unique[0].bounded;
    return {
      status: confident ? "confident" : unique.length ? "ambiguous" : "none",
      candidates: unique.slice(0, 5),
    };
  }

  return { isReadingDeck, dayHeadingTerms, findReadingCandidates };
});
