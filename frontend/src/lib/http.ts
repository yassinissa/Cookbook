/*
 * Axios instance + JWT auth. Ports lib/api.js + lib/auth.js.
 *
 * Access tokens are short-lived (60 min). A 401 mid-session clears the token
 * and bounces to /login rather than letting every screen's Retry fail forever.
 */
import axios from 'axios'

const TOKEN_KEY = 'cookbook_access_token'

export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://localhost:8001/api'

export const USE_SEED = import.meta.env.VITE_USE_SEED === '1'

export const http = axios.create({ baseURL: API_BASE_URL, timeout: 45_000 })

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}
function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export async function login(username: string, password: string) {
  const { data } = await http.post('/auth/login/', { username, password })
  setToken(data.access)
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

http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && getToken()) {
      clearToken()
      if (onUnauthorized) onUnauthorized()
      else window.location.assign('/login')
    }
    return Promise.reject(error)
  },
)

/** Unwrap DRF list endpoints that may or may not be paginated. */
export function listData<T>(data: T[] | { results: T[] }): T[] {
  return Array.isArray(data) ? data : data.results
}
