import { useMemo, useState } from 'react'
import { useQueries } from '@tanstack/react-query'

import { Button } from '@/components/Button'
import { Select } from '@/components/Input'
import { EmptyState, ErrorState, LoadingRow } from '@/components/States'
import * as api from '@/lib/api'
import { qk } from '@/lib/queryClient'
import { useProductionRecipes } from '@/lib/queries'
import { shortDate } from '@/lib/format'
import { useI18n } from '@/i18n'
import { PrintFrame } from './print/PrintFrame'
import { RecipeCardSheet, type DocLang } from './print/RecipeCardSheet'
import { SegmentedButtons } from '@/components/Page'
import { ControlBar, Ctl } from './controls'

const MAX = 40

export function PrepBookPage() {
  const { t, locale } = useI18n()

  const [kitchen, setKitchen] = useState<string>('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [lang, setLang] = useState<DocLang>(locale === 'ar' ? 'ar' : 'en')

  const list = useProductionRecipes()

  const kitchens = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of list.data ?? []) {
      if (r.prep_kitchen) seen.set(r.prep_kitchen, r.prep_kitchen_name || r.prep_kitchen)
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [list.data])

  const rows = useMemo(() => {
    const all = (list.data ?? []).slice().sort((a, b) => a.name_en.localeCompare(b.name_en))
    return kitchen ? all.filter((r) => r.prep_kitchen === kitchen) : all
  }, [list.data, kitchen])

  const selectedIds = [...selected]
  const details = useQueries({
    queries: selectedIds.map((id) => ({
      queryKey: qk.productionRecipe(id),
      queryFn: () => api.fetchProductionRecipe(id),
    })),
  })

  const loaded = details
    .map((q) => q.data)
    .filter((d): d is NonNullable<typeof d> => !!d)
    .sort((a, b) => a.name_en.localeCompare(b.name_en))

  const anyLoading = details.some((q) => q.isLoading)
  const overCap = selected.size > MAX

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function selectAll() {
    setSelected(new Set(rows.map((r) => r.id)))
  }

  const kitchenLabel = kitchen ? kitchens.find(([k]) => k === kitchen)?.[1] : null

  const controls = (
    <ControlBar>
      <Ctl label={t('documents.prepKitchen')}>
        <Select value={kitchen} onChange={(e) => setKitchen(e.target.value)}>
          <option value="">{t('documents.prepKitchen.all')}</option>
          {kitchens.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </Select>
      </Ctl>

      <Ctl label={t('documents.lang')}>
        <SegmentedButtons<DocLang>
          label={t('documents.lang')}
          value={lang}
          onChange={setLang}
          options={[
            { value: 'en', label: t('documents.lang.en') },
            { value: 'ar', label: t('documents.lang.ar') },
            { value: 'both', label: t('documents.lang.both') },
          ]}
        />
      </Ctl>

      <div className="flex items-end gap-2 sm:col-span-2">
        <Button variant="secondary" size="sm" onClick={selectAll} disabled={rows.length === 0}>
          {t('documents.selectAll')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSelected(new Set())}
          disabled={selected.size === 0}
        >
          {t('documents.clear')}
        </Button>
        <span className="pb-1.5 text-xs text-ink-subtle">
          {t('documents.selected', { n: selected.size })}
        </span>
      </div>

      <div className="sm:col-span-2 lg:col-span-4">
        {list.isLoading ? (
          <LoadingRow />
        ) : rows.length === 0 ? (
          <p className="text-sm text-ink-subtle">{t('state.empty')}</p>
        ) : (
          <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-hairline bg-surface-raised p-2">
            {rows.map((r) => (
              <li key={r.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[13px] text-ink hover:bg-surface-sunken">
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                    className="h-4 w-4 rounded border-hairline-strong accent-[var(--accent)]"
                  />
                  <span className="truncate">{r.name_en}</span>
                  <span className="tnum ms-auto flex-none text-xs text-ink-subtle">
                    #{r.recipe_code}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      {overCap && (
        <p className="sm:col-span-2 lg:col-span-4 text-sm text-warning-ink">
          {t('documents.tooMany', { max: MAX })}
        </p>
      )}
    </ControlBar>
  )

  return (
    <PrintFrame
      title={t('documents.prepBook.title')}
      subtitle={kitchenLabel ?? undefined}
      controls={controls}
      printDisabled={loaded.length === 0 || overCap}
    >
      {selected.size === 0 ? (
        <EmptyState icon="production" title={t('documents.prepBook.empty')} />
      ) : overCap ? (
        <EmptyState icon="production" title={t('documents.tooMany', { max: MAX })} />
      ) : details.some((q) => q.isError) ? (
        <ErrorState />
      ) : anyLoading && loaded.length === 0 ? (
        <LoadingRow />
      ) : (
        <div className="doc-sheet">
          <section className="doc-section mb-8 border-b-2 border-current pb-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em]">
              {t('documents.coverBook')}
            </p>
            <h2 className="mt-1 font-display text-[24px] font-semibold">
              {kitchenLabel ?? t('documents.prepKitchen.all')}
            </h2>
            <p className="mt-1 text-[12px]">
              {loaded.length === 1
                ? t('documents.coverCountOne')
                : t('documents.coverCount', { n: loaded.length })}{' '}
              · {t('documents.printedOn', { date: shortDate(new Date().toISOString(), locale) })}
            </p>
          </section>

          <section className="doc-section mb-8">
            <h3 className="mb-1 text-[11px] font-bold uppercase tracking-[0.1em]">
              {t('documents.contents')}
            </h3>
            <ol className="text-[12px]">
              {loaded.map((d, i) => (
                <li key={d.id} className="flex justify-between border-b border-[#ddd] py-0.5">
                  <span>
                    {i + 1}. {d.name_en}
                  </span>
                  <span className="font-mono opacity-70">#{d.recipe_code}</span>
                </li>
              ))}
            </ol>
          </section>

          {loaded.map((d) => (
            <RecipeCardSheet
              key={d.id}
              kind="production"
              recipe={d}
              lang={lang}
              includeCost
              pageBreakBefore
            />
          ))}
        </div>
      )}
    </PrintFrame>
  )
}
