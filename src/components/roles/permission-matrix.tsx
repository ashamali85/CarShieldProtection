"use client";

import { useState } from "react";
import { PERMISSION_AREAS, type Permission } from "@/lib/permissions";

type Labels = { areas: Record<string, string>; perms: Record<string, string> };

/**
 * One row per area with a checkbox per permission. Ticking an action ticks the area's View;
 * unticking View clears the area. Boxes for access the editor doesn't have are disabled.
 */
export function PermissionMatrix({ initial, grantable, readOnly, labels }: { initial: Permission[]; grantable: Permission[]; readOnly?: boolean; labels: Labels }) {
  const [on, setOn] = useState<Set<Permission>>(() => new Set(initial));
  const allowed = new Set(grantable);
  const toggle = (area: (typeof PERMISSION_AREAS)[number], p: Permission, checked: boolean) => {
    const next = new Set(on);
    const view = area.perms.find((x) => x.endsWith(".view")) as Permission | undefined;
    if (checked) {
      next.add(p);
      if (view) next.add(view);
    } else if (p === view) {
      for (const x of area.perms) next.delete(x as Permission);
    } else {
      next.delete(p);
    }
    setOn(next);
  };
  return (
    <div className="divide-y divide-line rounded-xl border border-line">
      {PERMISSION_AREAS.map((area) => (
        <fieldset key={area.area} className="grid gap-2 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:items-center">
          <legend className="contents">
            <span className="text-sm font-medium text-ink">{labels.areas[area.area]}</span>
          </legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {area.perms.map((p) => {
              const disabled = readOnly || !allowed.has(p);
              const view = area.perms.find((x) => x.endsWith(".view"));
              // View can't be unticked while an action in the area is ticked.
              const locked = p === view && area.perms.some((x) => x !== view && on.has(x as Permission));
              return (
                <label key={p} className={`flex min-h-8 items-center gap-2 text-sm ${disabled ? "text-muted" : "cursor-pointer text-ink"}`}>
                  <input
                    type="checkbox"
                    name="perm"
                    value={p}
                    checked={on.has(p)}
                    disabled={disabled}
                    onChange={(e) => !locked && toggle(area, p, e.target.checked)}
                    className="size-4 accent-brand-600 disabled:opacity-50"
                  />
                  {labels.perms[p]}
                  {/* Disabled boxes aren't submitted; keep what's already granted so saving doesn't drop it. */}
                  {disabled && on.has(p) && !readOnly && <input type="hidden" name="perm" value={p} />}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
