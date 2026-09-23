import test from "node:test";
import assert from "node:assert/strict";

import { driveFileId, isScriptLink, parseScriptLink, scriptRowLabel } from "./script-link.ts";

const SHARE = "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view?usp=sharing";

test("the link off Drive's Share button is accepted as-is", () => {
  const parsed = parseScriptLink(SHARE);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.ok && parsed.url, SHARE);
});

test("surrounding whitespace from a paste is trimmed", () => {
  const parsed = parseScriptLink(`  ${SHARE}\n`);
  assert.equal(parsed.ok && parsed.url, SHARE);
});

test("an empty field is a prompt, not an error about syntax", () => {
  assert.deepEqual(parseScriptLink(""), {
    ok: false,
    reason: "Paste the Drive link to the script.",
  });
  assert.deepEqual(parseScriptLink("   "), {
    ok: false,
    reason: "Paste the Drive link to the script.",
  });
});

test("something that is not a URL says so", () => {
  const parsed = parseScriptLink("the script is on my desktop");
  assert.equal(parsed.ok, false);
  assert.match(parsed.ok ? "" : parsed.reason, /not a link/);
});

test("http is refused — the phone would open it exactly as pasted", () => {
  const parsed = parseScriptLink("http://drive.google.com/file/d/1Abc/view");
  assert.equal(parsed.ok, false);
  assert.match(parsed.ok ? "" : parsed.reason, /https/);
});

test("a link to anywhere but Drive is refused", () => {
  // The admin is filling a field that the team taps without looking. Any host
  // would make an episode a redirect the whole team follows on trust.
  for (const url of [
    "https://example.com/script.pdf",
    "https://drive.google.com.evil.test/file/d/1Abc/view",
    "https://notdrive.google.com/file/d/1Abc/view",
  ]) {
    const parsed = parseScriptLink(url);
    assert.equal(parsed.ok, false, url);
    assert.match(parsed.ok ? "" : parsed.reason, /Google Drive/, url);
  }
});

test("the Google hosts a share link really comes from are accepted", () => {
  for (const url of [
    "https://drive.google.com/file/d/1Abc/view",
    "https://docs.google.com/document/d/1Abc/edit",
    "https://drive.usercontent.google.com/download?id=1Abc",
  ]) {
    assert.equal(isScriptLink(url), true, url);
  }
});

test("the host check ignores case, because a paste may not", () => {
  assert.equal(isScriptLink("https://Drive.Google.com/file/d/1Abc/view"), true);
});

test("the file id is read out of both shapes Drive hands out", () => {
  assert.equal(driveFileId(SHARE), "1AbCdEfGhIjKlMnOpQrStUvWxYz");
  assert.equal(
    driveFileId("https://drive.usercontent.google.com/download?id=1XyZ"),
    "1XyZ"
  );
});

test("an unrecognised shape is not an error — the id only labels the row", () => {
  assert.equal(driveFileId("https://drive.google.com/drive/folders"), null);
  assert.equal(driveFileId("https://example.com/x"), null);
  assert.equal(scriptRowLabel("https://drive.google.com/drive/folders"), "Open in Drive");
});

test("the row shows enough of the id to tell two scripts apart", () => {
  assert.equal(scriptRowLabel(SHARE), "Drive · 1AbCdEfG…");
});
