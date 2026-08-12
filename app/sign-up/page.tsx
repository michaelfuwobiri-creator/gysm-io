"use client";
import { useState } from "react";
export default function SignUpPage() {
  const [email, setEmail] = useState("");
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FCFCF9] p-8">
      <div className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-xl border">
        <h1 className="text-2xl font-bold mb-6">Create GYSM account</h1>
        <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@email.com" className="w-full p-3 border rounded-xl mb-4" />
        <button onClick={()=>window.location.href='/builder'} className="w-full bg-black text-white p-3 rounded-xl">Create account</button>
      </div>
    </div>
  );
}