/**
 * The scrolling body for any screen with a text box on it.
 *
 * Android is edge to edge, and edge to edge means the window no longer
 * shrinks when the keyboard opens: a plain ScrollView carries on as though
 * the keyboard were not there, and the box being typed into ends up under
 * it. This one scrolls the focused box clear of the keyboard, with room to
 * spare for the line of help text that usually sits beneath it.
 *
 * Taps stay with the form while the keyboard is up, so the first tap on a
 * button presses it rather than only closing the keyboard.
 */

import type { ComponentProps } from "react";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

/** Enough to show the box and the note or button directly under it. */
const CLEARANCE = 72;

export function KeyboardScroll(props: ComponentProps<typeof KeyboardAwareScrollView>) {
  return (
    <KeyboardAwareScrollView
      bottomOffset={CLEARANCE}
      keyboardShouldPersistTaps="handled"
      {...props}
    />
  );
}
