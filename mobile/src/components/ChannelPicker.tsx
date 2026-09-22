/**
 * Which channel this person is reminded on.
 *
 * The admin's choice, set per person. It is a preference rather than a
 * restriction: if the pinned channel fails or cannot reach them, the chain
 * still falls through, because a reminder that is not delivered is worse than
 * one delivered the wrong way.
 *
 * "Whatever works" is first and is the default, because it is the right
 * answer for almost everybody.
 */

import { Pressable, View } from "react-native";

import { AppText } from "./AppText";
import { SectionCaption } from "./SectionCaption";
import { CHANNEL_LABELS } from "../lib/channels.ts";
import type { ChannelId, Settings, TeamMember } from "../lib/model";
import { reachableChannels } from "../lib/channels.ts";
import { colors, fontFamily, radii, spacing } from "../theme/tokens";
import { type } from "../theme/typography";

export interface ChannelPickerProps {
  member: TeamMember;
  settings: Settings;
  busy?: boolean;
  onChange: (channel: ChannelId | null) => void;
}

const ORDER: ChannelId[] = ["push", "telegram", "whatsapp", "sms"];

export function ChannelPicker({ member, settings, busy = false, onChange }: ChannelPickerProps) {
  const reachable = new Set(reachableChannels(member, settings));
  const options: { id: ChannelId | null; label: string }[] = [
    { id: null, label: "Whatever works" },
    ...ORDER.map((id) => ({ id, label: CHANNEL_LABELS[id] })),
  ];

  return (
    <View style={{ gap: spacing.chips, opacity: busy ? 0.5 : 1 }}>
      <SectionCaption>Remind on</SectionCaption>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.chipsTight }}>
        {options.map((option) => {
          const on = option.id === (member.preferredChannel ?? null);
          // A channel that is switched off, or that this person has no
          // address for, is shown but plainly unusable — that is information,
          // not clutter: it is why they are not getting WhatsApp.
          const usable = option.id === null || reachable.has(option.id);

          return (
            <Pressable
              key={option.id ?? "auto"}
              onPress={() => onChange(option.id)}
              disabled={busy}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, disabled: busy }}
              accessibilityLabel={`Remind on ${option.label}${usable ? "" : ", not connected"}`}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: radii.pill,
                borderWidth: 1,
                borderColor: on ? colors.ink : colors.hairlineStronger,
                backgroundColor: on ? colors.ink : colors.surface,
                minHeight: 34,
                justifyContent: "center",
              }}
            >
              <AppText
                style={{
                  fontFamily: fontFamily.medium,
                  fontSize: 11,
                  lineHeight: 13,
                  color: on ? colors.white : usable ? colors.muted : colors.faint,
                  textDecorationLine: usable ? "none" : "line-through",
                }}
              >
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <AppText style={[type.metaXSmall, { color: colors.faint }]}>
        {member.preferredChannel
          ? `Tried first. If it fails, the usual order takes over.`
          : `Push first, then Telegram, then whatever else is switched on.`}
      </AppText>
    </View>
  );
}
