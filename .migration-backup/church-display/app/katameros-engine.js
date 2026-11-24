(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ChurchKatameros = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const MONTHS = ["", "توت", "بابه", "هاتور", "كيهك", "طوبة", "أمشير", "برمهات", "برموده", "بشنس", "بؤونة", "أبيب", "مسرى", "النسيء"];
  const ORDINALS = ["", "الأول", "الثانى", "الثالث", "الرابع", "الخامس"];
  const NUMBERED_BOOK_NAMES = new Map([
    [9, "صموئيل الأول"], [10, "صموئيل الثاني"],
    [11, "الملوك الأول"], [12, "الملوك الثاني"],
    [13, "أخبار الأيام الأول"], [14, "أخبار الأيام الثاني"],
    [46, "كورنثوس الأولى"], [47, "كورنثوس الثانية"],
    [52, "تسالونيكي الأولى"], [53, "تسالونيكي الثانية"],
    [54, "تيموثاوس الأولى"], [55, "تيموثاوس الثانية"],
    [60, "بطرس الأولى"], [61, "بطرس الثانية"],
    [62, "يوحنا الأولى"], [63, "يوحنا الثانية"], [64, "يوحنا الثالثة"],
    [70, "المكابيين الأول"],
  ]);
  const SECTION_TITLES = {
    vespers: "العشية", matins: "باكر", liturgy: "القداس",
    "hour-1": "الساعة الأولى", "hour-3": "الساعة الثالثة", "hour-6": "الساعة السادسة",
    "hour-9": "الساعة التاسعة", "hour-11": "الساعة الحادية عشر", "hour-12": "الساعة الثانية عشر",
  };
  const HOUR_TOKENS = {
    FirstHour: "الساعة الأولى", ThirdHour: "الساعة الثالثة", SixthHour: "الساعة السادسة",
    NinthHour: "الساعة التاسعة", EleventhHour: "الساعة الحادية عشر",
    TwelfthHour: "الساعة الثانية عشر", EveOf: "عشية",
  };
  const FEASTS = [
    { feast: "Christmas", jan: 7, build: "ConstructChristmas" },
    { feast: "NativityParamoun", paramoun: true, build: "ConstructNativityParamoun" },
    { feast: "Ascension", easter: 39 }, { feast: "Pentecost", easter: 49 },
    { feast: "ThomasSunday", easter: 7 },
    { feast: "LazarusSaturday", easter: -8, build: "ConstructLazarusSaturday" },
    { feast: "TempleEntrance", coptic: [6, 8], build: "ConstructTempleEntrance" },
    { feast: "EgyptEntrance", coptic: [9, 24], build: "ConstructEgyptEntrance" },
    { feast: "Annunciation", coptic: [7, 29], build: "ConstructAnnunciation" },
    { feast: "Cross", coptic: [7, 10], build: "ConstructFeastOfTheCross" },
    { feast: "Cross", coptic: [1, 17], build: "ConstructFeastOfTheCross" },
    { feast: "Cross", coptic: [1, 18], build: "ConstructFeastOfTheCross2" },
    { feast: "Cross", coptic: [1, 19], build: "ConstructFeastOfTheCross3" },
    { feast: "FastOfNinevah", easter: -69, build: "ConstructFastOfNinevah1" },
    { feast: "FastOfNinevah", easter: -68, build: "ConstructFastOfNinevah2" },
    { feast: "FastOfNinevah", easter: -67, build: "ConstructFastOfNinevah3" },
    { feast: "Jonas", easter: -66, build: "ConstructFeastOfJonas" },
    { feast: "PalmSunday", easter: -7, build: "ConstructPalmSunday" },
    { feast: "PaschaMonday", easter: -6, build: "ConstructPaschaMonday" },
    { feast: "PaschaTuesday", easter: -5, build: "ConstructPaschaTuesday" },
    { feast: "TheophanyParamoun", coptic: [5, 10], build: "ConstructTheophanyParamoun" },
    { feast: "Theophany", coptic: [5, 11], build: "ConstructTheophany" },
    { feast: "WeddingOfCana", coptic: [5, 13], build: "ConstructWeddingOfCana" },
    { feast: "GreatLentPreparationSaturday", easter: -57, build: "ConstructGreatLentPreparationSaturday" },
    { feast: "GreatLentPreparationSunday", easter: -56, build: "ConstructGreatLentPreparationSunday" },
    { feast: "PaschaWednesday", easter: -4, build: "ConstructPaschaWednesday" },
    { feast: "PaschaThursday", easter: -3, build: "ConstructPaschaThursday" },
    { feast: "PaschaFriday", easter: -2, build: "ConstructPaschaFriday" },
    { feast: "PaschaSaturday", easter: -1, build: "ConstructPaschaSaturday" },
    { feast: "Easter", easter: 0, build: "ConstructEaster" },
    { feast: "Nayrouz", coptic: [1, 1], build: "ConstructNayrouz" },
    { feast: "Circumcision", coptic: [5, 6] },
    { feast: "Apostles", coptic: [11, 5] },
    { feast: "Transfiguration", coptic: [12, 13] },
    { feast: "StMaryAssumption", coptic: [12, 16] },
  ];

  const data = () => {
    const value = root.CHURCH_KATAMEROS_DATA;
    if (!value) throw new Error("بيانات القطمارس المحلية غير محمّلة.");
    return value;
  };
  const dayNum = (year, month, day) => Math.floor(Date.UTC(year, month - 1, day) / 86400000);
  const fromDayNum = (number) => {
    const date = new Date(number * 86400000);
    return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
  };
  const weekdayOf = (number) => new Date(number * 86400000).getUTCDay();
  const COPTIC_ANCHOR = { year: 1743, dayNum: dayNum(2026, 9, 11) };

  function copticNewYear(year) {
    const leapsBefore = (value) => Math.floor(value / 4);
    return COPTIC_ANCHOR.dayNum + 365 * (year - COPTIC_ANCHOR.year) +
      (leapsBefore(year) - leapsBefore(COPTIC_ANCHOR.year));
  }
  function toCoptic(number) {
    let year = COPTIC_ANCHOR.year + Math.floor((number - COPTIC_ANCHOR.dayNum) / 365.25);
    while (copticNewYear(year + 1) <= number) year++;
    while (copticNewYear(year) > number) year--;
    const offset = number - copticNewYear(year);
    return { year, month: Math.floor(offset / 30) + 1, day: offset % 30 + 1 };
  }
  function fromCoptic(year, month, day) {
    return copticNewYear(year) + 30 * (month - 1) + day - 1;
  }
  function easterDayNum(year) {
    const a = year % 19, b = year % 4, c = year % 7;
    const x = (19 * a + 16) % 30;
    const y = (2 * b + 4 * c + 6 * x) % 7;
    return dayNum(year, 3, 31) + x + y + 3;
  }
  function parseDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
    if (!match) throw new Error("التاريخ لازم يبقى YYYY-MM-DD");
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const number = dayNum(year, month, day);
    const actual = fromDayNum(number);
    if (actual.y !== year || actual.m !== month || actual.d !== day) throw new Error("التاريخ غير صحيح.");
    return { year, month, day, number };
  }
  function firstBy(rows, keyFn) {
    const map = new Map();
    for (const row of rows) if (!map.has(keyFn(row))) map.set(keyFn(row), row);
    return map;
  }
  function sources() {
    const d = data();
    return {
      annual: firstBy(d.readings_annual, (r) => `${r.Month_Number}-${r.Day}`),
      sunday: firstBy(d.readings_sunday, (r) => `${r.Month_Number}-${r.Day}`),
      lent: firstBy(d.readings_great_lent, (r) => `${r.Week}-${r.DayOfWeek}`),
      pentecost: firstBy(d.readings_pentecost, (r) => `${r.Week}-${r.DayOfWeek}`),
      feasts: d.feasts_readings,
      feastNames: Object.fromEntries(d.feasts_ar.map((f) => [f.name.toLowerCase(), f.ar])),
    };
  }
  function psalmGospel(psalm, gospel, joyous = true) {
    return { type: "psalm-gospel", psalms: psalm ? [psalm] : [], gospels: [gospel], joyous };
  }
  function fromRefs(row) {
    const out = [];
    if (row.V_Psalm_Ref) out.push({ id: "vespers", title: SECTION_TITLES.vespers, subSections: [psalmGospel(row.V_Psalm_Ref, row.V_Gospel_Ref)] });
    out.push({
      id: "matins",
      title: SECTION_TITLES.matins,
      subSections: [
        ...(row.Prophecy ? [{ type: "prophecy", ref: row.Prophecy }] : []),
        psalmGospel(row.M_Psalm_Ref, row.M_Gospel_Ref),
      ],
    });
    out.push({
      id: "liturgy",
      title: SECTION_TITLES.liturgy,
      subSections: [
        { type: "pauline", ref: row.P_Gospel_Ref },
        { type: "catholic", ref: row.C_Gospel_Ref },
        { type: "acts", ref: row.X_Gospel_Ref },
        { type: "synaxarium" },
        ...(row.L_Gospel_Ref ? [psalmGospel(row.L_Psalm_Ref, row.L_Gospel_Ref)] : []),
      ],
    });
    return out;
  }
  function feastSections(name, d) {
    const feast = (d.feasts || d.feasts_readings)[name];
    if (!feast) throw new Error(`قراءات العيد ${name} مش موجودة فى بيانات القطمارس.`);
    if (feast.annual) {
      const row = sources().annual.get(`${feast.annual.month}-${feast.annual.day}`);
      return { sections: fromRefs(row), annual: feast.annual };
    }
    const feastNames = d.feastNames || Object.fromEntries(data().feasts_ar.map((item) => [item.name.toLowerCase(), item.ar]));
    const next = feast.nextDayFeast ? feastNames[String(feast.nextDayFeast).toLowerCase()] || "" : "";
    return {
      sections: feast.sections.map((section) => ({
        id: section.id,
        title: section.title
          ? String(section.title).replace(/\{(\w+)\}/g, (_, key) => key === "NextDay" ? next : HOUR_TOKENS[key] || "")
          : SECTION_TITLES[section.id] || section.id,
        subSections: section.subSections.map((sub) => ({ ...sub })),
      })),
    };
  }
  function isNativityParamoun(number, copticMonth) {
    const { y } = fromDayNum(number);
    const date = dayNum(y, 1, 6);
    const weekday = weekdayOf(date);
    return copticMonth === 4 &&
      ((weekday === 0 && number >= date - 2 && number < date) ||
        (weekday === 6 && number >= date - 1 && number < date) || number === date);
  }
  function dayFeast(number, coptic, easterDiff, d) {
    const { m, d: day } = fromDayNum(number);
    for (const feast of FEASTS) {
      if (feast.easter !== undefined && feast.easter === easterDiff) return feast;
      if (feast.coptic && feast.coptic[0] === coptic.month && feast.coptic[1] === coptic.day) {
        if (easterDiff >= -8 && easterDiff <= 0) continue;
        return feast;
      }
      if (feast.jan !== undefined && m === 1 && day === feast.jan) return feast;
      if (feast.paramoun && isNativityParamoun(number, coptic.month)) return feast;
    }
    return null;
  }
  function sundaysElapsed(coptic) {
    let count = 0;
    for (let day = 1; day <= coptic.day; day++) {
      if (weekdayOf(fromCoptic(coptic.year, coptic.month, day)) === 0) count++;
    }
    return count;
  }
  function specialCase(number, coptic, d) {
    const weekday = weekdayOf(number), { y, m } = fromDayNum(number);
    if (coptic.month === 4 && weekday === 0 && coptic.day === 30) {
      return { source: "special:kiahk-30-sunday", title: null, sections: fromRefs(sources().annual.get("4-30")) };
    }
    if (coptic.month === 4 && coptic.day === 29 && toCoptic(dayNum(y, 1, 7)).day === 28) {
      return { source: "special:kiahk-29", title: null, sections: fromRefs(sources().annual.get("4-29")) };
    }
    const paramoun = dayNum(y + 1, 1, 6);
    if (m !== 1 && weekdayOf(paramoun) === 0 && weekday === 0) {
      const sunday = sundaysElapsed(coptic);
      if (coptic.month === 3 && coptic.day + 7 > 30) {
        return { source: "special:kiahk-sunday-1", title: null, sections: fromRefs(sources().sunday.get("4-1")) };
      }
      if (coptic.month === 4) {
        return { source: `special:kiahk-sunday-${sunday + 1}`, title: null, sections: fromRefs(sources().sunday.get(`4-${sunday + 1}`)) };
      }
    }
    if (coptic.month === 5) {
      const theophanyWeekday = weekdayOf(fromCoptic(coptic.year, 5, 11));
      if ((theophanyWeekday === 1 && ((weekday === 5 && coptic.day === 8) || (weekday === 6 && coptic.day === 9))) ||
          (theophanyWeekday === 0 && weekday === 5 && coptic.day === 9)) {
        return {
          source: "special:theophany-paramoun",
          title: d.feastNames.theophanyparamoun,
          sections: feastSections("ConstructTheophanyParamounSpecial", d).sections,
        };
      }
    }
    return null;
  }
  function planForDate(date) {
    const parsed = parseDate(date);
    const d = sources();
    const coptic = toCoptic(parsed.number);
    const weekday = weekdayOf(parsed.number);
    const base = {
      date,
      weekday,
      coptic: { ...coptic, monthName: MONTHS[coptic.month] },
      synaxarium: d.feasts ? [] : [],
    };
    const synaxarium = data().synaxarium_ar
      .filter((entry) => entry.month === coptic.month && entry.day === coptic.day)
      .map(({ order, title, slug }) => ({ order, title, slug: slug || null }));
    base.synaxarium = synaxarium;
    const done = (source, title, sections, periodInfo = null) => ({ ...base, source, title, periodInfo, sections });
    const special = specialCase(parsed.number, coptic, d);
    if (special) return done(special.source, special.title, special.sections);
    const easter = easterDayNum(parsed.year);
    const easterDiff = parsed.number - easter;
    const feast = dayFeast(parsed.number, coptic, easterDiff, d);
    const feastTitle = feast ? d.feastNames[feast.feast.toLowerCase()] || null : null;
    if (feast && feast.build) return done(`feast:${feast.feast}`, feastTitle, feastSections(feast.build, data()).sections);

    let row;
    let source;
    let periodInfo = null;
    if (parsed.number >= easter - 55 && parsed.number <= easter - 9) {
      const week = Math.floor((parsed.number - (easter - 55)) / 7) + 1;
      row = d.lent.get(`${week}-${weekday}`);
      source = `great-lent:${week}-${weekday}`;
    } else if (easterDiff > 0 && easterDiff <= 49) {
      const week = Math.floor(easterDiff / 7) + 1 - (weekday === 0 ? 1 : 0);
      row = d.pentecost.get(`${week}-${weekday}`);
      source = `pentecost:${week}-${weekday}`;
    } else if (coptic.day === 29 && weekday === 0 && coptic.month !== 6 && coptic.month !== 5) {
      return done("feast:29th-of-month", null, feastSections("Construct29OfMonth", data()).sections);
    } else if (weekday === 0) {
      const sunday = Math.floor((coptic.day - 1) / 7) + 1;
      row = d.sunday.get(`${coptic.month}-${sunday}`);
      source = `sunday:${coptic.month}-${sunday}`;
      periodInfo = `الأحد ${ORDINALS[sunday] || sunday} من شهر ${MONTHS[coptic.month]}`;
    } else {
      row = d.annual.get(`${coptic.month}-${coptic.day}`);
      source = `annual:${coptic.month}-${coptic.day}`;
    }
    if (!row) throw new Error(`مفيش قراءات لـ${source}`);
    const plan = done(source, feastTitle, fromRefs(row), periodInfo);
    plan.dayName = row.DayName || null;
    plan.season = row.Season || null;
    plan.rawTune = row.Day_Tune || row.Seasonal_Tune || null;
    return plan;
  }

  function copticDateLabel(coptic) {
    return `${coptic.day} ${coptic.monthName} ${coptic.year}`;
  }
  function getDayMetadata(plan) {
    const date = parseDate(plan.date);
    const coptic = plan.coptic;
    const easterDiff = date.number - easterDayNum(date.year);
    const fasts = [];
    if (coptic.month === 3 && coptic.day >= 16 || coptic.month === 4 && coptic.day <= 28) fasts.push("صوم الميلاد");
    if (easterDiff >= -69 && easterDiff <= -67) fasts.push("صوم نينوى");
    if (easterDiff >= -55 && easterDiff <= -1) fasts.push("الصوم الكبير وأسبوع البصخة");
    const apostlesStart = easterDayNum(date.year) + 50;
    if (date.number >= apostlesStart && coptic.month >= 9 && coptic.month <= 10 ||
        date.number >= apostlesStart && coptic.month === 11 && coptic.day < 5) fasts.push("صوم الرسل");
    if (coptic.month === 12 && coptic.day >= 1 && coptic.day <= 15) fasts.push("صوم السيدة العذراء");
    const isPentecostSeason = easterDiff >= 0 && easterDiff <= 49;
    if (!isPentecostSeason && !plan.title && (plan.weekday === 3 || plan.weekday === 5) && !fasts.length) {
      fasts.push(plan.weekday === 3 ? "صوم الأربعاء" : "صوم الجمعة");
    }
    let season = plan.season || "";
    if (easterDiff >= -55 && easterDiff <= -1) season = "الصوم الكبير وأسبوع البصخة";
    else if (isPentecostSeason) season = "الخماسين المقدسة";
    else if (fasts.includes("صوم الميلاد")) season = "صوم الميلاد";
    else if (fasts.includes("صوم نينوى")) season = "صوم نينوى";
    else if (fasts.includes("صوم الرسل")) season = "صوم الرسل";
    else if (fasts.includes("صوم السيدة العذراء")) season = "صوم السيدة العذراء";
    const dayType = plan.source === "feast:FastOfNinevah" ? "صوم نينوى" :
      /^feast:Pascha/.test(plan.source) ? "أسبوع البصخة" :
      plan.source === "feast:PalmSunday" ? "أحد الشعانين" :
        plan.title ? "عيد" : fasts.length ? "صوم" : "يوم عادي";
    const raw = String(plan.rawTune || "");
    let tune = raw;
    if (/lenten|abstinence/i.test(raw) || fasts.length > 0) tune = "لحن صيامي";
    else if (/festal|joyous/i.test(raw) || isPentecostSeason || /Easter|Nayrouz|Cross|Christmas|Theophany/i.test(plan.source)) tune = "لحن فرايحي";
    else if (!tune) tune = "اللحن السنوي";
    return { dayType, season: season || "السنوي", tune, rawTune: raw || null, fasts, copticLabel: copticDateLabel(coptic) };
  }
  function readingName(type, sectionId) {
    const label = data().labels_ar.readings.find((entry) => entry.name.toLowerCase() === String(type).toLowerCase() && entry.meta === "Title");
    const section = SECTION_TITLES[sectionId];
    if (type === "psalm-gospel") return section === "العشية" ? "مزمور وإنجيل العشية" :
      section === "باكر" ? "مزمور وإنجيل باكر" : "مزمور وإنجيل القداس";
    return label ? label.ar : type;
  }
  function flattenReadings(plan) {
    const out = [];
    for (const section of plan.sections) {
      for (const sub of section.subSections) {
        if (sub.type === "psalm-gospel") {
          for (const ref of sub.psalms || []) out.push({ id: `${section.id}:psalm:${ref}`, sectionId: section.id, type: "psalm", title: readingName("psalm-gospel", section.id) + " — المزمور", reference: ref });
          for (const ref of sub.gospels || []) out.push({ id: `${section.id}:gospel:${ref}`, sectionId: section.id, type: "gospel", title: readingName("psalm-gospel", section.id) + " — الإنجيل", reference: ref });
        } else if (sub.type === "synaxarium") {
          const entries = localSynaxariumEntries(plan.coptic.month, plan.coptic.day);
          for (const entry of entries) {
            out.push({ id: `liturgy:synaxarium:${entry.order}`, sectionId: section.id, type: "synaxarium", title: entry.title, reference: entry.title, text: entry.text });
          }
          if (!entries.length) out.push({ id: "liturgy:synaxarium:none", sectionId: section.id, type: "synaxarium", title: "السنكسار", reference: "لا يوجد نص سنكسار محلي لهذا التاريخ.", text: "" });
        } else if (sub.ref) {
          out.push({ id: `${section.id}:${sub.type}:${sub.ref}`, sectionId: section.id, type: sub.type, title: readingName(sub.type, section.id), reference: sub.ref });
        }
      }
    }
    return out;
  }
  function localSynaxariumEntries(month, day) {
    return data().synaxarium_ar
      .filter((entry) => entry.month === month && entry.day === day)
      .sort((a, b) => a.order - b.order)
      .map((entry) => ({ title: entry.title, text: stripHtml(entry.text || ""), order: entry.order }));
  }
  function stripHtml(value) {
    return String(value || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"').replace(/&#39;/g, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
      .replace(/\s+/g, " ").trim();
  }
  function parseRawReference(reference) {
    const out = [];
    for (const raw of String(reference).split(/\*@\+|@/)) {
      const part = raw.trim();
      if (!part) continue;
      if (part.indexOf(":") !== part.lastIndexOf(":")) {
        const pieces = part.split(/[-:]/);
        const [bookId, chapter1] = pieces[0].split(".").map(Number);
        const verse1 = Number(pieces[1]), chapter2 = Number(pieces[2]);
        let verse2Start = 1, verse2End = Number(pieces[3]);
        if (pieces.length > 4) { verse2Start = Number(pieces[3]); verse2End = Number(pieces[4]); }
        out.push({ bookId, chapter: chapter1, spec: { from: verse1, to: "end" } });
        for (let chapter = chapter1 + 1; chapter < chapter2; chapter++) out.push({ bookId, chapter, spec: { from: 1, to: "end" } });
        out.push({ bookId, chapter: chapter2, spec: { from: verse2Start, to: verse2End } });
        continue;
      }
      const match = /^(\d+)\.(\d+):(.+)$/.exec(part);
      if (!match) throw new Error(`مرجع مش مفهوم: ${part}`);
      const bookId = Number(match[1]), chapter = Number(match[2]), verses = match[3];
      if (verses.includes("-")) {
        const [from, to] = verses.split("-");
        out.push({ bookId, chapter, spec: { from: Number(from), to: to === "end" ? "end" : Number(to) } });
      } else if (verses.includes(",")) {
        out.push({ bookId, chapter, spec: { list: verses.split(",").map(Number) } });
      } else out.push({ bookId, chapter, spec: { list: [Number(verses)] } });
    }
    return out;
  }
  function referenceParts(reference) {
    const fixes = data().ref_fixes.fixes || {};
    const out = [];
    for (const raw of String(reference).split(/\*@\+|@/)) {
      const key = raw.trim();
      if (!key) continue;
      const fix = fixes[key];
      if (fix && fix.skip) continue;
      for (const part of parseRawReference(fix && fix.to || key)) {
        out.push({ ...part, pending: Boolean(fix && fix.review) || part.bookId > 66 || part.bookId === 27 && part.chapter > 12 });
      }
    }
    return out;
  }
  let biblePromise = null;
  let bibleIndex = null;
  let bibleScriptPromise = null;
  function loadBibleDataScript() {
    if (root.CHURCH_BIBLE_GZIP_BASE64) return Promise.resolve();
    if (bibleScriptPromise) return bibleScriptPromise;
    if (!root.document) return Promise.reject(new Error("ملف نص الكتاب غير محمّل."));
    bibleScriptPromise = new Promise((resolve, reject) => {
      const script = root.document.createElement("script");
      script.src = new URL("./data/bible-data.js", root.document.baseURI).href;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("تعذر تحميل ملف نص الكتاب المحلي."));
      root.document.head.appendChild(script);
    });
    return bibleScriptPromise;
  }
  async function loadBible() {
    if (bibleIndex) return bibleIndex;
    if (!biblePromise) {
      biblePromise = (async () => {
        await loadBibleDataScript();
        const encoded = root.CHURCH_BIBLE_GZIP_BASE64;
        if (!encoded) throw new Error("نص الكتاب المحلي غير محمّل.");
        const binary = typeof atob === "function" ? atob(encoded) : Buffer.from(encoded, "base64").toString("binary");
        const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        let text;
        if (typeof DecompressionStream === "function") {
          const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
          text = await new Response(stream).text();
        } else if (typeof require === "function") {
          text = require("node:zlib").gunzipSync(Buffer.from(bytes)).toString("utf8");
        } else throw new Error("المتصفح لا يدعم فك ضغط بيانات الكتاب.");
        const snapshot = JSON.parse(text);
        const index = new Map();
        for (const row of snapshot.verses || []) {
          const key = `${row[1]}.${row[2]}`;
          if (!index.has(key)) index.set(key, new Map());
          index.get(key).set(row[3], row[4]);
        }
        bibleIndex = { books: snapshot.books || [], chapters: index };
        return bibleIndex;
      })();
    }
    try { return await biblePromise; } catch (error) { biblePromise = null; bibleScriptPromise = null; throw error; }
  }
  const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
  const toArabicDigits = (value) => String(value).replace(/\d/g, (digit) => AR_DIGITS[Number(digit)]);
  const displayBookName = (book) => NUMBERED_BOOK_NAMES.get(book.id) ||
    String(book.ar).replace(/^سفر\s+/, "").replace(/^[1-3]\s+/, "");
  async function readingText(reference) {
    const bible = await loadBible();
    const names = new Map(data().books.map((book) => [book.id, displayBookName(book)]));
    const passages = [];
    for (const part of referenceParts(reference)) {
      const chapterMap = bible.chapters.get(`${part.bookId}.${part.chapter}`);
      const book = names.get(part.bookId) || String(part.bookId);
      const spec = part.spec;
      const selectedNumbers = "list" in spec
        ? spec.list
        : Array.from({ length: Math.max(0, (spec.to === "end" ? chapterMap && chapterMap.size || spec.from : spec.to) - spec.from + 1) }, (_, index) => spec.from + index);
      const verses = chapterMap
        ? selectedNumbers.filter((number) => chapterMap.has(number)).map((number) => ({ verse: number, text: chapterMap.get(number) }))
        : [];
      const range = "list" in spec
        ? spec.list.map(toArabicDigits).join("، ")
        : `${toArabicDigits(spec.from)}${spec.to === "end" ? "-آخره" : spec.to === spec.from ? "" : "-" + toArabicDigits(spec.to)}`;
      passages.push({
        bookId: part.bookId,
        book,
        chapter: part.chapter,
        label: `${book} ${toArabicDigits(part.chapter)}: ${range}`,
        verses,
        ...(part.pending || verses.length !== selectedNumbers.length ? { pending: true } : {}),
      });
    }
    return { reference, passages };
  }
  function splitTextIntoPages(text, maxChars = 280) {
    const paragraphs = String(text || "").split("\n").filter((paragraph) => paragraph.trim());
    const pages = [];
    let current = "";
    for (const paragraph of paragraphs) {
      const candidate = current ? `${current}\n${paragraph}` : paragraph;
      if (candidate.length <= maxChars) { current = candidate; continue; }
      if (current) pages.push(current);
      if (paragraph.length > maxChars) {
        const words = paragraph.split(" ");
        let chunk = "";
        for (const word of words) {
          const next = chunk ? `${chunk} ${word}` : word;
          if (next.length <= maxChars) chunk = next;
          else { if (chunk) pages.push(chunk); chunk = word; }
        }
        current = chunk;
      } else current = paragraph;
    }
    if (current) pages.push(current);
    return pages.length ? pages : [String(text || "")];
  }
  async function generatedSlides(reading, date) {
    const content = reading.type === "synaxarium"
      ? { title: reading.title, passages: [{ label: reading.title, verses: [{ verse: "", text: reading.text || "" }] }] }
      : await readingText(reading.reference);
    if (reading.type !== "synaxarium" && content.passages.some((passage) => passage.pending)) {
      throw new Error("المرجع فيه جزء غير متاح أو محتاج مراجعة فى بيانات الكتاب؛ لن نعرض نصاً ناقصاً.");
    }
    const passageTexts = content.passages.map((passage) =>
      passage.verses.map((verse) => `${verse.verse ? toArabicDigits(verse.verse) + " " : ""}${verse.text}`).join("\n"),
    );
    if (!passageTexts.some((text) => text.trim())) return null;
    const pages = passageTexts.flatMap((text) => splitTextIntoPages(text, 280));
    const title = reading.title || reading.type;
    const slides = [
      { n: 1, file: null, hidden: false, generated: true, text: `${title}\n${content.passages.map((passage) => passage.label).join("\n")}` },
      ...pages.map((text, index) => ({ n: index + 2, file: null, hidden: false, generated: true, text })),
      { n: pages.length + 2, file: null, hidden: false, generated: true, text: `انتهت ${title}` },
    ];
    return {
      title: `${title} — من بياناتنا`,
      source: `__generated__/${date}/${reading.id}`,
      generated: true,
      readingId: reading.id,
      reading: { ...reading },
      generatedDate: date,
      slides,
    };
  }
  function formatReference(reference) {
    return referenceLabels(reference).join("؛ ");
  }
  function referenceLabels(reference) {
    const names = new Map(data().books.map((book) => [book.id, displayBookName(book)]));
    return referenceParts(reference).map((part) => {
      const spec = part.spec;
      const range = "list" in spec
        ? spec.list.map(toArabicDigits).join("، ")
        : `${toArabicDigits(spec.from)}${spec.to === "end" ? "-آخره" : spec.to === spec.from ? "" : "-" + toArabicDigits(spec.to)}`;
      return `${names.get(part.bookId) || part.bookId} ${toArabicDigits(part.chapter)}: ${range}`;
    });
  }

  return {
    MONTHS,
    toCoptic,
    fromCoptic,
    easterDayNum,
    parseDate,
    planForDate,
    getDayMetadata,
    copticDateLabel,
    flattenReadings,
    localSynaxariumEntries,
    readingText,
    generatedSlides,
    splitTextIntoPages,
    formatReference,
    referenceLabels,
    loadBible,
  };
});
