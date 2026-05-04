"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProductRole } from "@/lib/product-access";

import {
  assignProductRole,
  removeProductMember,
  resendProductInvitation,
  revokeProductInvitation,
  updateProductMemberRole,
} from "./actions";

export function ProductRoleForm({ productId }: { productId: string }) {
  const [role, setRole] = useState("agent");
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="grid gap-3 rounded-lg border border-border bg-card p-5 md:grid-cols-[1fr_180px_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        formData.set("role", role);
        startTransition(async () => {
          try {
            const result = await assignProductRole(productId, formData);
            form.reset();
            setRole("agent");
            toast.success(
              result.emailSent
                ? result.kind === "assigned"
                  ? "Product role updated and email sent"
                  : "Invite saved and email sent"
                : result.kind === "assigned"
                  ? "Product role updated; email delivery was skipped"
                  : "Invite saved; email delivery was skipped",
            );
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to update role");
          }
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-xs text-[color:var(--text-secondary)]">
          Email
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          placeholder="teammate@example.com"
          className="rounded-lg"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-[color:var(--text-secondary)]">Role</Label>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="developer">Developer</SelectItem>
            <SelectItem value="agent">Agent</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-end">
        <Button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-foreground text-background hover:bg-foreground/90 md:w-auto"
        >
          Assign
        </Button>
      </div>
    </form>
  );
}

export function RemoveProductMemberButton({
  productId,
  userId,
}: {
  productId: string;
  userId: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          try {
            await removeProductMember(productId, userId);
            toast.success("Product access removed");
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to remove access");
          }
        });
      }}
      className="rounded-lg text-xs text-[color:var(--text-secondary)] hover:text-foreground"
    >
      Remove
    </Button>
  );
}

export function ProductMemberRoleSelect({
  productId,
  userId,
  currentRole,
  disabled,
}: {
  productId: string;
  userId: string;
  currentRole: ProductRole;
  disabled: boolean;
}) {
  const [role, setRole] = useState<ProductRole>(currentRole);
  const [isPending, startTransition] = useTransition();

  return (
    <Select
      value={role}
      disabled={disabled || isPending}
      onValueChange={(nextRole) => {
        const typedRole = nextRole as ProductRole;
        setRole(typedRole);
        startTransition(async () => {
          try {
            await updateProductMemberRole(productId, userId, typedRole);
            toast.success("Product role updated");
          } catch (error) {
            setRole(currentRole);
            toast.error(error instanceof Error ? error.message : "Failed to update role");
          }
        });
      }}
    >
      <SelectTrigger className="h-8 w-32 rounded-lg text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="admin">Admin</SelectItem>
        <SelectItem value="developer">Developer</SelectItem>
        <SelectItem value="agent">Agent</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function PendingInviteActions({
  productId,
  invitationId,
  status,
}: {
  productId: string;
  invitationId: string;
  status: string;
}) {
  const [isPending, startTransition] = useTransition();
  const canResend = status !== "accepted";
  const canRevoke = status === "pending";

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={!canResend || isPending}
        onClick={() => {
          startTransition(async () => {
            try {
              const result = await resendProductInvitation(productId, invitationId);
              toast.success(
                result.emailSent
                  ? "Invitation resent"
                  : "Invitation refreshed; email delivery was skipped",
              );
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Failed to resend invite");
            }
          });
        }}
        className="rounded-lg text-xs text-[color:var(--text-secondary)] hover:text-foreground"
      >
        Resend
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={!canRevoke || isPending}
        onClick={() => {
          startTransition(async () => {
            try {
              await revokeProductInvitation(productId, invitationId);
              toast.success("Invitation revoked");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Failed to revoke invite");
            }
          });
        }}
        className="rounded-lg text-xs text-[color:var(--text-secondary)] hover:text-foreground"
      >
        Revoke
      </Button>
    </div>
  );
}
