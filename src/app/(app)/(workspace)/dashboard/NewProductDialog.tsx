"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { createProduct } from "./actions";

const CATEGORIES = [
  { value: "saas", label: "SaaS" },
  { value: "e-commerce", label: "E-commerce" },
  { value: "mobile-app", label: "Mobile app" },
  { value: "web-app", label: "Web app" },
  { value: "other", label: "Other" },
];

export function NewProductDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("saas");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");

  const reset = () => {
    setName("");
    setCategory("saas");
    setDescription("");
    setUrl("");
    setError(null);
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setPending(true);

    try {
      const { id } = await createProduct({ name, category, description, url });
      setOpen(false);
      reset();
      router.push(`/products/${id}/widget`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className="rounded-lg bg-foreground text-background hover:bg-foreground/90">
          <Plus className="mr-1.5 size-4" />
          Add product
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New product</DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="mt-2 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="product-name" className="text-[color:var(--text-secondary)]">
              Name
            </Label>
            <Input
              id="product-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My App"
              maxLength={64}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[color:var(--text-secondary)]">
              Category
            </Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="product-desc" className="text-[color:var(--text-secondary)]">
              Description{" "}
              <span className="text-[color:var(--text-tertiary)]">
                (optional)
              </span>
            </Label>
            <Textarea
              id="product-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this product do?"
              rows={2}
              maxLength={280}
              className="resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="product-url" className="text-[color:var(--text-secondary)]">
              URL{" "}
              <span className="text-[color:var(--text-tertiary)]">
                (optional)
              </span>
            </Label>
            <Input
              id="product-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://yourapp.com"
            />
          </div>

          {error ? (
            <p className="text-sm text-[color:var(--status-error,#ef4444)]">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              className="rounded-lg text-[color:var(--text-secondary)] hover:bg-card hover:text-foreground"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-foreground text-background hover:bg-foreground/90"
            >
              {pending ? "Creating…" : "Create product"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
