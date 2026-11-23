import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInviteShareTargets,
  buildInviteShareText,
  buildInviteUrl,
  parseInviteParam,
  parseInviteQuery,
} from "../lib/invite.ts";
import { safeReturnPath } from "../lib/format.ts";

test("invite links use the same origin and only a public username", () => {
  assert.equal(
    buildInviteUrl("mahmoud_y", "https://drive.oscardevs.com"),
    "https://drive.oscardevs.com/oscar-messenger/?invite=mahmoud_y",
  );
  assert.equal(buildInviteUrl("+201012345678", "https://oscardevs.com"), null);
  assert.equal(buildInviteUrl("person@example.com", "https://oscardevs.com"), null);
});

test("invite text and quick-share targets include the link", () => {
  const link = "https://oscardevs.com/oscar-messenger/?invite=alex_1";
  const text = buildInviteShareText(link);
  assert.equal(text, `انضم لى على Oscar Messaging علشان نتكلم ببلاش: ${link}`);
  const targets = buildInviteShareTargets(text);
  assert.equal(targets.whatsapp, `https://wa.me/?text=${encodeURIComponent(text)}`);
  assert.equal(targets.sms, `sms:?&body=${encodeURIComponent(text)}`);
});

test("invite query parsing accepts valid handles and ignores invalid or missing values", () => {
  assert.equal(parseInviteQuery("?invite=alex_1"), "alex_1");
  assert.equal(parseInviteQuery("?invite=Bad%2FHandle"), null);
  assert.equal(parseInviteQuery("?other=alex_1"), null);
  assert.equal(parseInviteParam(["  USER_1  "]), "user_1");
  assert.equal(parseInviteParam(undefined), null);
  assert.equal(safeReturnPath("/?invite=alex_1"), "/?invite=alex_1");
  assert.equal(safeReturnPath("/?invite=alex%2F1"), "/");
});
