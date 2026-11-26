import { test } from "node:test";
import assert from "node:assert/strict";
import { copyHtmlTable } from "../client/src/lib/copy-table";

test("copyHtmlTable puts the optional intro before the table and leaves default output unchanged", async () => {
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const clipboardItemDescriptor = Object.getOwnPropertyDescriptor(globalThis, "ClipboardItem");
  let captured: Record<string, Blob> | null = null;

  class TestClipboardItem {
    constructor(readonly data: Record<string, Blob>) {}
  }

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      clipboard: {
        write: async (items: ClipboardItem[]) => {
          captured = (items[0] as unknown as TestClipboardItem).data;
        },
        writeText: async () => {},
      },
    },
  });
  Object.defineProperty(globalThis, "ClipboardItem", {
    configurable: true,
    value: TestClipboardItem,
  });

  try {
    const introText = "ارجو اغلاق الجسيم الاتى مع الشكر";
    assert.equal(await copyHtmlTable(["العنوان"], [["القيمة"]], { introText }), true);
    const htmlWithIntro = await captured!["text/html"].text();
    const textWithIntro = await captured!["text/plain"].text();
    assert.ok(htmlWithIntro.indexOf(`<p dir="rtl" align="right"`) >= 0);
    assert.ok(htmlWithIntro.indexOf(introText) < htmlWithIntro.indexOf("<table"));
    assert.ok(textWithIntro.startsWith(`${introText}\n\n`));

    assert.equal(await copyHtmlTable(["العنوان"], [["القيمة"]]), true);
    const htmlWithoutIntro = await captured!["text/html"].text();
    const textWithoutIntro = await captured!["text/plain"].text();
    assert.doesNotMatch(htmlWithoutIntro, /<p\b/);
    assert.equal(textWithoutIntro, "العنوان\nالقيمة");
  } finally {
    if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
    else Reflect.deleteProperty(globalThis, "navigator");
    if (clipboardItemDescriptor) Object.defineProperty(globalThis, "ClipboardItem", clipboardItemDescriptor);
    else Reflect.deleteProperty(globalThis, "ClipboardItem");
  }
});
