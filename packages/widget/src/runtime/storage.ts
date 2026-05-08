import type { SupoCustomer } from "../types";

type ConversationRef = {
  id: string | null;
  token: string | null;
};

function safeStorage(kind: "localStorage" | "sessionStorage"): Storage | null {
  try {
    return typeof window !== "undefined" ? window[kind] : null;
  } catch {
    return null;
  }
}

export function createStorage(productId: string) {
  const customerKey = `supo_cust_${productId}`;
  const conversationKey = `supo_conv_${productId}`;

  function customerConversationKey(customer: SupoCustomer | null): string {
    return `${conversationKey}_${customer?.email?.trim().toLowerCase() || "anonymous"}`;
  }

  return {
    getCustomer(): SupoCustomer | null {
      const local = safeStorage("localStorage");
      if (!local) return null;
      try {
        const parsed = JSON.parse(local.getItem(customerKey) || "null") as SupoCustomer | null;
        return parsed?.name && parsed?.email ? parsed : null;
      } catch {
        return null;
      }
    },
    setCustomer(customer: SupoCustomer) {
      safeStorage("localStorage")?.setItem(
        customerKey,
        JSON.stringify({ ...customer, email: customer.email.trim().toLowerCase() }),
      );
    },
    getConversation(customer: SupoCustomer | null): ConversationRef {
      const local = safeStorage("localStorage");
      const session = safeStorage("sessionStorage");
      const raw = local?.getItem(customerConversationKey(customer)) ?? session?.getItem(conversationKey);
      if (!raw) return { id: null, token: null };
      try {
        const parsed = JSON.parse(raw) as ConversationRef;
        return { id: parsed.id ?? null, token: parsed.token ?? null };
      } catch {
        return { id: raw, token: null };
      }
    },
    setConversation(customer: SupoCustomer | null, id: string, token: string | null) {
      const value = JSON.stringify({ id, token });
      safeStorage("localStorage")?.setItem(customerConversationKey(customer), value);
      safeStorage("sessionStorage")?.setItem(conversationKey, value);
    },
    clear() {
      const local = safeStorage("localStorage");
      const session = safeStorage("sessionStorage");
      local?.removeItem(customerKey);
      session?.removeItem(conversationKey);
      if (!local) return;
      for (let index = local.length - 1; index >= 0; index -= 1) {
        const key = local.key(index);
        if (key?.startsWith(`${conversationKey}_`)) local.removeItem(key);
      }
    },
  };
}
