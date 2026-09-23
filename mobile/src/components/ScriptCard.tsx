/**
 * The script on an episode: the admin's side of it.
 *
 * One Drive link. Paste, save, replace, remove. The link is not stored on the
 * episode document — see lib/model.ts — because that document is readable by
 * everyone approved and this is not.
 */

import { useState } from "react";
import { Linking, Pressable, TextInput, View } from "react-native";

import { AppText } from "./AppText";
import { Button } from "./Button";
import { SectionCaption } from "./SectionCaption";
import { clearEpisodeScript, setEpisodeScript } from "../lib/actions";
import { parseScriptLink, scriptRowLabel } from "../lib/script-link.ts";
import type { EpisodeScript } from "../lib/model";
import { colors, fontFamily, radii, spacing } from "../theme/tokens";

export function ScriptCard({
  episodeId,
  script,
  addedBy,
  onToast,
}: {
  episodeId: string;
  script: EpisodeScript | null;
  addedBy: string;
  onToast: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const parsed = parseScriptLink(draft);
    if (!parsed.ok) {
      setError(parsed.reason);
      return;
    }
    setBusy(true);
    try {
      await setEpisodeScript(episodeId, parsed.url, addedBy);
      setEditing(false);
      setDraft("");
      setError(null);
      onToast("Script linked. Everyone with a task on this episode can open it.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await clearEpisodeScript(episodeId);
      onToast("Script link removed.");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "That did not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.hairline,
        borderRadius: radii.cardLarge,
        padding: spacing.card,
        gap: 9,
      }}
    >
      <SectionCaption>Script</SectionCaption>

      {script && !editing ? (
        <>
          <Pressable
            onPress={() => void Linking.openURL(script.url)}
            accessibilityRole="link"
            accessibilityLabel="Open the script in Drive"
            android_ripple={{ color: colors.ripple }}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              backgroundColor: pressed ? colors.fill : colors.surfaceSunken,
              borderRadius: radii.card,
              paddingVertical: 12,
              paddingHorizontal: 13,
            })}
          >
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                backgroundColor: colors.infoFill,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AppText
                style={{
                  fontFamily: fontFamily.monoSemibold,
                  fontSize: 8.5,
                  lineHeight: 10,
                  color: colors.onBar,
                }}
              >
                PDF
              </AppText>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText weight="medium" style={{ fontFamily: fontFamily.medium, fontSize: 12.5, lineHeight: 15 }}>
                Open in Drive
              </AppText>
              <AppText
                numberOfLines={1}
                style={{
                  fontFamily: fontFamily.mono,
                  fontSize: 10,
                  lineHeight: 14,
                  color: colors.faint,
                  marginTop: 2,
                }}
              >
                {scriptRowLabel(script.url)}
              </AppText>
            </View>
          </Pressable>

          <AppText
            style={{
              fontFamily: fontFamily.regular,
              fontSize: 11,
              lineHeight: 15.4,
              color: colors.muted,
            }}
          >
            Only the people with a task on this episode can open it.
          </AppText>

          <View style={{ flexDirection: "row", gap: spacing.cardTight }}>
            <Button
              label="Replace"
              variant="outline"
              size="compact"
              disabled={busy}
              onPress={() => {
                setDraft(script.url);
                setError(null);
                setEditing(true);
              }}
              style={{ flex: 1 }}
            />
            <Button
              label="Remove"
              variant="quiet"
              size="compact"
              disabled={busy}
              onPress={() => void remove()}
              style={{ flex: 1 }}
            />
          </View>
        </>
      ) : null}

      {!script && !editing ? (
        <>
          <AppText
            style={{
              fontFamily: fontFamily.regular,
              fontSize: 12,
              lineHeight: 16.8,
              color: colors.muted,
            }}
          >
            Link the script from Drive and everyone with a task on this episode gets a way to open it.
          </AppText>
          <Button
            label="Link a script"
            size="compact"
            onPress={() => {
              setDraft("");
              setError(null);
              setEditing(true);
            }}
            style={{ alignSelf: "flex-start" }}
          />
        </>
      ) : null}

      {editing ? (
        <>
          <TextInput
            value={draft}
            onChangeText={(next) => {
              setDraft(next);
              setError(null);
            }}
            placeholder="https://drive.google.com/file/d/…"
            placeholderTextColor={colors.faint}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            accessibilityLabel="Drive link to the script"
            style={{
              borderWidth: 1,
              borderColor: error ? colors.danger : colors.hairlineStronger,
              borderRadius: radii.card,
              paddingVertical: 12,
              paddingHorizontal: 13,
              fontFamily: fontFamily.mono,
              fontSize: 11.5,
              color: colors.ink,
              backgroundColor: colors.surface,
            }}
          />
          {error ? (
            <AppText
              style={{
                fontFamily: fontFamily.regular,
                fontSize: 11,
                lineHeight: 15.4,
                color: colors.danger,
              }}
            >
              {error}
            </AppText>
          ) : (
            <AppText
              style={{
                fontFamily: fontFamily.regular,
                fontSize: 11,
                lineHeight: 15.4,
                color: colors.faint,
              }}
            >
              Use Drive&apos;s Share button, and set the file so anyone with the link can view it.
            </AppText>
          )}
          <View style={{ flexDirection: "row", gap: spacing.cardTight }}>
            <Button
              label={busy ? "Saving…" : "Save link"}
              size="compact"
              disabled={busy}
              onPress={() => void save()}
              style={{ flex: 1 }}
            />
            <Button
              label="Cancel"
              variant="quiet"
              size="compact"
              disabled={busy}
              onPress={() => {
                setEditing(false);
                setError(null);
              }}
              style={{ flex: 1 }}
            />
          </View>
        </>
      ) : null}
    </View>
  );
}
