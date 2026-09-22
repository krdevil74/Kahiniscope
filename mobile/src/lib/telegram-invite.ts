/**
 * What somebody reads when they are asked to connect Telegram.
 *
 * This is the first thing a bot ever says to a person, and it is usually
 * forwarded by an admin into a chat that already has a relationship in it —
 * so it is written as one person asking another, not as a system announcing
 * itself. It says who it is from, what it does, exactly what to do, and what
 * it will not do.
 *
 * That last part is the one that matters. Somebody handing over a messaging
 * channel wants to know what they are letting in, and "we will not spam you"
 * is only believable if the message also says how often it will actually
 * write and why.
 *
 * Pure: no Firebase, no React. Unit tested.
 */

/** First name only. A full name in a greeting reads like a form letter. */
function firstName(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first || "there";
}

export interface InviteText {
  /** The whole message, for the share sheet. */
  message: string;
  /** The subject line, for the share targets that use one. */
  subject: string;
}

export function telegramInvite(name: string | null | undefined, url: string): InviteText {
  const who = firstName(name);

  return {
    subject: "Your Kahiniscope reminders on Telegram",
    message:
      `Hi ${who},\n\n` +
      `Welcome to Kahiniscope's reminder system.\n\n` +
      `Open the link below and press Start. That connects this chat, and from ` +
      `then on your task reminders arrive here — with the episode, what is ` +
      `needed and by when, and a button to submit straight from the chat.\n\n` +
      `${url}\n\n` +
      `You will only hear from us about work that is actually assigned to you, ` +
      `and only while it is still open. No newsletters, no announcements, ` +
      `nothing at odd hours. We know your time is the work.\n\n` +
      `— Kahiniscope`,
  };
}
