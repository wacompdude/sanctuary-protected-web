import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import Link from "next/link";

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
                <CardTitle className="text-2xl">Check your email</CardTitle>
                <CardDescription>
                  Confirm your account to finish registration
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                We created your account. Open the confirmation link in your
                email, then sign in to continue to your dashboard.
              </p>
              <Button asChild className="w-full" variant="outline">
                <Link href="/login">Go to sign in</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
