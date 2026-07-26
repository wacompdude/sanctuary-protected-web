import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Buttons for the dark platform console. Do not use the light-theme shadcn
 * Button here — outline/default tokens render white-on-white against slate-950.
 */
const platformButtonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500/60 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-amber-500 text-slate-950 shadow hover:bg-amber-400",
        outline:
          "border border-slate-700 bg-slate-900 text-slate-100 shadow-sm hover:bg-slate-800 hover:text-slate-50",
        ghost: "text-slate-300 hover:bg-slate-900 hover:text-slate-50",
        destructive:
          "border border-red-800/80 bg-red-950/40 text-red-200 hover:bg-red-950/70",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface PlatformButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof platformButtonVariants> {
  asChild?: boolean;
}

const PlatformButton = React.forwardRef<HTMLButtonElement, PlatformButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(platformButtonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
PlatformButton.displayName = "PlatformButton";

export { PlatformButton, platformButtonVariants };
