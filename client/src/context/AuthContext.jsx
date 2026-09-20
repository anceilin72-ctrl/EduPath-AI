import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from '../lib/api.js';

/**
 * Who is signed in, and their profile.
 *
 * The profile lives here rather than being fetched per page because almost every
 * screen needs it — the roadmap generator reads hours per week, the resume page
 * reads confirmed skills, the gap analysis reads education level. Keeping one copy
 * means a change on the profile page is immediately reflected everywhere else
 * instead of the app showing two versions of the same fact.
 */
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  /**
   * Starts true when a token exists: the app must not decide the user is signed
   * out before it has had a chance to verify the stored token, or a page refresh
   * on a protected route would bounce them to the login screen every time.
   */
  const [loading, setLoading] = useState(Boolean(getToken()));

  const signOut = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  // A rejected token means the session is over — expired, or the server restarted
  // with a different JWT_SECRET, which happens a lot in development.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    if (!getToken()) return;

    let cancelled = false;

    api.auth
      .me()
      .then(({ user: fetched }) => {
        if (!cancelled) setUser(fetched);
      })
      .catch(() => {
        if (!cancelled) signOut();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [signOut]);

  const signIn = useCallback(async (credentials) => {
    const { token, user: signedIn } = await api.auth.login(credentials);
    setToken(token);
    setUser(signedIn);
    return signedIn;
  }, []);

  const register = useCallback(async (details) => {
    const { token, user: created } = await api.auth.register(details);
    setToken(token);
    setUser(created);
    return created;
  }, []);

  /** Save profile changes and keep the local copy in step with the server's. */
  const saveProfile = useCallback(async (changes) => {
    const { user: updated } = await api.auth.updateProfile(changes);
    setUser(updated);
    return updated;
  }, []);

  /** Used after the resume page confirms skills, which changes knownNodeKeys. */
  const refresh = useCallback(async () => {
    const { user: fresh } = await api.auth.me();
    setUser(fresh);
    return fresh;
  }, []);

  const value = useMemo(
    () => ({ user, loading, signIn, register, signOut, saveProfile, refresh }),
    [user, loading, signIn, register, signOut, saveProfile, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');
  return context;
}

export default AuthContext;
