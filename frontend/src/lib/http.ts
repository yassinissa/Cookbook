/*
 * Axios instance + JWT auth. Ports lib/api.js + lib/auth.js.
 *
 * Access tokens are short-lived (60 min; backend SIMPLE_JWT). Rather than
 * hard-logging-out the instant one expires, a 401 triggers a single silent
 * refresh (via the long-lived refresh token, 7 days) and retries the
 * original request. Only a *failed* refresh (refresh token itself expired,
 * revoked, or missing) clears state and bounces to /login. This matters for
 * anyone who leaves a screen open mid-task (e.g. approving a QA standard)
 * past the 60-minute mark — the in-flight action now completes instead of
 * silently dying with the app appearing to "freeze" until a manual refresh.
 */
import axios from 'axios'

const TOKEN_KEY = 'cookbook_access_token'
const REFRESH_TOKEN_KEY = 'cookbook_refresh_token'

export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://localhost:8001/api'

export const USE_SEED = import.meta.env.VITE_USE_SEED === '1'

export const http = axios.create({ baseURL: API_BASE_URL, timeout: 45_000 })

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}
function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

/* same-tab localStorage writes don't fire a `storage` event, so notify
   subscribers (AuthProvider) explicitly whenever the token appears or clears. */
const tokenListeners = new Set<() => void>()
export function onTokenChange(cb: () => void): () => void {
  tokenListeners.add(cb)
  return () => tokenListeners.delete(cb)
}
function emitTokenChange() {
  tokenListeners.forEach((cb) => cb())
}

function setToken(access: string, refresh?: string) {
  localStorage.setItem(TOKEN_KEY, access)
  if (refresh) localStorage.setItem(REFRESH_TOKEN_KEY, refresh)
  emitTokenChange()
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  emitTokenChange()
}

export async function login(username: string, password: string) {
  const { data } = await http.post('/auth/login/', { username, password })
  setToken(data.access, data.refresh)
  return data
}

export function logout() {
  clearToken()
}

http.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

function forceLogout() {
  clearToken()
  if (onUnauthorized) onUnauthorized()
  else window.location.assign('/login')
}

/* Dedupe concurrent 401s (e.g. a background list refetch + a foreground
   mutation both mid-flight when the token dies) into one refresh call —
   every waiter shares its result instead of each firing its own
   POST /auth/token/refresh/ and racing SIMPLE_JWT's refresh-token rotation. */
let refreshInFlight: Promise<string> | null = null

async function refreshAccessToken(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const refresh = getRefreshToken()
      if (!refresh) throw new Error('No refresh token')
      try {
        const { data } = await axios.post(`${API_BASE_URL}/auth/token/refresh/`, { refresh })
        setToken(data.access, data.refresh)
        return data.access as string
      } finally {
        refreshInFlight = null
      }
    })()
  }
  return refreshInFlight
}

http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error
    if (response?.status !== 401 || !getToken()) return Promise.reject(error)

    // Never retry the refresh call itself, and only retry an original
    // request once, to avoid looping if the backend keeps saying 401.
    if (config?.url?.includes('/auth/token/refresh/') || config?._retried) {
      forceLogout()
      return Promise.reject(error)
    }
    if (!getRefreshToken()) {
      forceLogout()
      return Promise.reject(error)
    }

    try {
      const access = await refreshAccessToken()
      config._retried = true
      config.headers.Authorization = `Bearer ${access}`
      return http(config)
    } catch {
      forceLogout()
      return Promise.reject(error)
    }
  },
)

/** Unwrap DRF list endpoints that may or may not be paginated. */
export function listData<T>(data: T[] | { results: T[] }): T[] {
  return Array.isArray(data) ? data : data.results
}

/**
 * Fetch every page of a DRF-paginated list (walking `next`) and return the
 * flat array. Screens that filter/search client-side need the whole set, not
 * just page 1 (PAGE_SIZE is 25). A bare-array response passes straight through.
 */
export async function fetchAllPages<T>(path: string): Promise<T[]> {
  const out: T[] = []
  let url: string | null = path
  // hard stop so a pagination bug can't spin forever
  for (let guard = 0; url && guard < 200; guard++) {
    const { data }: { data: T[] | { results: T[]; next: string | null } } = await http.get(url)
    if (Array.isArray(data)) return data
    out.push(...data.results)
    url = data.next
  }
  return out
}
