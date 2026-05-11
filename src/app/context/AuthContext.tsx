import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: "user" | "admin";
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  storeName: string;
  login: (token: string, user: AuthUser, storeName: string) => void;
  logout: () => void;
  isAdmin: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  storeName: "",
  login: () => {},
  logout: () => {},
  isAdmin: false,
  isAuthenticated: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [storeName, setStoreName] = useState<string>("");

  useEffect(() => {
    const savedToken = localStorage.getItem("rc_token");
    const savedUser = localStorage.getItem("rc_user");
    const savedStore = localStorage.getItem("rc_store");
    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
        setStoreName(savedStore || "");
      } catch {
        localStorage.removeItem("rc_token");
        localStorage.removeItem("rc_user");
        localStorage.removeItem("rc_store");
      }
    }
  }, []);

  const login = (t: string, u: AuthUser, store: string) => {
    setToken(t);
    setUser(u);
    setStoreName(store);
    localStorage.setItem("rc_token", t);
    localStorage.setItem("rc_user", JSON.stringify(u));
    localStorage.setItem("rc_store", store);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setStoreName("");
    localStorage.removeItem("rc_token");
    localStorage.removeItem("rc_user");
    localStorage.removeItem("rc_store");
  };

  return (
    <AuthContext.Provider value={{
      user, token, storeName, login, logout,
      isAdmin: user?.role === "admin",
      isAuthenticated: !!user,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
