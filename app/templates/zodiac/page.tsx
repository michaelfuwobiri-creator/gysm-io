import Link from 'next/link';
export default function Page(){
  return (
    <div className='min-h-screen bg-black text-white p-8'>
      <Link href='/' className='text-white/50 text-sm'>← Back to GYSM.IO</Link>
      <div className='max-w-5xl mx-auto mt-20'>
        <div className='inline-flex bg-white/10 px-3 py-1 rounded-full text-xs'>TEMPLATE • zodiac</div>
        <h1 className='text-6xl font-black mt-6 capitalize'>zodiac Template</h1>
        <p className='text-white/60 mt-4 text-xl'>This is a premium dark template for zodiac apps. Fully editable in builder.</p>
        <Link href='/builder' className='inline-block mt-8 bg-white text-black px-8 py-3 rounded-full font-bold'>Open in Builder →</Link>
        <div className='mt-16 grid grid-cols-3 gap-4'>
          <div className='bg-zinc-900 border border-white/10 p-6 rounded-2xl h-32'/>
          <div className='bg-zinc-900 border border-white/10 p-6 rounded-2xl h-32'/>
          <div className='bg-zinc-900 border border-white/10 p-6 rounded-2xl h-32'/>
        </div>
      </div>
    </div>
  )
}
