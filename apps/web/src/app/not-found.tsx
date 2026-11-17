import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">This page or offer does not exist.</p>
      <Link href="/offers" className="mt-4 inline-block underline">
        Back to offers
      </Link>
    </div>
  );
}
