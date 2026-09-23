/**
 * Toasts: a dark pill with a yellow dot, 16px from each edge, 104px from the
 * bottom, gone after 2.6 seconds.
 *
 * Every interaction in the design confirms itself this way, so it lives at
 * the root and is reached with useToast().
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, StyleSheet, View } from "react-native";

import { AppText } from "../components/AppText";
import { colors, layout, radii, spacing } from "../theme/tokens";
import { type } from "../theme/typography";

type Show = (message: string) => void;

const ToastContext = createContext<Show | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;

  const show = useCallback<Show>(
    (next) => {
      if (timer.current) clearTimeout(timer.current);
      setMessage(next);
      Animated.timing(opacity, { toValue: 1, duration: 140, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }).start(
          ({ finished }) => {
            if (finished) setMessage(null);
          }
        );
      }, layout.toastDuration);
    },
    [opacity]
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const styles = toastStyles();

  return (
    <ToastContext.Provider value={show}>
      {children}
      {message ? (
        <Animated.View pointerEvents="none" style={[styles.toast, { opacity }]}>
          <View style={styles.dot} />
          <AppText style={[type.bodySmall, { color: colors.onBar, flex: 1 }]}>{message}</AppText>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): Show {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast must be used inside a ToastProvider");
  return show;
}

/**
 * Built per render rather than once at import, so the sheet is read back from
 * `colors` each time rather than frozen at module load.
 */
function toastStyles() {
  return StyleSheet.create({
    toast: {
      position: "absolute",
      left: layout.toastInset,
      right: layout.toastInset,
      bottom: layout.toastBottom,
      zIndex: 70,
      backgroundColor: colors.bar,
      borderRadius: 11,
      paddingVertical: 12,
      paddingHorizontal: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.cards,
      elevation: 8,
      shadowColor: "#000",
      shadowOpacity: 0.28,
      shadowRadius: 30,
      shadowOffset: { width: 0, height: 10 },
    },
    dot: {
      width: 7,
      height: 7,
      borderRadius: radii.pill,
      backgroundColor: colors.brand,
    },
  });
}
