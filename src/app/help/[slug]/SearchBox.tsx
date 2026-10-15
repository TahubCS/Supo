import { Search } from "lucide-react";

/** Plain GET form so search works without JavaScript and results are linkable. */
export function SearchBox({ action, defaultValue, large }: { action: string; defaultValue?: string; large?: boolean }) {
  return (
    <form action={action} method="get" role="search" className="relative w-full">
      <Search
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-[color:var(--text-tertiary)] ${large ? "left-4 size-5" : "left-3 size-4"}`}
      />
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder="Search for answers…"
        aria-label="Search the help center"
        maxLength={200}
        className={`w-full rounded-xl border border-border bg-card text-foreground shadow-sm outline-none placeholder:text-[color:var(--text-tertiary)] focus:border-foreground/40 ${
          large ? "h-14 pl-12 pr-4 text-base" : "h-10 pl-9 pr-3 text-sm"
        }`}
      />
    </form>
  );
}
