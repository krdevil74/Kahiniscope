/**
 * Getting a payment screenshot onto a payment, and back off again.
 *
 * Four things happen here and only one of them is a Firestore write:
 *
 *   pickProofImage      the gallery, then a resize, because the payload is capped
 *   attachPaymentProof  a callable — the expiry has to be the server's clock
 *   fetchPaymentProof   one document, read only when somebody taps download
 *   saveProofToDevice   a file, then the share sheet
 *
 * Every native module below is loaded on demand and behind a try, the same way
 * lib/notifications.ts loads expo-notifications. The reason is recorded in
 * docs/STATUS.md: the web render resolves shims whose methods throw, so a
 * module being importable is not the same as it being usable, and a screen that
 * reaches for the gallery must not take the whole app down when there isn't
 * one. Both of these run on a screen an admin uses for money.
 */

import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { Platform } from "react-native";

import { db } from "./firebase";
import { toProof } from "./payment-convert.ts";
import {
  fitsProofLimit,
  PROOF_CONTENT_TYPE,
  PROOF_JPEG_QUALITY,
  PROOF_MAX_EDGE,
  proofFileName,
  type PaymentProof,
} from "./payment-proof.ts";
import { appFunctions } from "./region.ts";

const PROOFS = "paymentProofs";

// ---------------------------------------------------------------------------
// The gallery
// ---------------------------------------------------------------------------

export interface PickedImage {
  /** base64, no data: prefix. */
  data: string;
  contentType: string;
}

/**
 * A screenshot out of the gallery, resized to fit a Firestore document.
 *
 * `null` means the admin backed out, which is not an error and must not be
 * toasted as one. Anything actually wrong throws with a sentence.
 *
 * The resize is not optional and not a hope: a phone screenshot is a tall PNG
 * that routinely exceeds the payload limit, so it is re-encoded to JPEG at
 * 1280px and 60% before it is measured. A UPI confirmation is flat text on a
 * plain ground and survives that easily.
 */
export async function pickProofImage(): Promise<PickedImage | null> {
  const picker = loadPicker();
  if (!picker) throw new Error("This build cannot open the gallery.");

  const result = await picker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: false,
    // Cropping is a decision about evidence, so it is the admin's to make in
    // their own gallery, not a step this flow forces.
    allowsEditing: false,
    quality: 1,
  });
  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  const shrunk = await shrink(asset.uri);
  if (shrunk) return shrunk;

  // No manipulator in this build: fall back to whatever the picker gave us,
  // and let the size check below be the thing that refuses.
  const data = asset.base64 ?? (await readAsBase64(asset.uri));
  if (!data) throw new Error("That image could not be read.");
  if (!fitsProofLimit(data)) {
    throw new Error("That screenshot is too large. Crop it and try again.");
  }
  return { data, contentType: asset.mimeType ?? PROOF_CONTENT_TYPE };
}

/** Longest edge to 1280, JPEG at 60%. Null when the module is not in the build. */
async function shrink(uri: string): Promise<PickedImage | null> {
  const manipulator = loadManipulator();
  if (!manipulator) return null;

  const context = manipulator.ImageManipulator.manipulate(uri).resize({ width: PROOF_MAX_EDGE });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({
    format: manipulator.SaveFormat.JPEG,
    compress: PROOF_JPEG_QUALITY,
    base64: true,
  });

  const data = saved.base64 ?? (await readAsBase64(saved.uri));
  if (!data) throw new Error("That image could not be read.");
  if (!fitsProofLimit(data)) {
    // Resized and still too big is a very unusual photograph, not a screenshot.
    throw new Error("That image is too detailed to attach. A screenshot works best.");
  }
  return { data, contentType: PROOF_CONTENT_TYPE };
}

// ---------------------------------------------------------------------------
// Firestore
// ---------------------------------------------------------------------------

/**
 * Attach it, or replace what is there.
 *
 * A callable rather than a client write: the thirty-day expiry is set from the
 * server's clock, and a phone with the wrong date would otherwise decide for
 * itself when the evidence disappears.
 */
export async function attachPaymentProof(
  paymentId: string,
  image: PickedImage
): Promise<{ expiresAt: string }> {
  const call = httpsCallable<
    { paymentId: string; data: string; contentType: string },
    { expiresAt: string; byteSize: number }
  >(appFunctions(), "attachPaymentProof");
  const { data } = await call({ paymentId, ...image });
  return { expiresAt: data.expiresAt };
}

/**
 * The image, on demand.
 *
 * One `getDoc` rather than a subscription, and never called to render a list:
 * these documents are hundreds of kilobytes and the payment rows already carry
 * the two dates that say whether to offer the download at all.
 *
 * `null` covers both "expired and swept" and "never attached" — the caller
 * already knows which from the payment.
 */
