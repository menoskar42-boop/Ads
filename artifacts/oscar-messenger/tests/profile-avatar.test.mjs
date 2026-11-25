import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [avatar, settings, packageJson, generatedApi] = await Promise.all([
  readFile(new URL("../components/Avatar.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/ProfileAvatarSettings.tsx", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../../../lib/api-client-react/src/generated/api.ts", import.meta.url), "utf8"),
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
  assert.match(settings, /uploadMessengerProfileAvatar\(body,/);
  assert.match(settings, /Content-Type": contentType/);
  assert.match(settings, /deleteMessengerProfileAvatar/);
  assert.match(settings, /MAX_AVATAR_BYTES = 2 \* 1024 \* 1024/);
  assert.match(settings, /512 \/ Math\.max\(image\.naturalWidth, image\.naturalHeight\)/);
  assert.match(settings, /canvas\.toBlob/);
  assert.match(settings, /"image\/jpeg",\s*0\.85/);
  assert.doesNotMatch(settings, /base64:\s*true/);
  assert.match(generatedApi, /uploadMessengerProfileAvatar = async \(uploadMessengerProfileAvatarBody: Blob/);
  assert.match(generatedApi, /body: uploadMessengerProfileAvatarBody/);
  assert.doesNotMatch(generatedApi.slice(
    generatedApi.indexOf("export const uploadMessengerProfileAvatar ="),
    generatedApi.indexOf("export const getDeleteMessengerProfileAvatarUrl"),
  ), /JSON\.stringify/);
});
