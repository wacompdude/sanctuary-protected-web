"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MemberProfileForm } from "@/components/team/member-profile-form";
import { modalOverlayClasses, modalPanelClasses } from "@/components/ui/modal";
import type { TeamMemberRow } from "@/lib/organization/team";

export function MemberEditButton({ member }: { member: TeamMemberRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        onClick={() => setOpen(true)}
        title={`Edit ${member.name}`}
      >
        <Pencil className="mr-1 h-3.5 w-3.5" />
        Edit
      </Button>
      {open ? (
        <div
          className={modalOverlayClasses()}
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`edit-member-${member.userId}`}
            className={modalPanelClasses()}
            onClick={(event) => event.stopPropagation()}
          >
            <h2
              id={`edit-member-${member.userId}`}
              className="text-lg font-semibold tracking-tight"
            >
              Edit member
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Correct this person&apos;s name or phone. Email cannot be changed
              here.
            </p>
            <div className="mt-4">
              <MemberProfileForm
                key={`${member.userId}-${member.firstName ?? ""}-${member.lastName ?? ""}`}
                userId={member.userId}
                email={member.email}
                firstName={member.firstName}
                lastName={member.lastName}
                phone={member.phone}
                onSaved={() => {
                  setOpen(false);
                  router.refresh();
                }}
              />
            </div>
            <div className="mt-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
