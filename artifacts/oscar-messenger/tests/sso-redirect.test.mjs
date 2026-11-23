import assert from "node:assert/strict";
import test from "node:test";
import { safeReturnPath } from "../lib/format.ts";
import { ssoRedirectUrl } from "../lib/sso-redirect.ts";

test("web Google sign-in returns to Messenger on either supported domain", () => {
  assert.equal(
    ssoRedirectUrl("web", "https://drive.oscardevs.com", "oscar-messenger://"),
    "https://drive.oscardevs.com/oscar-messenger/sign-in",
  );
  assert.equal(
    ssoRedirectUrl("web", "https://oscardevs.com", "oscar-messenger://"),
    "https://oscardevs.com/oscar-messenger/sign-in",
  );
});

test("native Google sign-in keeps its existing scheme redirect", () => {
  const nativeUri = "oscar-messenger://oauthredirect";
  assert.equal(ssoRedirectUrl("ios", "https://drive.oscardevs.com", nativeUri), nativeUri);
  assert.equal(ssoRedirectUrl("android", "", nativeUri), nativeUri);
});

test("return paths reject external URLs but allow a Messenger chat route", () => {
  assert.equal(safeReturnPath("https://evil.com"), "/");
  assert.equal(safeReturnPath("//evil.com"), "/");
  assert.equal(safeReturnPath("/chat/123"), "/chat/123");
});
