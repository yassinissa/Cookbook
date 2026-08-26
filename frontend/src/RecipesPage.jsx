import { useState } from 'react'
import { logout } from './lib/auth'
import DishRecipeList from './DishRecipeList'
import DishRecipeForm from './DishRecipeForm'
import DishRecipeCard from './DishRecipeCard'
import ProductionRecipeList from './ProductionRecipeList'
import ProductionRecipeForm from './ProductionRecipeForm'
import ProductionRecipeCard from './ProductionRecipeCard'
import DishStandardsList from './DishStandardsList'
import MenusPage from './MenusPage'
import { secondaryButtonClass } from './RecipeFormFields'

const TABS = [
  { key: 'dish', label: 'Dish Recipes' },
  { key: 'production', label: 'Production Recipes' },
  { key: 'standards', label: 'QA Standards' },
  { key: 'menus', label: 'Menus' },
]

export default function RecipesPage({ onLoggedOut, onOpenItems }) {
  const [tab, setTab] = useState('dish')
  const [mode, setMode] = useState({ name: 'list' }) // { name: 'list' } | { name: 'form', recipeId }

  function switchTab(key) {
    setTab(key)
    setMode({ name: 'list' })
  }

  return (
    <div className="min-h-screen bg-stone-50 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold text-stone-900 tracking-tight">Cookbook</h1>
          <div className="flex items-center gap-4">
            <button onClick={onOpenItems} className={secondaryButtonClass}>Inventory items</button>
            <button onClick={() => { logout(); onLoggedOut() }} className={secondaryButtonClass}>Log out</button>
          </div>
        </div>

        {mode.name === 'list' && (
          <div className="flex gap-1 mb-6 border-b border-stone-200">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => switchTab(t.key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 ${
                  tab === t.key ? 'border-accent-600 text-stone-900' : 'border-transparent text-stone-400 hover:text-stone-600'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {mode.name === 'form' && tab === 'dish' && (
          <DishRecipeForm
            recipeId={mode.recipeId}
            onDone={() => setMode({ name: 'list' })}
            onCancel={() => setMode({ name: 'list' })}
          />
        )}
        {mode.name === 'form' && tab === 'production' && (
          <ProductionRecipeForm
            recipeId={mode.recipeId}
            onDone={() => setMode({ name: 'list' })}
            onCancel={() => setMode({ name: 'list' })}
          />
        )}
        {mode.name === 'card' && tab === 'dish' && (
          <DishRecipeCard
            recipeId={mode.recipeId}
            onBack={() => setMode({ name: 'list' })}
            onEdit={(id) => setMode({ name: 'form', recipeId: id })}
          />
        )}
        {mode.name === 'card' && tab === 'production' && (
          <ProductionRecipeCard
            recipeId={mode.recipeId}
            onBack={() => setMode({ name: 'list' })}
            onEdit={(id) => setMode({ name: 'form', recipeId: id })}
          />
        )}
        {mode.name === 'card' && tab === 'standards' && (
          <DishRecipeCard
            recipeId={mode.recipeId}
            onBack={() => setMode({ name: 'list' })}
            onEdit={(id) => { setTab('dish'); setMode({ name: 'form', recipeId: id }) }}
          />
        )}

        {mode.name === 'list' && tab === 'standards' && (
          <DishStandardsList onOpen={(id) => setMode({ name: 'card', recipeId: id })} />
        )}

        {mode.name === 'list' && tab === 'menus' && <MenusPage />}

        {mode.name === 'list' && tab === 'dish' && (
          <DishRecipeList
            onNew={() => setMode({ name: 'form', recipeId: null })}
            onEdit={(id) => setMode({ name: 'form', recipeId: id })}
            onView={(id) => setMode({ name: 'card', recipeId: id })}
          />
        )}
        {mode.name === 'list' && tab === 'production' && (
          <ProductionRecipeList
            onNew={() => setMode({ name: 'form', recipeId: null })}
            onEdit={(id) => setMode({ name: 'form', recipeId: id })}
            onView={(id) => setMode({ name: 'card', recipeId: id })}
          />
        )}
      </div>
    </div>
  )
}
