const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const displaySource = fs.readFileSync(path.join(__dirname, "../app/display.js"), "utf8");

function runDisplay({ pathname, mode = "slide" }) {
  const elements = new Map();
  for (const id of ["slideImage", "generatedText", "blankScreen", "missingSlideMessage"]) {
    elements.set(id, {
      hidden: id !== "blankScreen" && id !== "missingSlideMessage",
      style: {},
      textContent: "",
      src: "",
      removeAttribute(name) { if (name === "src") this.src = ""; },
    });
  }
  const listeners = new Map();
  const posted = [];
  const opener = { postMessage(message) { posted.push(message); } };
  class FailedImage {
    set src(value) {
      this._src = value;
      if (value) this.onerror?.();
    }
    get src() { return this._src; }
  }
  const window = {
    opener,
    location: { pathname },
    addEventListener(name, callback) { listeners.set(name, callback); },
  };
  const document = {
    body: { style: {} },
    getElementById(id) { return elements.get(id); },
    addEventListener() {},
  };
  vm.runInNewContext(displaySource, { window, document, Image: FailedImage, URL, Map, Set, Number, String, Array, Boolean });
  listeners.get("message")({
    source: opener,
    data: {
      channel: "church-display-control",
      type: "state",
      mode,
      deck: { source: "deck.pptx", slides: [{ n: 1, file: "slide-0001.jpg" }] },
      slideNumber: 1,
      assetBase: "https://example.test/liturgy-slides/out/",
    },
  });
  return { elements, posted };
}

test("failed online slide image shows the notice and reports its slide number to the operator", () => {
  const { elements, posted } = runDisplay({ pathname: "/liturgy-slides/display.html" });
  assert.equal(elements.get("blankScreen").hidden, false);
  assert.equal(elements.get("missingSlideMessage").hidden, false);
  assert.equal(
    posted.some((message) => message.type === "image-error" && message.slideNumber === 1),
    true,
  );
});

test("white-screen mode and the offline projector keep the online-missing notice hidden", () => {
  const white = runDisplay({ pathname: "/liturgy-slides/display.html", mode: "white" });
  assert.equal(white.elements.get("blankScreen").hidden, false);
  assert.equal(white.elements.get("missingSlideMessage").hidden, true);
  assert.equal(white.posted.some((message) => message.type === "image-error"), false);

  const offline = runDisplay({ pathname: "/church-display/app/display.html" });
  assert.equal(offline.elements.get("missingSlideMessage").hidden, true);
  assert.equal(offline.posted.some((message) => message.type === "image-error"), false);
});
