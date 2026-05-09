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

  function identityKey(customer: SupoCustomer | null): string {
    const externalId = customer?.externalId?.trim() || customer?.id?.trim();
    if (externalId) return `external:${externalId}`;
    const email = customer?.email?.trim().toLowerCase();
    if (email) return `email:${email}`;
    return "anonymous";
  }

  function customerConversationKey(customer: SupoCustomer | null): string {
    return `${conversationKey}_${identityKey(customer)}`;
  }

  function legacyEmailConversationKey(customer: SupoCustomer | null): string | null {
    const email = customer?.email?.trim().toLowerCase();
    return email ? `${conversationKey}_${email}` : null;
  }

  return {
    getCustomer(): SupoCustomer | null {
      const local = safeStorage("localStorage");
      if (!local) return null;
      try {
        const parsed = JSON.parse(local.getItem(customerKey) || "null") as SupoCustomer | null;
        return parsed?.externalId || parsed?.id || parsed?.email ? parsed : null;
      } catch {
        return null;
      }
    },
    setCustomer(customer: SupoCustomer) {
      const externalId = customer.externalId?.trim() || customer.id?.trim();
      const email = customer.email?.trim().toLowerCase();
      safeStorage("localStorage")?.setItem(
        customerKey,
        JSON.stringify({ ...customer, externalId, id: undefined, email }),
      );
    },
    getConversation(customer: SupoCustomer | null): ConversationRef {
      const local = safeStorage("localStorage");
      const session = safeStorage("sessionStorage");
      const legacyKey = legacyEmailConversationKey(customer);
      const raw =
        local?.getItem(customerConversationKey(customer)) ??
        (legacyKey ? local?.getItem(legacyKey) : null) ??
        session?.getItem(conversationKey);
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
      const legacyKey = legacyEmailConversationKey(customer);
      if (legacyKey) safeStorage("localStorage")?.setItem(legacyKey, value);
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
