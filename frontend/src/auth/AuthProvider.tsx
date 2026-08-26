import { createContext, useContext, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { fetchMe } from '@/lib/api/accounts'
import { USE_SEED, getToken } from '@/lib/http'
import type { CapabilityCode, Me } from '@/types/access'

interface AuthValue {
  me: Me | null
  loading: boolean
  can: (cap: CapabilityCode) => boolean
  canAny: (caps: CapabilityCode[]) => boolean
  isSuperuser: boolean
  scope: Me['scope'] | null
  refetch: () => void
}

const AuthContext = createContext<AuthValue | null>(null)
export const AUTH_QUERY_KEY = ['auth', 'me'] as const

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const enabled = USE_SEED || !!getToken()

  const { data, isLoading } = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: fetchMe,
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  })

  const me = data ?? null
  const caps = new Set(me?.capabilities ?? [])
  const isSuperuser = !!me?.is_superuser

  const value: AuthValue = {
    me,
    loading: enabled && isLoading,
    isSuperuser,
    scope: me?.scope ?? null,
    can: (cap) => isSuperuser || caps.has(cap),
    canAny: (list) => isSuperuser || list.some((c) => caps.has(c)),
    refetch: () => qc.invalidateQueries({ queryKey: AUTH_QUERY_KEY }),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
