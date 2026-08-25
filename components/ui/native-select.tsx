import * as React from "react";
import { cn } from "@/lib/utils";
import { nativeSelectClassName } from "@/components/ui/form-control";

const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.ComponentProps<"select">
>(({ className, children, ...props }, ref) => {
  return (
    <select
      ref={ref}
      className={cn(nativeSelectClassName, className)}
      {...props}
    >
      {children}
    </select>
  );
});
NativeSelect.displayName = "NativeSelect";

export { NativeSelect };
