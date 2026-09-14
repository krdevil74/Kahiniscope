import test from "node:test";
import assert from "node:assert/strict";

import {
  chainSentence,
  channelTags,
  memberChainSentence,
  planLabel,
  stepPlan,
} from "./channel-meta.ts";

const ALL_ON = { push: true, telegram: true, whatsapp: true, sms: true, email: true };

test("tags name the channel that would really go first", () => {
  const tags = channelTags(ALL_ON);
  assert.equal(tags.push, "Primary");
  assert.equal(tags.telegram, "Fallback");
  assert.equal(tags.whatsapp, "Fallback");
  assert.equal(tags.sms, "Last resort");
  assert.equal(tags.email, "Digest");
});

test("switching a channel off moves the tags with it", () => {
  const tags = channelTags({ ...ALL_ON, push: false, sms: false });
  assert.equal(tags.push, "Off");
  assert.equal(tags.telegram, "Primary", "Telegram is first once push is off");
  assert.equal(tags.whatsapp, "Last resort", "and WhatsApp is the end of the chain");
  assert.equal(tags.sms, "Off");
});

test("one channel on is the primary and nothing else", () => {
  const tags = channelTags({ push: false, telegram: true, whatsapp: false, sms: false, email: false });
  assert.equal(tags.telegram, "Primary");
  assert.equal(tags.whatsapp, "Off");
});

test("the closing note describes the real chain, not a fixed sentence", () => {
  assert.equal(
    chainSentence(ALL_ON),
    "Channels are tried in order: push, then Telegram, then WhatsApp, then SMS. " +
      "The first one that succeeds wins, and every attempt is logged."
  );
  assert.match(chainSentence({ ...ALL_ON, push: false, whatsapp: false }), /Telegram, then SMS/);
  assert.match(
    chainSentence({ push: false, telegram: true, whatsapp: false, sms: false, email: false }),
    /Only Telegram is on/
  );
});

test("every channel off is stated plainly, not hidden", () => {
  assert.match(
    chainSentence({ push: false, telegram: false, whatsapp: false, sms: false, email: false }),
    /no reminders will go out/
  );
});

test("the schedule rows are labelled as the design writes them", () => {
  assert.equal(planLabel(0), "First reminder after");
  assert.equal(planLabel(1), "Then every");
  assert.equal(planLabel(9), "Then every");
});

test("a ladder rung never drops below a day", () => {
  assert.deepEqual(stepPlan([7, 4, 3, 2, 1], 0, -1), [6, 4, 3, 2, 1]);
  assert.deepEqual(stepPlan([7, 4, 3, 2, 1], 4, -1), [7, 4, 3, 2, 1], "1 is the floor");
  assert.deepEqual(stepPlan([7, 4, 3, 2, 1], 2, 1), [7, 4, 4, 2, 1]);
});

test("stepping does not mutate the plan it was given", () => {
  const plan = [7, 4, 3, 2, 1];
  stepPlan(plan, 0, 5);
  assert.deepEqual(plan, [7, 4, 3, 2, 1]);
});

test("the member's version is shorter and never mentions the log", () => {
  assert.equal(
    memberChainSentence(ALL_ON),
    "Reminders arrive on push, then Telegram, then WhatsApp, then SMS."
  );
  assert.equal(
    memberChainSentence({ ...ALL_ON, sms: false }),
    "Reminders arrive on push, then Telegram, then WhatsApp."
  );
  assert.equal(
    memberChainSentence({ push: true, telegram: false, whatsapp: false, sms: false, email: false }),
    "Reminders arrive on push."
  );
  assert.match(
    memberChainSentence({ push: false, telegram: false, whatsapp: false, sms: false, email: false }),
    /switched off/
  );
  assert.doesNotMatch(memberChainSentence(ALL_ON), /logged/);
});
