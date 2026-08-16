"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";

const ROLES = [
  { value: "CUSTOMER", label: "Customer", description: "Browse the catalog and generate outfit looks." },
  { value: "STORE", label: "Store", description: "Browse the catalog and assist customers in-store." },
  { value: "ADMIN", label: "Admin", description: "Manage the catalog and matching rules." },
] as const;

type RoleValue = (typeof ROLES)[number]["value"];

export function RoleSelector() {
  const [role, setRole] = useState<RoleValue>("CUSTOMER");
  const requiresCode = role !== "CUSTOMER";

  return (
    <>
      <input type="hidden" name="role" value={role} />
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-ink">Account type</span>
        <div className="grid grid-cols-3 gap-2">
          {ROLES.map((r) => (
            <motion.button
              key={r.value}
              type="button"
              onClick={() => setRole(r.value)}
              aria-pressed={role === r.value}
              whileTap={{ scale: 0.97 }}
              animate={{ scale: role === r.value ? 1 : 1 }}
              transition={{ type: "spring", bounce: 0.2, duration: 0.3 }}
              className={`rounded-md border px-3 py-3 text-left text-sm transition-colors duration-150 ease-out ${
                role === r.value
                  ? "border-accent bg-accent/5 text-ink"
                  : "border-border bg-surface text-ink-secondary hover:border-accent/40"
              }`}
            >
              <div className="font-medium">{r.label}</div>
              <div className="mt-0.5 text-xs text-ink-muted">{r.description}</div>
            </motion.button>
          ))}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {requiresCode && (
          <motion.div
            key="code"
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 0 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-1">
              <label htmlFor="code" className="text-sm font-medium text-ink">
                {role === "ADMIN" ? "Admin code" : "Store code"}
              </label>
              <input
                id="code"
                name="code"
                type="password"
                required
                autoComplete="off"
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
