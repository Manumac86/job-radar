"use client";

import { format, isValid, parse } from "date-fns";
import { CalendarIcon, Clock, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** "YYYY-MM-DD" to a local Date (no time-zone shift), or undefined. */
function toDate(value: string): Date | undefined {
  if (!value) return undefined;
  const d = parse(value, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : undefined;
}

/**
 * shadcn date picker (Popover + Calendar). Works controlled (`value` + `onChange`) or inside a
 * form: a hidden input named `name` carries the "YYYY-MM-DD" value.
 */
export function DatePicker({
  value,
  defaultValue = "",
  onChange,
  name,
  required,
  clearable = !required,
  placeholder = "Pick a date",
  className,
  "aria-label": ariaLabel,
}: {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  required?: boolean;
  clearable?: boolean;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const [inner, setInner] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const current = value ?? inner;
  const selected = toDate(current);
  const set = (next: string) => {
    if (value === undefined) setInner(next);
    onChange?.(next);
  };
  return (
    <div className={cn("relative", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            aria-label={ariaLabel}
            data-empty={!selected}
            className="w-full justify-start font-normal data-[empty=true]:text-muted-foreground"
          >
            <CalendarIcon aria-hidden />
            {selected ? format(selected, "d MMM yyyy") : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            captionLayout="dropdown"
            // Year dropdown: past applications to interviews and contracts years ahead.
            startMonth={new Date(new Date().getFullYear() - 10, 0)}
            endMonth={new Date(new Date().getFullYear() + 5, 11)}
            weekStartsOn={1}
            onSelect={(d) => {
              set(d ? format(d, "yyyy-MM-dd") : "");
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      {clearable && selected ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Clear date"
          className="absolute top-1/2 right-1 size-7 -translate-y-1/2"
          onClick={() => set("")}
        >
          <X aria-hidden />
        </Button>
      ) : null}
      {name ? <input type="hidden" name={name} value={current} required={required} /> : null}
    </div>
  );
}

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));

/**
 * shadcn time picker: hour and minute selects (24-hour clock). Works controlled or in a form
 * through a hidden "HH:MM" input named `name`.
 */
export function TimePicker({
  value,
  defaultValue = "",
  onChange,
  name,
  required,
  minuteStep = 5,
  className,
  "aria-label": ariaLabel = "Time",
}: {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  required?: boolean;
  minuteStep?: number;
  className?: string;
  "aria-label"?: string;
}) {
  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner;
  const [h = "", m = ""] = current ? current.split(":") : [];
  const minutes = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) =>
    String(i * minuteStep).padStart(2, "0"),
  );
  // Keep an existing off-step minute (e.g. 08:07 from a hand-edited file) selectable.
  if (m && !minutes.includes(m)) {
    minutes.push(m);
    minutes.sort();
  }
  const set = (hour: string, minute: string) => {
    const next = `${hour || "00"}:${minute || "00"}`;
    if (value === undefined) setInner(next);
    onChange?.(next);
  };
  return (
    <div role="group" aria-label={ariaLabel} className={cn("flex items-center gap-1", className)}>
      <Clock aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <Select value={h} onValueChange={(v) => set(v, m)}>
        <SelectTrigger aria-label={`${ariaLabel} hour`} className="w-full min-w-16">
          <SelectValue placeholder="HH" />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {HOURS.map((x) => (
            <SelectItem key={x} value={x}>
              {x}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span aria-hidden className="text-muted-foreground">
        :
      </span>
      <Select value={m} onValueChange={(v) => set(h, v)}>
        <SelectTrigger aria-label={`${ariaLabel} minute`} className="w-full min-w-16">
          <SelectValue placeholder="MM" />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {minutes.map((x) => (
            <SelectItem key={x} value={x}>
              {x}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {name ? <input type="hidden" name={name} value={current} required={required} /> : null}
    </div>
  );
}
