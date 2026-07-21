"use client";

import { MetricAlertsEditor } from "@/components/MetricAlertsEditor";

export function MetricAlertsTemplateClient({ initial }: { initial: any }) {
  return (
    <MetricAlertsEditor
      initial={initial}
      scope="template"
      onSave={async (config) => {
        const r = await fetch("/api/metric-alerts/template", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config }),
        });
        if (!r.ok) throw new Error("save failed");
        const data = await r.json();
        return data.config;
      }}
    />
  );
}
