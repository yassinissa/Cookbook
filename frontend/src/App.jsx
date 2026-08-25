import { useState } from 'react'
import { getToken } from './lib/auth'
import LoginForm from './LoginForm'
import ItemsList from './ItemsList'
import DishRecipeList from './DishRecipeList'
import DishRecipeForm from './DishRecipeForm'

function App() {
  const [loggedIn, setLoggedIn] = useState(!!getToken())
  const [view, setView] = useState({ name: 'recipes' })

  if (!loggedIn) {
    return <LoginForm onLoggedIn={() => setLoggedIn(true)} />
  }

  const onLoggedOut = () => setLoggedIn(false)

  if (view.name === 'items') {
    return <ItemsList onLoggedOut={onLoggedOut} onBack={() => setView({ name: 'recipes' })} />
  }

  if (view.name === 'recipe-form') {
    return (
      <DishRecipeForm
        recipeId={view.recipeId}
        onDone={() => setView({ name: 'recipes' })}
        onCancel={() => setView({ name: 'recipes' })}
      />
    )
  }

  return (
    <DishRecipeList
      onLoggedOut={onLoggedOut}
      onNew={() => setView({ name: 'recipe-form', recipeId: null })}
      onEdit={(id) => setView({ name: 'recipe-form', recipeId: id })}
      onOpenItems={() => setView({ name: 'items' })}
    />
  )
}

export default App
