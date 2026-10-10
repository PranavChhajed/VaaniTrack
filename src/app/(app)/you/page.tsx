"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { currentSession, signOut } from "@/lib/auth";
import { setAudioConsent, useAudioConsent } from "@/lib/device";
import { eraseOnServer, wipeThisPhone } from "@/lib/erase";
import { csvFileName, toCsv } from "@/lib/exportCsv";
import { sinceLine, todayISO } from "@/lib/journal";
import { notifyLocal } from "@/lib/localStore";
import { NAME_MAX, saveSettings, useSettings } from "@/lib/settings";
import { PAYMENT_OPTIONS } from "@/lib/types";
import { useHydrated, useLocalValue } from "@/lib/useLocalValue";
import { useTransactions } from "@/lib/useTransactions";

/**
 * You: what the app knows about the person using it, and what they can ask it
 * to do differently.
 *
 * The rule for what belongs here is that a setting must change what happens
 * the next time an expense is said. Anything that only adds a decision
 * (themes, categories, languages) stays out. Everything on the screen says in
 * plain words what it does, because a setting whose effect has to be guessed
 * is one nobody trusts enough to touch.
 *
 * All of it is stored on this phone, like the journal, and the screen says so.
 */

const button =
  "focus-ring rounded-[var(--radius-pill)] border-2 border-vast-ink px-6 py-3 font-figtree text-body-sm font-medium text-vast-ink";
const buttonMint = `${button} bg-mint-whisper active:bg-mint-deep disabled:cursor-not-allowed disabled:opacity-60`;
const buttonQuiet = `${button} bg-paper active:bg-paper-edge disabled:cursor-not-allowed disabled:opacity-60`;
const buttonDanger =
  "focus-ring rounded-[var(--radius-pill)] border-2 border-vast-ink bg-alert px-6 py-3 font-figtree text-body-sm font-medium text-paper disabled:cursor-not-allowed disabled:opacity-50";

function Card({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-card)] border-2 border-vast-ink bg-paper-raised p-6">
      <h2 className="display-type text-subheading text-vast-ink">{title}</h2>
      {intro ? (
        <p className="mt-2 max-w-[52ch] font-figtree text-body-sm text-fog">{intro}</p>
      ) : null}
      <div className="mt-5 flex flex-col gap-4">{children}</div>
    </section>
  );
}

/** One choice in a group. A real radio input underneath, so the arrow keys,
 *  the screen reader's "2 of 3" and form semantics all work without help. */
