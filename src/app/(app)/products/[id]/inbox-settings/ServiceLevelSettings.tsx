"use client";

import { Clock, Plus, Smile, Target, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { WEEKDAYS, type BusinessHoursConfig, type Weekday } from "@/lib/sla/hours";

import { saveBusinessHours, saveCsatEnabled, saveSlaPolicies, type SlaPolicyInput } from "./actions";

const DAY_LABELS: Record<Weekday, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};
const ORDERED_DAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const PRIORITIES = ["urgent", "high", "normal", "low"] as const;

function timezones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? ["UTC"];
  } catch {
    return ["UTC"];
  }
}

function Section({ icon: Icon, title, description, children }: { icon: typeof Clock; title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 rounded-lg border border-border bg-card p-5">
      <div className="mb-4 flex items-start gap-3">
        <Icon className="mt-0.5 size-4 text-[color:var(--text-secondary)]" />
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-[color:var(--text-secondary)]">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export function ServiceLevelSettings({
  productId,
  businessHours,
  policies,
  csatEnabled: initialCsat,
}: {
  productId: string;
  businessHours: BusinessHoursConfig;
  policies: SlaPolicyInput[];
  csatEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(businessHours.enabled);
  const [timezone, setTimezone] = useState(businessHours.timezone);
  const [schedule, setSchedule] = useState(businessHours.schedule);
  const [holidays, setHolidays] = useState(businessHours.holidays);
  const [holidayDraft, setHolidayDraft] = useState("");
  const [sla, setSla] = useState<Record<string, { first: string; resolution: string }>>(() =>
    Object.fromEntries(
      PRIORITIES.map((p) => {
        const policy = policies.find((x) => x.priority === p);
        return [p, { first: policy?.firstResponseMinutes?.toString() ?? "", resolution: policy?.resolutionMinutes?.toString() ?? "" }];
      }),
    ),
  );
  const [csat, setCsat] = useState(initialCsat);
  const [isPending, startTransition] = useTransition();
  const zones = useMemo(() => timezones(), []);

  function run(action: () => Promise<void>, success: string) {
    startTransition(async () => {
      try {
        await action();
        toast.success(success);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save");
      }
    });
  }

  function setDay(day: Weekday, open: boolean) {
    setSchedule((prev) => ({ ...prev, [day]: open ? (prev[day]?.length ? prev[day] : [{ start: "09:00", end: "17:00" }]) : [] }));
  }

  function setRange(day: Weekday, field: "start" | "end", value: string) {
    setSchedule((prev) => {
      const range = prev[day]?.[0] ?? { start: "09:00", end: "17:00" };
      return { ...prev, [day]: [{ ...range, [field]: value }] };
    });
  }

  return (
    <>
      <Section
        icon={Clock}
        title="Business hours"
        description="Outside these hours customers who ask for a person are told the team is offline and asked for an email, and SLA timers pause."
      >
        <label className="mb-4 flex items-center gap-2 text-sm text-foreground">
          <Switch checked={enabled} onCheckedChange={setEnabled} />
          Use business hours
        </label>
        <div className={enabled ? "" : "pointer-events-none opacity-50"}>
          <label className="mb-3 block text-xs text-[color:var(--text-secondary)]">
            Timezone
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="ml-2 h-8 rounded-md border border-border bg-transparent px-2 text-sm text-foreground"
            >
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </label>
          <div className="space-y-2">
            {ORDERED_DAYS.map((day) => {
              const range = schedule[day]?.[0];
              return (
                <div key={day} className="flex items-center gap-3 text-sm">
                  <Switch checked={Boolean(range)} onCheckedChange={(open) => setDay(day, open)} aria-label={`${DAY_LABELS[day]} open`} />
                  <span className="w-24 text-foreground">{DAY_LABELS[day]}</span>
                  {range ? (
                    <>
                      <Input type="time" value={range.start} onChange={(e) => setRange(day, "start", e.target.value)} className="h-8 w-28" />
                      <span className="text-[color:var(--text-tertiary)]">to</span>
                      <Input type="time" value={range.end} onChange={(e) => setRange(day, "end", e.target.value)} className="h-8 w-28" />
                    </>
                  ) : (
                    <span className="text-xs text-[color:var(--text-tertiary)]">Closed</span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-4">
            <p className="mb-2 text-xs text-[color:var(--text-secondary)]">Holidays</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {holidays.map((day) => (
                <span key={day} className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs">
                  {day}
                  <button type="button" aria-label={`Remove ${day}`} onClick={() => setHolidays(holidays.filter((d) => d !== day))}>
                    <Trash2 className="size-3" />
                  </button>
                </span>
              ))}
              <Input type="date" value={holidayDraft} onChange={(e) => setHolidayDraft(e.target.value)} className="h-8 w-40" />
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1 text-xs"
                disabled={!holidayDraft}
                onClick={() => {
                  setHolidays([...new Set([...holidays, holidayDraft])].sort());
                  setHolidayDraft("");
                }}
              >
                <Plus className="size-3" /> Add
              </Button>
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <Button
            size="sm"
            disabled={isPending}
            onClick={() =>
              run(
                () =>
                  saveBusinessHours(productId, {
                    enabled,
                    timezone,
                    schedule: Object.fromEntries(WEEKDAYS.map((d) => [d, schedule[d] ?? []])),
                    holidays,
                  }),
                "Business hours saved",
              )
            }
          >
            Save
          </Button>
        </div>
      </Section>

      <Section
        icon={Target}
        title="Service level targets"
        description="Time to first human reply and to resolution after a conversation is handed to your team, per priority. Counted in business hours when enabled. Leave empty for no target."
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[color:var(--text-tertiary)]">
              <th className="pb-2 font-normal">Priority</th>
              <th className="pb-2 font-normal">First response (minutes)</th>
              <th className="pb-2 font-normal">Resolution (minutes)</th>
            </tr>
          </thead>
          <tbody>
            {PRIORITIES.map((p) => (
              <tr key={p}>
                <td className="py-1 capitalize text-foreground">{p}</td>
                <td className="py-1 pr-3">
                  <Input
                    type="number"
                    min={1}
                    value={sla[p].first}
                    onChange={(e) => setSla({ ...sla, [p]: { ...sla[p], first: e.target.value } })}
                    className="h-8"
                    placeholder="—"
                  />
                </td>
                <td className="py-1">
                  <Input
                    type="number"
                    min={1}
                    value={sla[p].resolution}
                    onChange={(e) => setSla({ ...sla, [p]: { ...sla[p], resolution: e.target.value } })}
                    className="h-8"
                    placeholder="—"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 flex justify-end">
          <Button
            size="sm"
            disabled={isPending}
            onClick={() =>
              run(
                () =>
                  saveSlaPolicies(
                    productId,
                    PRIORITIES.map((p) => ({
                      priority: p,
                      firstResponseMinutes: Number(sla[p].first) || null,
                      resolutionMinutes: Number(sla[p].resolution) || null,
                    })),
                  ),
                "Service level targets saved",
              )
            }
          >
            Save
          </Button>
        </div>
      </Section>

      <Section
        icon={Smile}
        title="Customer satisfaction (CSAT)"
        description="When a conversation is resolved, the widget asks the customer to rate it from 1 to 5. Results appear in Analytics."
      >
        <label className="flex items-center gap-2 text-sm text-foreground">
          <Switch
            checked={csat}
            disabled={isPending}
            onCheckedChange={(next) => {
              setCsat(next);
              run(() => saveCsatEnabled(productId, next), next ? "CSAT survey enabled" : "CSAT survey disabled");
            }}
          />
          Ask customers to rate resolved conversations
        </label>
      </Section>
    </>
  );
}
