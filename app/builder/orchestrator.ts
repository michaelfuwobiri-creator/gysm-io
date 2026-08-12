export function generateApp(prompt: string){
  const p = prompt.toLowerCase();
  let type = 'custom';
  if(p.includes('food') || p.includes('eat') || p.includes('restaurant') || p.includes('jollof') || p.includes('lagos')) type='food';
  else if(p.includes('uber') || p.includes('ride') || p.includes('taxi') || p.includes('dog') || p.includes('walk') || p.includes('gps') || p.includes('map') || p.includes('delivery')) type='ride';
  else if(p.includes('dating') || p.includes('tinder') || p.includes('match') || p.includes('founder') || p.includes('zodiac')) type='dating';
  else if(p.includes('clinic') || p.includes('doctor') || p.includes('health')) type='clinic';
  else if(p.includes('shop') || p.includes('store')) type='shop';
  const words = prompt.trim().split(/\s+/).slice(0,4);
  const appName = words.map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ') || 'My App';
  let pages: string[] = [];
  if(type==='food') pages=['Restaurants','Menu','Cart','Orders'];
  else if(type==='ride') pages=['Map','Drivers','Ride','History'];
  else if(type==='dating') pages=['Discover','Matches','Chat','Profile'];
  else if(type==='clinic') pages=['Doctors','Schedule','Records','Chat'];
  else if(type==='shop') pages=['Products','Cart','Orders','Account'];
  else pages=['Home','Features','Pricing','Dashboard'];
  return { appName, type, pages, prompt };
}
