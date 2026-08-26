import { useEffect } from 'react'
import { Navigate, Outlet, useNavigate } from 'react-router-dom'

import { getToken, setUnauthorizedHandler, USE_SEED } from '@/lib/http'

export function RequireAuth() {
  const navigate = useNavigate()

  useEffect(() => {
    setUnauthorizedHandler(() => navigate('/login', { replace: true }))
  }, [navigate])

  if (!USE_SEED && !getToken()) {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}
