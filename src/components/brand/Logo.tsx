import Image from "next/image";
import Link from "next/link";

// The "A" monogram alone -- used wherever space is tight (nav bar, auth
// page headers). Links home since it doubles as the app's brand mark.
export function LogoIcon({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <Link href="/" aria-label="AI Outfit Picker home" className={className}>
      <Image src="/logo-icon.png" alt="AI Outfit Picker" width={size} height={size} priority />
    </Link>
  );
}

// The full lockup (icon + wordmark + tagline) -- used where the brand
// itself is the content, not just a nav accent (the landing hero).
export function LogoFull({ className }: { className?: string }) {
  return (
    <Image
      src="/logo-full.png"
      alt="AI Outfit Picker — AI-powered menswear styling"
      width={1088}
      height={218}
      className={className}
      priority
    />
  );
}
