import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BrandLogo } from "@/components/brand-logo";

export default function Page() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader className="space-y-4 text-center">
              <BrandLogo
                href="/"
                size={36}
                className="mx-auto justify-center"
                wordmarkClassName="text-xl font-semibold"
              />
              <div className="space-y-1.5">
                <CardTitle className="text-2xl">
                  Thank you for signing up!
                </CardTitle>
                <CardDescription>Check your email to confirm</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                You&apos;ve successfully signed up. Please check your email to
                confirm your account before signing in.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