export async function fetchPaymentProof(paymentId: string): Promise<PaymentProof | null> {
  const snap = await getDoc(doc(db, PROOFS, paymentId));
  return snap.exists() ? toProof(snap) : null;
}

// ---------------------------------------------------------------------------
// Off the phone
// ---------------------------------------------------------------------------

/** What happened to the screenshot, so the toast can say the true thing. */
export type ProofSaved = "saved" | "shared" | "unavailable";

/**
 * Put the image on the phone.
 *
 * It used to go straight to the share sheet, on the reasoning that the sheet
 * is what "download" means on Android and that the media-library permission is
 * a lot to ask for one screenshot. In the hand it is not what it means: tapping
 * a ⤓ and being offered WhatsApp and Messenger is being asked to send your own
 * evidence to somebody, when all you wanted was to keep it.
 *
 * So it saves to the photos first, and asks once. If the permission is refused
 * — or the module is not in this build — the share sheet is still there, which
 * is a smaller promise honestly kept rather than a dead button.
 *
 * `unavailable` is the honest answer on a web render and in Expo Go, where
 * neither route exists.
 */
export async function saveProofToDevice(
  payment: { id: string; taskType: string },
  proof: PaymentProof
): Promise<ProofSaved> {
  const fs = loadFileSystem();
  if (!fs) return "unavailable";

  const file = new fs.File(fs.Paths.cache, proofFileName(payment, proof.contentType));
  // A stale file from a previous tap would otherwise be saved instead.
  if (file.exists) file.delete();
  file.create();
  // The bytes are handed over as base64 rather than decoded here: React Native
  // does not provide `atob`, and a base64 polyfill for one screenshot is a
  // dependency this does not need when the file layer already speaks it.
  file.write(proof.data, { encoding: "base64" });

  if (await saveToPhotos(file.uri)) return "saved";

  const sharing = loadSharing();
  if (!sharing || !(await sharing.isAvailableAsync())) return "unavailable";
  await sharing.shareAsync(file.uri, {
    mimeType: proof.contentType,
    dialogTitle: "Save the payment screenshot",
    UTI: "public.image",
  });
  return "shared";
}

/**
 * Into the phone's own photos, if we are allowed.
 *
 * `writeOnly` because that is all this does — it adds one image and never
 * reads the library, and the system dialog says so, which is the difference
 * between a reasonable request and an alarming one. Refusal is an ordinary
 * answer here, not an error: the caller falls back to the share sheet.
 */
async function saveToPhotos(uri: string): Promise<boolean> {
  const media = loadMediaLibrary();
  if (!media) return false;
  try {
    const existing = await media.getPermissionsAsync(true);
    const granted =
      existing.granted || (existing.canAskAgain && (await media.requestPermissionsAsync(true)).granted);
    if (!granted) return false;
    await media.saveToLibraryAsync(uri);
    return true;
  } catch {
    // Including the one that matters on Android 13+: a library that is there
    // but refuses to write. The share sheet is still a way out.
    return false;
  }
}

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

/**
 * The four native modules, each loaded on demand and each behind a try.
 *
 * Web is ruled out first rather than trusting the require to fail: the shims
 * resolve and throw when called, which is the shape of the bug that took the
 * web render down once already (docs/STATUS.md, first run, item 2).
 *
 * One loader per module, with the name written out, because Metro will not
 * bundle a `require` whose argument is a variable — it has to be able to see
 * what is being asked for.
 */
const absent = () => Platform.OS === "web";

function loadPicker(): typeof import("expo-image-picker") | null {
  if (absent()) return null;
  try {
    return require("expo-image-picker");
  } catch {
    return null;
  }
}

function loadManipulator(): typeof import("expo-image-manipulator") | null {
  if (absent()) return null;
  try {
    return require("expo-image-manipulator");
  } catch {
    return null;
  }
}

function loadFileSystem(): typeof import("expo-file-system") | null {
  if (absent()) return null;
  try {
    return require("expo-file-system");
  } catch {
    return null;
  }
}

function loadMediaLibrary(): typeof import("expo-media-library") | null {
  if (absent()) return null;
  try {
    return require("expo-media-library");
  } catch {
    return null;
  }
}

function loadSharing(): typeof import("expo-sharing") | null {
  if (absent()) return null;
  try {
    return require("expo-sharing");
  } catch {
    return null;
  }
}

async function readAsBase64(uri: string): Promise<string | null> {
  const fs = loadFileSystem();
  if (!fs) return null;
  try {
    return new fs.File(uri).base64();
  } catch {
    return null;
  }
}
