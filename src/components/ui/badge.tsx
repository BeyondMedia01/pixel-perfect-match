import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
        outline: "text-foreground",
        intake: "border-info/30 bg-info/10 text-info font-medium",
        active: "border-success/30 bg-success/10 text-success font-medium",
        hold: "border-warning/40 bg-warning/15 text-signal-foreground dark:text-warning font-medium",
        closed: "border-border bg-muted text-muted-foreground font-medium",
        urgent: "border-destructive/30 bg-destructive/10 text-destructive font-medium",
        signal: "border-signal/40 bg-signal/15 text-signal-foreground dark:text-signal font-medium",
        quiet: "border-border bg-secondary text-secondary-foreground font-normal",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
