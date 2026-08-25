import { useState } from 'react'
import { getToken } from './lib/auth'
import LoginForm from './LoginForm'
import ItemsList from './ItemsList'

function App() {
  const [loggedIn, setLoggedIn] = useState(!!getToken())

  if (!loggedIn) {
    return <LoginForm onLoggedIn={() => setLoggedIn(true)} />
  }

  return <ItemsList onLoggedOut={() => setLoggedIn(false)} />
}

export default App
