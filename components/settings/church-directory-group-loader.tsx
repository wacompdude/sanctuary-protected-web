import { ChurchDirectoryContacts } from "@/components/settings/church-directory-contacts";
import { listChurchContactsForTypes } from "@/lib/church/contact-queries";
import type { ChurchContactType } from "@/lib/church/contacts";
import { Card, CardContent } from "@/components/ui/card";

export async function ChurchDirectoryGroupLoader({
  churchId,
  canEdit,
  contactTypes,
  intro,
}: {
  churchId: string;
  canEdit: boolean;
  contactTypes: ChurchContactType[];
  intro?: string;
}) {
  const { contacts, error } = await listChurchContactsForTypes(
    churchId,
    contactTypes,
  );

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">{error}</p>
          {error.includes("019_church_contacts") && (
            <p className="mt-2 text-sm text-muted-foreground">
              Run <code>supabase/migrations/019_church_contacts.sql</code> in
              the Supabase SQL Editor, then refresh.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {intro ? <p className="text-sm text-muted-foreground">{intro}</p> : null}
      <ChurchDirectoryContacts
        contactTypes={contactTypes}
        contacts={contacts}
        canEdit={canEdit}
      />
    </div>
  );
}
