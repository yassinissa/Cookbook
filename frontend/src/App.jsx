import { useState } from 'react'
import { getToken } from './lib/auth'
import { ToastProvider } from './Toast'
import LoginForm from './LoginForm'
import ItemsList from './ItemsList'
import RecipesPage from './RecipesPage'

function App() {
  const [loggedIn, setLoggedIn] = useState(!!getToken())
  const [view, setView] = useState('recipes')

  const onLoggedOut = () => setLoggedIn(false)

  return (
    <ToastProvider>
      {!loggedIn ? (
        <LoginForm onLoggedIn={() => setLoggedIn(true)} />
      ) : view === 'items' ? (
        <ItemsList onLoggedOut={onLoggedOut} onBack={() => setView('recipes')} />
      ) : (
        <RecipesPage onLoggedOut={onLoggedOut} onOpenItems={() => setView('items')} />
      )}
    </ToastProvider>
  )
}

export default App
