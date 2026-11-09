# VOIIE end-to-end test (your own address only)

Run AFTER: (1) git push + Vercel deploy is READY, (2) Resend shows gysm.io "Verified" (see VOIIE-SETUP.md).
Sign in at https://www.gysm.io/voiie as the owner account, open DevTools console (F12) and paste step by step.

```js
// 1. create a test lead that goes to YOUR inbox (platform "manual" is not region-gated)
const r = await fetch('/api/voiie/leads',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({handle:'e2e-test-'+Date.now(),platform:'manual',displayName:'E2E Test Bakery',
  contactEmail:'michaelfuwobiri@gmail.com',signal:'e2e test'})}).then(r=>r.json()); console.log(r); window.LID=r.id;

// 2. send the first touch (goes only to michaelfuwobiri@gmail.com)
console.log(await fetch('/api/voiie/outreach/'+LID,{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({channel:'email'})}).then(r=>r.json()));
```
3. Open the email -> "Show original": SPF, DKIM, DMARC must all say PASS. Click the /start link, answer the 4 questions.
4. Within ~2 minutes a second email arrives: "Your free demo for ... is ready" with the demo link and a Stripe link
   (Starter $79.99). Open the Stripe link and confirm the price, then CLOSE it without paying.
5. Click "Unsubscribe" in the footer: a confirm page appears (so mail-security scanners cannot opt people out by prefetching); press "Yes, unsubscribe me" and it says "You're unsubscribed". Then repeat step 2 for the same lead:
   it must answer "This lead is marked do-not-contact."
Expected failure today: step 2 returns "Resend rejected the email ... domain is not verified" until Resend DNS is done.
