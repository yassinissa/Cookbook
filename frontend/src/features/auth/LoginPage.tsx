import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Input } from '@/components/Input'
import { Icon } from '@/components/Icon'
import { AUTH_QUERY_KEY } from '@/auth/AuthProvider'
import { fetchMe } from '@/lib/api/accounts'
import { getToken, login, USE_SEED } from '@/lib/http'
import { useI18n } from '@/i18n'
import { useTheme } from '@/theme/ThemeProvider'

/* Warm directional scrim over the photo (or the generated ambient ground):
   deep on the leading edge where the brand sits, clear through the middle so
   the image reads, deep again at the bottom. Precomputed rgba only — no
   color-mix / token-alpha (iOS 15 Safari on the iPads). */
const SCRIM =
  'linear-gradient(90deg, rgba(9,7,6,0.70) 0%, rgba(9,7,6,0.26) 22%, rgba(9,7,6,0.02) 44%, rgba(9,7,6,0) 56%, rgba(9,7,6,0.24) 78%, rgba(9,7,6,0.58) 100%),' +
  'radial-gradient(120% 120% at 3% 102%, rgba(150,74,44,0.20) 0%, rgba(14,11,9,0) 46%),' +
  'radial-gradient(70% 60% at 100% -4%, rgba(210,150,80,0.08) 0%, rgba(14,11,9,0) 52%),' +
  'linear-gradient(179deg, rgba(12,10,8,0.42) 0%, rgba(12,10,8,0.08) 30%, rgba(12,10,8,0.20) 58%, rgba(9,7,6,0.78) 100%)'

/* same fractal-noise grain the app ground uses, for cohesion over the photo */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")"

const META_LINK =
  'font-mono uppercase tracking-[inherit] text-white/72 transition-colors hover:text-white ' +
  'focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]'

