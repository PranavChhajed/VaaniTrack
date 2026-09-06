"use client";

import { useEffect, useState } from "react";
import { audioConsent, setAudioConsent, type AudioConsent } from "@/lib/device";

/**
 * The one question asked before the first recording.
 *
 * Mounted in the root layout rather than on the capture screen, because the
 * journal can record too — asking in one place and not the other would mean a
 * recording could be kept without anyone having agreed to it.
 *
 * What it deliberately does not do is decide anything for the user. There is no
 * pre-ticked box and no default: the recorder stays behind this until one of
 * the two buttons is pressed, and "No" is as easy to press as "Yes".
 *
 * Answering "no" is not a degraded mode. The app works identically — VaaniTrack
 * still records expenses, still shows transcripts, still logs what the pipeline
 * did. The only difference is whether the recording itself is kept.
 */
export function AudioConsentGate() {
  // Rendered only after mount: localStorage doesn't exist on the server, and
  // guessing an answer would flash the wrong thing at someone who already
  // decided.
  const [consent, setConsent] = useState<AudioConsent | null>(null);

  useEffect(() => {
    setConsent(audioConsent());
  }, []);

  if (consent === null || consent !== "unknown") return null;

  const answer = (value: "granted" | "denied") => {
    setAudioConsent(value);
    setConsent(value);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-vast-ink/60 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-title"
        className="sheet-rise w-full max-w-[440px] rounded-[var(--radius-card)] border-2 border-vast-ink bg-paper px-6 py-7 sm:rise"
      >
        <h2
          id="consent-title"
          className="display-type text-heading-sm text-vast-ink"
        >
          Can we keep your recordings?
        </h2>

        <p className="mt-4 font-figtree text-body-sm text-charcoal">
          VaaniTrack sometimes hears an amount wrong. Keeping the audio lets us
          replay a mistake and find out whether it was the listening or the
          understanding that failed &mdash; which is the only way it gets better.
        </p>

        <ul className="mt-4 flex flex-col gap-2 font-figtree text-body-sm text-charcoal">
          <li>&middot; Recordings are deleted after 90 days.</li>
          <li>&middot; Only you and the developer can access them.</li>
          <li>&middot; You can say no and everything still works.</li>
        </ul>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => answer("granted")}
            className="flex-1 rounded-[var(--radius-button)] border-2 border-vast-ink bg-mint-whisper px-5 py-3 font-figtree text-body-sm font-medium text-vast-ink active:bg-mint-deep"
          >
            Yes, keep them
          </button>
          <button
            type="button"
            onClick={() => answer("denied")}
            className="flex-1 rounded-[var(--radius-button)] border-2 border-vast-ink bg-paper-raised px-5 py-3 font-figtree text-body-sm text-vast-ink active:bg-paper-edge"
          >
            No, don&rsquo;t
          </button>
        </div>
      </div>
    </div>
  );
}
