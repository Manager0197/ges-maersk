import React, { createContext, useContext, useState, ReactNode } from 'react';

type Role = 'ADMIN' | 'EMPLOYE';

interface AuthContextType {
  role: Role;
  setRole: (role: Role) => void;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>('ADMIN');

  return (
    <AuthContext.Provider value={{ role, setRole, isAdmin: role === 'ADMIN' }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("Missing AuthProvider");
  return ctx;
}
