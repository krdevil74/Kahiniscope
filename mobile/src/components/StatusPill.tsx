/**
 * The small filled pill that says where an episode is in its life.
 *
 * Two states, and they read at a glance rather than by colour alone: a
 * broadcast episode is the one nothing new can be assigned to, which is a
 * thing an admin needs to see without reading the word.
 */

import { View } from "react-native";

import { AppText } from "./AppText";
import { episodeStatusLabel } from "../lib/episode-status.ts";
import type { EpisodeStatus } from "../lib/model";
import { colors, fontFamily, radii } from "../theme/tokens";

export function StatusPill({ status, onInk = false }: { status: EpisodeStatus; onInk?: boolean }) {
  const broadcast = status === "broadcast";

  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: onInk
          ? "rgba(255,255,255,.14)"
          : broadcast
            ? colors.infoSoft
            : colors.heatSoft,
        borderRadius: radii.pill,
        paddingVertical: 4,
        paddingHorizontal: 9,
      }}
    >
      <AppText
        style={{
          fontFamily: fontFamily.monoSemibold,
          fontSize: 9.5,
          lineHeight: 12,
          letterSpacing: 0.6,
          color: onInk ? colors.onBar : broadcast ? colors.info : colors.heat,
        }}
      >
        {episodeStatusLabel(status).toUpperCase()}
      </AppText>
    </View>
  );
}
