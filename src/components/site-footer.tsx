import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="text-muted-foreground mx-auto flex max-w-6xl flex-wrap gap-x-4 gap-y-1 px-4 py-6 text-xs">
      <span>© Slotwise</span>
      <Link href="/privacy" className="hover:underline">
        Privacy
      </Link>
      <Link href="/terms" className="hover:underline">
        Terms
      </Link>
      <Link href="/cookies" className="hover:underline">
        Cookies
      </Link>
    </footer>
  );
}
