import { useState } from 'react'
import { getToken } from './lib/auth'
import LoginForm from './LoginForm'
import ItemsList from './ItemsList'
import RecipesPage from './RecipesPage'

function App() {
  const [loggedIn, setLoggedIn] = useState(!!getToken())
  const [view, setView] = useState('recipes')

  if (!loggedIn) {
    return <LoginForm onLoggedIn={() => setLoggedIn(true)} />
  }

  const onLoggedOut = () => setLoggedIn(false)

  if (view === 'items') {
    return <ItemsList onLoggedOut={onLoggedOut} onBack={() => setView('recipes')} />
  }

  return <RecipesPage onLoggedOut={onLoggedOut} onOpenItems={() => setView('items')} />
}

export default App
