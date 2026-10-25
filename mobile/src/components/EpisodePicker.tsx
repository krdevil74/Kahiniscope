/**
 * Choosing an episode on the Assign screen.
 *
 * It used to be every in-progress episode as a row, one under another. With
 * ten or fifteen of them in flight that pushed the rest of the form a long
 * way down, and the one you wanted had to be found by eye. Now the form shows
 * one field — the episode chosen, or a prompt — and the list opens in a sheet
 * with a search box above it.
 */

import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "./AppText";
import { searchEpisodes } from "../lib/assign.ts";
import { airLabel } from "../lib/format.ts";
import type { Episode } from "../lib/model";
import { colors, fontFamily, radii, spacing, MIN_TAP_TARGET } from "../theme/tokens";
import { type } from "../theme/typography";

/** Below this the list is short enough to read, and a search box is noise. */
const SEARCH_FROM = 6;

export function EpisodePicker({
  episodes,
  selectedId,
  onSelect,
}: {
  /** Already filtered to what can be assigned, in the order to show them. */
  episodes: readonly Episode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = episodes.find((e) => e.id === selectedId) ?? null;
  const matching = useMemo(() => searchEpisodes(episodes, query), [episodes, query]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={
          selected ? `Episode: ${selected.code} ${selected.title}. Change` : "Choose an episode"
        }
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.cards,
          paddingVertical: 11,
          paddingHorizontal: 12,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: selected ? colors.brand : colors.hairlineStrong,
          backgroundColor: selected ? colors.selectedFill : colors.surface,
          minHeight: MIN_TAP_TARGET,
        }}
      >
        {selected ? (
          <EpisodeLine episode={selected} on />
        ) : (
          <AppText
            weight="medium"
            style={{
              flex: 1,
              fontFamily: fontFamily.medium,
              fontSize: 12.5,
              lineHeight: 15,
              color: colors.muted,
            }}
          >
            {`Choose an episode · ${episodes.length} in progress`}
          </AppText>
        )}
        <AppText style={{ fontFamily: fontFamily.mono, fontSize: 11, lineHeight: 13, color: colors.faint }}>
          ▾
        </AppText>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={close}
      >
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          {/* Tapping the dimmed part closes it, as a sheet should. */}
          <Pressable
            onPress={close}
            accessibilityLabel="Close"
            style={{ flex: 1, minHeight: insets.top + 60, backgroundColor: "rgba(0,0,0,.45)" }}
          />
          <View
            style={{
              maxHeight: "80%",
              backgroundColor: colors.surfaceAlt,
              borderTopLeftRadius: radii.cardHero,
              borderTopRightRadius: radii.cardHero,
              paddingTop: spacing.card,
              paddingHorizontal: spacing.screen,
              paddingBottom: insets.bottom + spacing.card,
              gap: spacing.cards,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <AppText weight="semibold" style={type.bodySmall}>
                Choose an episode
              </AppText>
              <Pressable
                onPress={close}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={8}
                style={{ minHeight: 32, justifyContent: "center", paddingHorizontal: 4 }}
              >
                <AppText style={{ fontFamily: fontFamily.medium, fontSize: 12, lineHeight: 14, color: colors.muted }}>
                  Close
                </AppText>
              </Pressable>
            </View>

            {episodes.length >= SEARCH_FROM ? (
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search by code or title"
                placeholderTextColor={colors.faint}
                accessibilityLabel="Search episodes"
                autoCorrect={false}
                style={{
                  minHeight: MIN_TAP_TARGET,
                  paddingHorizontal: 12,
                  borderRadius: radii.cardSmall,
                  borderWidth: 1,
                  borderColor: colors.hairlineStrong,
                  backgroundColor: colors.surface,
                  fontFamily: fontFamily.regular,
                  fontSize: 13,
                  color: colors.ink,
                }}
              />
            ) : null}

            <FlatList
              data={matching}
              keyExtractor={(e) => e.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: spacing.chipsTight }}
              ListEmptyComponent={
                <AppText style={[type.bodySmall, { color: colors.faint }]}>
                  {`Nothing matches "${query.trim()}".`}
                </AppText>
              }
              renderItem={({ item }) => {
                const on = item.id === selectedId;
                return (
                  <Pressable
                    onPress={() => {
                      onSelect(item.id);
                      close();
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${item.code} ${item.title}`}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: spacing.cards,
                      paddingVertical: 11,
                      paddingHorizontal: 12,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: on ? colors.brand : colors.hairlineStrong,
                      backgroundColor: on ? colors.selectedFill : colors.surface,
                      minHeight: MIN_TAP_TARGET,
                    }}
                  >
                    <EpisodeLine episode={item} on={on} />
                  </Pressable>
                );
              }}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

/** Dot, code, title, air date — the row as it always looked. */
function EpisodeLine({ episode, on }: { episode: Episode; on: boolean }) {
  return (
    <>
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: radii.pill,
          backgroundColor: on ? colors.brand : colors.hairlineStrong,
        }}
      />
      <AppText
        style={{
          fontFamily: fontFamily.monoSemibold,
          fontSize: 10,
          lineHeight: 11,
          color: colors.yellowDeep,
        }}
      >
        {episode.code}
      </AppText>
      <AppText
        numberOfLines={1}
        weight="medium"
        style={{
          flex: 1,
          minWidth: 0,
          fontFamily: fontFamily.medium,
          fontSize: 12.5,
          lineHeight: 15,
        }}
      >
        {episode.title}
      </AppText>
      <AppText
        style={{
          fontFamily: fontFamily.mono,
          fontSize: 10,
          lineHeight: 11,
          color: colors.faint,
        }}
      >
        {airLabel(episode.airDate)}
      </AppText>
    </>
  );
}
