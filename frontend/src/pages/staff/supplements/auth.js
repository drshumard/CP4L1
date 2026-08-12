import { createContext, useContext } from 'react';

// Replaces the standalone app's Clerk-backed AppUserContext. SupplementsApp provides
// { user: { name, role: 'hc' | 'admin' } } derived from the portal session — pages and
// AppShell keep their original `const { user } = useAuth()` calls untouched.
export const SuppAuthContext = createContext({ user: null, loading: false });
export const useAuth = () => useContext(SuppAuthContext);
