/**
 * A phone number, the way everybody on this team writes one.
 *
 * The country code is a label, not something to type. Everybody here is in
 * India, so asking each person to key "+91" in front of ten digits is ten
 * chances to get it wrong — and a field that accepts "+91", "91", "091" and
 * "0091" is a field that eventually stores one of them raw.
 *
 * So: a fixed prefix, ten digits, and nothing else gets through.
 */

import { TextInput, View } from "react-native";

import { AppText } from "./AppText";
import { DEFAULT_DIAL_CODE, limitNationalInput, NATIONAL_DIGITS } from "../lib/phone.ts";
import { colors, fontFamily, radii, MIN_TAP_TARGET } from "../theme/tokens";

export interface PhoneFieldProps {
  /** The ten national digits. Not the E.164 form. */
  value: string;
  onChange: (next: string) => void;
  invalid?: boolean;
  accessibilityLabel: string;
}

export function PhoneField({ value, onChange, invalid = false, accessibilityLabel }: PhoneFieldProps) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "stretch",
        borderWidth: 1,
        borderColor: invalid ? colors.danger : colors.hairlineStrong,
        borderRadius: radii.chipLarge,
        backgroundColor: colors.surface,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          justifyContent: "center",
          paddingHorizontal: 13,
          backgroundColor: colors.surfaceSunken,
          borderRightWidth: 1,
          borderRightColor: colors.hairline,
        }}
      >
        <AppText
          style={{
            fontFamily: fontFamily.monoMedium,
            fontSize: 13,
            lineHeight: 16,
            color: colors.muted,
          }}
        >
          {DEFAULT_DIAL_CODE}
        </AppText>
      </View>

      <TextInput
        value={value}
        onChangeText={(next: string) => onChange(limitNationalInput(next))}
        placeholder="98765 43210"
        placeholderTextColor={colors.faint}
        keyboardType="number-pad"
        autoComplete="tel"
        maxLength={NATIONAL_DIGITS}
        accessibilityLabel={accessibilityLabel}
        style={{
          flex: 1,
          paddingVertical: 12,
          paddingHorizontal: 13,
          minHeight: MIN_TAP_TARGET,
          fontFamily: fontFamily.mono,
          fontSize: 13,
          color: colors.ink,
        }}
      />
    </View>
  );
}
