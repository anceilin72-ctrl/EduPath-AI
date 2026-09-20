import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { api } from '../lib/api.js';
import { DOMAIN_BLURBS, DOMAIN_LABELS, label } from '../lib/format.js';

/**
 * The landing page.
 *
 * One promise, two buttons, then the six fields of work. Nothing else — a visitor
 * who has to read three paragraphs to find out what this does will leave, and the
 * previous version of this page asked them to.
 *
 * The domains come from the API so the counts are real. If the server is not up the
 * cards still render without them: a visitor should never meet an error page as
 * their first impression of the project.
 */

const DOMAIN_ORDER = ['technology', 'business', 'creative', 'healthcare', 'government', 'education'];

const STEPS = [
  'Tell us what you already know',
  'Pick the job you want',
  'Get a step-by-step plan',
];

export default function Landing() {
  const [counts, setCounts] = useState({});

  useEffect(() => {
    let cancelled = false;

    api.roles
      .domains()
      .then(({ domains }) => {
        if (cancelled) return;
        setCounts(Object.fromEntries(domains.map((d) => [d.domain, d.roleCount])));
      })
      .catch(() => {
        /* counts are decoration; the page works without them */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-14">
      <section className="pt-6 sm:pt-12">
        <h1 className="text-4xl sm:text-5xl font-bold max-w-3xl">
          Build Your Career Roadmap
        </h1>
        <p className="mt-4 text-lg text-ink-soft max-w-prose">
          Choose your dream career, tell us what you already know, and get a personalized
          step-by-step learning path.
        </p>

        <div className="mt-7 flex flex-wrap gap-3">
          <Link to="/sign-up" className="btn-accent">
            Get Started
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link to="/careers" className="btn-quiet">
            Explore Careers
          </Link>
        </div>

        <ol className="mt-10 grid gap-3 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step} className="panel px-4 py-3 flex items-center gap-3">
              <span className="figure text-effort text-sm font-semibold">{i + 1}</span>
              <span className="text-sm text-ink-soft">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Pick a field</h2>
        <p className="mt-1 text-ink-soft">Thirty careers across six fields.</p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DOMAIN_ORDER.map((domain) => (
            <Link key={domain} to={`/careers?domain=${domain}`} className="tile group">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-lg font-semibold group-hover:text-effort transition-colors">
                  {label(DOMAIN_LABELS, domain)}
                </h3>
                {counts[domain] ? <span className="figure text-xs text-ink-faint">{counts[domain]} jobs</span> : null}
              </div>
              <p className="mt-1 text-sm text-ink-soft">{DOMAIN_BLURBS[domain]}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
