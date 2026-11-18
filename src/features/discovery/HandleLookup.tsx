"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";

const HANDLE_PATTERN = /^[a-z0-9._]{1,30}$/;

export function HandleLookup() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const handle = value.trim().replace(/^@/, "").toLowerCase();

    if (!HANDLE_PATTERN.test(handle)) {
      setError("Enter a valid Instagram username: letters, numbers, dots, or underscores.");
      return;
    }

    setError("");
    router.push(`/profile/${encodeURIComponent(handle)}`);
  };

  return (
    <form onSubmit={submit} noValidate className="w-full md:w-96">
      <label htmlFor="handle" className="sr-only">
        Instagram username
      </label>
      <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/15 focus-within:ring-indigo-400">
        <span className="text-sm text-slate-300" aria-hidden="true">
          @
        </span>
        <input
          id="handle"
          name="handle"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="username"
          className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-400"
        />
        <button
          type="submit"
          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-400"
        >
          Analyze
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-rose-200">
          {error}
        </p>
      ) : null}
      <p className="mt-2 text-xs leading-relaxed text-slate-400">
        Username-only lookup reads Instagram&apos;s public profile page. No API keys or Meta app
        required. Private accounts show follower counts only.
      </p>
    </form>
  );
}
