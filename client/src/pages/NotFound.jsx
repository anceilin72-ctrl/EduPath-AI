import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

/** A 404 that offers the two things somebody lost here probably wanted. */
export default function NotFound() {
  return (
    <div className="max-w-prose mx-auto text-center py-12 animate-rise-in">
      <Compass size={32} className="mx-auto text-ink-faint" aria-hidden="true" />
      <h1 className="text-3xl font-bold mt-4">No such page</h1>
      <p className="text-ink-soft mt-2">Your plans are safe — they are where you left them.</p>
      {/* "/" rather than "/home": the landing page bounces a signed-in visitor to
          their dashboard, so one link is right for both kinds of reader. */}
      <div className="flex flex-wrap gap-2 justify-center mt-6">
        <Link to="/" className="btn-accent">
          Go home
        </Link>
        <Link to="/careers" className="btn-quiet">
          Explore careers
        </Link>
      </div>
    </div>
  );
}
