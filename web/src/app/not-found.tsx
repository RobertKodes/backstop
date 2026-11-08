import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid gap-4 py-10">
      <h1 className="page-title">Page not found</h1>
      <p className="lede">There is nothing at this address.</p>
      <p>
        <Link className="link" href="/">
          Go to live offers
        </Link>
      </p>
    </div>
  );
}
