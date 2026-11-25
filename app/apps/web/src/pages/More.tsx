import { ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { MORE } from "../components/Layout.tsx";
import { Card, PageHeader } from "../components/ui.tsx";

export function More() {
  return (
    <>
      <PageHeader title="More" />
      <Card className="mb-6 p-0">
        <ul className="divide-y divide-[var(--line)]">
          {MORE.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Link to={to} className="flex items-center gap-3 px-4 py-3.5 text-sm hover:bg-[var(--lane)]">
                <Icon size={18} className="text-accent-600 dark:text-sky-300" />
                <span className="flex-1 font-display text-base font-semibold tracking-wider uppercase">{label}</span>
                <ChevronRight size={16} className="text-slate-400" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
