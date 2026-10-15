import { Link } from "@tanstack/react-router";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="site-brand" to="/" aria-label="Feedbax home">
      <span className="brand-mark" aria-hidden="true">
        F
      </span>
      {!compact && <span>Feedbax</span>}
    </Link>
  );
}
