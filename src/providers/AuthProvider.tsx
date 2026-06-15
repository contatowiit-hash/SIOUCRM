import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setAccessToken, type ApiRestaurant, type ApiUser, type AuthResponse } from '../lib/api';
import type { Profile, Restaurant } from '../types/domain';

interface AuthUser {
  id: string;
  email: string;
  email_confirmed_at: string | null;
}

interface AuthSession {
  user: AuthUser;
}

interface AuthContextValue {
  session: AuthSession | null;
  user: AuthUser | null;
  profile: Profile | null;
  restaurant: Restaurant | null;
  restaurantId: string | null;
  loading: boolean;
  accessToken: string | null;
  apiUser: ApiUser | null;
  startApiSession: (auth: AuthResponse) => void;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [accessTokenState, setAccessTokenState] = useState<string | null>(null);
  const [apiUser, setApiUser] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);

  const clearLocalState = useCallback(() => {
    setSession(null);
    setProfile(null);
    setRestaurant(null);
    setAccessToken(null);
    setAccessTokenState(null);
    setApiUser(null);
    localStorage.removeItem('syntra_api_session');
    localStorage.removeItem('syntra_dev_plan');
  }, []);

  const applyApiSession = useCallback((token: string, user: ApiUser, apiRestaurant: ApiRestaurant) => {
    setAccessToken(token);
    setAccessTokenState(token);
    setApiUser(user);
    setSession({
      user: {
        id: user.id,
        email: user.email,
        email_confirmed_at: user.email_verified_at || new Date().toISOString(),
      },
    });
    setProfile({
      id: user.id,
      restaurant_id: user.restaurant_id,
      full_name: user.full_name,
      role: user.role,
    });
    setRestaurant(apiRestaurant);
  }, []);

  const startApiSession = useCallback(
    (auth: AuthResponse) => {
      applyApiSession(auth.access_token, auth.user, auth.restaurant);
    },
    [applyApiSession],
  );

  const refreshProfile = useCallback(async () => {
    if (!accessTokenState) return;
    const result = await api.me();
    setApiUser(result.user);
    setProfile({
      id: result.user.id,
      restaurant_id: result.user.restaurant_id,
      full_name: result.user.full_name,
      role: result.user.role,
    });
    setRestaurant(result.restaurant);
  }, [accessTokenState]);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      clearLocalState();
    }
  }, [clearLocalState]);

  useEffect(() => {
    let mounted = true;

    api
      .refresh()
      .then((result) => {
        if (mounted) applyApiSession(result.access_token, result.user, result.restaurant);
      })
      .catch(() => {
        if (mounted) clearLocalState();
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [applyApiSession, clearLocalState]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user || null,
      profile,
      restaurant,
      restaurantId: profile?.restaurant_id || null,
      loading,
      accessToken: accessTokenState,
      apiUser,
      startApiSession,
      refreshProfile,
      signOut,
    }),
    [accessTokenState, apiUser, loading, profile, refreshProfile, restaurant, session, signOut, startApiSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
};
