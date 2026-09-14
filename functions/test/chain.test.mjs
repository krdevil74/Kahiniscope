import test from "node:test";
import assert from "node:assert/strict";

import { chainOrder, sendThroughChain } from "../lib/messaging/chain.js";

const TO = {
  uid: "u1",
  name: "Rizu Ahmed",
  phone: "+8801712344192",
  telegramChatId: "900",
  fcmTokens: ["token-a"],
};

const MESSAGE = {
  short: "Voice recording · EP-41 · 4 days overdue",
  body: "Rizu, Voice recording for EP-41 is 4 days overdue.",
  taskIds: ["t1"],
  actionableTaskId: "t1",
  template: null,
};

const ALL_ON = { push: true, telegram: true, whatsapp: true, sms: true };

/** An adapter that records what it was asked to do. */
function fake(id, behaviour = "delivered", { canReach = () => true } = {}) {
  const calls = [];
  return {
    adapter: {
      id,
      canReach,
      send: async (to, message) => {
        calls.push({ to, message });
        if (behaviour === "throw") throw new Error("network exploded");
        return behaviour === "delivered"
          ? { result: "delivered", channel: id }
          : { result: "failed", channel: id, error: "rejected" };
      },
    },
    calls,
  };
}

test("push is tried first, and nothing else is tried after it works", async () => {
  const push = fake("push");
  const telegram = fake("telegram");
  const result = await sendThroughChain(
    [push.adapter, telegram.adapter],
    TO,
    MESSAGE,
    { enabled: ALL_ON, escalationStep: 4 }
  );

  assert.equal(result.delivered, "push");
  assert.equal(push.calls.length, 1);
  assert.equal(telegram.calls.length, 0, "the chain stopped");
  assert.deepEqual(result.attempts.map((a) => a.channel), ["push"]);
});

test("a failure falls through to the next channel, and every attempt is logged", async () => {
  const push = fake("push", "failed");
  const telegram = fake("telegram");
  const whatsapp = fake("whatsapp");

  const result = await sendThroughChain(
    [push.adapter, telegram.adapter, whatsapp.adapter],
    TO,
    MESSAGE,
    { enabled: ALL_ON, escalationStep: 4 }
  );

  assert.equal(result.delivered, "telegram");
  assert.deepEqual(result.attempts.map((a) => `${a.channel}:${a.result}`), [
    "push:failed",
    "telegram:delivered",
  ]);
  assert.equal(whatsapp.calls.length, 0);
});

test("an adapter that throws is a failure, not a crash", async () => {
  const push = fake("push", "throw");
  const telegram = fake("telegram");

  const result = await sendThroughChain([push.adapter, telegram.adapter], TO, MESSAGE, {
    enabled: ALL_ON,
    escalationStep: 4,
  });

  assert.equal(result.delivered, "telegram");
  assert.equal(result.attempts[0].result, "failed");
  assert.match(result.attempts[0].error, /network exploded/);
});

test("a channel switched off is skipped, and says so in the log", async () => {
  const push = fake("push");
  const telegram = fake("telegram");

  const result = await sendThroughChain([push.adapter, telegram.adapter], TO, MESSAGE, {
    enabled: { ...ALL_ON, push: false },
    escalationStep: 4,
  });

  assert.equal(result.delivered, "telegram");
  assert.equal(push.calls.length, 0);
  assert.deepEqual(result.attempts[0], {
    result: "skipped",
    channel: "push",
    error: "switched off",
  });
});

test("a person with no address for a channel is skipped, not failed", async () => {
  const push = fake("push", "delivered", { canReach: () => false });
  const telegram = fake("telegram");

  const result = await sendThroughChain([push.adapter, telegram.adapter], TO, MESSAGE, {
    enabled: ALL_ON,
    escalationStep: 4,
  });

  assert.equal(result.attempts[0].result, "skipped");
  assert.match(result.attempts[0].error, /no address/);
  assert.equal(result.delivered, "telegram");
});

test("SMS is held back until the task reaches the daily stage", async () => {
  const sms = fake("sms");
  const early = await sendThroughChain([sms.adapter], TO, MESSAGE, {
    enabled: ALL_ON,
    escalationStep: 2,
  });
  assert.equal(early.delivered, null);
  assert.match(early.attempts[0].error, /daily stage/);
  assert.equal(sms.calls.length, 0, "the free key is one message a day");

  const late = await sendThroughChain([sms.adapter], TO, MESSAGE, {
    enabled: ALL_ON,
    escalationStep: 4,
  });
  assert.equal(late.delivered, "sms");
});

test("a task's preferred channel goes first, then the normal order resumes", () => {
  assert.deepEqual(chainOrder("whatsapp"), ["whatsapp", "push", "telegram", "sms"]);
  assert.deepEqual(chainOrder(null), ["push", "telegram", "whatsapp", "sms"]);
});

test("a preference does not trap a message on a channel that fails", async () => {
  const whatsapp = fake("whatsapp", "failed");
  const push = fake("push");

  const result = await sendThroughChain([push.adapter, whatsapp.adapter], TO, MESSAGE, {
    enabled: ALL_ON,
    preferred: "whatsapp",
    escalationStep: 4,
  });

  assert.deepEqual(result.attempts.map((a) => a.channel), ["whatsapp", "push"]);
  assert.equal(result.delivered, "push");
});

test("when nothing can be delivered, that is reported rather than thrown", async () => {
  const push = fake("push", "failed");
  const telegram = fake("telegram", "failed");

  const result = await sendThroughChain([push.adapter, telegram.adapter], TO, MESSAGE, {
    enabled: ALL_ON,
    escalationStep: 4,
  });

  assert.equal(result.delivered, null);
  assert.equal(result.attempts.length, 2);
  assert.ok(result.attempts.every((a) => a.result === "failed"));
});
