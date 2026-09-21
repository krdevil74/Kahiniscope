/**
 * Choosing a theme, and making the choice stick.
 *
 * Three settings rather than two. "System" is the one most people want and
 * the one an app that only offers light and dark cannot express: a phone that
 * goes dark at sunset should take the app with it.
 *
 * The choice is stored on the device, not on the user record. Somebody who
 * prefers dark on their phone has not expressed an opinion about the tablet
 * they occasionally use, and putting it in Firestore would also mean the
 * first frame after launch is drawn in the wrong theme while it loads.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { applyPalette } from "./tokens.ts";
import {
  isThemePreference,
  resolveScheme,
  type ColorScheme,
  type ThemePreference,
} from "./preference.ts";

export { isThemePreference, resolveScheme };
export type { ThemePreference };

const KEY = "kahiniscope.theme";

export interface Theme {
  /** What the person chose. */
  preference: ThemePreference;
  /** What that resolves to right now. */
  scheme: ColorScheme;
  setPreference: (next: ThemePreference) => void;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setStored] = useState<ThemePreference>("system");
  const scheme = resolveScheme(preference, system);

  // Read the stored choice once. Until it arrives the app draws in the
  // resolved system theme, which is the right guess and not a flash of the
  // wrong one for anybody who left it on System.
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(KEY)
      .then((value) => {
        if (alive && isThemePreference(value)) setStored(value);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  /**
   * Swap the palette *before* the children render, not in an effect after —
   * an effect would paint one frame in the outgoing theme every time this
   * changes, which is exactly the flicker a theme switch must not have.
   */
  const value = useMemo<Theme>(() => {
    applyPalette(scheme);
    return {
      preference,
      scheme,
      setPreference: (next) => {
        setStored(next);
        void AsyncStorage.setItem(KEY, next).catch(() => {});
      },
    };
  }, [preference, scheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error("useTheme must be used inside a ThemeProvider");
  return theme;
}
