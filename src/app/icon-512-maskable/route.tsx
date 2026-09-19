import { ImageResponse } from "next/og";
import { iconElement } from "@/lib/logoIcon";

/** The manifest's maskable 512×512 icon — wider safe-zone padding so the
 *  mark survives Android's circular or squircle mask. See lib/logoIcon.tsx. */
export async function GET() {
  return new ImageResponse(iconElement(512, true), { width: 512, height: 512 });
}
