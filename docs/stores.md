# GYSM Stores (beta)

Online stores built on GYSM: products, Stripe checkout on the seller's own
account, an email to the seller for every paid order, and "bring your own
accounts" for the database (Neon or Supabase), sign-in (Clerk) and shipping
(Shippo). Everything is off until `STORES_ENABLED=true`.

## Turn it on

1. Run `db/migrations/0039_stores.sql` and `0040_store_bookings.sql` and `0041_store_shipping.sql` on the production Neon database.
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

There is no separate store page: the seller does everything by chatting with
the builder agent at `/agent`.

1. "Make me a store for my bakery" -> the agent reads `store_setup_guide`,
   explains which accounts the seller needs, and creates a draft store
   (`store_create`, approved by the seller).
2. The agent adds and edits products (`store_add_product`,
   `store_update_product`, `store_remove_product`).
3. `store_payments_link` gives a one-time link to connect the seller's own
   Stripe account on Stripe's page. Stripe sends them back to the builder.
   Money goes to their account; GYSM never holds it.
4. Optional: `store_connect` connects their own Neon, Supabase, Clerk or
   Shippo account. The seller types the secret in the private approval box,
   GYSM checks it with the provider and stores it encrypted. A verified Neon
   connection on an empty store moves its products and orders into the
   seller's own database.
5. `store_update` with status `live` opens the store. The seller gets an email
   for every paid order and can ask the agent for `store_orders`.

## Bookings

Stores can also take appointments. The agent adds services (`store_add_service`,
with a duration and a price, 0 for free), sets weekly opening hours
(`store_set_hours`, in the store's time zone set with `store_update`), and shows
or cancels bookings (`store_bookings`, `store_cancel_booking`). Customers pick a
service, day and time on the store page. Free bookings are confirmed at once;
paid ones go through Stripe Checkout on the seller's account and hold the slot
for 30 minutes. The seller and the customer both get an email.

## Shipping

`store_set_shipping` sets flat rates customers choose at checkout (Stripe adds
them to the order total), the ship-from address and a default parcel. After an
order is paid, `store_shipping_rates` quotes real carrier rates through the
seller's own Shippo account, and `store_buy_label` buys the label (charged to
their Shippo account, so the seller approves the exact price), saves the
tracking number, marks the order shipped and emails the customer. Sellers
without Shippo use `store_mark_shipped` with any carrier's tracking link.

## Selling through AI assistants

GYSM's public MCP server (`/api/mcp`) offers shoppers three store tools while
`STORES_ENABLED=true`: `find_stores` (search live stores, their products and
services), `get_store` (one store's catalogue, prices, stock, appointments and
shipping options) and `start_checkout` (a Stripe Checkout link for confirmed
items; the shopper pays on Stripe's page into the seller's account). Any
assistant connected to the GYSM connector can use them. Stripe's own Agentic
Commerce Suite is US-only with a waitlist, so it is not used yet.

## Not built yet

Running a store's data on Supabase (keys are checked and saved), customer
sign-in on the storefront with the seller's Clerk keys, live carrier rates at
checkout (checkout uses the seller's flat rates), and refunds (done in the
seller's Stripe dashboard).
