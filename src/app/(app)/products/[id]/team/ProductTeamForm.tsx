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

import { assignProductRole, removeProductMember } from "./actions";

export function ProductRoleForm({ productId }: { productId: string }) {
  const [role, setRole] = useState("agent");
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="grid gap-3 rounded-lg border border-border bg-card p-5 md:grid-cols-[1fr_180px_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        formData.set("role", role);
        startTransition(async () => {
          try {
            await assignProductRole(productId, formData);
            event.currentTarget.reset();
            setRole("agent");
            toast.success("Product role updated");
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
