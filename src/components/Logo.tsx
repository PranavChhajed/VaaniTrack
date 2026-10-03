import Image from "next/image";
import logoMark from "../../public/logo.png";

/**
 * The VaaniTrack mark.
 *
 * A "V" built from two halves of the product: a profile speaking on the
 * left, a receipt carrying a rupee on the right. Vaani and track, in one
 * letter. Supplied as artwork rather than drawn in code, so it lives in
 * `public/logo.png` and every surface renders that one file.
 *
 * Derived from `docs/design/reference/logo-reference.png` by
 * `docs/design/LOGO.md`'s recipe: the wordmark and tagline cropped away
 * (the app already sets "VaaniTrack" in type beside the mark, so baking it
 * into the image would say it twice), the background made transparent, and
 * the original gold rotated to a green in the app's own family. Ember Glow
 * is the only warm accent the palette has and it means "the microphone is
 * live", so the mark may not spend it.
 *
 * The artwork is wider than it is tall. `size` is its **height**; width
 * follows from the aspect ratio, so a row of things at the same `size` line
 * up on their heights the way type does.
 */

/** 661 × 512, `public/logo.png`'s own committed dimensions. */
const ASPECT = 661 / 512;

type LogoProps = {
  /** Rendered height in px. Width follows the aspect ratio. */
  size?: number;
  className?: string;
};

export function Logo({ size = 28, className }: LogoProps) {
  return (
    <Image
      src={logoMark}
      alt=""
      aria-hidden="true"
      height={size}
      width={Math.round(size * ASPECT)}
      className={className}
      priority
    />
  );
}
