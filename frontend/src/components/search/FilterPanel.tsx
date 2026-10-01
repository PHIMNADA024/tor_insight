"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

/**
 * Filter values as plain strings (including the numeric ones) so controlled
 * <input>/<select> elements can stay empty instead of coercing to 0/NaN.
 * Parsing into real numbers happens where these are sent to the search API.
 */
export type SearchFilters = {
  keyword: string;
  agency: string;
  category: string;
  fiscalYear: string;
  budgetMin: string;
  budgetMax: string;
};

export const emptyFilters: SearchFilters = {
  keyword: "",
  agency: "",
  category: "",
  fiscalYear: "",
  budgetMin: "",
  budgetMax: "",
};

/** Display labels for the Tor model's `category` values (backend/src/models/tor.ts). */
export const CATEGORY_LABELS: Record<string, string> = {
  software: "ซอฟต์แวร์",
  it_equipment: "ครุภัณฑ์คอมพิวเตอร์/ไอที",
};

/** Fiscal years are stored in Gregorian; BMA staff refer to them in Buddhist Era. */
export function toBuddhistYear(gregorianYear: number) {
  return gregorianYear + 543;
}

type SelectFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allLabel: string;
  options: { value: string; label: string }[];
};

function SelectField({ label, value, onChange, allLabel, options }: SelectFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
      >
        <option value="">{allLabel}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export type FilterPanelProps = {
  value: SearchFilters;
  onChange: (value: SearchFilters) => void;
  onApply: () => void;
  onReset: () => void;
  /** Option lists come from GET /api/tors/filters so they match what's actually searchable. */
  agencyOptions?: string[];
  categoryOptions?: string[];
  fiscalYearOptions?: number[];
};

export function FilterPanel({
  value,
  onChange,
  onApply,
  onReset,
  agencyOptions = [],
  categoryOptions = [],
  fiscalYearOptions = [],
}: FilterPanelProps) {
  function setField<K extends keyof SearchFilters>(key: K, fieldValue: SearchFilters[K]) {
    onChange({ ...value, [key]: fieldValue });
  }

  return (
    <aside className="h-fit rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">ตัวกรอง</h2>

        <button
          type="button"
          onClick={onReset}
          className="cursor-pointer text-xs text-primary hover:underline"
        >
          ล้างทั้งหมด
        </button>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">คำสำคัญ</Label>
          <Input
            placeholder="พิมพ์คำค้นหา..."
            className="h-9"
            value={value.keyword}
            onChange={(e) => setField("keyword", e.target.value)}
          />
        </div>

        <SelectField
          label="หน่วยงาน"
          value={value.agency}
          onChange={(v) => setField("agency", v)}
          allLabel="ทุกหน่วยงาน"
          options={agencyOptions.map((a) => ({ value: a, label: a }))}
        />

        <SelectField
          label="หมวดหมู่"
          value={value.category}
          onChange={(v) => setField("category", v)}
          allLabel="ทุกหมวดหมู่"
          options={categoryOptions.map((c) => ({ value: c, label: CATEGORY_LABELS[c] ?? c }))}
        />

        <SelectField
          label="ปีงบประมาณ"
          value={value.fiscalYear}
          onChange={(v) => setField("fiscalYear", v)}
          allLabel="ทุกปี"
          options={fiscalYearOptions.map((y) => ({
            value: String(y),
            label: String(toBuddhistYear(y)),
          }))}
        />

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">ช่วงงบประมาณ (บาท)</Label>

          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              min={0}
              placeholder="ต่ำสุด"
              className="h-9"
              value={value.budgetMin}
              onChange={(e) => setField("budgetMin", e.target.value)}
            />
            <Input
              type="number"
              min={0}
              placeholder="สูงสุด"
              className="h-9"
              value={value.budgetMax}
              onChange={(e) => setField("budgetMax", e.target.value)}
            />
          </div>
        </div>

        <Button className="w-full" onClick={onApply}>
          ใช้ตัวกรอง
        </Button>

        <Button variant="outline" className="w-full" onClick={onReset}>
          รีเซ็ต
        </Button>
      </div>
    </aside>
  );
}
