import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { buildAuth } from "./r2";
import { migrateChatImages, type MigrateDeps } from "./chat-image-migrate";
import { storeChatImage } from "./chat-images";

// ٢٠٢٦-١٠-٢٥: صور الشات على R2 بدل القاعدة

test("SigV4 matches the official AWS example (GET Object)", () => {
  const EMPTY = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  const auth = buildAuth({
    method: "GET", host: "examplebucket.s3.amazonaws.com", pathname: "/test.txt", query: "",
    headers: { range: "bytes=0-9", "x-amz-content-sha256": EMPTY, "x-amz-date": "20130524T000000Z" },
    payloadHash: EMPTY, amzDate: "20130524T000000Z", region: "us-east-1",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  });
  assert.match(auth, /Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41$/);
});

test("without R2 secrets a new image stays in the database (nothing is lost)", async () => {
  const saved = process.env.R2_BUCKET;
  delete process.env.R2_BUCKET;
  const d = "data:image/jpeg;base64," + Buffer.from("img").toString("base64");
  assert.equal(await storeChatImage(d, 1), d);
  if (saved !== undefined) process.env.R2_BUCKET = saved;
});

const img = (s: string) => "data:image/jpeg;base64," + Buffer.from(s).toString("base64");
function fake(rows: Record<number, string>, opts: { corrupt?: boolean } = {}) {
  const bucket = new Map<string, Buffer>();
  const deps: MigrateDeps = {
    async next(after) {
      const id = Object.keys(rows).map(Number).sort((a, b) => a - b).find((i) => i > after && rows[i].startsWith("data:"));
      return id ? { id, groupId: 1 } : null;
    },
    async read(id) { return rows[id]?.startsWith("data:") ? rows[id] : null; },
    async swap(id, key, md5) {
      if (!(id in rows) || crypto.createHash("md5").update(rows[id]).digest("hex") !== md5) return false;
      rows[id] = "r2:" + key; return true;
    },
    async put(key, body) { bucket.set(key, opts.corrupt ? Buffer.from("x") : body); },
    async get(key) { const b = bucket.get(key); return b ? { body: b } : null; },
    async del(key) { bucket.delete(key); },
    async sleep() {},
  };
  return { deps, bucket };
}

test("old images move to R2 only after the copy is verified", async () => {
  const rows: Record<number, string> = { 1: img("a"), 2: "data:text/html;base64,AAAA", 3: img("c") };
  const { deps, bucket } = fake(rows);
  assert.deepEqual(await migrateChatImages(deps), { moved: 2, skipped: 1 });
  assert.match(rows[1], /^r2:mybible\/chat\/1\/.+\.jpg$/);
  assert.equal(bucket.get(rows[1].slice(3))?.toString(), "a");
  assert.equal(rows[2], "data:text/html;base64,AAAA", "مش صورة — تفضل زي ما هي");
});

test("a corrupted upload stops the move and keeps the image in the database", async () => {
  const rows: Record<number, string> = { 1: img("a") };
  const { deps, bucket } = fake(rows, { corrupt: true });
  await assert.rejects(migrateChatImages(deps));
  assert.equal(rows[1], img("a"));
  assert.equal(bucket.size, 0, "النسخة البايظة اتمسحت");
});

test("a message deleted during the move leaves nothing behind on R2", async () => {
  const rows: Record<number, string> = { 1: img("a") };
  const { deps, bucket } = fake(rows);
  const swap = deps.swap;
  deps.swap = async (id, key, md5) => { delete rows[id]; return swap(id, key, md5); };
  assert.deepEqual(await migrateChatImages(deps), { moved: 0, skipped: 1 });
  assert.equal(bucket.size, 0);
});
