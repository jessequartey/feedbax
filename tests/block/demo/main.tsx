// A pretend SaaS dashboard that hosts the Feedbax block. It exists to exercise the dialog by hand:
// fixed header, scrolled content, dark mode, a private value marked data-feedbax-ignore, and failure injection.
import * as React from "react";
import { createRoot } from "react-dom/client";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FeedbaxDialog } from "@/components/feedbax/feedback-dialog";
import { FeedbaxLink } from "@/components/feedbax/feedbax-link";
import type { CreatePostResult } from "@/lib/feedbax/types";
import "./demo.css";

declare const __PORTAL_URL__: string;
const params = new URLSearchParams(location.search);
const portalUrl = params.get("portal") ?? __PORTAL_URL__;
const redirectOnSubmit = params.get("redirect") !== "0";

const bars = [38, 62, 45, 80, 55, 92, 70, 48, 66, 84, 58, 74];
const rows = Array.from({ length: 14 }, (_, i) => ({
  id: `INV-${1040 + i}`,
  customer: ["Acme Co", "Globex", "Initech", "Umbrella", "Hooli", "Stark Ltd"][i % 6],
  amount: (120 + i * 37.5).toFixed(2),
  status: ["Paid", "Pending", "Overdue"][i % 3],
}));

function App() {
  const [dark, setDark] = React.useState(() => matchMedia("(prefers-color-scheme: dark)").matches);
  const [signedIn, setSignedIn] = React.useState<boolean | null>(null);
  const [submitted, setSubmitted] = React.useState<CreatePostResult | null>(null);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  React.useEffect(() => {
    void fetch("/api/demo-session")
      .then((r) => r.json() as Promise<{ signedIn: boolean }>)
      .then((s) => setSignedIn(s.signedIn));
  }, []);
  const auth = async (action: "login" | "logout") => {
    await fetch(`/api/demo-${action}`);
    setSignedIn(action === "login");
  };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
        <span className="font-heading text-sm font-semibold">Acme Cloud</span>
        <nav className="ml-4 hidden gap-4 text-xs text-muted-foreground sm:flex">
          <span>Overview</span>
          <span>Invoices</span>
          <span>Settings</span>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-xs text-muted-foreground md:inline">
            {signedIn === null ? "…" : signedIn ? "Signed in as Ada" : "Signed out"}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void auth(signedIn ? "logout" : "login")}
          >
            {signedIn ? "Sign out" : "Sign in as Ada"}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle dark mode"
            onClick={() => setDark((d) => !d)}
          >
            {dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
          </Button>
          <FeedbaxLink portalUrl={portalUrl} target="_blank" className="hidden text-xs sm:inline">
            Go to feedbax
          </FeedbaxLink>
          <FeedbaxDialog
            portalUrl={portalUrl}
            redirectOnSubmit={redirectOnSubmit}
            onSubmitted={setSubmitted}
            open={open}
            onOpenChange={setOpen}
            trigger={<Button size="sm">Feedback</Button>}
          />
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 pt-20 pb-24">
        <section className="space-y-1">
          <h1 className="font-heading text-xl font-semibold">Revenue overview</h1>
          <p className="text-xs text-muted-foreground">
            Try the <strong>Feedback</strong> button. Sign in first, scroll a little before
            capturing, and use titles ending in <code>/fail429</code>, <code>/fail401</code>,{" "}
            <code>/fail500</code> or <code>/failnet</code> to see the error and retry paths.
          </p>
          {submitted ? (
            <p role="status" className="text-xs">
              Last submitted post: <code data-testid="submitted">{submitted.postId}</code>
            </p>
          ) : null}
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          {[
            ["MRR", "$48,210"],
            ["Active seats", "1,284"],
            ["Churn", "1.9%"],
          ].map(([label, value]) => (
            <div key={label} className="border bg-card p-4 text-card-foreground">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-semibold">{value}</p>
            </div>
          ))}
        </section>

        <section className="border bg-card p-4">
          <p className="mb-3 text-xs font-medium">Monthly revenue</p>
          <div className="flex h-40 items-end gap-2">
            {bars.map((h, i) => (
              <div key={i} className="flex-1 bg-primary/80" style={{ height: `${h}%` }} />
            ))}
          </div>
        </section>

        <section className="border bg-card p-4 text-xs">
          <p className="mb-2 font-medium">Billing contact</p>
          <p>
            ada@acme.example · card ending <span className="font-mono">4242</span>
          </p>
          <p className="mt-2 text-muted-foreground" data-feedbax-ignore="">
            This line is marked data-feedbax-ignore, so it never appears in a screenshot.
          </p>
        </section>

        <section className="border bg-card">
          <table className="w-full text-xs">
            <thead className="border-b text-left text-muted-foreground">
              <tr>
                <th className="p-3 font-medium">Invoice</th>
                <th className="p-3 font-medium">Customer</th>
                <th className="p-3 font-medium">Amount</th>
                <th className="p-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="p-3 font-mono">{row.id}</td>
                  <td className="p-3">{row.customer}</td>
                  <td className="p-3">${row.amount}</td>
                  <td className="p-3">{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
