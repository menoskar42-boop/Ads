import assert from "node:assert/strict";
import test from "node:test";
import {
  buildContactResolveSql,
  contactResolveParams,
  ownedContactNicknameJoin,
  resolveContactMatches,
} from "../src/lib/contact-nicknames.ts";

const candidates = [
  { userId: "u1", username: "ahmed", displayName: "أحمد يوسف", nickname: "workfriend" },
  { userId: "u2", username: "workfriend", displayName: "محمود", nickname: null },
];

test("nickname match takes priority over another user's exact username", () => {
  const result = resolveContactMatches(candidates, "workfriend");
  assert.equal(result.status, "one");
  assert.equal(result.matchedBy, "nickname");
  assert.equal(result.matches[0].userId, "u1");
});

test("exact username fallback accepts names with or without @", () => {
  for (const name of ["ahmed", "@ahmed"]) {
    const result = resolveContactMatches(candidates, name);
    assert.equal(result.status, "one");
    assert.equal(result.matchedBy, "username");
    assert.equal(result.matches[0].userId, "u1");
  }
});

test("display-name fallback uses the shared Arabic name normalization", () => {
  const result = resolveContactMatches(candidates, "احمد يوسف");
  assert.equal(result.status, "one");
  assert.equal(result.matchedBy, "displayName");
  assert.equal(result.matches[0].userId, "u1");
});

test("duplicate personal nicknames are ambiguous and return every matching contact", () => {
  const result = resolveContactMatches(
    [
      { userId: "u1", username: "first", displayName: "أحمد", nickname: "الشغل" },
      { userId: "u2", username: "second", displayName: "محمود", nickname: "الشغل" },
    ],
    "الشغل",
  );
  assert.equal(result.status, "ambiguous");
  assert.equal(result.matchedBy, "nickname");
  assert.deepEqual(result.matches.map((match) => match.userId), ["u1", "u2"]);
});

test("returns none when no candidate or owner-private nickname matches", () => {
  assert.deepEqual(resolveContactMatches(candidates, "غير موجود"), {
    status: "none",
    matches: [],
  });
  const userBViewOfUserAContact = [
    { userId: "u3", username: "colleague", displayName: "زميل", nickname: null },
  ];
  assert.equal(
    resolveContactMatches(userBViewOfUserAContact, "اسم خاص سجله المستخدم أ").status,
    "none",
  );
});

test("nickname query joins and parameters are scoped to the authenticated owner", () => {
  const sql = buildContactResolveSql(true);
  assert.equal(sql.split("n.owner_user_id = $1").length - 1, 2);
  assert.equal(ownedContactNicknameJoin("peer").includes("n.owner_user_id = $1"), true);
  assert.equal(ownedContactNicknameJoin("peer", "$4").includes("n.owner_user_id = $4"), true);
  assert.deepEqual(contactResolveParams("auth-user-b", "أحمد"), [
    "auth-user-b",
    "احمد",
    "أحمد",
  ]);
  assert.ok(sql.includes("n.nickname_key = $2"));
  assert.match(sql, /LIMIT 10/);
});
