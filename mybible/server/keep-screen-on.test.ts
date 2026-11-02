// طلب عضو فى جروب درس مار مرقس (٢٠٢٦-١١-٠٢): الشاشة ماتنامش طول ما الجروب مفتوح.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("صفحتين الجروب (القراية والشات) بيمنعوا الشاشة تنام", () => {
  for (const page of ["../client/src/pages/GroupView.tsx", "../client/src/pages/GroupChat.tsx"]) {
    const s = read(page);
    assert.match(s, /import \{ useKeepScreenOn \} from '@\/hooks\/useKeepScreenOn'/, page);
    assert.match(s, /^\s+useKeepScreenOn\(\);/m, page);
  }
});

test("Wake Lock + رجوعه لما الصفحة ترجع ظاهرة + بديل الفيديو + بيتشال لما الصفحة تتقفل", () => {
  const h = read("../client/src/hooks/useKeepScreenOn.ts");
  assert.match(h, /wakeLock\.request\('screen'\)/);
  assert.match(h, /addEventListener\('visibilitychange', onVisible\)/);
  assert.match(h, /video\.src = '\/keep-awake\.mp4'/);
  assert.match(h, /lock\?\.release\?\.\(\)/);
  assert.ok(statSync(new URL("../client/public/keep-awake.mp4", import.meta.url)).size > 0);
});
