# GYSM Stores (beta)

Online stores built on GYSM: products, Stripe checkout on the seller's own
account, an email to the seller for every paid order, and "bring your own
accounts" for the database (Neon or Supabase), sign-in (Clerk) and shipping
(Shippo). Everything is off until `STORES_ENABLED=true`.

## Turn it on

1. Run `db/migrations/0039_stores.sql` on the production Neon database.
2. In Stripe (live and test), enable **Connect** for the GYSM platform account.
3. In Stripe, add a webhook endpoint for **events on connected accounts**:
   `https://www.gysm.io/api/webhooks/stripe-connect` with
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.expired` and `account.updated`.
4. Set these in Vercel, then redeploy:

| Variable | Value |
| --- | --- |
| `STORES_ENABLED` | `true` |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | the signing secret of the Connect webhook above |
| `BACKEND_ENCRYPTION_KEY` | already set if Supabase connect works; encrypts sellers' keys |
| `STORES_ROOT_DOMAIN` | optional, `gysm.store`, once `*.gysm.store` points at this Vercel project |
| `STORES_APPLICATION_FEE_BPS` | optional platform fee in basis points (100 = 1%); default 0 |

Without `STORES_ROOT_DOMAIN`, stores live at `https://www.gysm.io/shop/<slug>`.
A wildcard domain on Vercel needs the domain's nameservers on Vercel.

## How a seller gets selling

1. `/stores` → create a store (draft).
2. Add products.
3. **Connect Stripe**: the seller signs up or in on Stripe's own page. Money goes
   to their account; GYSM never holds it.
4. Optional: under **Your accounts**, paste keys for their own Neon, Supabase,
   Clerk or Shippo. GYSM checks each key with the provider and stores it
   encrypted. A verified Neon connection on an empty store moves its products
   and orders into the seller's own database.
5. **Open store**.

The GYSM agent can do steps 1, 2 and 4 for the seller (`store_setup_guide`,
`store_create`, `store_add_product`, `store_connect`, `store_status`); the
seller always types secrets themselves and approves each step.

## Not built yet

Running a store's data on Supabase (keys are checked and saved), customer
sign-in on the storefront with the seller's Clerk keys, Shippo rates and labels
at checkout, booking pages, and refunds from the dashboard.
