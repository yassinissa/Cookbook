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
