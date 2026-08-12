import Link from 'next/link';
export default function Home(){
 return(
  <div className="min-h-screen bg-white flex flex-col items-center justify-center text-center p-10">
    <h1 className="text-7xl font-black">GYSM.IO</h1>
    <p className="mt-4 text-slate-500">The builder for modern brands.</p>
    <div className="mt-10 flex gap-4">
      <Link href="/builder" className="bg-black text-white px-8 py-4 rounded-full font-bold">Open Builder</Link>
    </div>
  </div>
 )
}
