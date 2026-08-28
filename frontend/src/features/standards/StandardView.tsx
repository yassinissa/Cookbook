import { Card, CardBody, CardHeader } from '@/components/Card'
import { TASTE_AXES, TasteAxisBar } from '@/components/TasteAxis'
import { useI18n, type TFunc } from '@/i18n'
import type { DishStandard } from '@/types/api'

/** Read-only render of a QA/QC dish standard — shared by the dish detail
 * page and the standalone Standards screen. */
export function StandardCard({ std, t }: { std: DishStandard; t: TFunc }) {
  return (
    <Card elevated>
      <CardHeader title={t('editor.section.standard')} />
      <CardBody className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <Spec
            label="Portion"
            value={std.portion_weight_g && `${std.portion_weight_g} ± ${std.portion_tolerance_g ?? 0} g`}
          />
          <Spec
            label="Serving temp"
            value={std.serving_temp_c && `${std.serving_temp_c} ± ${std.temp_tolerance_c ?? 0} °C`}
          />
          <Spec
            label="Holding"
            value={std.holding_time_minutes != null ? `${std.holding_time_minutes} min` : ''}
          />
          <Spec label="Primary flavour" value={std.primary_flavor} />
          <Spec label="Aftertaste" value={std.aftertaste} />
          <Spec label="Mouthfeel" value={std.mouthfeel} />
        </div>

        {(std.appearance || std.color || std.aroma || std.texture || std.presentation) && (
          <dl className="grid gap-2 border-t border-hairline pt-4 text-sm sm:grid-cols-2">
            <Prose label="Appearance" value={std.appearance} />
            <Prose label="Colour" value={std.color} />
            <Prose label="Aroma" value={std.aroma} />
            <Prose label="Texture" value={std.texture} />
            <Prose label="Presentation" value={std.presentation} />
          </dl>
        )}

        <div className="space-y-1.5 border-t border-hairline pt-4">
          {TASTE_AXES.map(([key, label]) => (
            <TasteAxisBar
              key={key}
              label={label}
              target={std[`${key}_target`]}
              tolerance={std[`${key}_tolerance`]}
            />
          ))}
        </div>

        {std.freshness_standard && (
          <p className="border-t border-hairline pt-3 text-sm text-ink-muted">
            <span className="font-medium text-ink">Freshness — </span>
            {std.freshness_standard}
          </p>
        )}
        {std.critical_defects_not_allowed && (
          <p className="rounded-lg border border-danger-subtle bg-danger-subtle p-3 text-sm text-danger-ink">
            <span className="font-semibold">Critical defects — </span>
            {std.critical_defects_not_allowed}
          </p>
        )}
      </CardBody>
    </Card>
  )
}

/** Bare body (no Card wrapper) — for embedding inside another panel. */
export function StandardBody({ std }: { std: DishStandard }) {
  const { t } = useI18n()
  return <StandardCard std={std} t={t} />
}

function Spec({ label, value }: { label: string; value?: string | number | null }) {
  if (!value) return null
  return (
    <div>
      <dt className="text-2xs uppercase tracking-wide text-ink-subtle">{label}</dt>
      <dd className="tnum text-ink">{value}</dd>
    </div>
  )
}

function Prose({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div>
      <dt className="text-2xs uppercase tracking-wide text-ink-subtle">{label}</dt>
      <dd className="text-ink-muted">{value}</dd>
    </div>
  )
}
