"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

function AuthInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/builder";

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState("");

  // If already signed in, skip straight through -- this is what lets the
  // landing page send everyone through /auth without needing to know the
  // user's login state itself: /auth?redirect=/builder ...
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        router.replace(redirectTo);
      } else {
        setCheckingSession(false);
      }
    });
  }, [router, redirectTo]);

  async function handleGoogle() {
    setError("");
    const origin = window.location.origin;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?redirect=${encodeURIComponent(redirectTo)}`,
      },
    });
  }

  async function handleEmailAuth() {
    setError("");
    if (!email.trim() || !password.trim()) {
      setError("Enter an email and password.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirectTo)}` },
        });
        if (signUpError) throw signUpError;
        setError("Check your email to confirm your account, then sign in.");
        setMode("signin");
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
        router.replace(redirectTo);
      }
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-[#FCFCF9] flex items-center justify-center">
        <div className="opacity-40 text-sm">Loading…</div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "Inter,sans-serif" }} className="min-h-screen bg-[#FCFCF9] grid md:grid-cols-2">
      <div className="hidden md:flex bg-black text-white p-10 flex-col justify-between relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_0%_0%,rgba(124,58,237,0.4),transparent),radial-gradient(60%_60%_at_100%_100%,rgba(236,72,153,0.3),transparent)]" />
        <div className="relative flex items-center gap-2">
          <div className="h-7 w-7 rounded-[8px] bg-white text-black grid place-items-center font-black">G</div>
          <span className="font-black">GYSM.IO</span>
        </div>
        <div className="relative">
          <h1 className="text-[48px] font-black leading-[0.85] tracking-[-0.04em]">
            Build your
            <br />
            <span className="bg-gradient-to-r from-violet-600 via-fuchsia-500 to-violet-600 bg-clip-text text-transparent">
              empire.
            </span>
          </h1>
        </div>
      </div>

      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold mb-1">{mode === "signup" ? "Create your account" : "Sign in to GYSM"}</h1>
          <p className="text-sm text-gray-500 mb-6">
            {mode === "signup" ? "Already have an account? " : "New here? "}
            <button
              onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
              className="underline font-medium"
            >
              {mode === "signup" ? "Sign in" : "Create one"}
            </button>
          </p>

          <button
            onClick={handleGoogle}
            className="w-full h-12 border rounded-xl font-medium flex items-center justify-center gap-2 mb-4 hover:bg-gray-50"
          >
            Continue with Google
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="h-px bg-gray-200 flex-1" />
            <span className="text-xs text-gray-400">or</span>
            <div className="h-px bg-gray-200 flex-1" />
          </div>

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="w-full p-3 border rounded-xl mb-3"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleEmailAuth()}
            placeholder="Password"
            className="w-full p-3 border rounded-xl mb-4"
          />

          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

          <button
            onClick={handleEmailAuth}
            disabled={loading}
            className="w-full bg-black text-white p-3 rounded-xl font-medium disabled:opacity-50"
          >
            {loading ? "Please wait…" : mode === "signup" ? "Create account" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#FCFCF9]" />}>
      <AuthInner />
    </Suspense>
  );
}
