/**
 * The owner rule, tested on its own. Run with `npm test` in functions/ —
 * the sources are compiled to lib/ first.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  isOwnerEmail,
  initialAccess,
  reconcileAccess,
  accessChanged,
  displayNameFrom,
} from "../lib/roles.js";

const OWNERS = ["owner@kahiniscope.test"];

test("the owner address on a verified token is the owner", () => {
  assert.equal(isOwnerEmail("owner@kahiniscope.test", true, OWNERS), true);
  assert.deepEqual(initialAccess("owner@kahiniscope.test", true, OWNERS), {
    role: "owner",
    status: "approved",
  });
});

test("case and surrounding space do not matter", () => {
  assert.equal(isOwnerEmail("  Owner@Kahiniscope.TEST ", true, OWNERS), true);
});

test("an unverified owner address is not the owner", () => {
  assert.equal(isOwnerEmail("owner@kahiniscope.test", false, OWNERS), false);
  assert.equal(isOwnerEmail("owner@kahiniscope.test", undefined, OWNERS), false);
});

test("lookalike addresses are not the owner", () => {
  for (const email of [
    "owner@kahiniscope.test.attacker.net",
    "owner@kahiniscope.example",
    "owner+admin@kahiniscope.test",
    "own.er@kahiniscope.test",
    "xowner@kahiniscope.test",
    "",
    null,
    undefined,
  ]) {
    assert.equal(isOwnerEmail(email, true, OWNERS), false, String(email));
  }
});

test("a second owner address can be added without other changes", () => {
  const owners = ["owner@kahiniscope.test", "backup@kahiniscope.test"];
  assert.equal(isOwnerEmail("backup@kahiniscope.test", true, owners), true);
});

test("every other verified Google account lands pending", () => {
  assert.deepEqual(initialAccess("rizu@gmail.com", true, OWNERS), {
    role: "member",
    status: "pending",
  });
});

test("reconcile keeps a legitimate admin", () => {
  assert.deepEqual(
    reconcileAccess(
      { role: "admin", status: "approved" },
      "rizu@gmail.com",
      true,
      OWNERS
    ),
    { role: "admin", status: "approved" }
  );
});

test("reconcile demotes a self-declared owner to admin", () => {
  assert.deepEqual(
    reconcileAccess(
      { role: "owner", status: "approved" },
      "attacker@gmail.com",
      true,
      OWNERS
    ),
    { role: "admin", status: "approved" }
  );
});

test("reconcile restores the real owner from a tampered document", () => {
  assert.deepEqual(
    reconcileAccess(
      { role: "member", status: "pending" },
      "owner@kahiniscope.test",
      true,
      OWNERS
    ),
    { role: "owner", status: "approved" }
  );
});

test("reconcile falls back to least privilege on junk", () => {
  assert.deepEqual(
    reconcileAccess({ role: "superuser", status: "yes" }, "x@gmail.com", true, OWNERS),
    { role: "member", status: "pending" }
  );
  assert.deepEqual(
    reconcileAccess({}, "x@gmail.com", true, OWNERS),
    { role: "member", status: "pending" }
  );
});

test("an admin who is not approved is not an admin", () => {
  assert.deepEqual(
    reconcileAccess(
      { role: "admin", status: "pending" },
      "rizu@gmail.com",
      true,
      OWNERS
    ),
    { role: "member", status: "pending" }
  );
});

test("accessChanged spots approval and promotion", () => {
  assert.equal(
    accessChanged({ role: "member", status: "pending" }, { role: "member", status: "approved" }),
    true
  );
  assert.equal(
    accessChanged({ role: "member", status: "approved" }, { role: "admin", status: "approved" }),
    true
  );
  assert.equal(
    accessChanged({ role: "admin", status: "approved" }, { role: "admin", status: "approved" }),
    false
  );
  assert.equal(accessChanged({}, { role: "member", status: "pending" }), true);
});

test("display name falls back to the address local part", () => {
  assert.equal(displayNameFrom("Rizu Ahmed", "rizu@gmail.com"), "Rizu Ahmed");
  assert.equal(displayNameFrom("  ", "rizu@gmail.com"), "rizu");
  assert.equal(displayNameFrom(null, null), "New member");
});
