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

type PagedResponse<T> = { results: T[]; next: string | null; count?: number }

// Cap concurrent page fetches so a big list (fetchAllPages is used for
// client-side search screens) doesn't flood the backend's single gunicorn
// worker (render.yaml: one process, 8 threads) — see the "why parallel"
// note on fetchAllPages below.
const PAGE_FETCH_CONCURRENCY = 6

async function mapWithConcurrency<In, Out>(
  items: In[],
  limit: number,
  fn: (item: In) => Promise<Out>,
): Promise<Out[]> {
  const out: Out[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

/**
 * Fetch every page of a DRF-paginated list and return the flat array.
 * Screens that filter/search client-side need the whole set, not just page 1
 * (PAGE_SIZE is 25). A bare-array response passes straight through.
 *
 * Page 1 is fetched first (to learn `count`), then every remaining page is
 * fetched in parallel (bounded — see PAGE_FETCH_CONCURRENCY) instead of
 * walking `next` one page at a time: for a dish/production list already
 * past a couple hundred rows, that turned page-load into several seconds of
 * serial round-trips (the global header search box pulls this list on every
 * screen), which read as the whole app being slow to become usable.
 */
export async function fetchAllPages<T>(path: string): Promise<T[]> {
  const { data: first }: { data: T[] | PagedResponse<T> } = await http.get(path)
  if (Array.isArray(first)) return first
  if (!first.next || first.count == null) {
    // no `count` to plan around (or already done) — fall back to walking `next`
    const out = [...first.results]
    let url = first.next
    for (let guard = 0; url && guard < 200; guard++) {
      const { data }: { data: PagedResponse<T> } = await http.get(url)
      out.push(...data.results)
      url = data.next
    }
    return out
  }

  const pageSize = first.results.length
  const totalPages = Math.min(Math.ceil(first.count / pageSize), 200) // guard: pagination bugs can't spin forever
  const sep = path.includes('?') ? '&' : '?'
  const restPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2)
  const rest = await mapWithConcurrency(restPages, PAGE_FETCH_CONCURRENCY, async (page) => {
    const { data } = await http.get<PagedResponse<T>>(`${path}${sep}page=${page}`)
    return data.results
  })
  return [...first.results, ...rest.flat()]
}
