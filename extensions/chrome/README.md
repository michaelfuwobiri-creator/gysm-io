# GYSM Agent for Chrome

A side panel where GYSM Agent can work in your browser: read the page in your
current tab, click, type, scroll and open pages. **You approve every click,
entry and page change.** It never types passwords, card numbers or one-time
codes, and text hidden on a page (invisible, off-screen, zero-size) is not sent
to the agent.

## Install (until it is on the Chrome Web Store)

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and choose this `extensions/chrome` folder
   (or unzip `gysm-chrome-extension.zip` and choose the unzipped folder).
3. Pin **GYSM Agent** from the puzzle-piece menu, then click it on any website
   (or press Ctrl+Shift+G / Cmd+Shift+G).
4. Be signed in to https://www.gysm.io in the same Chrome. The panel uses that
   sign-in; it never sees your password.

The first time it needs a site, it asks "Let GYSM use this site?" — choose
*This site* or *All sites*. You can also right-click a page or selected text and
choose **Ask GYSM**.

## What it can do

- `browser_read` page text plus numbered buttons, links and fields
- `browser_click`, `browser_type` (with optional Enter), `browser_scroll`
- `browser_navigate` in the current tab, `browser_tabs` to list tabs
- Screenshot button: sends a picture of the visible tab with your message
- Plan checklist, questions, file downloads and approvals for the agent's
  other tools (deploying a site, running commands), same as gysm.io/agent

## Working on its own (asks first)

Press **Work on its own** (or let the agent ask). A card lets you choose *only
this site* or *any allowed site* and a step limit (10-100). While it is on,
clicks, typing and moving between pages on those sites run without a prompt,
and a bar shows the steps used with a **Stop/Pause** button. It still stops
and asks before anything labelled buy, pay, order, send, post, publish, delete,
sign out, allow/authorize and the like, before pressing Enter in a non-search
field, and before opening a site you did not allow. It never fills password,
card or one-time-code fields. Closing the panel, **Stop** or **New chat** ends it.

## Files

- `manifest.json`: Manifest V3, side panel, host access to gysm.io; other sites
  are optional and asked for when needed
- `sidepanel.html / .css / .js`: the chat and the approval cards
- `pagetools.js`: runs inside the page (isolated world); reads and acts on the DOM
- `background.js`: toolbar button and right-click menu
- `test/e2e.cjs`: end-to-end check (`node extensions/chrome/test/e2e.cjs`,
  needs Playwright)

## Safety model

- The server only offers the `browser_*` tools to requests marked as coming from
  the extension, and tells the model that page content is untrusted data.
- Every write action shows a card with what will happen and on which site.
  **Stop** declines whatever is waiting.
- Password, card, CVV and one-time-code fields are refused in the page script,
  even if the model asks and the user approves.
- Addresses must be http(s); `javascript:`, `file:` and `chrome:` are refused.
