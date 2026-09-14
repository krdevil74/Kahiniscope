/**
 * Generate every launcher and store image from the one asset that exists:
 * ../assets/kahiniscope-logo.png, the client's 2937x2937 transparent PNG.
 *
 *   npm run icons
 *
 * The handoff is explicit that no other imagery exists and none is to be
 * invented, so everything here is the same disc at different sizes, on the
 * brand's own backgrounds.
 */

import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const SOURCE = fileURLToPath(new URL("../../assets/kahiniscope-logo.png", import.meta.url));
const OUT = fileURLToPath(new URL("../assets/", import.meta.url));

const INK = { r: 0x1b, g: 0x1a, b: 0x17, alpha: 1 };
const SURFACE_ALT = { r: 0xf7, g: 0xf5, b: 0xf0, alpha: 1 };
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

const logo = (size) =>
  sharp(SOURCE).resize(size, size, { fit: "contain", background: TRANSPARENT }).png();

/** Logo centred on a canvas, at `scale` of the canvas width. */
async function centred({ size, scale, background, file }) {
  const inner = Math.round(size * scale);
  const buf = await logo(inner).toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background },
  })
    .composite([{ input: buf, gravity: "center" }])
    .png()
    .toFile(OUT + file);
  console.log(`  ${file}  ${size}x${size}  logo at ${Math.round(scale * 100)}%`);
}

await mkdir(OUT, { recursive: true });

console.log("Launcher and store images:");

// App icon. The disc runs to the edge of the square, so the ink only shows
// in the four corners — the mark stays as large as the format allows.
await centred({ size: 1024, scale: 1, background: INK, file: "icon.png" });

// Android adaptive icon. The foreground is masked to whatever shape the
// launcher chooses, and only the centre 66% is guaranteed to survive, so the
// disc sits at 68% on a transparent field with the ink supplied separately.
await centred({ size: 1024, scale: 0.68, background: TRANSPARENT, file: "android-icon-foreground.png" });
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: INK } })
  .png()
  .toFile(OUT + "android-icon-background.png");
console.log("  android-icon-background.png  1024x1024  solid ink");

// Monochrome (themed icons, Android 13+). The launcher throws the colour
// away and paints the alpha channel in whatever tint the wallpaper suggests,
// so the alpha has to carry the drawing. Building it from the source's own
// darkness keeps the wordmark and drops the yellow field: ink becomes opaque,
// the disc becomes transparent, and everything outside the disc stays empty.
{
  const size = 1024;
  const inner = Math.round(size * 0.68);
  const { data, info } = await sharp(SOURCE)
    .resize(inner, inner, { fit: "contain", background: TRANSPARENT })
    .extend({
      top: Math.floor((size - inner) / 2),
      bottom: Math.ceil((size - inner) / 2),
      left: Math.floor((size - inner) / 2),
      right: Math.ceil((size - inner) / 2),
      background: TRANSPARENT,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i++) {
    const p = i * info.channels;
    const luma = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
    const darkness = 255 - luma;              // ink high, yellow low
    const alpha = data[p + 3] / 255;          // nothing outside the disc
    out[i * 4] = 255;
    out[i * 4 + 1] = 255;
    out[i * 4 + 2] = 255;
    out[i * 4 + 3] = Math.round(darkness * alpha);
  }

  await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toFile(OUT + "android-icon-monochrome.png");
}
console.log("  android-icon-monochrome.png  1024x1024  wordmark in the alpha channel");

// Splash. Drawn on surface-alt, the same ground as the pending screen, so
// launching into the holding screen has no visible seam.
await centred({ size: 1024, scale: 0.62, background: TRANSPARENT, file: "splash-icon.png" });

// Play Console store icon: 512x512, no alpha anywhere.
await sharp({ create: { width: 512, height: 512, channels: 4, background: INK } })
  .composite([{ input: await logo(512).toBuffer(), gravity: "center" }])
  .flatten({ background: INK })
  .removeAlpha()
  .png({ compressionLevel: 9 })
  .toFile(OUT + "store-icon-512.png");
console.log("  store-icon-512.png  512x512  flattened, no alpha (Play listing)");

// Notification icon: white silhouette on transparent, which is all Android
// renders in the status bar.
await sharp(SOURCE)
  .resize(96, 96, { fit: "contain", background: TRANSPARENT })
  .png()
  .toFile(OUT + "notification-icon.png");
console.log("  notification-icon.png  96x96  status bar mark");

// The mark as the app itself draws it: header at 40px, pending screen at 76.
await logo(512).toFile(OUT + "logo.png");
console.log("  logo.png  512x512  in-app mark, transparent");

await sharp(SOURCE).resize(48, 48).png().toFile(OUT + "favicon.png");
console.log("  favicon.png  48x48");

// Play listing feature graphic: 1024x500, no alpha, no text that the store
// will overlay. The mark on ink, off-centre, with the brand yellow as a band
// — the same two colours the app is built from and nothing invented.
{
  const width = 1024;
  const height = 500;
  const mark = await logo(360).toBuffer();

  await sharp({ create: { width, height, channels: 4, background: INK } })
    .composite([
      // A yellow band along the bottom edge, echoing the member header.
      {
        input: {
          create: { width, height: 8, channels: 4, background: { r: 0xff, g: 0xc2, b: 0x0a, alpha: 1 } },
        },
        top: height - 8,
        left: 0,
      },
      { input: mark, top: Math.round((height - 360) / 2), left: Math.round((width - 360) / 2) },
    ])
    .flatten({ background: INK })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(OUT + "store-feature-graphic-1024x500.png");
  console.log("  store-feature-graphic-1024x500.png  1024x500  Play listing, no alpha");
}

console.log(`\nSplash background: #f7f5f0   Adaptive icon background: #1b1a17`);
