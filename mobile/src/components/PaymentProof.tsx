/**
 * The payment screenshot, on both sides of the app.
 *
 * `ProofDownload` is the small ⤓ beside an amount: whoever can read the payment
 * can save the image. For a member it is the evidence that the transfer
 * happened; for an admin it is a look at what they attached.
 *
 * `ProofAttach` is the admin's half — pick a screenshot, and it is on the
 * payment. It sits on the pending card, where the admin is already typing the
 * figure they just transferred, and again inside a paid row for the times
 * somebody marks a payment paid and remembers the screenshot afterwards.
 *
 * Neither loads an image to draw a list. The payment carries two dates saying
 * whether a screenshot exists and until when; the bytes are fetched only when
 * somebody taps. See lib/payment-proof.ts.
 */

import { useState } from "react";
import { Pressable, View } from "react-native";

import { AppText } from "./AppText";
import { Button } from "./Button";
import { useToast } from "../lib/toast";
import {
  isProofAvailable,
  proofLabel,
  PROOF_RETENTION_NOTE,
  type ProofDates,
} from "../lib/payment-proof.ts";
import {
  attachPaymentProof,
  fetchPaymentProof,
  pickProofImage,
  saveProofToDevice,
} from "../lib/proof-actions.ts";
import { colors, fontFamily, radii } from "../theme/tokens";
import { type } from "../theme/typography";

interface ProofPayment extends ProofDates {
  id: string;
  taskType: string;
}

/**
 * The download. Nothing is drawn when there is no screenshot to fetch, and
 * nothing is drawn once it has expired — the row says so in words instead, so
 * the icon never promises a file that is gone.
 */
export function ProofDownload({ payment, now }: { payment: ProofPayment; now: Date }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  if (!isProofAvailable(payment, now)) return null;

  async function download() {
    if (busy) return;
    setBusy(true);
    try {
      const proof = await fetchPaymentProof(payment.id);
      if (!proof) {
        // Swept between the list loading and the tap. Rare, and the honest
        // answer is the reason rather than a failure.
        toast("That screenshot has been deleted — payments keep theirs for 30 days.");
        return;
      }
      const saved = await saveProofToDevice(payment, proof);
      if (saved === "saved") toast("Saved to your photos.");
      if (saved === "unavailable") toast("This build cannot save files. Open the app on your phone.");
      // "shared" says nothing: the sheet they just used is its own receipt.
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not download.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressable
      onPress={() => void download()}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={`Download the payment screenshot for ${payment.taskType}`}
      accessibilityState={{ disabled: busy }}
      hitSlop={12}
      style={{
        width: 30,
        height: 30,
        borderRadius: radii.pill,
        borderWidth: 1,
        borderColor: busy ? colors.hairlineStrong : colors.money,
        backgroundColor: colors.moneySoft,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <AppText
        weight="semibold"
        style={{
          fontFamily: fontFamily.monoSemibold,
          fontSize: 12,
          lineHeight: 14,
          color: busy ? colors.faint : colors.money,
        }}
      >
        {busy ? "…" : "⤓"}
      </AppText>
    </Pressable>
  );
}

/**
 * The admin's side: attach one, or replace the one that is there.
 *
 * Replacing resets the thirty days, which is worth knowing and is why the label
 * changes rather than the button disappearing once something is attached.
 */
export function ProofAttach({
  payment,
  now,
  compact = false,
}: {
  payment: ProofPayment;
  now: Date;
  /** Inside an expanded row, where the button is one of several quiet ones. */
  compact?: boolean;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const attached = isProofAvailable(payment, now);

  async function attach() {
    if (busy) return;
    setBusy(true);
    try {
      const image = await pickProofImage();
      // Backing out of the gallery is not a failure and says nothing.
      if (!image) return;
      await attachPaymentProof(payment.id, image);
      toast(attached ? "Screenshot replaced — 30 days from now." : "Screenshot attached.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "That did not attach.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 5 }}>
      <Button
        label={busy ? "Attaching…" : attached ? "Replace screenshot" : "Attach screenshot"}
        variant="quiet"
        size={compact ? "compact" : "regular"}
        radius={radii.cardSmall}
        disabled={busy}
        onPress={() => void attach()}
        accessibilityLabel={`${attached ? "Replace" : "Attach"} the payment screenshot for ${payment.taskType}`}
        style={{ borderColor: colors.hairlineStrong }}
      />
      {!compact ? (
        <AppText style={[type.metaXSmall, { color: colors.faint, lineHeight: 15 }]}>
          {PROOF_RETENTION_NOTE}
        </AppText>
      ) : null}
    </View>
  );
}

/**
 * "Screenshot · 12 days left", or "Screenshot expired".
 *
 * The expired line is the reason a payment keeps the date it was attached:
 * somebody who saw the image last month and comes back for it should read that
 * it has gone, not find a row that never mentioned it.
 */
export function ProofNote({ payment, now }: { payment: ProofPayment; now: Date }) {
  const label = proofLabel(payment, now);
  if (!label) return null;
  const gone = !isProofAvailable(payment, now);

  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: gone ? colors.surfaceSunken : colors.moneySoft,
        borderRadius: radii.pill,
        paddingVertical: 4,
        paddingHorizontal: 9,
        minHeight: 0,
      }}
    >
      <AppText
        style={{
          fontFamily: fontFamily.mono,
          fontSize: 9.5,
          lineHeight: 13,
          color: gone ? colors.faint : colors.money,
        }}
      >
        {label}
      </AppText>
    </View>
  );
}
