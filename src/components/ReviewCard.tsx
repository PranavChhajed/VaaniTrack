"use client";

import { useState } from "react";
import { useSettings } from "@/lib/settings";
import { DEFAULTS, type Field, type Provenance, type Transaction } from "@/lib/types";

/**
 * FR-12: review before save.
 *
 * The one screen that carries the product. Nothing commits without passing
 * through here, which is what makes "never record a wrong transaction"
 * survivable given that currency amounts are the weakest thing ASR does
 * (36.3% baseline, docs/RESEARCH.md §1.1).
 *
 * Provenance (FR-10) is rendered using the Wispr Flow reference's hand-drawn underline
 * accent, which the reference system uses for editorial emphasis. Here it
 * marks values the system supplied rather than heard: emphasis repurposed
 * as honesty.
 */

function ProvenanceNote({ provenance }: { provenance: Provenance }) {
  const label: Record<Provenance, string | null> = {
    said: null,
    inferred: "worked out",
    default: "your default",
    unknown: null,
  };
  const text = label[provenance];
  if (!text) return null;
  return (
    <span className="ml-2 font-figtree text-caption font-normal text-fog">
      {text}
    </span>
  );
}

function ReadOnlyValue({
  field,
  placeholder,
}: {
  field: Field<string | number>;
  placeholder: string;
}) {
  if (field.value === null || field.value === "") {
    return (
      <span className="prov-unknown font-figtree text-body">{placeholder}</span>
    );
  }
  const classes =
    field.provenance === "inferred"
      ? "prov-inferred"
      : field.provenance === "default"
        ? "text-fog"
        : "";
  return (
    <span className={`font-figtree text-body ${classes}`}>{field.value}</span>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t-2 border-paper-edge py-4">
      <span className="font-figtree text-caption font-medium text-fog">
        {label}
      </span>
      <span className="text-right">{children}</span>
    </div>
  );
}

const inputClass =
  "focus-ring w-full rounded-[var(--radius-input)] border-2 border-vast-ink bg-paper px-4 py-3 font-figtree text-body-sm text-vast-ink outline-none focus:border-forest-ink";

export function ReviewCard({
  transaction,
  needsConfirmation,
  confirmationReason,
  onSave,
  onDiscard,
}: {
  transaction: Transaction;
  needsConfirmation: boolean;
  confirmationReason: string | null;
  onSave: (t: Transaction) => void;
  onDiscard: () => void;
}) {
  // A transaction the model flagged as ambiguous opens in edit mode: the
  // user is going to have to touch it anyway, so don't make them ask.
  const { defaultPayment } = useSettings();
  const [editing, setEditing] = useState(needsConfirmation);
  const [draft, setDraft] = useState(transaction);

  const set = <K extends keyof Transaction>(key: K, value: string) => {
    setDraft((prev) => ({
      ...prev,
      [key]: {
        value:
          value === ""
            ? null
            : ((key === "amount"
                ? Number(value.replace(/[^\d.]/g, ""))
                : value) as never),
        // Anything the user types is, by definition, said.
        provenance: value === "" ? "unknown" : "said",
      },
    }));
  };

  const amountMissing = draft.amount.value === null;

  return (
    <article className="rise rounded-[var(--radius-card)] border-2 border-vast-ink bg-paper-raised p-6 sm:p-8">
      {needsConfirmation && confirmationReason ? (
        // Deliberately ember, not alert: the app being unsure is normal
        // operation here, not a failure. See the --color-alert comment in
        // globals.css — alert is for errors and destructive actions, and
        // "please check this" belongs in the provenance vocabulary instead.
        <p className="mb-6 rounded-[var(--radius-input)] border-2 border-vast-ink bg-ember-glow px-4 py-3 font-figtree text-body-sm text-vast-ink">
          {confirmationReason}
        </p>
      ) : null}

      {transaction.transcript ? (
        <p className="mb-6 font-figtree text-caption text-fog">
          You said “{transaction.transcript}”
        </p>
      ) : null}

      {editing ? (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="font-figtree text-caption font-medium text-fog">
              Amount
            </span>
            <input
              className={inputClass}
              inputMode="decimal"
              autoFocus
              value={draft.amount.value ?? ""}
              onChange={(e) => set("amount", e.target.value)}
              placeholder="How much?"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="font-figtree text-caption font-medium text-fog">
              What for
            </span>
            <input
              className={inputClass}
              value={draft.description.value ?? ""}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Description"
            />
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="font-figtree text-caption font-medium text-fog">
                Category <span className="font-normal">(fine to leave blank)</span>
              </span>
              <input
                className={inputClass}
                value={draft.category.value ?? ""}
                onChange={(e) => set("category", e.target.value)}
                placeholder="Optional"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="font-figtree text-caption font-medium text-fog">
                Paid with
              </span>
              <input
                className={inputClass}
                value={draft.paymentMethod.value ?? ""}
                onChange={(e) => set("paymentMethod", e.target.value)}
                placeholder={defaultPayment}
              />
            </label>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-3">
            <span
              className={[
                "money text-heading",
                draft.amount.provenance === "inferred" ? "prov-inferred" : "",
                amountMissing ? "prov-unknown" : "",
              ].join(" ")}
            >
              {draft.amount.value === null
                ? "amount not heard"
                : `${DEFAULTS.currency}${draft.amount.value.toLocaleString("en-IN")}`}
            </span>
            <ProvenanceNote provenance={draft.amount.provenance} />
          </div>

          <p className="mt-2 font-figtree text-subheading text-vast-ink">
            {draft.description.value ?? (
              <span className="prov-unknown">no description</span>
            )}
          </p>

          <div className="mt-6">
            <Row label="Category">
              <ReadOnlyValue field={draft.category} placeholder="none" />
              <ProvenanceNote provenance={draft.category.provenance} />
            </Row>
            {draft.payee.value ? (
              <Row label="Paid to">
                <ReadOnlyValue field={draft.payee} placeholder="—" />
              </Row>
            ) : null}
            <Row label="Paid with">
              <ReadOnlyValue field={draft.paymentMethod} placeholder="not set" />
              <ProvenanceNote provenance={draft.paymentMethod.provenance} />
            </Row>
            <Row label="Date">
              <ReadOnlyValue field={draft.date} placeholder="not set" />
              <ProvenanceNote provenance={draft.date.provenance} />
            </Row>
          </div>
        </>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => onSave(draft)}
          disabled={amountMissing}
          className={[
            "focus-ring rounded-[var(--radius-button)] border-2 border-vast-ink px-6 py-4",
            "font-figtree text-body-sm font-medium text-vast-ink",
            amountMissing
              ? "cursor-not-allowed bg-paper-edge opacity-60"
              : "bg-mint-whisper hover:bg-forest-ink hover:text-paper active:bg-mint-deep",
          ].join(" ")}
        >
          {amountMissing ? "Add an amount to save" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="focus-ring rounded-[var(--radius-button)] border-2 border-vast-ink bg-paper-raised px-6 py-4 font-figtree text-body-sm font-medium text-vast-ink hover:bg-paper-edge"
        >
          {editing ? "Done editing" : "Edit"}
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="focus-ring px-2 py-4 font-figtree text-body-sm text-fog underline underline-offset-4 hover:text-vast-ink"
        >
          Discard
        </button>
      </div>

      {!editing ? (
        <p className="mt-6 font-figtree text-caption text-fog">
          Underlined values were worked out, not heard. Nothing is saved until you
          say so.
        </p>
      ) : null}
    </article>
  );
}
