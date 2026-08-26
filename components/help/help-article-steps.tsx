import Link from "next/link";
import { AlertTriangle, ExternalLink, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isHelpDeepLinkPath } from "@/lib/help/deep-links";
import type { HelpArticleStep } from "@/lib/help/types";

export function HelpArticleSteps({ steps }: { steps: HelpArticleStep[] }) {
  if (steps.length === 0) return null;

  return (
    <section className="space-y-4" aria-labelledby="help-steps-heading">
      <h2 id="help-steps-heading" className="text-xl font-semibold tracking-tight">
        Steps
      </h2>
      <ol className="space-y-4">
        {steps.map((step) => {
          const deepLink =
            step.deep_link_path && isHelpDeepLinkPath(step.deep_link_path)
              ? step.deep_link_path
              : null;

          return (
            <li key={step.id}>
              <Card>
                <CardHeader className="pb-3">
                  <CardDescription>Step {step.step_number}</CardDescription>
                  <CardTitle className="text-lg">{step.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {step.instruction}
                  </p>

                  {step.expected_result ? (
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">
                        Expected result:{" "}
                      </span>
                      {step.expected_result}
                    </p>
                  ) : null}

                  {step.tip_text ? (
                    <div className="flex gap-2 rounded-md border border-dashed bg-muted/40 p-3 text-sm">
                      <Lightbulb
                        className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
                        aria-hidden
                      />
                      <p>
                        <span className="font-medium">Tip: </span>
                        {step.tip_text}
                      </p>
                    </div>
                  ) : null}

                  {step.warning_text ? (
                    <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                      <AlertTriangle
                        className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                        aria-hidden
                      />
                      <p>
                        <span className="font-medium">Warning: </span>
                        {step.warning_text}
                      </p>
                    </div>
                  ) : null}

                  {deepLink ? (
                    <Button variant="outline" className="h-11" asChild>
                      <Link href={deepLink}>
                        {step.deep_link_label || "Open page"}
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      </Link>
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
