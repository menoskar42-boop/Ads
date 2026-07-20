/**
 * Polyfills for iOS 10-12, Samsung 2017, Chrome 70
 * NO external imports — pure self-contained JS/TS
 */

// ── Array ─────────────────────────────────────────────────────────────────
if (!Array.prototype.flat) {
  (Array.prototype as any).flat = function (depth: any) {
    depth = depth === undefined ? 1 : Math.floor(depth);
    return (function flat(arr: any[], d: number): any[] {
      return arr.reduce(function (acc: any[], val: any) {
        return acc.concat(Array.isArray(val) && d > 0 ? flat(val, d - 1) : val);
      }, []);
    })(this, depth);
  };
}

if (!Array.prototype.flatMap) {
  (Array.prototype as any).flatMap = function (fn: any, ctx?: any) {
    return Array.prototype.map.call(this, fn, ctx).reduce(function (a: any[], v: any) {
      return a.concat(v);
    }, []);
  };
}

// ── Object ────────────────────────────────────────────────────────────────
if (!Object.fromEntries) {
  (Object as any).fromEntries = function (entries: any) {
    return Array.from(entries as any[]).reduce(function (obj: any, pair: any) {
      obj[pair[0]] = pair[1];
      return obj;
    }, {});
  };
}

// ── String ────────────────────────────────────────────────────────────────
if (!String.prototype.replaceAll) {
  String.prototype.replaceAll = function (search: any, replace: any) {
    return this.split(search).join(replace);
  };
}

// ── Promise ───────────────────────────────────────────────────────────────
if (!Promise.allSettled) {
  (Promise as any).allSettled = function (promises: any[]) {
    return Promise.all(
      promises.map(function (p: any) {
        return Promise.resolve(p)
          .then(function (v: any) { return { status: "fulfilled", value: v }; })
          .catch(function (r: any) { return { status: "rejected", reason: r }; });
      })
    );
  };
}

// ── Globals ───────────────────────────────────────────────────────────────
if (typeof (window as any).queueMicrotask === "undefined") {
  (window as any).queueMicrotask = function (fn: () => void) {
    Promise.resolve().then(fn);
  };
}

if (typeof (window as any).globalThis === "undefined") {
  (window as any).globalThis = window;
}

// ── AbortController stub — iOS < 12 ──────────────────────────────────────
if (typeof (window as any).AbortController === "undefined") {
  (window as any).AbortController = function AbortControllerPolyfill(this: any) {
    this.signal = { aborted: false, addEventListener: function () {}, removeEventListener: function () {} };
  };
  (window as any).AbortController.prototype.abort = function () {
    this.signal.aborted = true;
  };
}

// ── ResizeObserver — iOS < 13.4 ──────────────────────────────────────────
// Polling-based implementation: checks sizes every 200ms
if (typeof (window as any).ResizeObserver === "undefined") {
  (window as any).ResizeObserver = function ROPolyfill(this: any, callback: any) {
    this._cb = callback;
    this._els = [] as Element[];
    const self = this;
    this._timer = setInterval(function () {
      if (!self._els.length) return;
      const entries: any[] = [];
      for (let i = 0; i < self._els.length; i++) {
        const el = self._els[i] as HTMLElement;
        const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 0, height: 0 };
        entries.push({ target: el, contentRect: rect, borderBoxSize: [], contentBoxSize: [] });
      }
      try { callback(entries, self); } catch (_) {}
    }, 200);
  };
  (window as any).ResizeObserver.prototype.observe = function (el: Element) {
    if (this._els.indexOf(el) === -1) this._els.push(el);
    // Fire immediately once so layout is calculated right away
    const rect = (el as HTMLElement).getBoundingClientRect ? (el as HTMLElement).getBoundingClientRect() : { width: 0, height: 0 };
    try { this._cb([{ target: el, contentRect: rect, borderBoxSize: [], contentBoxSize: [] }], this); } catch (_) {}
  };
  (window as any).ResizeObserver.prototype.unobserve = function (el: Element) {
    const i = this._els.indexOf(el);
    if (i > -1) this._els.splice(i, 1);
  };
  (window as any).ResizeObserver.prototype.disconnect = function () {
    clearInterval(this._timer);
    this._els = [];
  };
}

// ── IntersectionObserver — iOS < 12.2 ────────────────────────────────────
// Stub: fires "intersecting = true" immediately so whileInView content shows
if (typeof (window as any).IntersectionObserver === "undefined") {
  (window as any).IntersectionObserver = function IOPolyfill(this: any, callback: any) {
    this._cb = callback;
  };
  (window as any).IntersectionObserver.prototype.observe = function (el: Element) {
    const self = this;
    setTimeout(function () {
      try { self._cb([{ isIntersecting: true, target: el, intersectionRatio: 1 }], self); } catch (_) {}
    }, 0);
  };
  (window as any).IntersectionObserver.prototype.unobserve = function () {};
  (window as any).IntersectionObserver.prototype.disconnect = function () {};
}

// ── MediaQueryList.addEventListener — iOS < 14 ───────────────────────────
if (typeof window !== "undefined" && window.matchMedia) {
  try {
    const testMql = window.matchMedia("(min-width:0px)");
    if (testMql && typeof testMql.addEventListener !== "function") {
      const _orig = window.matchMedia.bind(window);
      (window as any).matchMedia = function (query: string) {
        const mql: any = _orig(query);
        if (mql && typeof mql.addEventListener !== "function") {
          mql.addEventListener = function (_t: string, listener: any) {
            return mql.addListener(typeof listener === "function" ? listener : listener.handleEvent.bind(listener));
          };
          mql.removeEventListener = function (_t: string, listener: any) {
            return mql.removeListener(typeof listener === "function" ? listener : listener.handleEvent.bind(listener));
          };
        }
        return mql;
      };
    }
  } catch (_) { /* ignore */ }
}
