import Link from "next/link";

/**
 * Policy pages. The text is a starting template for a solo-professional scheduling tool and
 * must be reviewed by a lawyer before launch (see README "Before launch").
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link href="/" className="text-primary text-sm font-semibold">
        Slotwise
      </Link>
      <article className="mt-6 flex flex-col gap-4 text-sm leading-6 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </article>
    </main>
  );
}
