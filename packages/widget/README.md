# Supo Widget SDK

Official browser SDK for adding the Supo customer support widget to React, Next.js, Vite, vanilla TypeScript, and custom chat interfaces.

> Alpha release: install with the `alpha` tag until the SDK is marked stable.

## Install

```bash
npm install @supoapp/widget@alpha
```

## React and Next.js

Use the React helpers in a client component near your app shell.

```tsx
"use client";

import { SupoProvider, SupoWidget } from "@supoapp/widget/react";

export function AppShell({ user, children }) {
  return (
    <SupoProvider
      productId="YOUR_PRODUCT_ID"
      apiBaseUrl="https://your-supo-app.com"
      customer={{ name: user.name, email: user.email }}
    >
      {children}
      <SupoWidget />
    </SupoProvider>
  );
}
```

Use `useSupo()` for custom buttons.

```tsx
"use client";

import { useSupo } from "@supoapp/widget/react";

export function HelpButton() {
  const supo = useSupo();
  return <button onClick={() => supo.open()}>Contact support</button>;
}
```

## Vanilla TypeScript

Use the core runtime in any browser app that can import npm packages.

```ts
import { initSupo } from "@supoapp/widget";

const supo = initSupo({
  productId: "YOUR_PRODUCT_ID",
  apiBaseUrl: "https://your-supo-app.com",
  customer: { name: "Jane Smith", email: "jane@example.com" },
  appearance: {
    launcherStyle: "icon-label",
    launcherLabel: "Support",
  },
});

supo.open();
```

## Headless

Use the headless client when you want Supo's backend, persistence, escalation, realtime, and polling fallback, but you want to build your own chat UI.

```ts
import { createSupoClient } from "@supoapp/widget/headless";

const supo = createSupoClient({
  productId: "YOUR_PRODUCT_ID",
  apiBaseUrl: "https://your-supo-app.com",
  customer: { name: "Jane Smith", email: "jane@example.com" },
});

const reply = await supo.sendMessage("I need help with billing");
```

## Runtime Options

```ts
type SupoInitOptions = {
  productId: string;
  apiBaseUrl?: string;
  customer?: { name: string; email: string } | (() => { name: string; email: string } | null);
  appearance?: {
    theme?: "dark" | "light";
    position?: "bottom-right" | "bottom-left";
    accentColor?: `#${string}`;
    launcherLabel?: string;
    launcherStyle?: "icon" | "icon-label";
    panelSize?: "compact" | "standard" | "wide";
    borderRadius?: "soft" | "rounded" | "square";
    botName?: string;
    greeting?: string;
    introTitle?: string;
    introDescription?: string;
    inputPlaceholder?: string;
    agentHandoffLabel?: string;
    showPoweredBy?: boolean;
  };
  behavior?: {
    startOpen?: boolean;
    hideLauncher?: boolean;
  };
  realtime?: "auto" | "polling";
};
```

## Runtime API

```ts
supo.open();
supo.close();
supo.toggle();
supo.identify({ name: "Jane Smith", email: "jane@example.com" });
supo.reset();
supo.destroy();

const state = supo.getState();

const unsubscribe = supo.on("state-change", (state) => {
  console.log(state);
});
```

## What the SDK Handles

- Loads saved widget defaults from Supo.
- Applies runtime options from your code.
- Stores customer and conversation tokens in the browser.
- Sends messages to Supo.
- Handles escalation to a human agent.
- Uses realtime when available and polling as a fallback.

## API Base URL

The SDK is installed from npm, but it still calls your Supo app at runtime.

Use `apiBaseUrl` for local development and self-hosted installs:

```ts
initSupo({
  productId: "YOUR_PRODUCT_ID",
  apiBaseUrl: "http://localhost:3000",
});
```

## Fallback Script

For CMS/no-code sites that cannot install npm packages, use the hosted fallback script from your Supo app instead.

```html
<script>
  window.SupoSettings = {
    productId: "YOUR_PRODUCT_ID",
    apiBaseUrl: "https://your-supo-app.com"
  };
</script>
<script async src="https://your-supo-app.com/widget.js"></script>
```

## Status

`@supoapp/widget` is currently alpha software. Use `@alpha` for early integrations and expect small API changes before the stable release.
