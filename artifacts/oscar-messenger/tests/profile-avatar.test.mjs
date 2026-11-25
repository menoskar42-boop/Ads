import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [avatar, settings, packageJson] = await Promise.all([
  readFile(new URL("../components/Avatar.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/ProfileAvatarSettings.tsx", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
]);

test("avatar uses the authenticated private image and falls back to initials", () => {
  assert.match(avatar, /import \{ Image \} from "expo-image"/);
  assert.match(avatar, /Authorization: `Bearer \$\{token\}`/);
  assert.match(avatar, /credentials: "include"/);
  assert.match(avatar, /initials\(name\)/);
  assert.match(avatar, /uri\?: string \| null/);
});

test("settings provide web file selection, native image picker, upload and removal", () => {
  assert.ok(packageJson.devDependencies?.["expo-image-picker"]);
  assert.match(settings, /<input[\s\S]*type="file"[\s\S]*image\/jpeg,image\/png,image\/webp/);
  assert.match(settings, /requestMediaLibraryPermissionsAsync/);
  assert.match(settings, /launchImageLibraryAsync/);
  assert.match(settings, /uploadMessengerProfileAvatar/);
  assert.match(settings, /deleteMessengerProfileAvatar/);
  assert.match(settings, /MAX_AVATAR_BYTES = 2 \* 1024 \* 1024/);
});
