"use client";

import { useEffect } from "react";

import { mountDemoWidget } from "@/lib/demo-widget";

export function DemoWidget({ productId }: { productId: string }) {
  useEffect(() => mountDemoWidget(productId), [productId]);
  return null;
}
