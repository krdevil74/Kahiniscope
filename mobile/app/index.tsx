/**
 * The gate. Three destinations, decided by the claims on the ID token:
 *
 *   not signed in      → sign-in
 *   signed in, pending → the holding screen
 *   signed in, approved→ the admin board, or the member's own task list
 *
 * The decision is the server's, not the app's: `status` and `role` are custom
 * claims, and the Firestore rules enforce the same reading independently.
 */

import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { useSession } from "../src/lib/auth";
import { colors } from "../src/theme/tokens";

export default function Index() {
  const { loading, user, isApproved, isAdmin } = useSession();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt }}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  if (!user) return <Redirect href="/sign-in" />;
  if (!isApproved) return <Redirect href="/pending" />;
  return <Redirect href={isAdmin ? "/board" : "/summary"} />;
}
