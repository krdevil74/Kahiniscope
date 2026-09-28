/**
 * Capture the Play listing's tablet screenshots without a tablet.
 *
 * The listing asks for 7-inch and 10-inch shots, and there is no tablet in the
 * building. `screenshots.mjs` takes the phone ones off a real device over adb;
 * this takes the tablet ones off the web target, which is legitimate for the
 * same reason the tablet layout bug was found there in the first place: React
 * Native lays out from the window width exactly as react-native-web does, so a
 * window the size of a tablet's screen in dp renders the tablet layout — the
 * same components, the same tokens, the same 760px cap.
 *
 * What it is not is a photograph of Android: no status bar, no system back
 * gesture bar, and text is composited by Chrome rather than by Android. The
 * app's own pixels are the app's own.
 *
 *   600 x 960 dp  @2 = 1200 x 1920   a 7-inch tablet (Nexus 7)
 *   800 x 1280 dp @2 = 1600 x 2560   a 10-inch tablet (Nexus 10)
 *
 * Three terminals, from the repository root:
 *
 *   npm run emulators
 *   npm run seed:demo
 *   cd mobile && EXPO_PUBLIC_USE_EMULATORS=1 EXPO_PUBLIC_EMULATOR_HOST=127.0.0.1 \
 *     EXPO_PUBLIC_EMULATOR_OWNER=owner@kahiniscope.test \
 *     EXPO_PUBLIC_EMULATOR_MEMBER=rizu@example.com npx expo start
 *
 * then, here:
 *
 *   node scripts/tablet-screenshots.mjs 7 admin
 *   node scripts/tablet-screenshots.mjs 7 member
 *   node scripts/tablet-screenshots.mjs 10 admin
 *   node scripts/tablet-screenshots.mjs 10 member
 *
 * The owner address has to be the one in OWNER_EMAILS for the demo project —
 * functions/.env.kahiniscope-demo — or the account signs in as a member.
 *
 * Output: design/store-screenshots/tablet-7in and tablet-10in, flattened to
 * 24-bit PNG because Play rejects an alpha channel.
 */

import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

import sharp from "sharp";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ORIGIN = "http://localhost:8081";

const SIZES = {
  7: { dir: "tablet-7in", width: 600, height: 960, scale: 2 },
  10: { dir: "tablet-10in", width: 800, height: 1280, scale: 2 },
};

const which = process.argv[2] ?? "7";
const mode = process.argv[3] ?? "admin";
const size = SIZES[which];
if (!size) throw new Error(`Unknown size "${which}". Use 7 or 10.`);
if (mode !== "admin" && mode !== "member") throw new Error(`Unknown mode "${mode}".`);

const OUT = fileURLToPath(new URL(`../../design/store-screenshots/${size.dir}/`, import.meta.url));
mkdirSync(OUT, { recursive: true });

/**
 * A profile per run. Firebase keeps the session in localStorage, so reusing
 * one would sign the member in as whoever ran last.
 */
const PROFILE = `/tmp/kahiniscope-shots-${which}-${mode}`;
rmSync(PROFILE, { recursive: true, force: true });
const PORT = 9300 + Number(which) + (mode === "member" ? 40 : 0);

const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`,
  "--hide-scrollbars",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-gpu",
  "about:blank",
]);
chrome.on("error", () => {
  console.error(`Chrome is not at ${CHROME}.`);
  process.exit(1);
});

/** Wait for the debugging port, then attach to the one open page. */
async function pageSocket() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      const page = targets.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // Not listening yet.
    }
    await sleep(500);
  }
  throw new Error("Chrome never opened its debugging port.");
}

const ws = new WebSocket(await pageSocket());
await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));

let nextId = 1;
const pending = new Map();
ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  const waiting = pending.get(message.id);
  if (!waiting) return;
  pending.delete(message.id);
  message.error ? waiting.reject(new Error(JSON.stringify(message.error))) : waiting.resolve(message.result);
});

function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const { result, exceptionDetails } = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  return result.value;
}

/** Poll an expression until it is true. The first load has to build the bundle. */
async function until(expression, what, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await evaluate(expression)) return;
    } catch {
      // The page is mid-navigation; ask again.
    }
    await sleep(400);
  }
  throw new Error(`Timed out waiting for ${what}.`);
}

/**
 * Press something by its label. Real mouse events rather than element.click(),
 * because a Pressable listens for pointer events and a synthetic click is not
 * one. The deepest match wins: the label sits inside the pressable.
 */
async function press(label) {
  const point = await evaluate(`(() => {
    const wanted = ${JSON.stringify(label)};
    const hit = [...document.querySelectorAll("div,span,a,button")]
      .reverse()
      .find((node) => node.textContent.trim() === wanted && node.getClientRects().length);
    if (!hit) return null;
    const box = hit.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  })()`);
  if (!point) throw new Error(`Nothing on screen reads "${label}".`);
  for (const type of ["mousePressed", "mouseReleased"]) {
    await send("Input.dispatchMouseEvent", {
      type,
      x: point.x,
      y: point.y,
      button: "left",
      clickCount: 1,
      buttons: type === "mousePressed" ? 1 : 0,
    });
    await sleep(60);
  }
}

async function go(path) {
  await send("Page.navigate", { url: ORIGIN + path });
  await sleep(1200);
  await until("document.body.innerText.trim().length > 0", `${path} to render`);
}

async function shot(name) {
  await evaluate("document.fonts.ready.then(() => true)");
  // Long enough for the Firestore listeners to land and the bars to draw.
  await sleep(1500);
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  // Play wants 24-bit PNG: Chrome's has an alpha channel it will not take.
  const { width, height } = await sharp(Buffer.from(data, "base64"))
    .flatten({ background: "#ffffff" })
    .png({ compressionLevel: 9 })
    .toFile(OUT + name + ".png");
  console.log(`  ${size.dir}/${name}.png  ${width}x${height}`);
}

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: size.width,
  height: size.height,
  deviceScaleFactor: size.scale,
  mobile: true,
  screenWidth: size.width,
  screenHeight: size.height,
});
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

console.log(
  `\n${size.dir} · ${mode}: ${size.width}x${size.height}dp @${size.scale} → ` +
    `${size.width * size.scale}x${size.height * size.scale}px`
);

await send("Page.navigate", { url: ORIGIN });
await until(
  "!!document.body && /emulator/.test(document.body.innerText)",
  "the sign-in screen with its emulator buttons — is Metro running with EXPO_PUBLIC_USE_EMULATORS=1?",
  300_000
);

if (mode === "admin") {
  await press("emulator · owner");
  await until("/Overdue|Needs chasing/.test(document.body.innerText)", "the board");
  await sleep(2500);
  await shot("01-board");

  for (const [path, name] of [
    ["/episodes", "02-episodes"],
    ["/episode/seed-ep41", "03-episode"],
    ["/team", "04-team"],
    ["/requests", "05-requests"],
    ["/notify", "06-notify"],
  ]) {
    await go(path);
    await shot(name);
  }
} else {
  await press("emulator · member");
  await until("/Summary|Payments/.test(document.body.innerText)", "the member's summary");
  await sleep(2500);
  await shot("07-member-summary");

  // Tabs, not routes: the member's three screens share one.
  await press("Tasks");
  await sleep(2500);
  await shot("08-member-tasks");

  await press("Payments");
  await sleep(2500);
  await shot("09-member-payments");
}

ws.close();
chrome.kill();
console.log("Done.");
process.exit(0);
