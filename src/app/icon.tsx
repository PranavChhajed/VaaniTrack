import { ImageResponse } from "next/og";
import { iconElement } from "@/lib/logoIcon";

/**
 * The favicon and tab icon — generated, not painted, so it can never drift
 * from the mark in `Logo.tsx`. Uses the same shared badge as `apple-icon.tsx`
 * and the manifest icons in `icon-192/`, `icon-512/` — see `logoIcon.tsx`.
 */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(iconElement(32), size);
}
