import Link from "next/link";
import { MailPlus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function TeamOnboardingActions() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="space-y-3">
          <Button asChild className="w-fit">
            <Link href="/team/add">
              <UserPlus className="h-4 w-4" />
              Add member
            </Link>
          </Button>
          <CardTitle className="text-base">New to Sanctuary Protected</CardTitle>
          <CardDescription className="text-sm leading-relaxed text-muted-foreground">
            Use this when the person does not already have a login at
            sanctuaryprotected.com. Adding them creates their account and
            places them on this church only.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground">
            You will set up their name, email, role, and a temporary password
            they can use to sign in for the first time.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-3">
          <Button variant="outline" asChild className="w-fit">
            <Link href="/team/invite">
              <MailPlus className="h-4 w-4" />
              Invite member
            </Link>
          </Button>
          <CardTitle className="text-base">Already has a login</CardTitle>
          <CardDescription className="text-sm leading-relaxed text-muted-foreground">
            Use this when the person already has a Sanctuary Protected account.
            Inviting them keeps their existing login and adds this church, so
            they can belong to two or more churches.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground">
            They receive an email invitation and accept it with the same account
            they already use to sign in.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
