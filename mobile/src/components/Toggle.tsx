/**
 * The 44×26 switch: ink when on, hairline-strong when off, a white knob that
 * slides.
 */

import { Pressable, View } from "react-native";

import { colors, layout, radii } from "../theme/tokens";

export interface ToggleProps {
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  accessibilityLabel: string;
}

export function Toggle({ value, onChange, disabled = false, accessibilityLabel }: ToggleProps) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      // The control is 26px tall; the slop is what reaches 44.
      hitSlop={{ top: 9, bottom: 9, left: 6, right: 6 }}
      style={{
        width: layout.toggleWidth,
        height: layout.toggleHeight,
        borderRadius: radii.pill,
        padding: 3,
        flexDirection: "row",
        justifyContent: value ? "flex-end" : "flex-start",
        backgroundColor: value ? colors.ink : colors.hairlineStronger,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: radii.pill,
          backgroundColor: colors.white,
          elevation: 2,
          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowRadius: 3,
          shadowOffset: { width: 0, height: 1 },
        }}
      />
    </Pressable>
  );
}
