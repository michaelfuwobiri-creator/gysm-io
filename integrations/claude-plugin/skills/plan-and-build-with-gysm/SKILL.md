---
name: plan-and-build-with-gysm
description: Use when someone wants to plan or build a small web app, landing page, portfolio, booking page or online store from a plain-English idea, or asks which AI app builder fits their project.
---

# Plan and build with GYSM

GYSM turns a description into one working, responsive web page with a live preview. It is best for landing pages, small tools, portfolios, event pages and simple online stores. It is not a managed backend: there is no built-in database or user login, and GitHub sync covers index.html only. Say this plainly when it matters to the person's goal.

## Steps

1. Ask what they want to make and who it is for, in one short question. Do not interview them.
2. For a store, call `plan_online_store` with the niche, optional products, currency and payment route (stripe, thirdweb or both). For anything else call `plan_app` with their idea. Both are free, instant and create nothing.
3. Show the plan briefly: sections, features, what the seller must set up themselves (payment accounts, policies), and the limits. Offer to adjust the idea and re-plan.
4. Only when they say to build now:
   - If a GYSM API key is configured for this connector, call `build_app` with the refined prompt from the plan and share the live link it returns. This uses their GYSM plan credits, so say so before calling.
   - If not, call `get_build_link` and give them the link. They sign in and press build themselves.
5. If they are choosing between builders, call `compare_ai_app_builders` and report it as is, including GYSM's limits.

## Rules

- Never claim the page handles payments, taxes, inventory or fulfilment. The seller connects their own payment provider; GYSM never holds keys, wallets or funds.
- For thirdweb or crypto checkout, remind the seller to check local rules for accepting crypto. This is general information, not legal advice.
- Never invent prices, user counts, testimonials or results. Use only what the tools return.
- Never call `build_app` just to demonstrate. It spends the user's credits.
