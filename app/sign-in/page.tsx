"use client";
import { useState } from "react";
export default function SignInPage() {
  const [email, setEmail] = useState("");
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FCFCF9] p-8">
      <div className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-xl border">
        <h1 className="text-2xl font-bold mb-6">Sign in to GYSM</h1>
        <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@email.com" className="w-full p-3 border rounded-xl mb-4" />
        <button onClick={()=>alert("Clerk not connected yet - add real keys to enable auth")} className="w-full bg-black text-white p-3 rounded-xl">Continue</button>
        <p className="text-xs text-gray-500 mt-4">Temp login until Clerk keys added</p>
      </div>
    </div>
  );
}