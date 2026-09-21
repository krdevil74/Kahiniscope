import assert from "node:assert/strict";
import test from "node:test";

import {
  contactMatchNote,
  contactRemovedToast,
  EMPTY_CONTACT,
  isContactComplete,
  linkedToast,
  matchingContactFor,
  missingFromContact,
} from "./contacts.ts";
import { EMPTY_RATES, type TeamMember } from "./model.ts";

function member(overrides: Partial<TeamMember>): TeamMember {
  return {
    uid: "u1",
    name: "Someone",
    email: "",
    phone: null,
    telegramChatId: null,
    crafts: [],
    status: "approved",
    role: "member",
    fcmTokens: [],
    note: null,
    preferredChannel: null,
    accountless: false,
    rates: EMPTY_RATES,
    balance: 0,
    createdAt: null,
    ...overrides,
  };
}

test("the button says what is still missing, in the order it is asked for", () => {
  assert.equal(missingFromContact(EMPTY_CONTACT), "Add a name");
  assert.equal(missingFromContact({ ...EMPTY_CONTACT, name: "Rizu" }), "Add a phone number");
  assert.equal(
    missingFromContact({ ...EMPTY_CONTACT, name: "Rizu", phone: "01712344192" }),
    "Pick what they do"
  );
});

test("a half-typed number does not count as a number", () => {
  const draft = { ...EMPTY_CONTACT, name: "Rizu", phone: "0171", crafts: ["Voice"] };
  assert.equal(missingFromContact(draft), "Add a phone number");
  assert.equal(isContactComplete(draft), false);
});

test("a complete contact is complete however the number was typed", () => {
  for (const typed of ["+8801712344192", "01712-344192", "8801712344192"]) {
    assert.equal(
      isContactComplete({ ...EMPTY_CONTACT, name: "Rizu", phone: typed, crafts: ["Voice"] }),
      true,
      typed
    );
  }
});

test("a registration is matched to the contact with the same number", () => {
  const contact = member({ uid: "c1", accountless: true, phone: "+8801712344192" });
  const applicant = { uid: "new", phone: "01712-344192" };
  assert.equal(matchingContactFor(applicant, [contact])?.uid, "c1");
});

test("only contacts are offered: two real accounts are never merged", () => {
  const account = member({ uid: "a1", accountless: false, phone: "+8801712344192" });
  assert.equal(matchingContactFor({ uid: "new", phone: "+8801712344192" }, [account]), null);
});

test("a registration never matches itself", () => {
  const self = member({ uid: "new", accountless: true, phone: "+8801712344192" });
  assert.equal(matchingContactFor({ uid: "new", phone: "+8801712344192" }, [self]), null);
});

test("no number, no suggestion — a blank must never match a blank", () => {
  const contact = member({ uid: "c1", accountless: true, phone: null });
  assert.equal(matchingContactFor({ uid: "new", phone: null }, [contact]), null);
  assert.equal(matchingContactFor({ uid: "new", phone: "" }, [contact]), null);
});

test("removing says what went with them, because tasks go too", () => {
  assert.equal(contactRemovedToast("Rizu", 0), "Rizu removed");
  assert.equal(contactRemovedToast("Rizu", 1), "Rizu removed, along with 1 open task");
  assert.equal(contactRemovedToast("Rizu", 3), "Rizu removed, along with 3 open tasks");
});

test("linking says where the work went", () => {
  assert.match(linkedToast("Rizu", 0), /merged in$/);
  assert.match(linkedToast("Rizu", 1), /1 task moved/);
  assert.match(linkedToast("Rizu", 4), /4 tasks moved/);
});

test("the match note says how much work would move", () => {
  assert.match(contactMatchNote("Rizu Ahmed", 0), /nothing open/);
  assert.match(contactMatchNote("Rizu Ahmed", 1), /with 1 open task\./);
  assert.match(contactMatchNote("Rizu Ahmed", 2), /with 2 open tasks\./);
  assert.match(contactMatchNote("Rizu Ahmed", 2), /already on the team as Rizu Ahmed/);
});
