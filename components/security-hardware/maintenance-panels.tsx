"use client";

import { useActionState, useEffect } from "react";
import {
  completeEquipmentMaintenance,
  scheduleEquipmentMaintenance,
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
  MAINTENANCE_TYPES,
  labelForMaintenanceStatus,
  labelForMaintenanceType,
  type EquipmentMaintenanceRecord,
  type OpsActionState,
} from "@/lib/security-hardware/operations";
import { formatEquipmentDate } from "@/lib/security-hardware/constants";

const initialState: OpsActionState = {};

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const textareaClassName =
  "flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ScheduleMaintenanceForm({
  equipmentId,
}: {
  equipmentId: string;
}) {
  const action = scheduleEquipmentMaintenance.bind(null, equipmentId);
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.success) {
      const form = document.getElementById(
        `schedule-maintenance-${equipmentId}`,
      ) as HTMLFormElement | null;
      form?.reset();
    }
  }, [state.success, equipmentId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Schedule maintenance</CardTitle>
        <CardDescription>
          Create an inspection, repair, or other maintenance record.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id={`schedule-maintenance-${equipmentId}`}
          action={formAction}
          className="space-y-3"
        >
          {state.error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}
          {state.success && (
            <p className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
              Maintenance scheduled.
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="maintenance_type">Type</Label>
            <select
              id="maintenance_type"
              name="maintenance_type"
              required
              defaultValue="inspection"
              className={selectClassName}
            >
              {MAINTENANCE_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="scheduled_date">Scheduled date</Label>
            <Input
              id="scheduled_date"
              name="scheduled_date"
              type="date"
              required
            />
            {state.fieldErrors?.scheduled_date && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.scheduled_date}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="vendor">Vendor</Label>
            <Input id="vendor" name="vendor" placeholder="Optional" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="work_order_number">Work order #</Label>
            <Input id="work_order_number" name="work_order_number" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              name="description"
              className={textareaClassName}
            />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Scheduling…" : "Schedule"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function CompleteMaintenanceForm({
  record,
}: {
  record: EquipmentMaintenanceRecord;
}) {
  const action = completeEquipmentMaintenance.bind(null, record.id);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="mt-3 space-y-2 border-t border-border pt-3">
      {state.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      {state.success && (
        <p className="text-sm text-green-700 dark:text-green-400">
          Maintenance updated.
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`outcome-${record.id}`}>Outcome</Label>
          <select
            id={`outcome-${record.id}`}
            name="outcome"
            defaultValue="completed"
            className={selectClassName}
          >
            <option value="completed">Completed</option>
            <option value="failed_inspection">Failed inspection</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`completed_date-${record.id}`}>Completed date</Label>
          <Input
            id={`completed_date-${record.id}`}
            name="completed_date"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`findings-${record.id}`}>Findings</Label>
        <textarea
          id={`findings-${record.id}`}
          name="findings"
          className={textareaClassName}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`corrective_action-${record.id}`}>
          Corrective action
        </Label>
        <textarea
          id={`corrective_action-${record.id}`}
          name="corrective_action"
          className={textareaClassName}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`next_maintenance_date-${record.id}`}>
            Next maintenance date
          </Label>
          <Input
            id={`next_maintenance_date-${record.id}`}
            name="next_maintenance_date"
            type="date"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`cost-${record.id}`}>Cost</Label>
          <Input id={`cost-${record.id}`} name="cost" inputMode="decimal" />
        </div>
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Mark complete"}
      </Button>
    </form>
  );
}

export function MaintenanceHistoryCard({
  records,
  canOperate,
}: {
  records: EquipmentMaintenanceRecord[];
  canOperate: boolean;
}) {
  const open = records.filter(
    (row) => row.status === "scheduled" || row.status === "in_progress",
  );
  const closed = records.filter(
    (row) => row.status !== "scheduled" && row.status !== "in_progress",
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Maintenance history</CardTitle>
        <CardDescription>
          {records.length} record{records.length === 1 ? "" : "s"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {records.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No maintenance records yet.
          </p>
        )}

        {open.map((record) => (
          <div
            key={record.id}
            className="rounded-md border border-border p-3 text-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">
                  {labelForMaintenanceType(record.maintenance_type)}
                </p>
                <p className="text-muted-foreground">
                  {labelForMaintenanceStatus(record.status)} · scheduled{" "}
                  {formatEquipmentDate(record.scheduled_date)}
                </p>
                {record.description && (
                  <p className="mt-1 text-muted-foreground">
                    {record.description}
                  </p>
                )}
              </div>
            </div>
            {canOperate && <CompleteMaintenanceForm record={record} />}
          </div>
        ))}

        {closed.slice(0, 8).map((record) => (
          <div
            key={record.id}
            className="rounded-md border border-border/60 p-3 text-sm"
          >
            <p className="font-medium">
              {labelForMaintenanceType(record.maintenance_type)}
            </p>
            <p className="text-muted-foreground">
              {labelForMaintenanceStatus(record.status)} · completed{" "}
              {formatEquipmentDate(record.completed_date)}
            </p>
            {record.findings && (
              <p className="mt-1 text-muted-foreground">{record.findings}</p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
