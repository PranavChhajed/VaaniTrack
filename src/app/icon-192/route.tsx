import { ImageResponse } from "next/og";
import { iconElement } from "@/lib/logoIcon";

/** The manifest's "any"-purpose 192×192 icon. See lib/logoIcon.tsx. */
export async function GET() {
  return new ImageResponse(iconElement(192), { width: 192, height: 192 });
}