function Option({
  name,
  checked,
  onChange,
  label,
  hint,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  hint?: string;
}) {
  return (
    <label
      className={[
        "flex min-h-12 cursor-pointer flex-col justify-center rounded-[var(--radius-button)] border-2 border-vast-ink px-4 py-3",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-forest-ink",
        checked ? "bg-vast-ink text-paper" : "bg-paper text-vast-ink active:bg-mint-whisper",
      ].join(" ")}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <span className="font-figtree text-body-sm font-medium">{label}</span>
      {hint ? (
        <span className={["mt-1 font-figtree text-caption", checked ? "text-paper-edge" : "text-fog"].join(" ")}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p id={id} className="font-figtree text-body-sm font-medium text-vast-ink">
          {label}
        </p>
        <p className="mt-1 max-w-[40ch] font-figtree text-caption text-fog">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        onClick={() => onChange(!checked)}
        className={[
          // The extra reach is the tap target: the visible switch is 32px tall,
          // and a thumb should not have to land on it exactly.
          "focus-ring relative h-8 w-14 shrink-0 rounded-full border-2 border-vast-ink transition-colors before:absolute before:-inset-2",
          checked ? "bg-forest-ink" : "bg-paper-edge",
        ].join(" ")}
      >
        <span
          aria-hidden="true"
          className={[
            "absolute top-0.5 h-5 w-5 rounded-full border-2 border-vast-ink bg-paper-raised transition-[left]",
            checked ? "left-[26px]" : "left-0.5",
          ].join(" ")}
        />
      </button>
    </div>
  );
}

type Notice = { tone: "ok" | "bad"; text: string };

export default function You() {
  const hydrated = useHydrated();
  const settings = useSettings();
  const consent = useAudioConsent();
  const { transactions } = useTransactions();
  const session = useLocalValue<string | null>(
    () => currentSession()?.email ?? null,
    null,
  );

  const [confirming, setConfirming] = useState<null | "recordings" | "everything">(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const redirect = useRef<number | null>(null);

  // A pending redirect must not outlive the page it belongs to.
  useEffect(
    () => () => {
      if (redirect.current !== null) window.clearTimeout(redirect.current);
    },
    [],
  );

  const locked = busy || finished;
  const summary = sinceLine(transactions);

  const exportJournal = () => {
    const blob = new Blob(["﻿", toCsv(transactions)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = csvFileName(todayISO());
    document.body.append(link);
    link.click();
    link.remove();
    // Revoked a beat later: some browsers start the download asynchronously.
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setNotice({
      tone: "ok",
      text: `Exported ${transactions.length} ${transactions.length === 1 ? "expense" : "expenses"}.`,
    });
  };

  const deleteRecordings = async () => {
    setBusy(true);
    setNotice(null);
    const result = await eraseOnServer("recordings");
    setBusy(false);
    setConfirming(null);
    setNotice(
      result.ok
        ? {
            tone: "ok",
            text:
              result.recordings === 0
                ? "There were no recordings to delete."
                : `Deleted ${result.recordings} ${result.recordings === 1 ? "recording" : "recordings"}.`,
          }
        : { tone: "bad", text: result.error },
    );
  };

  const deleteEverything = async () => {
    setBusy(true);
    setNotice(null);
    // The server first. If it cannot be reached the phone is left exactly as
    // it was, and the person is told so, rather than being left half-deleted.
    const result = await eraseOnServer("everything");
    if (!result.ok) {
      setBusy(false);
      setNotice({ tone: "bad", text: result.error });
      return;
    }
    wipeThisPhone();
    setBusy(false);
    setFinished(true);
    setConfirming(null);
    setNotice({ tone: "ok", text: "Everything is deleted. Starting fresh…" });
    // A full page load, not a client-side navigation: the screens hold the old
    // journal in memory, and a clean load is the one way to be sure none of it
    // is written back to the phone that was just emptied.
    redirect.current = window.setTimeout(() => {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- deliberately a hard navigation
      window.location.assign("/app");
    }, 1400);
  };

  return (
    <main className="mx-auto flex w-full max-w-[900px] flex-col gap-8 px-5 pb-36 pt-8 sm:px-8 sm:pt-12">
      <AppHeader profile />

      <div>
        <h1 className="display-type text-heading text-vast-ink">You</h1>
        {hydrated ? (
          <p className="mt-2 font-figtree text-body-sm text-fog">
            {settings.name.trim() ? `${settings.name.trim()} · ` : ""}
            {summary ?? "Nothing recorded yet."}
          </p>
        ) : null}
      </div>

      {!hydrated ? (
        <p className="font-figtree text-body text-fog">Opening your settings…</p>
      ) : (
        <>
          <div aria-live="polite">
            {notice ? (
              <p
                className={[
                  "rounded-[var(--radius-input)] border-2 bg-paper-raised px-4 py-3 font-figtree text-body-sm",
                  notice.tone === "ok" ? "border-vast-ink text-vast-ink" : "border-alert text-alert",
                ].join(" ")}
              >
                {notice.text}
              </p>
            ) : null}
          </div>

          <Card
            title="Your name"
            intro="Shown on your icon and here. It isn’t used to read your expenses."
          >
            <label className="flex flex-col gap-2">
              <span className="font-figtree text-caption font-medium text-fog">
                What should we call you?
              </span>
              <input
                value={settings.name}
                onChange={(e) => saveSettings({ name: e.target.value.slice(0, NAME_MAX) })}
                maxLength={NAME_MAX}
                autoComplete="given-name"
                spellCheck={false}
                disabled={locked}
                placeholder="Optional"
                className="focus-ring w-full rounded-[var(--radius-input)] border-2 border-vast-ink bg-paper px-4 py-3 font-figtree text-body-sm text-vast-ink outline-none placeholder:text-fog focus:border-forest-ink"
              />
            </label>
          </Card>

          <Card
            title="How you pay"
            intro="What an expense is filed as when you don’t say."
          >
            <div role="radiogroup" aria-label="Default payment method" className="grid grid-cols-3 gap-2">
              {PAYMENT_OPTIONS.map((option) => (
                <Option
                  key={option}
                  name="payment"
                  label={option}
                  checked={settings.defaultPayment === option}
                  onChange={() => saveSettings({ defaultPayment: option })}
                />
              ))}
            </div>
            <p className="font-figtree text-caption text-fog">
              “250 lunch” is filed as{" "}
              <span className="font-medium text-vast-ink">{settings.defaultPayment}</span>. Say “UPI”,
              “cash” or “card” in the same breath and what you said wins.
            </p>
          </Card>

          <Card
            title="How careful to be"
            intro="When an expense is saved without asking you."
          >
            <div role="radiogroup" aria-label="Saving behaviour" className="flex flex-col gap-2">
              <Option
                name="care"
                label="Save straight away"
                hint="When it’s sure of the amount, it’s logged and you can undo. Anything unsure still asks."
                checked={!settings.reviewAll}
                onChange={() => saveSettings({ reviewAll: false })}
              />
              <Option
                name="care"
                label="Always let me check first"
                hint="Every entry waits for your OK before it’s saved."
                checked={settings.reviewAll}
                onChange={() => saveSettings({ reviewAll: true })}
              />
            </div>
          </Card>

          <Card title="Opening the app">
            <Switch
              checked={settings.openToRecord}
              onChange={(next) => saveSettings({ openToRecord: next })}
              label="Start listening when I open the app"
              hint="Opens ready for today’s expense, so one tap on the icon is all it takes. Your phone may still ask for permission, or for a tap, before it opens the microphone."
            />
          </Card>

          <Card title="Your voice">
            <Switch
              checked={consent === "granted"}
              onChange={(next) => setAudioConsent(next ? "granted" : "denied")}
              label="Keep my recordings"
              hint="Helps fix mishearings. They’re deleted after 90 days. Turning this off stops new ones being kept; ones already kept stay until you delete them."
            />

            {confirming === "recordings" ? (
              <div className="flex flex-col gap-3 rounded-[var(--radius-input)] border-2 border-vast-ink bg-paper p-4">
                <p className="font-figtree text-body-sm text-vast-ink">
                  Delete every recording kept from this phone? What was heard, and your
                  expenses, stay.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={deleteRecordings} disabled={locked} className={buttonDanger}>
                    {busy ? "Deleting…" : "Delete recordings"}
                  </button>
                  <button type="button" onClick={() => setConfirming(null)} disabled={locked} className={buttonQuiet}>
                    Keep them
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setNotice(null);
                    setConfirming("recordings");
                  }}
                  disabled={locked}
                  className={buttonQuiet}
                >
                  Delete my recordings
                </button>
              </div>
            )}
          </Card>

          <Card
            title="Your data"
            intro="Your journal is kept on this phone, with a copy on our server that helps us fix mistakes."
          >
            <div>
              <button
                type="button"
                onClick={exportJournal}
                disabled={locked || transactions.length === 0}
                className={buttonMint}
              >
                Export my journal
              </button>
              <p className="mt-2 font-figtree text-caption text-fog">
                A spreadsheet file (.csv) with every expense and what you said for it. Do this
                before deleting.
              </p>
            </div>

            {confirming === "everything" ? (
              <div className="flex flex-col gap-3 rounded-[var(--radius-input)] border-2 border-alert bg-paper p-4">
                <p className="font-figtree text-body-sm font-medium text-vast-ink">
                  This can’t be undone.
                </p>
                <p className="font-figtree text-body-sm text-charcoal">
                  It deletes your journal and settings from this phone, and the copy, the
                  recordings and the history on our server. You’ll be asked about recordings
                  again, as if you’d just arrived.
                </p>
                <label className="flex flex-col gap-2">
                  <span className="font-figtree text-caption font-medium text-fog">
                    Type <span className="text-vast-ink">delete</span> to confirm
                  </span>
                  <input
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    disabled={locked}
                    className="focus-ring w-full rounded-[var(--radius-input)] border-2 border-vast-ink bg-paper-raised px-4 py-3 font-figtree text-body-sm text-vast-ink outline-none focus:border-forest-ink"
                  />
                </label>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={deleteEverything}
                    disabled={locked || typed.trim().toLowerCase() !== "delete"}
                    className={buttonDanger}
                  >
                    {busy ? "Deleting…" : "Delete everything"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirming(null);
                      setTyped("");
                    }}
                    disabled={locked}
                    className={buttonQuiet}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setNotice(null);
                    setTyped("");
                    setConfirming("everything");
                  }}
                  disabled={locked}
                  className={`${buttonQuiet} !border-alert !text-alert`}
                >
                  Delete everything
                </button>
              </div>
            )}
          </Card>

          <Card title="Help">
            <div>
              <Link href="/diag/mic" className={`${buttonQuiet} inline-block`}>
                Check my microphone
              </Link>
              <p className="mt-2 font-figtree text-caption text-fog">
                If recording stops working, this shows where it breaks.
              </p>
            </div>

            <details className="group">
              <summary className="focus-ring cursor-pointer py-3 font-figtree text-body-sm text-vast-ink underline underline-offset-4">
                A one-tap record button
              </summary>
              <div className="mt-3 flex flex-col gap-3 font-figtree text-body-sm text-charcoal">
                <p>
                  <strong className="font-medium">iPhone:</strong> in Safari,
                  tap Share, then Add to Home Screen, and always open VaaniTrack
                  from that icon. Then turn on “Start listening when I open the
                  app” above, and one tap on the icon starts recording today’s
                  expense.
                </p>
                <p>
                  <strong className="font-medium">Android:</strong> the same
                  switch works. The VaaniTrack app also adds a Record an expense
                  tile for your home screen, and a long-press shortcut on its
                  icon.
                </p>
                <p className="text-caption text-fog">
                  Keep to one icon. On iPhone the Home Screen icon and Safari
                  each keep their own journal, so an expense saved in one will
                  not appear in the other. Some phones also ask for one tap
                  before they open the microphone; if yours does, the screen
                  will say so.
                </p>
              </div>
            </details>

            <details className="group">
              <summary className="focus-ring cursor-pointer py-3 font-figtree text-body-sm text-vast-ink underline underline-offset-4">
                What VaaniTrack doesn’t do yet
              </summary>
              <ul className="mt-3 flex flex-col gap-2 font-figtree text-body-sm text-charcoal">
                <li>&middot; It’s English only.</li>
                <li>&middot; Your journal lives on this phone. It doesn’t follow you to another one.</li>
                <li>&middot; No budgets or reminders.</li>
              </ul>
            </details>

            <div className="font-figtree text-caption text-fog">
              {session ? (
                <>
                  <p>Signed in as {session}.</p>
                  <button
                    type="button"
                    onClick={() => {
                      signOut();
                      notifyLocal();
                    }}
                    className="focus-ring inline-block py-3 text-body-sm text-vast-ink underline underline-offset-4"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <p>Accounts aren’t connected yet, so signing in doesn’t move your journal anywhere.</p>
                  <Link
                    href="/signin"
                    className="focus-ring inline-block py-3 text-body-sm text-vast-ink underline underline-offset-4"
                  >
                    Sign in
                  </Link>
                </>
              )}
            </div>
          </Card>
        </>
      )}
    </main>
  );
}
