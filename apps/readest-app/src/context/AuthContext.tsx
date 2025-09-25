'use client';

import React, { createContext, useContext, ReactNode } from 'react';

interface User {
  user_metadata?: {
    picture?: string;
    avatar_url?: string;
    full_name?: string;
  };
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  login: (token: string, user: unknown) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  // Auth disabled - return dummy values
  const login = () => {
    console.log('Authentication disabled');
  };

  const logout = () => {
    console.log('Authentication disabled');
  };

  return (
    <AuthContext.Provider value={{ token: null, user: null, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};