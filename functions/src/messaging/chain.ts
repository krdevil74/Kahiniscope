/**
 * The fallback chain: try in order, stop at the first success, log every
 * attempt.
 *
 * The adapters are passed in rather than imported, so the order and the
 * logging can be tested without a network, a bot token, or a device.
 */

import type { ChannelAdapter, ChannelId, Recipient, ReminderMessage, SendOutcome } from "./types";
import { CHAIN } from "./types";

export interface ChainResult {
  /** The channel that worked, or null if none did. */
  delivered: ChannelId | null;
  /** Every attempt, in order, including the ones that were skipped. */
  attempts: SendOutcome[];
}

export interface ChainOptions {
  /** settings/global.channels — a channel switched off is never tried. */
  enabled: Partial<Record<ChannelId, boolean>>;
  /**
   * The task's preferredChannel, if it has one. It is tried first, then the
   * normal order resumes — a preference, not a restriction, because a
   * reminder that is not delivered is worse than one delivered the wrong way.
   */
  preferred?: ChannelId | null;
  /**
   * SMS costs a message a day on the free key, so it is held back for tasks
   * already at the daily stage.
   */
  escalationStep?: number;
  smsFromStep?: number;
}

export const DEFAULT_SMS_FROM_STEP = 4;

/** The order to try, honouring a preference without letting it trap a message. */
export function chainOrder(preferred?: ChannelId | null): ChannelId[] {
  if (!preferred) return [...CHAIN];
  return [preferred, ...CHAIN.filter((c) => c !== preferred)];
}

export async function sendThroughChain(
  adapters: readonly ChannelAdapter[],
  to: Recipient,
  message: ReminderMessage,
  options: ChainOptions
): Promise<ChainResult> {
  const byId = new Map(adapters.map((a) => [a.id, a]));
  const attempts: SendOutcome[] = [];
  const smsFromStep = options.smsFromStep ?? DEFAULT_SMS_FROM_STEP;

  for (const id of chainOrder(options.preferred)) {
    const adapter = byId.get(id);
    if (!adapter) continue;

    if (options.enabled[id] === false) {
      attempts.push({ result: "skipped", channel: id, error: "switched off" });
      continue;
    }

    if (id === "sms" && (options.escalationStep ?? 0) < smsFromStep) {
      attempts.push({
        result: "skipped",
        channel: id,
        error: "held back until the daily stage",
      });
      continue;
    }

    if (!adapter.canReach(to)) {
      attempts.push({ result: "skipped", channel: id, error: "no address for this person" });
      continue;
    }

    let outcome: SendOutcome;
    try {
      outcome = await adapter.send(to, message);
    } catch (err) {
      outcome = {
        result: "failed",
        channel: id,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    attempts.push(outcome);
    if (outcome.result === "delivered") {
      return { delivered: id, attempts };
    }
  }

  return { delivered: null, attempts };
}
