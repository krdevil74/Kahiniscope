/**
 * The one rule the swap-in-place theme imposes, enforced rather than
 * documented.
 *
 * `colors` is a live object (see tokens.ts): the palette is swapped in place
 * when the theme changes and the tree re-renders, so anything that reads
 * `colors.x` *during render* follows the theme. Anything that reads it once
 * at module load does not — it keeps whichever theme happened to be active
 * when the file was first imported, for the life of the process.
 *
 * That is not a hypothetical. It was real in three places when the themes
 * went in: a frozen `StyleSheet.create` in the toast, a plain style object in
 * the review screen, and the whole type scale, which would have left every
 * heading in the app one colour forever.
 *
 * A comment would not have caught the next one. This does.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function sources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      sources(path, found);
    } else if (/\.tsx?$/.test(entry) && !entry.includes(".test.")) {
      found.push(path);
    }
  }
  return found;
}

/**
 * Top-level `const X = …` whose initialiser mentions `colors.`.
 *
 * Declarations that are functions or components are fine: their body runs at
 * call time, which is render time. It is the plain values — objects, arrays,
 * frozen stylesheets — that capture.
 */
function capturedAtModuleScope(text: string): string[] {
  const lines = text.split("\n");
  const hits: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^(export )?const [A-Za-z_][A-Za-z0-9_]* /.test(line)) continue;

    let depth = 0;
    const block: string[] = [];
    let j = i;
    do {
      const current = lines[j];
      block.push(current);
      for (const ch of current) {
        if (ch === "{" || ch === "[" || ch === "(") depth += 1;
        if (ch === "}" || ch === "]" || ch === ")") depth -= 1;
      }
      j += 1;
    } while (depth > 0 && j < lines.length);

    const body = block.join("\n");
    // A function or a component reads at call time, which is render time.
    const isCallable = /=>|\bfunction\b|\bmemo\(|\bforwardRef\(/.test(body);
    if (!isCallable && /\bcolors\./.test(body)) {
      hits.push(`${lines[i].trim().slice(0, 70)} (line ${i + 1})`);
    }
    i = j - 1;
  }

  return hits;
}

test("no style object captures the palette at module scope", () => {
  const offenders: string[] = [];

  for (const path of [...sources("src"), ...sources("app")]) {
    // tokens.ts and palettes.ts are where the palette is *defined*.
    if (path.startsWith("src/theme/tokens") || path.startsWith("src/theme/palettes")) continue;
    for (const hit of capturedAtModuleScope(readFileSync(path, "utf8"))) {
      offenders.push(`${path}: ${hit}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "These read `colors` once at import and will not follow the theme.\n" +
      "Make each one a function called during render, or pass the colour in as a prop:\n" +
      offenders.join("\n")
  );
});

test("the guard actually catches the shape it is guarding against", () => {
  // The exact bug that was in toast.tsx.
  const frozen = `const styles = StyleSheet.create({\n  toast: { backgroundColor: colors.bar },\n});`;
  assert.equal(capturedAtModuleScope(frozen).length, 1);

  // And the exact bug that was in review.tsx.
  const plain = `const inputStyle = {\n  color: colors.ink,\n} as const;`;
  assert.equal(capturedAtModuleScope(plain).length, 1);
});

test("the guard does not fire on things that read at render time", () => {
  const fn = `const inputStyle = () => ({ color: colors.ink });`;
  assert.deepEqual(capturedAtModuleScope(fn), []);

  const component = `const Row = memo(function Row() {\n  return <View style={{ backgroundColor: colors.surface }} />;\n});`;
  assert.deepEqual(capturedAtModuleScope(component), []);

  const noColours = `const SIZES = { small: 12, large: 20 };`;
  assert.deepEqual(capturedAtModuleScope(noColours), []);
});
