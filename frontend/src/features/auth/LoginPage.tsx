import { useEffect, useState, type FormEvent } from 'react'
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

  useEffect(() => {
    if (getToken()) navigate('/', { replace: true })
  }, [navigate])

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
    <div className="relative min-h-screen overflow-hidden bg-canvas lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      {/* signature rail — full height, screen (or panel) leading edge, every size */}
      <span aria-hidden className="spice-rail absolute inset-y-0 start-0 z-20 w-1.5" />

      <div className="absolute end-4 top-4 z-20 flex items-center gap-1">
        <LocaleToggle />
        <ThemeToggle />
      </div>

      {/* Brand — the thesis: a working kitchen run like an engineering team */}
      <section className="relative flex flex-col justify-center overflow-hidden px-6 pb-8 pt-16 sm:px-10 lg:min-h-screen lg:border-e lg:border-hairline lg:bg-surface-sunken lg:px-16 lg:pb-0 lg:pt-0">
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-40 animate-ambient-drift"
          style={{
            background:
              'radial-gradient(34rem 26rem at 34% 42%, var(--glow-1), transparent 70%)',
          }}
        />
        <Icon
          name="dish"
          size={480}
          aria-hidden
          className="pointer-events-none absolute -end-28 -top-20 text-ink opacity-[0.045] lg:-bottom-44 lg:-end-40 lg:top-auto lg:size-[560px]"
        />

        <div className="mb-7 flex items-center gap-2.5 lg:absolute lg:inset-x-16 lg:top-14 lg:mb-0">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-on shadow-e2 lg:h-9 lg:w-9">
            <Icon name="dish" size={20} />
          </span>
          <div className="lg:flex lg:items-center">
            <p className="font-display text-lg font-medium leading-none text-ink">
              {t('app.name')}
            </p>
            <p className="mt-1 font-mono text-[10px] font-medium uppercase text-ink-subtle ltr:tracking-[0.16em] lg:hidden">
              {t('app.group')}
            </p>
          </div>
        </div>

        <div className="relative stagger">
          <p className="font-mono text-[11px] font-medium uppercase text-accent-ink ltr:tracking-[0.2em]">
            {t('login.eyebrow')}
          </p>
          <h1
            className="mt-4 max-w-[13ch] font-display text-[clamp(1.85rem,7vw,3.4rem)] font-medium leading-[1.07] tracking-[-0.02em] text-ink"
            style={{ textWrap: 'balance' }}
          >
            {t('login.headline')}
          </h1>
          <p className="mt-4 max-w-md text-[14px] leading-relaxed text-ink-muted lg:mt-5 lg:text-[15px]">
            {t('login.lede')}
          </p>
          <div className="mt-6 flex items-center gap-4 font-mono text-[10px] uppercase text-ink-subtle ltr:tracking-[0.14em] sm:gap-5 sm:text-[11px] lg:mt-7">
            <span>8 branches</span>
            <span aria-hidden className="h-3 w-px bg-hairline-strong" />
            <span>EN&nbsp;/&nbsp;عربي</span>
            <span aria-hidden className="h-3 w-px bg-hairline-strong" />
            <span>KWD, live</span>
          </div>
        </div>
      </section>

      {/* Sign-in */}
      <section className="relative flex justify-center px-6 pb-14 pt-2 sm:px-10 lg:min-h-screen lg:items-center lg:pb-16 lg:pt-0">
        <div className="w-full max-w-[26rem] stagger">
          <div className="card-lit-hi overflow-hidden rounded-lg2 border border-hairline bg-surface-raised">
            <span aria-hidden className="spice-rail-h block h-1" />
            <div className="p-7 sm:p-8">
              <h2 className="font-display text-2xl font-medium tracking-tight text-ink">
                {t('login.submit')}
              </h2>
              <p className="mt-1.5 text-[13px] text-ink-subtle">{t('login.cardHint')}</p>

              <form onSubmit={onSubmit} className="mt-6 space-y-4">
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
                    <Icon name="alert" size={15} className="flex-none" />
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  loading={busy}
                  className="mt-1 h-11 w-full text-[15px] shadow-e2 transition-transform duration-150 hover:-translate-y-px active:translate-y-0"
                >
                  {busy ? t('login.submitting') : t('login.submit')}
                </Button>
              </form>
            </div>
          </div>

          <p className="mt-5 text-center text-xs leading-relaxed text-ink-subtle">
            {t('login.help')}
          </p>
        </div>
      </section>
    </div>
  )
}
