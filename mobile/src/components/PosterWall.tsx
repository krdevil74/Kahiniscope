/**
 * The wall of story posters behind the sign-in screen.
 *
 * Three columns of the channel's own covers, drifting in alternating
 * directions at speeds that never quite match, the whole thing tilted so the
 * movement reads as diagonal rather than as a list scrolling past. It is the
 * first thing anybody sees of this app, and an empty cream screen said
 * nothing about what the app is for.
 *
 * It is decoration, so it is built to be ignorable: dimmed under a scrim, no
 * touch targets, hidden from screen readers, and frozen entirely when the
 * system asks for reduced motion.
 *
 * The loop is the oldest trick there is — each column holds two identical
 * copies of its posters and slides by exactly the height of one, so the
 * moment it snaps back is the moment it looks the same.
 */

import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Platform,
  useWindowDimensions,
  View,
} from "react-native";

import {
  columnMotion,
  dealColumns,
  POSTER_RATIO,
  postersPerColumn,
  rotatedCover,
} from "../lib/poster-wall.ts";
import { POSTERS, type Poster } from "../lib/posters.ts";
import { colors } from "../theme/tokens";

const COLUMNS = 3;
const TILT_DEGREES = -9;
const GAP = 12;

/**
 * What reaches the eye is these two multiplied: roughly a quarter of the
 * artwork's full strength. Enough to read a title and tell horror from
 * comedy; not enough to compete with the form on top of it.
 */
const POSTER_OPACITY = 0.62;
const SCRIM_OPACITY = 0.6;

/**
 * Whether the system has asked for less movement.
 *
 * react-native-web's `isReduceMotionEnabled` resolves **true** when it cannot
 * read the media query at all. That is the right default for an accessibility
 * check — assume the person needs the accommodation — but the wrong one for
 * deciding whether a decoration may move, because it freezes the wall for
 * everybody. On web the browser can be asked directly, so it is.
 */
function prefersReducedMotion(): Promise<boolean> {
  if (Platform.OS === "web") {
    const media =
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    return Promise.resolve(media ? media.matches : false);
  }
  return AccessibilityInfo.isReduceMotionEnabled();
}

export function PosterWall() {
  const { width, height } = useWindowDimensions();
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let alive = true;
    prefersReducedMotion()
      .then((enabled) => {
        if (alive) setReduceMotion(enabled === true);
      })
      .catch(() => {});
    // The listener reports the real value on both platforms; only the initial
    // read needed help.
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) =>
      setReduceMotion(enabled === true)
    );
    return () => {
      alive = false;
      sub?.remove();
    };
  }, []);

  const layout = useMemo(() => {
    const cover = rotatedCover(width, height, TILT_DEGREES);
    const posterWidth = Math.round(cover.width / COLUMNS) - GAP;
    const posterHeight = Math.round(posterWidth * POSTER_RATIO);
    const perColumn = postersPerColumn(cover.height, posterHeight + GAP);
    return {
      cover,
      posterWidth,
      posterHeight,
      perColumn,
      columns: dealColumns(POSTERS, COLUMNS, perColumn),
      // One copy's height: the exact distance a column travels before it is
      // indistinguishable from where it started.
      travel: perColumn * (posterHeight + GAP),
    };
  }, [width, height]);

  return (
    <View
      // Decoration. Nothing here is reachable, readable or tappable.
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        ...StyleSheetAbsoluteFill,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        backgroundColor: colors.surfaceAlt,
      }}
    >
      <View
        style={{
          width: layout.cover.width,
          height: layout.cover.height,
          flexDirection: "row",
          gap: GAP,
          transform: [{ rotate: `${TILT_DEGREES}deg` }],
        }}
      >
        {layout.columns.map((posters, index) => (
          <PosterColumn
            key={index}
            posters={posters}
            index={index}
            width={layout.posterWidth}
            height={layout.posterHeight}
            travel={layout.travel}
            still={reduceMotion}
            placeholder={colors.ripple}
          />
        ))}
      </View>

      {/* The scrim: one flat wash of the page's own background, which is what
          turns sixteen loud covers into a texture. */}
      <View
        style={{
          ...StyleSheetAbsoluteFill,
          backgroundColor: colors.surfaceAlt,
          opacity: SCRIM_OPACITY,
        }}
      />
    </View>
  );
}

const StyleSheetAbsoluteFill = {
  position: "absolute" as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

interface ColumnProps {
  posters: Poster[];
  index: number;
  width: number;
  height: number;
  travel: number;
  still: boolean;
  /**
   * The tint behind a poster while it loads. Passed in rather than read
   * inside, because this component is memoised and would otherwise keep
   * whichever theme was active when it first rendered.
   */
  placeholder: string;
}

const PosterColumn = memo(function PosterColumn({
  posters,
  index,
  width,
  height,
  travel,
  still,
  placeholder,
}: ColumnProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const { up, durationMs } = columnMotion(index);

  useEffect(() => {
    if (still || travel <= 0) {
      // Rest at the top rather than frozen wherever the loop happened to be.
      progress.setValue(0);
      return;
    }
    progress.setValue(0);
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: durationMs,
        // Linear, or the wrap lands on a change of speed and reads as a stutter.
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [progress, durationMs, travel, still]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    // Columns start half a poster apart so the rows never line up into a grid.
    outputRange: up ? [0, -travel] : [-travel, 0],
  });

  return (
    <Animated.View
      style={{
        width,
        marginTop: index % 2 === 0 ? 0 : -(height + GAP) / 2,
        transform: [{ translateY }],
      }}
    >
      {/* Twice, so sliding by exactly one copy's height is invisible. */}
      {[0, 1].map((copy) =>
        posters.map((poster, i) => (
          <Image
            key={`${copy}-${i}`}
            source={poster.source}
            resizeMode="cover"
            fadeDuration={0}
            style={{
              width,
              height,
              marginBottom: GAP,
              borderRadius: 8,
              opacity: POSTER_OPACITY,
              backgroundColor: placeholder,
            }}
          />
        ))
      )}
    </Animated.View>
  );
});
