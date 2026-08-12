export function AppPreview({ project }: { project: any }){
  const type = project.type;
  if(type==='food') return (
    <div className='w-full max-w-sm mx-auto bg-white text-black rounded- overflow-hidden shadow-2xl'>
      <div className='bg-black text-white p-6'><div className='font-black text-xl'>🍔 {project.appName}</div><div className='text-xs opacity-60'>Lagos • 20 min delivery</div></div>
      <div className='p-4 space-y-3'>
        {['Jollof Rice - ₦3,500','Shawarma - ₦2,800','Burger - ₦4,200'].map(i=><div key={i} className='flex justify-between p-3 bg-zinc-100 rounded-xl'><span className='text-sm font-bold'>{i}</span><button className='bg-black text-white px-3 py-1 rounded-full text-xs'>+</button></div>)}
      </div>
      <div className='p-4'><div className='bg-[#BFFF00] text-black text-center py-3 rounded-full font-bold'>Checkout • ₦10,500</div></div>
    </div>
  )
  if(type==='ride') return (
    <div className='w-full max-w-sm mx-auto bg-white text-black rounded- overflow-hidden shadow-2xl'>
      <div className='h-64 bg-zinc-900 relative'><div className='absolute inset-0 flex items-center justify-center text-white/20 text-6xl'>🗺️ MAP</div><div className='absolute bottom-4 left-4 right-4 bg-white p-3 rounded-xl shadow'><div className='font-bold text-sm'>Driver 2 min away</div><div className='text-xs opacity-60'>Toyota Corolla • ABJ 123XY</div></div></div>
      <div className='p-4'><div className='bg-black text-white text-center py-3 rounded-full font-bold'>Track Live</div></div>
    </div>
  )
  if(type==='dating') return (
    <div className='w-full max-w-sm mx-auto bg-zinc-900 text-white rounded- overflow-hidden border border-white/10'>
      <div className='h- bg-gradient-to-b from-purple-600 to-black p-6 flex flex-col justify-end'><div className='text-3xl font-black'>Sarah, 24</div><div className='text-sm opacity-70'>92% match • 2km away</div><div className='flex gap-2 mt-4'><div className='flex-1 bg-white text-black py-3 rounded-full text-center font-bold'>❤️</div><div className='flex-1 bg-white/20 py-3 rounded-full text-center'>✕</div></div></div>
    </div>
  )
  return (
    <div className='w-full max-w-2xl bg-zinc-900 rounded-[1.5rem] border border-white/10 p-8'>
      <h2 className='text-2xl font-black text-white'>{project.appName}</h2><div className='text-xs text-white/50 mt-1 capitalize'>{type}</div>
      <div className='grid grid-cols-2 gap-3 mt-6'>{project.pages.map((p:string)=><div key={p} className='bg-black border border-white/10 rounded-xl p-6'><div className='font-bold text-white'>{p}</div><div className='text-xs text-white/40 mt-2'>Auto-generated</div></div>)}</div>
    </div>
  )
}
