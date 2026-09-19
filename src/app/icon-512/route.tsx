import { ImageResponse } from "next/og";
import { iconElement } from "@/lib/logoIcon";

/** The manifest's "any"-purpose 512×512 icon. See lib/logoIcon.tsx. */
export async function GET() {
  return new ImageResponse(iconElement(512), { width: 512, height: 512 });
}
