"use client";

import { FormEvent, useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { StatusControl } from "@/components/admin/StatusControl";
import { CATEGORIES, REGION_LEVELS, REGIONS, TARGET_GROUPS } from "@/lib/constants";
import type { Policy, PolicyStatus, RegionLevel, RiskLevel } from "@/lib/types";

interface PolicyFormProps {
  initialPolicy?: Policy;
}

interface FormState {
  titleZh: string;
  titleDe: string;
  publisher: string;
  officialUrl: string;
  publishedAt: string;
  effectiveAt: string;
  regionLevel: RegionLevel;
  regionName: string;
  category: string;
  targetGroups: string[];
  summaryZh: string;
  keyChanges: string[];
  userNotes: string;
  impactZh: string;
  contentZh: string;
  contentDeSummary: string;
  riskLevel: RiskLevel;
  status: PolicyStatus;
}

const emptyState: FormState = {
  titleZh: "",
  titleDe: "",
  publisher: "",
  officialUrl: "",
  publishedAt: new Date().toISOString().slice(0, 10),
  effectiveAt: "",
  regionLevel: "联邦",
  regionName: "联邦",
  category: "居留与签证",
  targetGroups: ["可能相关"],
  summaryZh: "",
  keyChanges: ["", "", ""],
  userNotes: "",
  impactZh: "",
  contentZh: "",
  contentDeSummary: "",
  riskLevel: "medium",
  status: "draft"
};

export function PolicyForm({ initialPolicy }: PolicyFormProps) {
  const [form, setForm] = useState<FormState>(() => initialPolicy ? fromPolicy(initialPolicy) : emptyState);
  const [message, setMessage] = useState<string>("");
  const regionOptions = useMemo(() => {
    if (form.regionLevel === "联邦") {
      return ["联邦"];
    }
    return Array.from(new Set([...REGIONS.states, ...REGIONS.cities]));
  }, [form.regionLevel]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "regionLevel" && value === "联邦") {
        next.regionName = "联邦";
      }
      return next;
    });
  }

  function updateKeyChange(index: number, value: string) {
    setForm((current) => ({
      ...current,
      keyChanges: current.keyChanges.map((item, itemIndex) => itemIndex === index ? value : item)
    }));
  }

  function addKeyChange() {
    setForm((current) => ({
      ...current,
      keyChanges: [...current.keyChanges, ""]
    }));
  }

  function removeKeyChange(index: number) {
    setForm((current) => ({
      ...current,
      keyChanges: current.keyChanges.filter((_, itemIndex) => itemIndex !== index)
    }));
  }

  function toggleTargetGroup(group: string) {
    setForm((current) => {
      const exists = current.targetGroups.includes(group);
      return {
        ...current,
        targetGroups: exists
          ? current.targetGroups.filter((item) => item !== group)
          : [...current.targetGroups, group]
      };
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("保存中...");

    const payload = {
      ...form,
      keyChanges: form.keyChanges.map((item) => item.trim()).filter(Boolean),
      effectiveAt: form.effectiveAt || undefined,
      contentDeSummary: form.contentDeSummary || undefined
    };

    const response = await fetch(initialPolicy ? `/api/admin/policies/${initialPolicy.id}` : "/api/admin/policies", {
      method: initialPolicy ? "PATCH" : "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error ?? "保存失败，请检查必填字段。");
      return;
    }

    setMessage(result.warning ?? "已保存。");
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6">
      <div className="rounded-lg border border-line bg-white p-5">
        <h2 className="text-lg font-semibold text-ink">基础信息</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <TextField label="中文标题" value={form.titleZh} onChange={(value) => updateField("titleZh", value)} required />
          <TextField label="德文原始标题" value={form.titleDe} onChange={(value) => updateField("titleDe", value)} required />
          <TextField label="发布机构" value={form.publisher} onChange={(value) => updateField("publisher", value)} required />
          <TextField label="官方链接" type="url" value={form.officialUrl} onChange={(value) => updateField("officialUrl", value)} required />
          <TextField label="发布时间" type="date" value={form.publishedAt} onChange={(value) => updateField("publishedAt", value)} required />
          <TextField label="生效时间" type="date" value={form.effectiveAt} onChange={(value) => updateField("effectiveAt", value)} />
        </div>
      </div>

      <div className="rounded-lg border border-line bg-white p-5">
        <h2 className="text-lg font-semibold text-ink">分类与适用范围</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <SelectField
            label="地区层级"
            value={form.regionLevel}
            onChange={(value) => updateField("regionLevel", value as RegionLevel)}
            options={REGION_LEVELS.map((level) => ({ value: level, label: level }))}
          />
          <SelectField
            label="适用地区"
            value={form.regionName}
            onChange={(value) => updateField("regionName", value)}
            options={regionOptions.map((region) => ({ value: region, label: region }))}
          />
          <SelectField
            label="政策类别"
            value={form.category}
            onChange={(value) => updateField("category", value)}
            options={CATEGORIES.map((category) => ({ value: category.value, label: category.label }))}
          />
        </div>

        <fieldset className="mt-4">
          <legend className="text-sm font-medium text-neutral-700">适用人群</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {TARGET_GROUPS.map((group) => (
              <label key={group} className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={form.targetGroups.includes(group)}
                  onChange={() => toggleTargetGroup(group)}
                  className="h-4 w-4 accent-policy-green"
                />
                {group}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="rounded-lg border border-line bg-white p-5">
        <h2 className="text-lg font-semibold text-ink">核心内容</h2>
        <div className="mt-4 grid gap-4">
          <TextArea label="一句话总结" value={form.summaryZh} onChange={(value) => updateField("summaryZh", value)} required rows={3} />

          <div>
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-medium text-neutral-700">关键变化</label>
              <button
                type="button"
                onClick={addKeyChange}
                className="focus-ring inline-flex items-center gap-1 rounded-lg border border-line bg-paper px-2 py-1 text-xs font-medium text-neutral-700 hover:border-policy-green"
              >
                <Plus className="h-3.5 w-3.5" />
                添加
              </button>
            </div>
            <div className="mt-2 grid gap-2">
              {form.keyChanges.map((change, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    value={change}
                    onChange={(event) => updateKeyChange(index, event.target.value)}
                    className="focus-ring h-10 flex-1 rounded-lg border border-line bg-paper px-3 text-sm text-ink"
                    placeholder={`关键变化 ${index + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeKeyChange(index)}
                    className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-white text-neutral-600 hover:border-policy-red hover:text-policy-red"
                    aria-label="删除关键变化"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <TextArea label="用户注意事项" value={form.userNotes} onChange={(value) => updateField("userNotes", value)} required rows={4} />
          <TextArea label="对华人用户的影响" value={form.impactZh} onChange={(value) => updateField("impactZh", value)} required rows={4} />
          <TextArea label="中文整理正文" value={form.contentZh} onChange={(value) => updateField("contentZh", value)} required rows={8} />
          <TextArea label="德文原文摘要" value={form.contentDeSummary} onChange={(value) => updateField("contentDeSummary", value)} rows={4} />
        </div>
      </div>

      <div className="rounded-lg border border-line bg-white p-5">
        <h2 className="text-lg font-semibold text-ink">质量控制</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <SelectField
            label="风险等级"
            value={form.riskLevel}
            onChange={(value) => updateField("riskLevel", value as RiskLevel)}
            options={[
              { value: "low", label: "低风险" },
              { value: "medium", label: "中风险" },
              { value: "high", label: "高风险" }
            ]}
          />
        </div>
        <div className="mt-5">
          <StatusControl value={form.status} onChange={(value) => updateField("status", value)} />
        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mx-5 border-t border-line bg-paper/95 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <p className="text-sm text-neutral-600">{message}</p>
          <button
            type="submit"
            className="focus-ring inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-policy-blue"
          >
            <Save className="h-4 w-4" />
            保存内容
          </button>
        </div>
      </div>
    </form>
  );
}

function fromPolicy(policy: Policy): FormState {
  return {
    titleZh: policy.titleZh,
    titleDe: policy.titleDe,
    publisher: policy.publisher,
    officialUrl: policy.officialUrl,
    publishedAt: policy.publishedAt,
    effectiveAt: policy.effectiveAt ?? "",
    regionLevel: policy.regionLevel,
    regionName: policy.regionName,
    category: policy.category,
    targetGroups: policy.targetGroups,
    summaryZh: policy.summaryZh,
    keyChanges: policy.keyChanges,
    userNotes: policy.userNotes,
    impactZh: policy.impactZh,
    contentZh: policy.contentZh,
    contentDeSummary: policy.contentDeSummary ?? "",
    riskLevel: policy.riskLevel,
    status: policy.status
  };
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  required
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium text-neutral-700">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className="focus-ring h-10 rounded-lg border border-line bg-paper px-3 text-sm text-ink"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  rows,
  required
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium text-neutral-700">{label}</span>
      <textarea
        value={value}
        rows={rows}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className="focus-ring rounded-lg border border-line bg-paper px-3 py-2 text-sm leading-6 text-ink"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium text-neutral-700">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="focus-ring h-10 rounded-lg border border-line bg-paper px-3 text-sm text-ink"
      >
        {options.map((option) => (
          <option key={`${label}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
