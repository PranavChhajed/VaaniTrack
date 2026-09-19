import { ImageResponse } from "next/og";
import { iconElement } from "@/lib/logoIcon";

/** iOS home-screen icon. Full-bleed, no self-drawn corners — iOS applies
 *  its own ~22% corner radius to whatever is supplied. See logoIcon.tsx. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(iconElement(180), size);
}
