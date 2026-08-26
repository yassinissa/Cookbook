import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Input } from '@/components/Input'
import { Icon } from '@/components/Icon'
import { LocaleToggle } from '@/shell/LocaleToggle'
import { ThemeToggle } from '@/shell/ThemeToggle'
import { getToken, login } from '@/lib/http'
import { useI18n } from '@/i18n'

export function LoginPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (getToken()) {
    navigate('/', { replace: true })
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(username, password)
      navigate('/', { replace: true })
    } catch {
      setError(t('login.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="absolute end-4 top-4 flex items-center gap-1">
        <LocaleToggle />
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-white">
            <Icon name="dish" size={22} />
          </span>
          <div>
            <p className="font-display text-2xl font-medium leading-none text-ink">
              {t('login.title')}
            </p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
              {t('app.group')}
            </p>
          </div>
        </div>

        <div className="rounded-card border border-hairline bg-surface p-6 shadow-card">
          <h1 className="text-sm font-semibold text-ink">{t('login.submit')}</h1>
          <p className="mb-5 mt-1 text-[13px] text-ink-subtle">{t('login.subtitle')}</p>

          <form onSubmit={onSubmit} className="space-y-4">
            <Field label={t('login.username')}>
              <Input
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </Field>
            <Field label={t('login.password')}>
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>

            {error && (
              <p
                role="alert"
                className="flex items-center gap-2 rounded-lg bg-danger-subtle px-3 py-2 text-[13px] font-medium text-danger-ink"
              >
                <Icon name="alert" size={15} />
                {error}
              </p>
            )}

            <Button type="submit" variant="primary" loading={busy} className="w-full">
              {busy ? t('login.submitting') : t('login.submit')}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
