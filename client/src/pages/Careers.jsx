import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { GraduationCap, Search, TrendingUp } from 'lucide-react';
import { api } from '../lib/api.js';
import { Badge, Callout, Loading, SectionHeading } from '../components/ui.jsx';
import {
  DEMAND_LABELS,
  DOMAIN_LABELS,
  EDUCATION_LABELS,
  label,
  plural,
  salaryRange,
} from '../lib/format.js';

/**
 * Browse the catalog.
 *
 * The domain filter is in the URL rather than in component state so a link to
 * "the healthcare careers" can be shared, and the back button behaves.
 */
export default function Careers() {
  const [params, setParams] = useSearchParams();
  const domain = params.get('domain') ?? '';
  const q = params.get('q') ?? '';

  const [search, setSearch] = useState(q);
  const [domains, setDomains] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.roles
      .domains()
      .then(({ domains: found }) => setDomains(found))
      .catch(() => {
        /* The filter is a convenience; the list below still works without it. */
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api.roles
      .list({ domain, q })
      .then(({ roles: found }) => {
        if (!cancelled) setRoles(found);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [domain, q]);

  /** Writing to the URL rather than to state keeps both filters in one place. */
  const update = (changes) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true });
  };

  return (
    <div className="animate-rise-in">
      <SectionHeading eyebrow="The catalog" title="Explore careers">
        Thirty jobs. Pick one and see the steps.
      </SectionHeading>

      {/* --- filters ------------------------------------------------------ */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <form
          className="relative flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            update({ q: search.trim() });
          }}
        >
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onBlur={() => update({ q: search.trim() })}
            placeholder="Search — nurse, data, teacher, CA…"
            className="input pl-9"
            aria-label="Search careers"
          />
        </form>

        <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0" role="group" aria-label="Filter by field">
          <button
            type="button"
            onClick={() => update({ domain: '' })}
            className={domain === '' ? 'btn-primary shrink-0' : 'btn-quiet shrink-0'}
          >
            All
          </button>
          {domains.map(({ domain: name, roleCount }) => (
            <button
              key={name}
              type="button"
              onClick={() => update({ domain: name })}
              className={domain === name ? 'btn-primary shrink-0' : 'btn-quiet shrink-0'}
            >
              {label(DOMAIN_LABELS, name)}
              <span className="figure text-xs opacity-70">{roleCount}</span>
            </button>
          ))}
        </div>
      </div>

      {error ? <Callout tone="error">{error}</Callout> : null}

      {loading ? (
        <Loading label="Loading careers" />
      ) : roles.length === 0 ? (
        <Callout tone="info" title="Nothing matched">
          Try a shorter word, or clear the filters.
        </Callout>
      ) : (
        <>
          <p className="eyebrow mb-3">{plural(roles.length, 'career')}</p>
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {roles.map((role) => (
              <li key={role.key}>
                <Link
                  to={`/careers/${role.key}`}
                  className="card p-4 h-full flex flex-col hover:border-ink transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-lg font-semibold">{role.title}</h3>
                    <Badge>{label(DOMAIN_LABELS, role.domain)}</Badge>
                  </div>

                  <p className="text-[15px] text-ink-soft mt-2 flex-1">{role.description}</p>

                  <dl className="mt-3 pt-3 border-t border-rule text-sm space-y-1">
                    {salaryRange(role.salaryINR) ? (
                      <div className="flex items-center gap-1.5">
                        <TrendingUp size={14} className="text-ink-faint shrink-0" aria-hidden="true" />
                        <dt className="sr-only">Typical pay</dt>
                        <dd className="figure">{salaryRange(role.salaryINR)}</dd>
                        <dd className="text-ink-faint">· {label(DEMAND_LABELS, role.demandLevel)}</dd>
                      </div>
                    ) : null}
                    <div className="flex items-center gap-1.5">
                      <GraduationCap size={14} className="text-ink-faint shrink-0" aria-hidden="true" />
                      <dt className="sr-only">Minimum education</dt>
                      <dd className="text-ink-soft">
                        {role.minimumEducation === 'none'
                          ? 'No formal qualification required'
                          : `Needs ${label(EDUCATION_LABELS, role.minimumEducation).toLowerCase()}`}
                      </dd>
                    </div>
                  </dl>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
