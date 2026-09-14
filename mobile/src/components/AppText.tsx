/**
 * Text that can draw what it is given.
 *
 * Every string in this app goes through here, so a Bengali episode title
 * picks up Noto Sans Bengali automatically instead of rendering as tofu in
 * Space Grotesk. Callers pass a preset from the type scale and forget about
 * it.
 */

import { Text, type TextProps, type TextStyle } from "react-native";

import { bengaliFallback } from "../theme/typography";

export interface AppTextProps extends TextProps {
  /** Weight to use if the string turns out to need the Bengali family. */
  weight?: "regular" | "medium" | "semibold";
}

/** Pull the rendered string out of children so the script can be sniffed. */
function flatten(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(flatten).join("");
  return "";
}

export function AppText({ style, weight = "regular", children, ...rest }: AppTextProps) {
  const fallback: TextStyle | undefined = bengaliFallback(flatten(children), weight);
  return (
    <Text style={[style, fallback]} {...rest}>
      {children}
    </Text>
  );
}
