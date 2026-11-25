import { Link } from "react-router";

export function NotFound() {
  return (
    <div className="py-24 text-center">
      <p className="text-sm text-slate-500">Page not found.</p>
      <Link to="/" className="mt-2 inline-block text-sm font-medium text-accent-600">
        Go home
      </Link>
    </div>
  );
}
