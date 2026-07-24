/**
 * AuthContext.tsx — Email/password JWT auth for CreditSetu.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { Navigate } from "react-router-dom";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  token: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isSignedIn: boolean;
  isLoaded: boolean;
  signIn: (user: AuthUser) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isSignedIn: false,
  isLoaded: false,
  signIn: () => {},
  signOut: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("bharatscore_token");
    const id = localStorage.getItem("bharatscore_user_id");
    const email = localStorage.getItem("bharatscore_email") || "";
    const name = localStorage.getItem("bharatscore_name") || "";

    if (token && id) {
      setUser({ id, email, name, token });
    }
    setIsLoaded(true);
  }, []);

  const signIn = useCallback((authUser: AuthUser) => {
    localStorage.setItem("bharatscore_token", authUser.token);
    localStorage.setItem("bharatscore_user_id", authUser.id);
    localStorage.setItem("bharatscore_email", authUser.email);
    localStorage.setItem("bharatscore_name", authUser.name);
    localStorage.setItem("bharatscore_auth_provider", "email");
    localStorage.removeItem("bharatscore_picture");
    setUser(authUser);
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem("bharatscore_token");
    localStorage.removeItem("bharatscore_user_id");
    localStorage.removeItem("bharatscore_email");
    localStorage.removeItem("bharatscore_name");
    localStorage.removeItem("bharatscore_picture");
    localStorage.removeItem("bharatscore_auth_provider");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isSignedIn: !!user,
        isLoaded,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  return useContext(AuthContext);
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useAuthContext();

  if (!isLoaded) return null;

  if (!isSignedIn) {
    return <Navigate to="/sign-in" replace />;
  }

  return <>{children}</>;
}
