import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, clearToken, setToken } from './api';

export type Role = 'FARMER' | 'COLLECTOR' | 'REVIEWER' | 'ADMIN';

export interface User {
  id: number;
  username: string;
  name: string;
  role: Role;
  phone?: string;
}

interface AuthState {
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState>(null as any);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem('film_user');
    return raw ? JSON.parse(raw) : null;
  });

  useEffect(() => {
    if (user) localStorage.setItem('film_user', JSON.stringify(user));
    else localStorage.removeItem('film_user');
  }, [user]);

  const login = async (username: string, password: string) => {
    const data = await api<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setToken(data.token);
    setUser(data.user);
  };

  const logout = () => {
    clearToken();
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export const ROLE_LABEL: Record<Role, string> = {
  FARMER: '种植户',
  COLLECTOR: '收料员',
  REVIEWER: '审核人员',
  ADMIN: '管理员',
};
