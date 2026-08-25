import { useEffect, useState } from 'react'
import { fetchReferenceData, itemConversions, itemNutrition } from './lib/cookbookApi'
import { Field, inputClass, primaryButtonClass, secondaryButtonClass, Spinner } from './RecipeFormFields'

const emptyConversion = {
  note_to_add: '', grams_per_piece: '', pieces_per_pack: '', pieces_per_kg: '', pieces_or_pack_per_box: '',
}
const emptyNutrition = {
  unit_scale: '', calories: '0', fat_g: '0', protein_g: '0', saturated_fat_g: '0', trans_fat_g: '0',
  cholesterol_mg: '0', sodium_mg: '0', carbs_g: '0', fibers_g: '0', sugars_g: '0', added_sugars_g: '0',
  verification_notes: '',
}

export default function ItemSupplementForm({ item, onBack }) {
  const [ref, setRef] = useState(null)
  const [conversion, setConversion] = useState(emptyConversion)
  const [lines, setLines] = useState([])
  const [hasConversion, setHasConversion] = useState(false)
  const [nutrition, setNutrition] = useState(emptyNutrition)
  const [hasNutrition, setHasNutrition] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedMessage, setSavedMessage] = useState('')

  useEffect(() => {
    fetchReferenceData().then(setRef)
    itemConversions.get(item.sku).then((c) => {
      if (c) {
        setConversion({
          note_to_add: c.note_to_add ?? '',
          grams_per_piece: c.grams_per_piece ?? '',
          pieces_per_pack: c.pieces_per_pack ?? '',
          pieces_per_kg: c.pieces_per_kg ?? '',
          pieces_or_pack_per_box: c.pieces_or_pack_per_box ?? '',
        })
        setLines(c.lines.map((l) => ({ label: l.label, quantity: l.quantity, unit: l.unit, gram_equivalent: l.gram_equivalent ?? '' })))
        setHasConversion(true)
      }
    })
    itemNutrition.get(item.sku).then((n) => {
      if (n) {
        setNutrition({ ...n, unit_scale: n.unit_scale })
        setHasNutrition(true)
      }
    })
  }, [item.sku])

  function addLine() {
    setLines((rows) => [...rows, { label: '', quantity: '', unit: '', gram_equivalent: '' }])
  }
  function updateLine(i, key, value) {
    setLines((rows) => rows.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)))
  }
  function removeLine(i) {
    setLines((rows) => rows.filter((_, idx) => idx !== i))
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    setSavedMessage('')
    setSaving(true)
    try {
      const conversionPayload = {
        item_sku: item.sku,
        ...conversion,
        grams_per_piece: conversion.grams_per_piece || null,
        pieces_per_pack: conversion.pieces_per_pack || null,
        pieces_per_kg: conversion.pieces_per_kg || null,
        pieces_or_pack_per_box: conversion.pieces_or_pack_per_box || null,
        lines,
      }
      if (hasConversion) {
        await itemConversions.update(item.sku, conversionPayload)
      } else {
        await itemConversions.create(conversionPayload)
        setHasConversion(true)
      }

      const nutritionPayload = { item_sku: item.sku, ...nutrition, unit_scale: nutrition.unit_scale || null }
      if (hasNutrition) {
        await itemNutrition.update(item.sku, nutritionPayload)
      } else {
        await itemNutrition.create(nutritionPayload)
        setHasNutrition(true)
      }

      setSavedMessage('Saved.')
    } catch (err) {
      setError(err.response?.data ? JSON.stringify(err.response.data) : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  if (!ref) return <Spinner />

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <button type="button" onClick={onBack} className={`${secondaryButtonClass} mb-1`}>← Back to items</button>
          <h1 className="text-2xl font-semibold text-stone-900 tracking-tight">{item.name_en}</h1>
          <p className="text-stone-500 text-sm">{item.sku} · Cookbook-only supplement data, not pushed to inventory-platform</p>
        </div>
        <div className="flex items-center gap-3">
          {savedMessage && <span className="text-sm text-success-700">{savedMessage}</span>}
          <button type="submit" disabled={saving} className={primaryButtonClass}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-md p-3 break-all">{error}</p>}

      <section className="bg-white rounded-lg border border-stone-200 p-4">
        <h2 className="text-sm font-semibold text-stone-700 mb-3">Packaging conversions</h2>
        <div className="grid grid-cols-4 gap-4 mb-4">
          <Field label="Grams per piece"><input type="number" step="0.001" className={inputClass} value={conversion.grams_per_piece} onChange={(e) => setConversion((c) => ({ ...c, grams_per_piece: e.target.value }))} /></Field>
          <Field label="Pieces per pack"><input type="number" step="0.001" className={inputClass} value={conversion.pieces_per_pack} onChange={(e) => setConversion((c) => ({ ...c, pieces_per_pack: e.target.value }))} /></Field>
          <Field label="Pieces per kg"><input type="number" step="0.001" className={inputClass} value={conversion.pieces_per_kg} onChange={(e) => setConversion((c) => ({ ...c, pieces_per_kg: e.target.value }))} /></Field>
          <Field label="Pieces/pack per box"><input type="number" step="0.001" className={inputClass} value={conversion.pieces_or_pack_per_box} onChange={(e) => setConversion((c) => ({ ...c, pieces_or_pack_per_box: e.target.value }))} /></Field>
        </div>
        <Field label="Note"><input className={inputClass} value={conversion.note_to_add} onChange={(e) => setConversion((c) => ({ ...c, note_to_add: e.target.value }))} /></Field>
      </section>

      <section className="bg-white rounded-lg border border-stone-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-stone-700">Cooking-measure conversions</h2>
          <button type="button" onClick={addLine} className={secondaryButtonClass}>+ Add conversion line</button>
        </div>
        {lines.length === 0 && <p className="text-sm text-stone-400 mb-2">No conversions yet — e.g. "1 Tbs = 25 g".</p>}
        <div className="space-y-2">
          {lines.map((line, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <input className={`${inputClass} col-span-3`} placeholder='e.g. "1 Tbs"' value={line.label} onChange={(e) => updateLine(i, 'label', e.target.value)} />
              <input type="number" step="0.001" className={`${inputClass} col-span-2 tabular-nums`} placeholder="Quantity" value={line.quantity} onChange={(e) => updateLine(i, 'quantity', e.target.value)} />
              <select className={`${inputClass} col-span-2`} value={line.unit} onChange={(e) => updateLine(i, 'unit', e.target.value)}>
                <option value="">—</option>
                {ref.units.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
              </select>
              <input type="number" step="0.001" className={`${inputClass} col-span-3 tabular-nums`} placeholder="Gram equivalent (optional)" value={line.gram_equivalent} onChange={(e) => updateLine(i, 'gram_equivalent', e.target.value)} />
              <button type="button" onClick={() => removeLine(i)} aria-label={`Remove conversion line ${i + 1}`} className="col-span-1 text-stone-400 hover:text-danger-600 transition-colors text-sm rounded focus:outline-none focus:ring-2 focus:ring-danger-500">✕</button>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-lg border border-stone-200 p-4">
        <h2 className="text-sm font-semibold text-stone-700 mb-3">Nutrition (per unit)</h2>
        <div className="grid grid-cols-4 gap-4">
          <Field label="Per unit">
            <select className={inputClass} value={nutrition.unit_scale} onChange={(e) => setNutrition((n) => ({ ...n, unit_scale: e.target.value }))}>
              <option value="">—</option>
              {ref.units.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
            </select>
          </Field>
          <Field label="Calories"><input type="number" step="0.001" className={inputClass} value={nutrition.calories} onChange={(e) => setNutrition((n) => ({ ...n, calories: e.target.value }))} /></Field>
          <Field label="Fat (g)"><input type="number" step="0.001" className={inputClass} value={nutrition.fat_g} onChange={(e) => setNutrition((n) => ({ ...n, fat_g: e.target.value }))} /></Field>
          <Field label="Protein (g)"><input type="number" step="0.001" className={inputClass} value={nutrition.protein_g} onChange={(e) => setNutrition((n) => ({ ...n, protein_g: e.target.value }))} /></Field>
          <Field label="Saturated fat (g)"><input type="number" step="0.001" className={inputClass} value={nutrition.saturated_fat_g} onChange={(e) => setNutrition((n) => ({ ...n, saturated_fat_g: e.target.value }))} /></Field>
          <Field label="Trans fat (g)"><input type="number" step="0.001" className={inputClass} value={nutrition.trans_fat_g} onChange={(e) => setNutrition((n) => ({ ...n, trans_fat_g: e.target.value }))} /></Field>
          <Field label="Cholesterol (mg)"><input type="number" step="0.001" className={inputClass} value={nutrition.cholesterol_mg} onChange={(e) => setNutrition((n) => ({ ...n, cholesterol_mg: e.target.value }))} /></Field>
          <Field label="Sodium (mg)"><input type="number" step="0.001" className={inputClass} value={nutrition.sodium_mg} onChange={(e) => setNutrition((n) => ({ ...n, sodium_mg: e.target.value }))} /></Field>
          <Field label="Carbs (g)"><input type="number" step="0.001" className={inputClass} value={nutrition.carbs_g} onChange={(e) => setNutrition((n) => ({ ...n, carbs_g: e.target.value }))} /></Field>
          <Field label="Fibers (g)"><input type="number" step="0.001" className={inputClass} value={nutrition.fibers_g} onChange={(e) => setNutrition((n) => ({ ...n, fibers_g: e.target.value }))} /></Field>
          <Field label="Sugars (g)"><input type="number" step="0.001" className={inputClass} value={nutrition.sugars_g} onChange={(e) => setNutrition((n) => ({ ...n, sugars_g: e.target.value }))} /></Field>
          <Field label="Added sugars (g)"><input type="number" step="0.001" className={inputClass} value={nutrition.added_sugars_g} onChange={(e) => setNutrition((n) => ({ ...n, added_sugars_g: e.target.value }))} /></Field>
        </div>
        <div className="mt-4">
          <Field label="Verification notes"><input className={inputClass} placeholder='e.g. "OK", "Check Required - All values zero"' value={nutrition.verification_notes} onChange={(e) => setNutrition((n) => ({ ...n, verification_notes: e.target.value }))} /></Field>
        </div>
      </section>
    </form>
  )
}
