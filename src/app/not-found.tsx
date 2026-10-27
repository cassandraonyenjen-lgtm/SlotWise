import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col justify-center gap-4 px-4 py-12">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground text-sm">
        This page doesn&apos;t exist. If someone shared a booking link with you, check that it was
        copied in full.
      </p>
      <Button asChild variant="outline" className="self-start">
        <Link href="/">Go to Slotwise</Link>
      </Button>
    </main>
  );
}
