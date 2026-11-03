import { cn } from "@/lib/utils";

/** The Acta A: a rounded peak on a soft arched base. Uses currentColor. */
export function ActaMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 40" className={cn("h-5 w-auto", className)} aria-hidden="true" fill="currentColor">
      <path d="M24 1c-3.4 0-5.6 1.8-7 4.6L2.2 31.4C-.6 37 5 41.6 10 38.8c4.2-2.4 8.8-3.8 14-3.8s9.8 1.4 14 3.8c5 2.8 10.6-1.8 7.8-7.4L31 5.6C29.6 2.8 27.4 1 24 1z" />
    </svg>
  );
}

export function ActaLogo({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const s = { sm: ["h-4", "text-lg"], md: ["h-5", "text-[22px]"], lg: ["h-7", "text-3xl"] }[size];
  return (
    <span className={cn("inline-flex items-center gap-2", className)} aria-label="Acta">
      <ActaMark className={s[0]} />
      <span className={cn("font-bold leading-none tracking-[-0.03em]", s[1])}>acta</span>
    </span>
  );
}
