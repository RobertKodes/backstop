"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid gap-4 py-10" role="alert">
      <h1 className="page-title">This page hit an error</h1>
      <p className="lede">{error.message || "Something went wrong while rendering this page."}</p>
      <p>
        <button type="button" className="btn btn-primary" onClick={reset}>
          Reload this page
        </button>
      </p>
    </div>
  );
}
