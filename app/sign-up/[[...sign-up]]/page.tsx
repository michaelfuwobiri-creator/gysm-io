import { SignUp } from "@clerk/nextjs";

// Item #9 of GYSM_IO_HANDOFF.md asks for "Cloudflare Turnstile captcha on
// signup" -- flagging why that isn't implemented as custom code here.
// <SignUp /> below is Clerk's own hosted UI component: this page has no
// form fields of its own to attach a Turnstile widget to, and there's no
// supported way to inject one into Clerk's rendered form short of
// rewriting this whole flow with Clerk Elements (their headless/"bring
// your own UI" primitives) -- a much larger change than this item calls
// for. The real equivalent that's actually reachable without a rewrite:
// Clerk Dashboard -> Configure -> Attack Protection -> "Bot sign-up
// protection", which runs Cloudflare Turnstile itself, invisibly, in
// front of every sign-up on this <SignUp /> component -- a toggle, not
// code. Turn it on there rather than looking for it in this file.
export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignUp />
    </div>
  );
}
