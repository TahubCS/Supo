import type { SupoEventHandler, SupoEventMap, SupoEventName, SupoHooks } from "../types";

export function createEmitter(hooks?: SupoHooks) {
  const listeners = new Map<SupoEventName, Set<SupoEventHandler>>();

  function emit<EventName extends SupoEventName>(
    event: EventName,
    payload: SupoEventMap[EventName],
  ) {
    listeners.get(event)?.forEach((handler) => handler(payload));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(`supo:${event}`, { detail: payload }));
    }

    if (event === "ready") hooks?.onReady?.();
    if (event === "open") hooks?.onOpen?.();
    if (event === "close") hooks?.onClose?.();
    if (event === "error") hooks?.onError?.(payload as { message: string });
    if (event === "escalation-change") {
      hooks?.onEscalationChange?.((payload as { status: null | "pending" | "active" }).status);
    }
  }

  function on<EventName extends SupoEventName>(
    event: EventName,
    handler: SupoEventHandler<EventName>,
  ) {
    const handlers = listeners.get(event) ?? new Set<SupoEventHandler>();
    handlers.add(handler as SupoEventHandler);
    listeners.set(event, handlers);
    return () => handlers.delete(handler as SupoEventHandler);
  }

  function clear() {
    listeners.clear();
  }

  return { emit, on, clear };
}
