"use client";

import { useActionState, useEffect } from "react";
import {
  assignEquipment,
  reportEquipmentLostOrStolen,
  returnEquipmentAssignment,
} from "@/app/(app)/security-hardware/ops-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  labelForAssignmentStatus,
  type EquipmentAssignmentRecord,
  type OpsActionState,
} from "@/lib/security-hardware/operations";
import { formatEquipmentDate } from "@/lib/security-hardware/constants";

const initialState: OpsActionState = {};

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const textareaClassName =
  "flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export type AssignableMember = {
  userId: string;
  name: string;
};

export function AssignmentPanels({
  equipmentId,
  assignments,
  members,
  canOperate,
  canManage,
  timeZone,
}: {
  equipmentId: string;
  assignments: EquipmentAssignmentRecord[];
  members: AssignableMember[];
  canOperate: boolean;
  canManage: boolean;
  timeZone?: string | null;
}) {
  const active = assignments.find((row) => row.status === "active") ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Current assignment</CardTitle>
          <CardDescription>
            Checkout history is preserved when equipment changes hands.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {active ? (
            <div className="space-y-3 rounded-md border border-border p-3 text-sm">
              <p>
                <span className="text-muted-foreground">Team: </span>
                {active.assigned_team || "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Assigned: </span>
                {formatEquipmentDate(active.assigned_at, timeZone)}
              </p>
              <p>
                <span className="text-muted-foreground">Expected return: </span>
                {formatEquipmentDate(active.expected_return_date, timeZone)}
              </p>
              {active.assignment_notes && (
                <p className="text-muted-foreground">{active.assignment_notes}</p>
              )}
              {canOperate && <ReturnAssignmentForm assignmentId={active.id} />}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No active assignment.
            </p>
          )}

          {canOperate && !active && (
            <AssignEquipmentForm
              equipmentId={equipmentId}
              members={members}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assignment history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assignments yet.</p>
          ) : (
            assignments.slice(0, 10).map((row) => (
              <div
                key={row.id}
                className="rounded-md border border-border/60 p-3 text-sm"
              >
                <p className="font-medium">
                  {row.assigned_team || "Assignment"} ·{" "}
                  {labelForAssignmentStatus(row.status)}
                </p>
                <p className="text-muted-foreground">
                  {formatEquipmentDate(row.assigned_at, timeZone)}
                  {row.returned_at
                    ? ` → ${formatEquipmentDate(row.returned_at, timeZone)}`
                    : ""}
                </p>
              </div>
            ))
          )}

          {canManage && (
            <LostStolenForm equipmentId={equipmentId} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AssignEquipmentForm({
  equipmentId,
  members,
}: {
  equipmentId: string;
  members: AssignableMember[];
}) {
  const action = assignEquipment.bind(null, equipmentId);
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.success) {
      const form = document.getElementById(
        `assign-equipment-${equipmentId}`,
      ) as HTMLFormElement | null;
      form?.reset();
    }
  }, [state.success, equipmentId]);

  return (
    <form
      id={`assign-equipment-${equipmentId}`}
      action={formAction}
      className="space-y-3"
    >
      {state.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      {state.success && (
        <p className="text-sm text-green-700 dark:text-green-400">
          Equipment assigned.
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor="assigned_team">Assigned team</Label>
        <Input id="assigned_team" name="assigned_team" />
        {state.fieldErrors?.assigned_team && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.assigned_team}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="assigned_user_id">Assigned member</Label>
        <select
          id="assigned_user_id"
          name="assigned_user_id"
          className={selectClassName}
          defaultValue=""
        >
          <option value="">Optional</option>
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="expected_return_date">Expected return</Label>
        <Input
          id="expected_return_date"
          name="expected_return_date"
          type="date"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="assignment_notes">Notes</Label>
        <textarea
          id="assignment_notes"
          name="assignment_notes"
          className={textareaClassName}
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Assigning…" : "Check out / assign"}
      </Button>
    </form>
  );
}

function ReturnAssignmentForm({ assignmentId }: { assignmentId: string }) {
  const action = returnEquipmentAssignment.bind(null, assignmentId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-2 border-t border-border pt-3">
      {state.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      <div className="space-y-1">
        <Label htmlFor={`return_condition-${assignmentId}`}>Condition</Label>
        <select
          id={`return_condition-${assignmentId}`}
          name="return_condition"
          defaultValue="returned"
          className={selectClassName}
        >
          <option value="returned">Returned – good</option>
          <option value="damaged">Returned – damaged</option>
          <option value="lost">Lost while assigned</option>
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`assignment_notes-${assignmentId}`}>Notes</Label>
        <textarea
          id={`assignment_notes-${assignmentId}`}
          name="assignment_notes"
          className={textareaClassName}
        />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Return equipment"}
      </Button>
    </form>
  );
}

function LostStolenForm({ equipmentId }: { equipmentId: string }) {
  const action = reportEquipmentLostOrStolen.bind(null, equipmentId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form
      action={formAction}
      className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3"
    >
      <p className="text-sm font-medium">Report lost or stolen</p>
      {state.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      {state.success && (
        <p className="text-sm text-green-700 dark:text-green-400">
          Status updated.
        </p>
      )}
      <select
        name="report_kind"
        defaultValue="lost"
        className={selectClassName}
      >
        <option value="lost">Lost</option>
        <option value="stolen">Stolen</option>
      </select>
      <textarea
        name="notes"
        placeholder="Optional notes"
        className={textareaClassName}
      />
      <Button type="submit" variant="destructive" size="sm" disabled={pending}>
        {pending ? "Updating…" : "Update status"}
      </Button>
    </form>
  );
}
