import { useState } from 'react'
import { logout } from './lib/auth'
import DishRecipeList from './DishRecipeList'
import DishRecipeForm from './DishRecipeForm'
import ProductionRecipeList from './ProductionRecipeList'
import ProductionRecipeForm from './ProductionRecipeForm'

const TABS = [
  { key: 'dish', label: 'Dish Recipes' },
  { key: 'production', label: 'Production Recipes' },
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
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold text-stone-900">Cookbook</h1>
          <div className="flex items-center gap-4">
            <button onClick={onOpenItems} className="text-sm text-stone-500 hover:text-stone-800">Inventory items</button>
            <button onClick={() => { logout(); onLoggedOut() }} className="text-sm text-stone-500 hover:text-stone-800">Log out</button>
          </div>
        </div>

        {mode.name === 'list' && (
          <div className="flex gap-1 mb-6 border-b border-stone-200">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => switchTab(t.key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                  tab === t.key ? 'border-stone-900 text-stone-900' : 'border-transparent text-stone-400 hover:text-stone-600'
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

        {mode.name === 'list' && tab === 'dish' && (
          <DishRecipeList
            onNew={() => setMode({ name: 'form', recipeId: null })}
            onEdit={(id) => setMode({ name: 'form', recipeId: id })}
          />
        )}
        {mode.name === 'list' && tab === 'production' && (
          <ProductionRecipeList
            onNew={() => setMode({ name: 'form', recipeId: null })}
            onEdit={(id) => setMode({ name: 'form', recipeId: id })}
          />
        )}
      </div>
    </div>
  )
}
