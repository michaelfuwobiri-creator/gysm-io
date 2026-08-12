import { NextRequest, NextResponse } from "next/server";

const BEAUTY_PROMPT = `
You are GYSM.IO Builder - generate BEAUTIFUL production single-file React apps.

MANDATORY:
- Output ONLY JSX code: const App = () => { return (...) } export default App
- No markdown, no explanation
- PRICE TAG REQUIRED: every product/card MUST have price:number and tag:string like "$14.99" and display as badge + button
- Block Builder: each section is a block: Header block, Hero block, Grid block, Cart block, Footer block - use rounded-[24px] border shadow
- Interactive: useState for cart, favs, search, category filter, quantity +/-, checkout modal
- Tailwind only, use https://picsum.photos/seed/NAME/400/300 for images
- BUG FIX: if dishes.map(dish => ...) NEVER use item.name, always use dish.name
- Premium dark mode, glass, rounded-2xl, hover effects
- For food apps, dishes = [{id, name, price, tag, description, image, cat}]
- Beautiful apps = cart drawer, fav hearts, search input, category pills, total price
`;

export async function POST(req: NextRequest){
  try{
    const { prompt } = await req.json();
    if(!prompt) return NextResponse.json({error:"No prompt"}, {status:400});

    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    let code = "";

    if(geminiKey){
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({contents:[{parts:[{text: BEAUTY_PROMPT + "\nUser request: " + prompt}]}]})
      });
      const data = await res.json();
      code = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } else if(openaiKey){
      const res = await fetch("https://api.openai.com/v1/chat/completions",{
        method:"POST",
        headers:{ "Authorization": "Bearer " + openaiKey, "Content-Type":"application/json" },
        body: JSON.stringify({
          model:"gpt-4o-mini",
          messages:[{role:"system", content:BEAUTY_PROMPT},{role:"user", content:prompt}],
          temperature:0.8
        })
      });
      const data = await res.json();
      code = data.choices?.[0]?.message?.content || "";
    }

    if(!code){
      // FALLBACK beautiful food app with price tags
      code = `
import React, { useState } from 'react';
const App = () => {
  const [cart, setCart] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const dishes = [
    { id: 1, name: "Margherita Pizza", price: 14.99, tag: "$14.99", description: "Classic Italian pizza with fresh tomatoes, mozzarella, basil.", image: "https://picsum.photos/seed/pizza1/400/300", cat: "Pizza" },
    { id: 2, name: "Sushi Platter", price: 24.5, tag: "$24.50", description: "Assortment of fresh sushi rolls and sashimi.", image: "https://picsum.photos/seed/sushi2/400/300", cat: "Sushi" },
    { id: 3, name: "Caesar Salad", price: 11.0, tag: "$11.00", description: "Crisp romaine, croutons, Caesar dressing.", image: "https://picsum.photos/seed/salad3/400/300", cat: "Salad" },
    { id: 4, name: "Cheeseburger", price: 13.99, tag: "$13.99", description: "Juicy beef patty with cheese, lettuce, tomato.", image: "https://picsum.photos/seed/burger4/400/300", cat: "Burger" },
    { id: 5, name: "Pasta Carbonara", price: 16.99, tag: "$16.99", description: "Creamy pasta with pancetta, eggs, parmesan.", image: "https://picsum.photos/seed/pasta5/400/300", cat: "Pasta" },
    { id: 6, name: "Chocolate Cake", price: 8.5, tag: "$8.50", description: "Rich moist chocolate cake.", image: "https://picsum.photos/seed/cake6/400/300", cat: "Dessert" },
  ];
  const filtered = dishes.filter(d => (cat==="All"||d.cat===cat) && d.name.toLowerCase().includes(q.toLowerCase()));
  const add = (d:any) => setCart(p => { const f=p.find(x=>x.id===d.id); return f? p.map(x=>x.id===d.id?{...x,qty:x.qty+1}:x) : [...p,{...d,qty:1}]; });
  const total = cart.reduce((s,i)=>s+i.price*i.qty,0).toFixed(2);
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex justify-between items-center bg-white/[0.06] border border-white/10 rounded-[24px] p-4">
          <h1 className="font-black tracking-tighter text-xl">DELICIOUS FOOD • BLOCK BUILDER</h1>
          <div className="bg-white text-black px-4 py-2 rounded-full font-bold text-sm">🛒 {cart.reduce((a,b)=>a+b.qty,0)} • \${total}</div>
        </div>
        <div className="mt-6 flex gap-2 flex-wrap">
          {["All","Pizza","Sushi","Salad","Burger","Pasta","Dessert"].map(c=>(
            <button key={c} onClick={()=>setCat(c)} className={\`px-4 py-2 rounded-full text-sm font-bold \${cat===c?"bg-white text-black":"bg-white/10"}\`}>{c}</button>
          ))}
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search..." className="ml-auto bg-white/10 border border-white/10 rounded-full px-4 h-9 text-sm outline-none" />
        </div>
        <div className="mt-6 grid md:grid-cols-3 gap-5">
          {filtered.map(dish => (
            <div key={dish.id} className="bg-white text-black rounded-[24px] overflow-hidden group hover:shadow-2xl transition">
              <div className="relative">
                <img src={dish.image} alt={dish.name} className="w-full h-48 object-cover group-hover:scale-105 transition duration-500" />
                <span className="absolute top-3 left-3 bg-black text-white text-xs font-black px-3 py-1 rounded-full">{dish.tag}</span>
              </div>
              <div className="p-5">
                <h3 className="font-bold">{dish.name}</h3>
                <p className="text-xs opacity-60 mt-1">{dish.description}</p>
                <button onClick={()=>add(dish)} className="mt-4 w-full h-10 bg-black text-white rounded-full font-bold text-sm">Add • {dish.tag}</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
export default App;
`;
    }

    code = code.replace(/```(?:jsx|tsx|javascript|ts)?\n?/g,"").replace(/```/g,"").trim();
    if(code.includes("dishes") && code.includes("item.")){
      code = code.replace(/\bitem\b/g, "dish");
    }
    // Fix missing price
    if(prompt.toLowerCase().includes("food") && !code.includes("tag")){
      code = code.replace(/price:\s*\d+/g, (m)=> m + `, tag: "$${m.split(":")[1].trim()}"`);
    }

    return NextResponse.json({ code });
  }catch(e:any){
    return NextResponse.json({error:e.message}, {status:500});
  }
}