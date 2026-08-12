export function generateApp(prompt: string) {
  const lower = prompt.toLowerCase()
  let type = 'clinic'
  if (lower.includes('zodiac') || lower.includes('horoscope') || lower.includes('astro')) type = 'zodiac'
  if (lower.includes('agency') || lower.includes('portfolio') || lower.includes('brand')) type = 'agency'
  if (lower.includes('payment') || lower.includes('stripe') || lower.includes('saas') || lower.includes('finance')) type = 'stripe'
  if (lower.includes('food') || lower.includes('delivery') || lower.includes('restaurant')) type = 'restaurant'
  if (lower.includes('fitness') || lower.includes('gym')) type = 'fitness'
  const getPages = (t:string) => {
    const m:any = { clinic: ['Home','Services','Doctors','Booking','Dashboard'], zodiac: ['Daily','Birth Chart','Compatibility'], agency: ['Work','About','Services'], stripe: ['Dashboard','Transactions','Customers'], restaurant: ['Menu','Orders','Tracking','Admin'], fitness: ['Workouts','Progress','Coaches'] }
    return m[t] || m.clinic
  }
  return { appName: prompt.split(' ').slice(0,3).join(' ') + ' App', type, pages: getPages(type), database: [{name:'users', fields:['id','email']},{name:`${type}_data`, fields:['id','content']}], prompt }
}
