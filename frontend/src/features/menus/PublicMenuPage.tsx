import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import { usePublicMenu } from '@/lib/queries'
import { useI18n } from '@/i18n'
import type { PublicMenuItem } from '@/types/api'

/**
 * The public, unauthenticated QR / print menu at /m/:slug. Its own bare shell —
 * no app chrome, no auth. Reads only the frozen edition payload.
 */
export function PublicMenuPage() {
  const { slug } = useParams()
  const { data, isLoading, isError } = usePublicMenu(slug)
  const { t, locale: appLocale } = useI18n()

  // the customer picks their language independently of any app setting
  const [lang, setLang] = useState<'en' | 'ar'>(appLocale === 'ar' ? 'ar' : 'en')
  const rtl = lang === 'ar'
  const pick = (en: string, ar: string) => (rtl ? ar || en : en || ar)

  useEffect(() => {
    document.title = data ? `${pick(data.branch.name_en, data.branch.name_ar)} — Menu` : 'Menu'
  }, [data, lang]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} lang={lang} className="pm-root">
      <style>{CSS}</style>

      {isLoading && <p className="pm-note">{t('publicMenu.loading')}</p>}

      {isError && (
        <div className="pm-note">
          <h1>{t('publicMenu.notFound')}</h1>
          <p>{t('publicMenu.notFoundHint')}</p>
        </div>
      )}

      {data && (
        <>
          <header className="pm-header">
            <div className="pm-langs no-print">
              <button aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
              <button aria-pressed={lang === 'ar'} onClick={() => setLang('ar')}>ع</button>
            </div>
            <h1 className="pm-title">{pick(data.branch.name_en, data.branch.name_ar)}</h1>
            {data.period_names.length > 0 && (
              <p className="pm-ribbon">
                {data.period_names.map((p) => pick(p.en, p.ar)).join(' · ')}
              </p>
            )}
            <button className="pm-print no-print" onClick={() => window.print()}>
              {t('publicMenu.print')}
            </button>
          </header>

          <main className="pm-menu">
            {data.categories.map((cat) => (
              <section key={cat.name_en} className="pm-cat">
                <h2>{pick(cat.name_en, cat.name_ar)}</h2>
                <ul>
                  {cat.items.map((item, i) => (
                    <Item key={i} item={item} pick={pick} t={t} />
                  ))}
                </ul>
              </section>
            ))}
          </main>

          <footer className="pm-foot">
            {t('publicMenu.asOf', { date: new Date(data.effective_on).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' }) })}
          </footer>
        </>
      )}
    </div>
  )
}

function Item({
  item,
  pick,
  t,
}: {
  item: PublicMenuItem
  pick: (en: string, ar: string) => string
  t: ReturnType<typeof useI18n>['t']
}) {
  const name = pick(item.name_en, item.name_ar)
  const desc = pick(item.description_en, item.description_ar)
  return (
    <li className="pm-item">
      {item.image_url && <img src={item.image_url} alt="" className="pm-img" loading="lazy" />}
      <div className="pm-body">
        <div className="pm-row">
          <span className="pm-name">{name}</span>
          {item.price != null && <span className="pm-price">{item.price}</span>}
        </div>
        {desc && <p className="pm-desc">{desc}</p>}
        <p className="pm-meta">
          {item.calories != null && <span>{t('publicMenu.kcal', { n: item.calories })}</span>}
          {item.allergens.length > 0 && (
            <span>{t('publicMenu.allergens')}: {item.allergens.join(', ')}</span>
          )}
        </p>
      </div>
    </li>
  )
}

/* Route-scoped styles — this page is served outside the app shell, so it owns
   its whole look, its own print rules, and both themes via prefers-color-scheme. */
const CSS = `
.pm-root {
  --pm-bg: #faf7f0; --pm-surface: #fffdf8; --pm-ink: #2a2320; --pm-muted: #7a6f62;
  --pm-line: #e6dcc9; --pm-accent: #a8481c;
  min-height: 100vh; margin: 0 auto; max-width: 720px; padding: 1.5rem 1.1rem 4rem;
  background: var(--pm-bg); color: var(--pm-ink);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
@media (prefers-color-scheme: dark) {
  .pm-root { --pm-bg: #16120e; --pm-surface: #201b16; --pm-ink: #ece3d6; --pm-muted: #a89a88;
             --pm-line: #362d24; --pm-accent: #e08a52; }
}
.pm-note { text-align: center; padding: 4rem 1rem; color: var(--pm-muted); }
.pm-note h1 { color: var(--pm-ink); font-size: 1.25rem; }
.pm-header { text-align: center; padding-bottom: 1.4rem; border-bottom: 2px solid var(--pm-accent); margin-bottom: 1.6rem; position: relative; }
.pm-title { font-size: clamp(1.6rem, 6vw, 2.2rem); margin: .3rem 0 .2rem; letter-spacing: -.01em; }
.pm-ribbon { display: inline-block; margin: .4rem 0 0; padding: .2rem .7rem; font-size: .8rem;
             background: var(--pm-accent); color: #fff; border-radius: 999px; }
.pm-langs { position: absolute; inset-inline-start: 0; top: 0; display: flex; gap: .25rem; }
.pm-langs button, .pm-print {
  border: 1px solid var(--pm-line); background: var(--pm-surface); color: var(--pm-muted);
  border-radius: 8px; padding: .3rem .6rem; font-size: .8rem; cursor: pointer;
}
.pm-langs button[aria-pressed="true"] { background: var(--pm-accent); color: #fff; border-color: var(--pm-accent); }
.pm-print { position: absolute; inset-inline-end: 0; top: 0; }
.pm-cat { margin-bottom: 2rem; }
.pm-cat h2 { font-size: 1.05rem; text-transform: uppercase; letter-spacing: .08em;
             color: var(--pm-accent); border-bottom: 1px solid var(--pm-line); padding-bottom: .3rem; margin: 0 0 .8rem; }
.pm-cat ul { list-style: none; margin: 0; padding: 0; }
.pm-item { display: flex; gap: .9rem; padding: .8rem 0; border-bottom: 1px solid var(--pm-line); }
.pm-item:last-child { border-bottom: 0; }
.pm-img { width: 72px; height: 72px; object-fit: cover; border-radius: 10px; flex: none; }
.pm-body { flex: 1; min-width: 0; }
.pm-row { display: flex; justify-content: space-between; gap: .8rem; align-items: baseline; }
.pm-name { font-weight: 600; }
.pm-price { font-variant-numeric: tabular-nums; color: var(--pm-muted); flex: none; }
.pm-desc { margin: .2rem 0 0; font-size: .88rem; color: var(--pm-muted); line-height: 1.45; }
.pm-meta { margin: .35rem 0 0; font-size: .72rem; color: var(--pm-muted); display: flex; flex-wrap: wrap; gap: .1rem 1rem; }
.pm-foot { margin-top: 2.5rem; text-align: center; font-size: .75rem; color: var(--pm-muted); }
@media print {
  .no-print { display: none !important; }
  .pm-root { background: #fff; color: #000; max-width: none; padding: 0; }
  .pm-img { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .pm-item { break-inside: avoid; }
  .pm-cat { break-inside: avoid-page; }
}
`
