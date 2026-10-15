import { db } from "@/db";
import { productAuditLog } from "@/db/schema";

export type AuditActor = { id: string; name?: string | null } | null;

/**
 * Records a product-level audit event. Never throws: auditing must not break
 * the action being audited.
 */
export async function recordProductAudit({
  productId,
  actor,
  action,
  targetType,
  targetId,
  metadata,
}: {
  productId: string;
  actor: AuditActor;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(productAuditLog).values({
      id: crypto.randomUUID(),
      productId,
      actorId: actor?.id ?? null,
      actorName: actor?.name ?? null,
      action,
      targetType: targetType ?? null,
      targetId: targetId ?? null,
      metadata: metadata ?? null,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("[audit] failed to record", action, error);
  }
}
