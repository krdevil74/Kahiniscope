import assert from "node:assert/strict";
import test from "node:test";

import { telegramInvite } from "./telegram-invite.ts";

const URL = "https://t.me/Kahiniscope_bot?start=abc123";

test("it opens with their name, and only their first", () => {
  // A full name in a greeting reads like a form letter, which is the one
  // thing this message must not.
  assert.match(telegramInvite("Rizu Ahmed", URL).message, /^Hi Rizu,/);
});

test("somebody with no name on file still gets a greeting", () => {
  for (const nothing of ["", "   ", null, undefined]) {
    assert.match(telegramInvite(nothing, URL).message, /^Hi there,/, JSON.stringify(nothing));
  }
});

test("the link is in the message, on its own line", () => {
  const { message } = telegramInvite("Rizu", URL);
  assert.ok(message.includes(`\n${URL}\n`), "a link buried in a paragraph gets missed");
});

test("it says exactly what to do", () => {
  assert.match(telegramInvite("Rizu", URL).message, /press Start/);
});

test("it says what it will send, and what it will not", () => {
  const { message } = telegramInvite("Rizu", URL);
  // A promise not to spam is only believable beside what it will actually send.
  assert.match(message, /only hear from us about work that is actually assigned/);
  assert.match(message, /No newsletters, no announcements/);
});

test("it carries a subject for the share targets that use one", () => {
  assert.equal(telegramInvite("Rizu", URL).subject, "Your Kahiniscope reminders on Telegram");
});

test("it reads as a person, not a system", () => {
  const { message } = telegramInvite("Rizu", URL);
  assert.doesNotMatch(message, /automated|do not reply|this is an automated/i);
  assert.match(message, /— Kahiniscope$/);
});
