'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'

export default function BuilderPage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  
  useEffect(() => {
    supabase.auth.getUser().then(({data}) => {
      if(!data.user) {
        router.push('/auth?redirect=/builder')
      } else {
        setUser(data.user)
      }
      setLoading(false)
    })
  }, [])

  if(loading) return <div className="p-20 text-center">Loading builder...</div>
  if(!user) return <div className="p-20 text-center">Redirecting to login...</div>

  return (
    <div className="min-h-screen p-6 bg-[#0a0a0a] text-white">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Builder</h1>
        <p className="text-gray-400 mb-8">Logged in as {user.email}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border border-white/10 rounded-xl p-6">
            <h2 className="font-semibold mb-4">Generate Website</h2>
            <textarea id="prompt" placeholder="Describe your website..." className="w-full h-32 bg-black border border-white/10 rounded p-3 text-sm"></textarea>
            <button onClick={() => alert('Generate API will be wired next')} className="mt-4 w-full bg-white text-black py-3 rounded font-medium">Generate</button>
          </div>
          <div className="border border-white/10 rounded-xl p-6">
            <h2 className="font-semibold mb-2">Preview</h2>
            <div className="h-32 bg-white/5 rounded flex items-center justify-center text-gray-500 text-sm">Your site will appear here</div>
          </div>
        </div>
      </div>
    </div>
  )
}
