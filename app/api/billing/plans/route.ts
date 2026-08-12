export async function GET(){
  return Response.json({
    plans: [
      { id:'starter', name:'Starter', price:29, currency:'eur', credits:15000, builds:30, perDay:'1 per day' },
      { id:'agency', name:'Agency', price:300, currency:'eur', credits:150000, builds:300, display:'Unlimited*', note:'*Fair use 300/mo' },
      { id:'credits_10', name:'PAYG 10 builds', price:10, currency:'usd', credits:5000, builds:10, type:'one_time' },
      { id:'credits_30', name:'PAYG 30 builds', price:25, currency:'usd', credits:15000, builds:30, type:'one_time' }
    ]
  })
}
