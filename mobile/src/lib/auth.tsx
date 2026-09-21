/**
 * Session state: who is signed in, and what the server says they may do.
 *
 * Role and status come off the ID token's custom claims, minted by the Cloud
 * Functions in functions/src/auth.ts. The app never decides them, and never
 * infers them from the user document — that document is readable by its owner
 * and so is not a safe place to read privilege from. The claim is.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { onIdTokenChanged, signOut as fbSignOut, type User } from "firebase/auth";

import { auth, db } from "./firebase";
import { registerForPush } from "./push.ts";
import { CLAIM_RETRY_DELAYS_MS, claimsAreBehind } from "./claim-refresh.ts";

export type Role = "owner" | "admin" | "member";
export type AccountStatus = "pending" | "approved";

export interface UserDoc {
  name: string;
  email: string;
  phone: string | null;
  telegramChatId: string | null;
  crafts: string[];
  /** Advanced and not yet worked off. Server-owned; see lib/payments.ts. */
  balance: number;
  status: AccountStatus;
  role: Role;
  fcmTokens: string[];
  note: string | null;
}

export interface Session {
  /** Still working out whether anyone is signed in. */
  loading: boolean;
  user: User | null;
  role: Role;
  status: AccountStatus;
  /** The signed-in user's own record, live. Null while loading or signed out. */
  profile: (UserDoc & { uid: string }) | null;
  isOwner: boolean;
  isAdmin: boolean;
  isApproved: boolean;
  signOut: () => Promise<void>;
  /** Pull fresh claims after an approval or promotion. */
  refresh: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>("member");
  const [status, setStatus] = useState<AccountStatus>("pending");
  const [profile, setProfile] = useState<(UserDoc & { uid: string }) | null>(null);

  const readClaims = useCallback(async (current: User | null, force = false) => {
    if (!current) {
      setRole("member");
      setStatus("pending");
      return;
    }
    const { claims } = await current.getIdTokenResult(force);
    // A token minted before the triggers existed carries nothing. Least
    // privilege is the right reading of that.
    setRole((claims.role as Role) ?? "member");
    setStatus((claims.status as AccountStatus) ?? "pending");
  }, []);

  useEffect(() => {
    return onIdTokenChanged(auth, async (current) => {
      setUser(current);
      await readClaims(current);
      setLoading(false);
    });
  }, [readClaims]);

  /**
   * Watch our own user document. It is the one thing a pending account may
   * read, and it is how the holding screen learns it has been approved: the
   * admin writes status, the Cloud Function re-mints the claim, this snapshot
   * fires, and we force a token refresh to pick the new claim up.
   */
  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    return onSnapshot(
      doc(db, "users", user.uid),
      (snap) => {
        if (!snap.exists()) {
          setProfile(null);
          return;
        }
        const data = snap.data() as UserDoc;
        setProfile({ uid: snap.id, ...data });

        // The document moved ahead of the token. Catch up.
        if (data.status !== status || data.role !== role) {
          void readClaims(user, true);
        }
      },
      (error) => {
        console.warn("users snapshot", error);
      }
    );
  }, [user, status, role, readClaims]);

  /**
   * The document knows, but the token does not yet.
   *
   * Approving somebody is a write to their user document; a Cloud Function
   * sees that write and re-mints their claims, but it is a trigger and runs
   * afterwards. The snapshot above fires immediately and asks for a fresh
   * token, which is usually a moment too early — and, before this, that was
   * the only attempt. A member sat on the holding screen until they
   * force-quit the app, at which point signing in minted a correct token and
   * it looked as though it had always worked.
   *
   * So it asks again, backing off, and gives up after about half a minute —
   * at which point the holding screen's pull-to-refresh is the way out.
   */
  useEffect(() => {
    if (!user || !claimsAreBehind(profile, { status, role })) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    const again = () => {
      const delay = CLAIM_RETRY_DELAYS_MS[attempt];
      if (delay === undefined || cancelled) return;
      attempt += 1;
      timer = setTimeout(() => {
        if (cancelled) return;
        void readClaims(user, true).then(again);
      }, delay);
    };
    again();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // `profile` is the trigger: when the claims catch up, status changes,
    // this re-runs, the condition is false and the loop is torn down.
  }, [user, profile, status, role, readClaims]);

  /**
   * Push is the first rung of the fallback chain, and it only works if the
   * device's token is on the record. Registering here means it happens once
   * per approved session, wherever the app opens, rather than being the job
   * of whichever screen happened to be built first.
   */
  useEffect(() => {
    if (!user || status !== "approved") return;
    let cancelled = false;
    void registerForPush(user.uid).then((result) => {
      if (cancelled || result.status === "registered") return;
      // Not an error worth showing anyone: a member who refuses notifications
      // still gets Telegram, WhatsApp and SMS.
      console.log("Push not registered:", result);
    });
    return () => {
      cancelled = true;
    };
  }, [user, status]);

  const value = useMemo<Session>(
    () => ({
      loading,
      user,
      role,
      status,
      profile,
      isOwner: role === "owner" && status === "approved",
      isAdmin: (role === "owner" || role === "admin") && status === "approved",
      isApproved: status === "approved",
      signOut: () => fbSignOut(auth),
      refresh: () => readClaims(user, true),
    }),
    [loading, user, role, status, profile, readClaims]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside a SessionProvider");
  return session;
}
