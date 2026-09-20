import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Callout, Field, TextInput } from '../components/ui.jsx';

/**
 * Sign in and sign up.
 *
 * Two exports rather than one component with a mode flag: the pages have different
 * fields, different validation and different destinations afterwards, and the flag
 * version had a conditional in almost every line.
 *
 * Field-level errors come back from the server's validator (`err.fieldError`), so
 * the messages the API already writes are shown against the right input instead of
 * being restated here in slightly different words.
 */

/** Where to go once signed in: back where they were headed, or the dashboard. */
function useDestination() {
  const location = useLocation();
  return location.state?.from ?? '/home';
}

function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="max-w-md mx-auto pt-4 sm:pt-10">
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="mt-1.5 text-ink-soft">{subtitle}</p>
      <div className="card p-6 mt-6">{children}</div>
      <p className="mt-4 text-sm text-ink-soft text-center">{footer}</p>
    </div>
  );
}

// ------------------------------------------------------------------- sign in

export function SignIn() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const destination = useDestination();

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await signIn(form);
      navigate(destination, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('Something went wrong. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to pick up where you left off."
      footer={
        <>
          New here?{' '}
          <Link to="/sign-up" className="link">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? <Callout tone="error">{error.message}</Callout> : null}

        <Field label="Email" htmlFor="email" error={error?.fieldError('email')}>
          <TextInput
            id="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={set('email')}
            required
          />
        </Field>

        <Field label="Password" htmlFor="password" error={error?.fieldError('password')}>
          <TextInput
            id="password"
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={set('password')}
            required
          />
        </Field>

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Login'}
        </button>
      </form>
    </AuthShell>
  );
}

// ------------------------------------------------------------------- sign up

export function SignUp() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState(null);
  /** Checked here rather than server-side: the server never sees the second field. */
  const [mismatch, setMismatch] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  async function onSubmit(event) {
    event.preventDefault();
    setError(null);
    setMismatch(null);

    if (form.password !== form.confirm) {
      setMismatch('The two passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      await register({ name: form.name, email: form.email, password: form.password });
      // A brand-new account has no plan yet, so the wizard is the only sensible
      // destination — not a dashboard with nothing on it.
      navigate('/setup', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('Something went wrong. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="It takes a minute. Then we build your plan."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/sign-in" className="link">
            Login
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? <Callout tone="error">{error.message}</Callout> : null}

        <Field label="Full Name" htmlFor="name" error={error?.fieldError('name')}>
          <TextInput id="name" autoComplete="name" value={form.name} onChange={set('name')} required />
        </Field>

        <Field label="Email" htmlFor="email" error={error?.fieldError('email')}>
          <TextInput
            id="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={set('email')}
            required
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          hint="At least 8 characters."
          error={error?.fieldError('password')}
        >
          <TextInput
            id="password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={set('password')}
            required
          />
        </Field>

        <Field label="Confirm Password" htmlFor="confirm" error={mismatch}>
          <TextInput
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={form.confirm}
            onChange={set('confirm')}
            error={mismatch}
            required
          />
        </Field>

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Creating your account…' : 'Get Started'}
        </button>
      </form>
    </AuthShell>
  );
}

export default SignIn;
