import { Link } from 'react-router-dom';
import { Eyebrow } from '../components/ui.jsx';

/**
 * About — how the plan is worked out.
 *
 * This page exists because the app makes a claim ("your plan is personal") that is
 * easy to fake, and a learner is entitled to see the mechanism. Kept to short
 * answers: anybody who wants the long version can read the code.
 */

const FACTS = [
  {
    q: 'Where do the steps come from?',
    a: 'A catalogue of 188 skills, exams, degrees and placements, each one listing what must come before it. Nothing is invented at the moment you ask.',
  },
  {
    q: 'How is the order decided?',
    a: 'Your plan is sorted so nothing appears before the things it depends on. You will never be asked to learn React before JavaScript.',
  },
  {
    q: 'What makes it personal?',
    a: 'Skills you already have are removed. Skills you have only started are kept at half the hours. Your study time sets the calendar.',
  },
  {
    q: 'Why is a degree still four years?',
    a: 'Practice gets faster if you put in more hours. A degree, an articleship or an internship does not — so those keep their real length.',
  },
  {
    q: 'Does an AI write my plan?',
    a: 'No. The plan is worked out in code, the same inputs always giving the same answer. An AI may reword the summary, and it is blocked from changing any figure.',
  },
];

export default function About() {
  return (
    <div className="max-w-3xl space-y-10">
      <header>
        <Eyebrow>About</Eyebrow>
        <h1 className="mt-2 text-3xl font-bold">How your plan is built</h1>
      </header>

      <dl className="space-y-5">
        {FACTS.map(({ q, a }) => (
          <div key={q} className="card p-5">
            <dt className="font-display text-lg font-semibold">{q}</dt>
            <dd className="mt-1.5 text-ink-soft">{a}</dd>
          </div>
        ))}
      </dl>

      <div className="panel p-5">
        <p className="text-ink-soft">
          Hours are estimates, and they are honest ones — a plan that promises a career in
          three months would be easier to sell and worth nothing.
        </p>
        <Link to="/sign-up" className="btn-primary mt-4">
          Build my roadmap
        </Link>
      </div>
    </div>
  );
}