export function LoginPage() {
  const { t, locale, toggleLocale } = useI18n()
  const { choice, cycle } = useTheme()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // load the landscape crop on wide screens, the portrait crop on phones
  const [wide, setWide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const sync = () => setWide(mq.matches)
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const photoSrc = wide ? '/img/login/desktop.jpg' : '/img/login/mobile.jpg'
  // a missing/failed photo just reveals `.login-canvas` (ambient.svg) underneath;
  // track which src failed so switching crops on resize retries the other one
  const [failedSrc, setFailedSrc] = useState('')
  const showPhoto = failedSrc !== photoSrc

  useEffect(() => {
    // Seed builds have no auth backend — there is nothing to sign into. Anyone
    // who lands here (e.g. a stale /login bookmark) goes straight back in.
    if (USE_SEED || getToken()) navigate('/', { replace: true })
  }, [navigate])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(username, password)
      // AuthProvider sits above the router, so navigating here won't make it
      // re-read the just-stored token. Prime the /me query first so the route
      // guards see the caps immediately instead of flashing "no access".
      await qc.prefetchQuery({ queryKey: AUTH_QUERY_KEY, queryFn: fetchMe, staleTime: 5 * 60_000 })
      navigate('/', { replace: true })
    } catch {
      setError(t('login.error'))
    } finally {
      setBusy(false)
    }
  }

  const themeIcon = choice === 'system' ? 'monitor' : choice === 'dark' ? 'moon' : 'sun'
  const themeLabel =
    choice === 'light' ? t('theme.light') : choice === 'dark' ? t('theme.dark') : t('theme.system')

  return (
    <div className="login-canvas relative isolate flex min-h-screen w-full flex-col overflow-x-hidden">
      {showPhoto && (
        <img
          key={photoSrc}
          src={photoSrc}
          alt=""
          aria-hidden
          onError={() => setFailedSrc(photoSrc)}
          decoding="async"
          fetchPriority="high"
          className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover object-[50%_32%] lg:object-[50%_42%]"
        />
      )}

      <div aria-hidden className="pointer-events-none absolute inset-0 z-10" style={{ background: SCRIM }} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 opacity-[0.06] mix-blend-overlay"
        style={{ backgroundImage: GRAIN, backgroundSize: '150px 150px' }}
      />

      {/* the signature rail, leading edge, every size */}
      <span aria-hidden className="spice-rail absolute inset-y-0 start-0 z-30 w-1.5" />

      <main className="relative z-20 flex flex-1 flex-col px-6 pb-11 pt-9 text-white sm:px-10 lg:px-16 lg:pb-14 lg:pt-12">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-on shadow-e2">
            <Icon name="dish" size={20} />
          </span>
          <div>
            <p className="font-display text-lg font-medium leading-none">{t('app.name')}</p>
            <p className="mt-1 font-mono text-[10px] font-medium uppercase text-white/55 ltr:tracking-[0.16em]">
              {t('app.group')}
            </p>
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-end gap-10 pt-10 lg:flex-row lg:items-stretch lg:justify-between lg:gap-14 lg:pt-8">
          {/* Brand — fills the shadowed leading band of the photo */}
          <div className="stagger flex flex-col justify-end lg:max-w-[46rem] lg:flex-1 lg:justify-center [&_h1]:[text-shadow:0_2px_24px_rgba(0,0,0,0.55)] [&>p]:[text-shadow:0_1px_12px_rgba(0,0,0,0.5)]">
            <p className="font-mono text-[11px] font-medium uppercase text-accent-200 ltr:tracking-[0.24em]">
              {t('login.eyebrow')}
            </p>
            <h1 className="mt-5 max-w-[13ch] font-display font-medium leading-[1.03] tracking-[-0.022em] text-white text-[clamp(2.2rem,8vw,3rem)] [text-wrap:balance] lg:mt-6 lg:max-w-[14ch] lg:text-[clamp(2.9rem,4.4vw,4.25rem)]">
              {t('login.headline')}
            </h1>
            <p className="mt-5 max-w-md text-[14px] leading-relaxed text-white/78 lg:mt-6 lg:max-w-xl lg:text-base">
              {t('login.lede')}
            </p>

            {/* meta + the only language / theme controls on the page */}
            <div className="mt-7 flex flex-wrap items-center gap-x-3.5 gap-y-2 font-mono text-[10px] uppercase text-white/60 ltr:tracking-[0.16em] [text-shadow:0_1px_8px_rgba(0,0,0,0.55)] sm:text-[11px] lg:mt-10">
              <span>8 branches</span>
              <span aria-hidden className="text-white/35">&bull;</span>
              <span>KWD, live</span>
              <span aria-hidden className="text-white/35">&bull;</span>
              <button type="button" onClick={toggleLocale} className={META_LINK}>
                {locale === 'en' ? 'العربية' : 'English'}
              </button>
              <span aria-hidden className="text-white/35">&bull;</span>
              <button
                type="button"
                onClick={cycle}
                aria-label={`${t('theme.light')} / ${t('theme.dark')} / ${t('theme.system')}`}
                className={`inline-flex items-center gap-1.5 ${META_LINK}`}
              >
                <Icon name={themeIcon} size={13} aria-hidden />
                {themeLabel}
              </button>
            </div>
          </div>

          {/* Sign-in — a warm-dark panel, lightly translucent so the pendant
             light bleeds through its edges. No backdrop-blur (iOS 15 iPads).
             Sits low so the brass lamp frames it from above. */}
          <div
            data-theme="dark"
            className="stagger w-full max-w-[23.5rem] self-center lg:flex-none lg:self-center lg:mt-[5vh] lg:me-16"
          >
            <div className="overflow-hidden rounded-lg2 border border-[rgba(240,214,175,0.16)] bg-[rgba(42,36,32,0.88)] shadow-[inset_0_1px_0_rgba(255,236,209,0.08),0_26px_70px_-14px_rgba(0,0,0,0.72),0_0_180px_-40px_rgba(236,176,106,0.5)]">
              <span aria-hidden className="spice-rail-h block h-1" />
              <div className="px-7 py-8 text-ink sm:px-8 sm:py-9">
                <h2 className="font-display text-2xl font-medium tracking-tight text-ink">
                  {t('login.submit')}
                </h2>
                <p className="mt-1.5 text-[13px] text-ink-muted">{t('login.cardHint')}</p>

                <form onSubmit={onSubmit} className="login-card-form mt-6 space-y-4">
                  <Field label={t('login.username')}>
                    <Input
                      autoFocus
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                  </Field>

                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="login-password"
                      className="text-[13px] font-medium text-ink-muted"
                    >
                      {t('login.password')}
                    </label>
                    <div className="relative">
                      <Input
                        id="login-password"
                        type={showPw ? 'text' : 'password'}
                        autoComplete="current-password"
                        className="pe-12"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw((v) => !v)}
                        aria-label={showPw ? t('login.hidePassword') : t('login.showPassword')}
                        aria-pressed={showPw}
                        className="absolute end-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-white/40 transition-colors hover:text-white/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
                      >
                        <Icon name={showPw ? 'eyeOff' : 'eye'} size={18} aria-hidden />
                      </button>
                    </div>
                  </div>

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
                    className="mt-1 h-11 w-full text-[15px] font-semibold transition-transform duration-150 hover:-translate-y-px active:translate-y-0"
                  >
                    {busy ? t('login.submitting') : t('login.submit')}
                  </Button>
                </form>
              </div>
            </div>

            <p className="mt-5 text-center text-xs leading-relaxed text-white/70 [text-shadow:0_1px_8px_rgba(0,0,0,0.55)]">
              {t('login.help')}
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
