import test from "node:test";
import assert from "node:assert/strict";

import { containsBengali, scriptOf } from "./bengali.ts";

test("recognises the sample episode titles", () => {
  for (const title of ["রক্তমুখী নীলা", "শেষ ট্রামের যাত্রী", "কুয়াশার নিচে"]) {
    assert.equal(containsBengali(title), true, title);
    assert.equal(scriptOf(title), "bengali");
  }
});

test("leaves English interface copy alone", () => {
  for (const copy of ["Needs chasing", "EP-41", "Nudge now", "4d overdue", "", "7 → 4 → 3 → 2 → 1 days"]) {
    assert.equal(containsBengali(copy), false, copy);
    assert.equal(scriptOf(copy), "latin");
  }
});

test("a mixed string is Bengali, because one Text gets one family", () => {
  assert.equal(scriptOf("EP-41 রক্তমুখী নীলা"), "bengali");
  assert.equal(scriptOf("Voice recording · কুয়াশার নিচে"), "bengali");
});

test("Bengali digits count", () => {
  assert.equal(containsBengali("৪১"), true);
});

test("non-strings are not Bengali", () => {
  for (const value of [null, undefined, 41, {}, []]) {
    assert.equal(containsBengali(value), false, String(value));
  }
});
