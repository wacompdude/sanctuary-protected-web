import { AsyncLocalStorage } from "async_hooks";

export type DemoOperationContext = {
  operationContext: "demo_restore" | "demo_rollback";
  organizationId: string;
  operationId?: string;
};

const storage = new AsyncLocalStorage<DemoOperationContext>();

export function getDemoOperationContext(): DemoOperationContext | undefined {
  return storage.getStore();
}

export function isDemoRestoreOperationActive(
  organizationId?: string,
): boolean {
  const ctx = storage.getStore();
  if (!ctx) return false;
  if (
    ctx.operationContext !== "demo_restore" &&
    ctx.operationContext !== "demo_rollback"
  ) {
    return false;
  }
  if (organizationId && ctx.organizationId !== organizationId) return false;
  return true;
}

export async function runWithDemoOperationContext<T>(
  context: DemoOperationContext,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(context, fn);
}
