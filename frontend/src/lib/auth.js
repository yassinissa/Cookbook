import { api } from './api'

const TOKEN_KEY = 'cookbook_access_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export async function login(username, password) {
  const { data } = await api.post('/auth/login/', { username, password })
  localStorage.setItem(TOKEN_KEY, data.access)
  return data
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY)
}

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Access tokens are short-lived (60 min default). A 401 here means the
// session expired mid-use — clear it and force back to the login screen
// rather than let every screen's "Retry" button fail forever.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && getToken()) {
      logout()
      window.location.reload()
    }
    return Promise.reject(error)
  },
)
