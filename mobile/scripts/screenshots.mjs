/**
 * Capture Play Store screenshots from a real Android device or emulator.
 *
 *   adb devices                 # make sure one is attached
 *   npm run screenshots
 *
 * Play wants at least two phone screenshots, 16:9 or 9:16, between 320 and
 * 3840 px on the long edge. A modern phone's own screen already satisfies
 * that, so these are taken at full resolution and left alone.
 *
 * They are deliberately taken from the running app rather than generated:
 * a store screenshot that does not match what installs is the one thing the
 * listing must never do. Seed the demo data first so the screens have
 * something in them (npm run seed:demo from the repository root).
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const OUT = fileURLToPath(new URL("../store/screenshots/", import.meta.url));

/** The five worth showing, in the order they tell the story. */
const SHOTS = [
  ["01-board", "The admin's board — overdue count, who needs chasing, the reminder feed"],
  ["02-episodes", "Episodes — slate completion and one card per episode"],
  ["03-episode-detail", "An episode — members, their tasks, a percentage at every level"],
  ["04-member", "A member's own app — their tasks and one Mark done button"],
  ["05-notify", "Notifications — channels and the escalation ladder"],
];

function adb(args) {
  return execFileSync("adb", args, { maxBuffer: 64 * 1024 * 1024 });
}

try {
  const devices = adb(["devices"]).toString().trim().split("\n").slice(1).filter(Boolean);
  if (devices.length === 0) {
    console.error("No device. Attach a phone with USB debugging, or start an emulator.");
    process.exit(1);
  }
  console.log(`Using: ${devices[0]}`);
} catch {
  console.error("adb is not on the PATH. It comes with Android Studio's platform-tools.");
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
const rl = createInterface({ input: stdin, output: stdout });

for (const [name, description] of SHOTS) {
  await rl.question(`\n${description}\n  Put that screen on the device, then press Enter…`);
  const png = adb(["exec-out", "screencap", "-p"]);
  writeFileSync(OUT + name + ".png", png);
  console.log(`  saved store/screenshots/${name}.png (${Math.round(png.length / 1024)}KB)`);
}

await rl.close();
console.log(`\nDone. Upload any two or more from store/screenshots/.`);
