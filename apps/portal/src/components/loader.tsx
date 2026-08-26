import { Loader2 } from "lucide-react";

export default function Loader() {
  return (
    <div className="portal-loading" role="status">
      <Loader2 aria-hidden="true" />
      <span>Loading published feedback…</span>
    </div>
  );
}
