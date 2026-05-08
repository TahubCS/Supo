import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { initSupo } from "./index";
import type { SupoCustomer, SupoInitOptions, SupoRuntime, SupoState } from "./types";

type SupoProviderProps = SupoInitOptions & {
  children: ReactNode;
};

const SupoContext = createContext<SupoRuntime | null>(null);
const initialState = (productId: string): SupoState => ({
  productId,
  isOpen: false,
  connection: "idle",
  customer: null,
  conversationId: null,
  escalationStatus: null,
});

export function SupoProvider({ children, ...options }: SupoProviderProps) {
  const runtimeRef = useRef<SupoRuntime | null>(null);
  const {
    productId,
    apiBaseUrl,
    customer,
    appearance,
    behavior,
    realtime,
    hooks,
  } = options;

  useEffect(() => {
    const runtime = initSupo({
      productId,
      apiBaseUrl,
      customer,
      appearance,
      behavior,
      realtime,
      hooks,
    });
    runtimeRef.current = runtime;
    return () => {
      runtime.destroy();
      runtimeRef.current = null;
    };
    // Runtime appearance/behavior are initialization options. Customer updates are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, apiBaseUrl]);

  useEffect(() => {
    const nextCustomer = resolveCustomer(customer);
    if (nextCustomer) runtimeRef.current?.identify(nextCustomer);
  }, [customer]);

  const value = useMemo(
    () =>
      ({
        open: () => runtimeRef.current?.open(),
        close: () => runtimeRef.current?.close(),
        toggle: () => runtimeRef.current?.toggle(),
        identify: (customer: SupoCustomer) => runtimeRef.current?.identify(customer) ?? false,
        reset: () => runtimeRef.current?.reset(),
        destroy: () => runtimeRef.current?.destroy(),
        getState: () => runtimeRef.current?.getState() ?? initialState(productId),
        on: (event, handler) => runtimeRef.current?.on(event, handler) ?? (() => {}),
      }) satisfies SupoRuntime,
    [productId],
  );

  return <SupoContext.Provider value={value}>{children}</SupoContext.Provider>;
}

export function SupoWidget() {
  return null;
}

export function useSupo(): SupoRuntime {
  const runtime = useContext(SupoContext);
  if (!runtime) throw new Error("useSupo must be used within a SupoProvider.");
  return runtime;
}

export function useSupoState(): SupoState {
  const runtime = useSupo();
  const [state, setState] = useState(() => runtime.getState());

  useEffect(() => {
    return runtime.on("state-change", setState);
  }, [runtime]);

  return state;
}

function resolveCustomer(customer: SupoInitOptions["customer"]): SupoCustomer | null {
  if (typeof customer === "function") {
    try {
      return customer();
    } catch {
      return null;
    }
  }
  return customer ?? null;
}

export type {
  SupoAppearance,
  SupoCustomer,
  SupoEscalationStatus,
  SupoEventHandler,
  SupoEventName,
  SupoHooks,
  SupoInitOptions,
  SupoMessage,
  SupoRealtimeMode,
  SupoRuntime,
  SupoState,
} from "./types";
