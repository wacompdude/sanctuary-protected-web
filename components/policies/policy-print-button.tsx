"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PolicyPrintButton() {
  return (
    <Button
      variant="outline"
      type="button"
      onClick={() => window.print()}
    >
      <Printer className="h-4 w-4" />
      Print
    </Button>
  );
}
