(function () {
  "use strict";
  const E = window.ChurchKatameros;
  const M = window.ChurchReadingMatcher;
  const DATE_KEY = "church-display-selected-date-v1";
  const MAP_KEY = "church-display-readings-map-v1";
  const RULE_CHOICES_KEY = "church-display-service-rule-choices-v1";
  const $ = (id) => document.getElementById(id);
  const safeGet = (key) => {
    try { return localStorage.getItem(key); } catch (error) { return null; }
  };
  const safeSet = (key, value) => {
    try { localStorage.setItem(key, value); return true; } catch (error) { return false; }
  };
  const safeJson = (key, fallback) => {
    try { return JSON.parse(safeGet(key) || "null") || fallback; } catch (error) { return fallback; }
  };
  const pad = (number) => String(number).padStart(2, "0");
  const localDateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
  let selectedDate = safeGet(DATE_KEY) || localDateKey(new Date());
  let currentPlan = null;
  let currentReadings = [];
  let stageChoices = {};
  let refreshTimer = null;

  function mapKey(plan, reading) {
    return `${plan.source}|${plan.coptic.month}-${plan.coptic.day}|${reading.id}`;
  }
  function getLibrary() {
    return window.ChurchControl && window.ChurchControl.getLibrary() || { decks: [] };
  }
  function findDeck(source) {
    return getLibrary().decks.find((deck) => deck.source === source) || null;
  }
  function headingTitle(plan) {
    if (plan.title) return plan.title;
    if (plan.periodInfo) return plan.periodInfo;
    return `اليوم ${plan.coptic.day} ${plan.coptic.monthName}`;
  }
  function renderSummary(plan) {
    const meta = E.getDayMetadata(plan);
    const date = E.parseDate(plan.date);
    const gregorian = new Date(Date.UTC(date.year, date.month - 1, date.day))
      .toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
    $("gregorianDate").textContent = gregorian;
    $("copticDate").textContent = meta.copticLabel;
    $("dayType").textContent = `نوع اليوم: ${meta.dayType}`;
    $("daySeason").textContent = `الموسم: ${meta.season}`;
    $("dayTune").textContent = `اللحن: ${meta.tune}`;
    $("fastNames").textContent = meta.fasts.length ? `الأصوام: ${meta.fasts.join("، ")}` : "لا يوجد صوم موسمي مسجل";
    $("todayDate").value = selectedDate;
    $("todayError").hidden = true;
  }
  function dateHeadings(plan) {
    return [headingTitle(plan), `${plan.coptic.day} ${plan.coptic.monthName}`];
  }
  function renderReferences(plan) {
    const host = $("readingReferences");
    host.replaceChildren();
    currentReadings = E.flattenReadings(plan);
    for (const reading of currentReadings) {
      const item = document.createElement("article");
      item.className = "today-reading";
      const title = document.createElement("h4");
      title.textContent = reading.title;
      const reference = document.createElement("p");
      reference.className = "reading-ref";
      reference.textContent = reading.type === "synaxarium"
        ? "السنكسار المحلي"
        : E.formatReference(reading.reference);
      const status = document.createElement("span");
      status.className = "today-reading-status";
      const controls = document.createElement("div");
      controls.className = "today-reading-actions";
      item.append(title, reference, status, controls);
      host.appendChild(item);
      processReading(reading, { status, controls, item }, plan);
    }
    if (!currentReadings.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "بيانات القطمارس لا تحتوي مراجع قراءة لهذا اليوم.";
      host.appendChild(empty);
    }
  }
  function addButton(parent, text, action, className) {
    const button = document.createElement("button");
    button.textContent = text;
    if (className) button.className = className;
    button.addEventListener("click", action);
    parent.appendChild(button);
    return button;
  }
  function saveMapping(key, mapping) {
    const map = safeJson(MAP_KEY, {});
    map[key] = { ...mapping, confirmedAt: new Date().toISOString() };
    if (!safeSet(MAP_KEY, JSON.stringify(map))) $("readingMapStatus").textContent = "تعذر حفظ الخريطة محلياً.";
    else $("readingMapStatus").textContent = "اتحفظ الاختيار على الجهاز.";
  }
  function useMapping(mapping, reading, label) {
    const deck = findDeck(mapping.source);
    const start = Number(mapping.start), end = Number(mapping.end);
    const slideNumbers = deck && deck.slides.map((slide) => Number(slide.n)).filter(Number.isFinite);
    if (!deck || !Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start ||
        !slideNumbers.length || end > Math.max(...slideNumbers)) return false;
    window.ChurchControl.addServiceItem({
      source: mapping.source,
      start,
      end,
      label: label || mapping.label || reading.title,
    });
    return true;
  }
  function renderCandidates(reading, host, result, plan, key) {
    const list = document.createElement("div");
    list.className = "candidate-list";
    const map = safeJson(MAP_KEY, {});
    const remembered = map[key];
    if (remembered && useMapping(remembered, reading, reading.title)) {
      const saved = document.createElement("small");
      saved.className = "muted";
      saved.textContent = "استخدمنا ربطاً مؤكداً من قبل.";
      host.appendChild(saved);
      addButton(host, "افتح القراءة المحفوظة", () => {
        const deck = findDeck(remembered.source);
        if (deck) window.ChurchControl.selectDeck(deck, remembered.start, { start: Number(remembered.start), end: Number(remembered.end) });
      });
      return;
    }
    if (result.status === "confident") {
      const match = result.candidates[0];
      useMapping({ source: match.source, start: match.start, end: match.end }, reading, reading.title);
      host.appendChild(Object.assign(document.createElement("small"), {
        className: "muted",
        textContent: `مطابقة واضحة: ${match.title} — ${match.start}–${match.end}، أُضيفت لخدمة النهارده.`,
      }));
      return;
    }
    if (result.candidates.length) {
      const note = document.createElement("small");
      note.className = "muted";
      note.textContent = "فيه أكتر من احتمال أو حدود القراءة مش واضحة. راجع البداية والنهاية قبل الاعتماد.";
      host.append(note, list);
      for (const candidate of result.candidates) {
        const card = document.createElement("div");
        card.className = "reading-candidate";
        const name = document.createElement("p");
        name.textContent = `${candidate.title} — مرجع قريب من شريحة ${candidate.referenceSlide}`;
        const start = document.createElement("input");
        start.type = "number";
        start.min = "1";
        start.value = String(candidate.start);
        start.setAttribute("aria-label", "أول شريحة للقراءة");
        const end = document.createElement("input");
        end.type = "number";
        end.min = "1";
        end.value = String(candidate.end);
        end.setAttribute("aria-label", "آخر شريحة للقراءة");
        const choose = document.createElement("button");
        choose.textContent = "اعتمد وأضف للخدمة";
        choose.addEventListener("click", () => {
          const from = Number(start.value), to = Number(end.value);
          const deck = findDeck(candidate.source);
          if (!deck || !Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) {
            $("todayError").textContent = "اختار نطاق شرائح صحيح.";
            $("todayError").hidden = false;
            return;
          }
          const last = Math.max(...deck.slides.map((slide) => Number(slide.n) || 0));
          if (to > last) {
            $("todayError").textContent = `آخر شريحة فى العرض ${last}.`;
            $("todayError").hidden = false;
            return;
          }
          const saved = { source: candidate.source, start: from, end: to, label: reading.title };
          saveMapping(key, saved);
          useMapping(saved, reading);
        });
        card.append(name, start, end, choose);
        list.appendChild(card);
      }
    } else {
      const note = document.createElement("small");
      note.className = "muted";
      note.textContent = "مش لاقيين المرجع فى نص عروض القراءات. ممكن تختار نص بياناتنا المحلية بدل التخمين.";
      host.appendChild(note);
    }
    addButton(host, "اعرض النص من بياناتنا", async () => {
      try {
        const deck = await E.generatedSlides(reading, plan.date);
        if (!deck) throw new Error("المرجع ده ملوش نص محلي متاح للتوليد.");
        window.ChurchControl.openGeneratedDeck(deck);
        $("readingMapStatus").textContent = "أُضيفت شرائح «من بياناتنا» لخدمة النهارده.";
      } catch (error) {
        $("todayError").textContent = error && error.message || "تعذر تكوين الشرائح المحلية.";
        $("todayError").hidden = false;
      }
    });
  }
  function processReading(reading, elements, plan) {
    const key = mapKey(plan, reading);
    const library = getLibrary();
    const result = M.findReadingCandidates(library, plan, reading);
    elements.status.textContent = result.status === "confident" ? "مطابقة واضحة" :
      result.status === "ambiguous" ? "تحتاج اختيار" : "مش موجودة فى العروض";
    renderCandidates(reading, elements.controls, result, plan, key);
  }
  function matchingRule(plan) {
    const rules = window.CHURCH_SERVICE_RULES && window.CHURCH_SERVICE_RULES.rules || [];
    const meta = E.getDayMetadata(plan);
    const seasonal = rules.find((rule) => rule.seasonIncludes && meta.season.includes(rule.seasonIncludes));
    const bySource = rules
      .filter((rule) => rule.sourceIncludes && plan.source.includes(rule.sourceIncludes))
      .sort((a, b) => b.sourceIncludes.length - a.sourceIncludes.length)[0];
    return seasonal || bySource ||
      rules.find((rule) => rule.id === "default") || { id: "empty", stages: [] };
  }
  function stageOptions(stage, decks) {
    const terms = (stage.anyTitleIncludes || []).map((term) => window.ChurchDisplayLib.normalize(term));
    return decks.filter((deck) => {
      const title = window.ChurchDisplayLib.normalize(`${deck.title || ""} ${deck.source || ""}`);
      return terms.some((term) => term && title.includes(term));
    });
  }
  function renderServiceSuggestions(plan) {
    const host = $("serviceSuggestions");
    host.replaceChildren();
    const rule = matchingRule(plan);
    const decks = getLibrary().decks;
    const saved = safeJson(RULE_CHOICES_KEY, {});
    stageChoices = saved[rule.id] && saved[rule.id].dateSource === plan.source ? saved[rule.id].choices || {} : {};
    for (const stage of rule.stages || []) {
      const row = document.createElement("label");
      row.className = "service-suggestion";
      const name = document.createElement("span");
      name.textContent = stage.label;
      const select = document.createElement("select");
      select.dataset.stage = stage.label;
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "اختار العرض المناسب";
      select.appendChild(empty);
      const options = stageOptions(stage, decks);
      for (const deck of options) {
        const option = document.createElement("option");
        option.value = deck.source;
        option.textContent = deck.title;
        select.appendChild(option);
      }
      const selected = stageChoices[stage.label] || (options.length === 1 ? options[0].source : "");
      if ([...select.options].some((option) => option.value === selected)) select.value = selected;
      select.addEventListener("change", () => { stageChoices[stage.label] = select.value; });
      row.append(name, select);
      host.appendChild(row);
    }
    if (!host.children.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "مفيش قاعدة خدمة مناسبة لهذا اليوم؛ اختار العروض يدويّاً من المكتبة.";
      host.appendChild(empty);
    }
  }
  function render() {
    try {
      currentPlan = E.planForDate(selectedDate);
      renderSummary(currentPlan);
      renderReferences(currentPlan);
      renderServiceSuggestions(currentPlan);
      safeSet(DATE_KEY, selectedDate);
    } catch (error) {
      $("todayError").textContent = error && error.message || "تعذر حساب قراءات التاريخ.";
      $("todayError").hidden = false;
    }
  }
  async function restoreGeneratedServiceItems() {
    const service = window.ChurchControl && window.ChurchControl.getServiceItems() || [];
    for (const item of service) {
      if (!item || !item.generated || !item.reading || !item.generatedDate) continue;
      try {
        const deck = await E.generatedSlides(item.reading, item.generatedDate);
        window.ChurchControl.registerGeneratedDeck(deck);
      } catch (error) {
        $("readingMapStatus").textContent = `تعذر استعادة شريحة محلية: ${error && error.message || "خطأ بيانات"}`;
      }
    }
  }
  function setDate(value) {
    if (!value) return;
    selectedDate = value;
    render();
  }
  function exportMap() {
    const blob = new Blob([JSON.stringify(safeJson(MAP_KEY, {}), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "church-readings-map.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }
  async function importMap(file) {
    if (!file) return;
    try {
      const value = JSON.parse(await file.text());
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("الملف لازم يكون خريطة JSON.");
      for (const item of Object.values(value)) {
        if (!item || typeof item.source !== "string" || !Number.isInteger(Number(item.start)) ||
            !Number.isInteger(Number(item.end)) || Number(item.end) < Number(item.start)) {
          throw new Error("فيه اختيار غير صحيح فى ملف الخريطة.");
        }
      }
      if (!safeSet(MAP_KEY, JSON.stringify(value))) throw new Error("تعذر حفظ الملف محلياً.");
      $("readingMapStatus").textContent = "تم استيراد خريطة القراءات.";
      render();
    } catch (error) {
      $("readingMapStatus").textContent = error && error.message || "تعذر استيراد الخريطة.";
    } finally {
      $("importReadingMap").value = "";
    }
  }

  $("todayDate").addEventListener("change", (event) => setDate(event.target.value));
  $("chooseTodayDate").addEventListener("click", () => {
    if (typeof $("todayDate").showPicker === "function") $("todayDate").showPicker();
    else $("todayDate").focus();
  });
  $("tomorrowVespers").addEventListener("click", () => {
    const date = E.parseDate(selectedDate);
    const tomorrow = new Date(Date.UTC(date.year, date.month - 1, date.day + 1));
    setDate(localDateKey(tomorrow));
  });
  $("confirmServiceSuggestions").addEventListener("click", () => {
    if (!currentPlan || !window.ChurchControl) return;
    const rule = matchingRule(currentPlan);
    const choices = [...$("serviceSuggestions").querySelectorAll("select")]
      .map((select) => ({ stage: select.dataset.stage, source: select.value }))
      .filter((item) => item.source);
    const map = safeJson(RULE_CHOICES_KEY, {});
    map[rule.id] = { dateSource: currentPlan.source, choices: Object.fromEntries(choices.map((item) => [item.stage, item.source])) };
    safeSet(RULE_CHOICES_KEY, JSON.stringify(map));
    for (const item of choices) window.ChurchControl.addServiceItem({ source: item.source, label: item.stage });
    $("readingMapStatus").textContent = choices.length
      ? `اتضاف ${choices.length} عروض بالترتيب لخدمة النهارده.`
      : "اختار عرضاً واحداً على الأقل قبل الاعتماد.";
  });
  $("exportReadingMap").addEventListener("click", exportMap);
  $("importReadingMap").addEventListener("change", (event) => importMap(event.target.files && event.target.files[0]));
  window.addEventListener("church-library-loaded", () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(render, 0);
  });
  render();
  restoreGeneratedServiceItems();
})();
