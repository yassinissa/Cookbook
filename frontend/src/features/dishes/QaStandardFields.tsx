import { Field } from '@/components/Field'
import { Input, Select, Textarea } from '@/components/Input'
import { TASTE_AXES, TasteAxisInput } from '@/components/TasteAxis'
import { useI18n } from '@/i18n'
import type { Branch, DishStandard } from '@/types/api'

export const EMPTY_STANDARD: DishStandard = {
  service_style: '',
  branch_applicability: '',
  portion_weight_g: '',
  portion_tolerance_g: '',
  serving_temp_c: '',
  temp_tolerance_c: '',
  holding_time_minutes: null,
  appearance: '',
  color: '',
  aroma: '',
  texture: '',
  presentation: '',
  primary_flavor: '',
  secondary_flavor: '',
  aftertaste: '',
  mouthfeel: '',
  freshness_standard: '',
  critical_defects_not_allowed: '',
  ...Object.fromEntries(TASTE_AXES.flatMap(([k]) => [[`${k}_target`, ''], [`${k}_tolerance`, '']])),
}

export function standardToForm(std: DishStandard): DishStandard {
  const clean: Record<string, string> = {}
  for (const key of Object.keys(EMPTY_STANDARD)) {
    const v = std[key]
    clean[key] = v === null || v === undefined ? '' : String(v)
  }
  return clean as unknown as DishStandard
}

export function QaStandardFields({
  standard,
  branches,
  onChange,
}: {
  standard: DishStandard
  branches: Branch[]
  onChange: (key: string, value: string) => void
}) {
  const { t } = useI18n()
  const val = (k: string) => String(standard[k] ?? '')

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Branch applicability">
          <Select value={val('branch_applicability')} onChange={(e) => onChange('branch_applicability', e.target.value)}>
            <option value="">—</option>
            <option>All Branches</option>
            <option>Selected Branches</option>
            {branches.map((b) => (
              <option key={b.id}>{b.name_en}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('editor.field.serviceStyle')}>
          <Input value={val('service_style')} onChange={(e) => onChange('service_style', e.target.value)} />
        </Field>
        <Field label="Portion weight (g)">
          <Input type="number" step="0.01" value={val('portion_weight_g')} onChange={(e) => onChange('portion_weight_g', e.target.value)} />
        </Field>
        <Field label="Portion tolerance (± g)">
          <Input type="number" step="0.01" value={val('portion_tolerance_g')} onChange={(e) => onChange('portion_tolerance_g', e.target.value)} />
        </Field>
        <Field label="Serving temp (°C)">
          <Input type="number" step="0.1" value={val('serving_temp_c')} onChange={(e) => onChange('serving_temp_c', e.target.value)} />
        </Field>
        <Field label="Temp tolerance (± °C)">
          <Input type="number" step="0.1" value={val('temp_tolerance_c')} onChange={(e) => onChange('temp_tolerance_c', e.target.value)} />
        </Field>
        <Field label="Holding time (min)">
          <Input type="number" value={val('holding_time_minutes')} onChange={(e) => onChange('holding_time_minutes', e.target.value)} />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ['appearance', 'Appearance'],
          ['color', 'Colour'],
          ['aroma', 'Aroma'],
          ['texture', 'Texture'],
          ['presentation', 'Presentation'],
          ['primary_flavor', 'Primary flavour'],
          ['secondary_flavor', 'Secondary flavour'],
          ['aftertaste', 'Aftertaste'],
          ['mouthfeel', 'Mouthfeel'],
        ].map(([key, label]) => (
          <Field key={key} label={label}>
            <Input value={val(key)} onChange={(e) => onChange(key, e.target.value)} />
          </Field>
        ))}
      </div>

      <div>
        <div className="mb-1 grid grid-cols-[1fr_5rem_5rem] gap-2 px-1 text-2xs uppercase tracking-wide text-ink-subtle">
          <span>Taste axis</span>
          <span className="text-center">Target</span>
          <span className="text-center">± Tol</span>
        </div>
        <div className="space-y-1.5">
          {TASTE_AXES.map(([key, label]) => (
            <TasteAxisInput
              key={key}
              label={label}
              target={val(`${key}_target`)}
              tolerance={val(`${key}_tolerance`)}
              onTarget={(v) => onChange(`${key}_target`, v)}
              onTolerance={(v) => onChange(`${key}_tolerance`, v)}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Freshness standard">
          <Textarea rows={2} value={val('freshness_standard')} onChange={(e) => onChange('freshness_standard', e.target.value)} />
        </Field>
        <Field label="Critical defects not allowed">
          <Textarea rows={2} value={val('critical_defects_not_allowed')} onChange={(e) => onChange('critical_defects_not_allowed', e.target.value)} />
        </Field>
      </div>
    </div>
  )
}
