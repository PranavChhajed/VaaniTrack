import { LOGO_PATH } from "@/components/Logo";

/**
 * Shared badge renderer for every generated app icon — the favicon, the
 * iOS home-screen icon, and the PWA manifest icons — so they read as one
 * visual family instead of each inventing its own treatment.
 *
 * Full-bleed fill, no self-drawn border: iOS and Android both apply their
 * own corner-rounding or adaptive mask to whatever image is supplied, so a
 * border risks being unevenly clipped at exactly the edge it's meant to
 * define. `maskable` widens the safe-zone padding to the ~20% Android's
 * spec asks for, so the mark survives a circular or squircle mask intact.
 */
export function iconElement(size: number, maskable = false) {
  const paddingRatio = maskable ? 0.22 : 0.14;
  const inner = size * (1 - paddingRatio * 2);
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#cfead9" /* --color-mint-whisper */,
      }}
    >
      <svg width={inner} height={inner} viewBox="0 0 32 32" fill="none">
        <path
          d={LOGO_PATH}
          stroke="#034f46" /* --color-forest-ink */
          strokeWidth={3.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
