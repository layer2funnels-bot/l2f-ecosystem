# 02 · Auth screens
File: `02-auth.html` · Status: approved with changes, applied

**Coverage check (your 7 states):** sign in ✓ · sign up ✓ · check email ✓ · reset password: request ✓ and set new ✓ (two screens, so 8 screens in the file) · accept invitation ✓ · no workspace yet ✓ · session expired ✓.

Shell: neutral, no organization yet. Brand line "Layer2Funnels + Aurj" with the plate-stack mark. Accept-invitation switches to the inviting organization's theme.

| Screen | Fields and buttons | Key copy |
|---|---|---|
| Sign in | Email, Password (show/hide), Continue with Google, Forgot password?, Sign in, Create an account | "Sign in" · "Use the email you were invited with." · Wrong login: "That email and password don't match. Try again, or reset your password." (never says which is wrong) · Footer: "Signing in on its own doesn't give you access to any organization. Membership is by invitation." |
| Sign up | Full name, Email, Password, Create account, Sign in | Notice: "Creating an account doesn't give you access to any organization. You still need an invitation." Hint "At least 10 characters. A few random words works well." |
| Check email | Resend email (30s countdown), Use a different email | "Confirm your email" / "We sent a link to …" · After a reset request: "If an account exists for … you'll get a reset link shortly." (same text whether or not the account exists) |
| Reset: request | Email, Send reset link, Back to sign in | "Reset your password" |
| Reset: set new | New password, Confirm, live rules (10+ characters, both match), Save new password | Success: "Password updated" + Sign in |
| Accept invitation | Accept invitation, Decline (confirm dialog), Sign out, compare-colours link (prototype only) | "Tabish Riaz invited you to join Aurj as an Editor." · "Signed in as … This invitation was sent to that email. Accepting adds you to Aurj only." |
| No workspace yet | Check for invitations, Sign out | "You're signed in, but not in an organization yet" · steps 1–3 · result "No invitations yet. We checked just now." Shows no organization data and no switcher. |
| Session expired | Email (read-only), Password, Sign in and go back, Use a different account | "Your session ended" · "Sign in again and we'll take you back to Projects in Layer2Funnels." · Warning "Changes you hadn't saved may not be kept." |

Behaviour: labels always visible; errors sit under the field and are announced (role=alert) and focus moves to the field; autocomplete attributes set; password toggle has a label and pressed state; targets ≥44px; one column at every width; reduced motion removes fades. Google sign-in button shows a note until go-live.

Tokens: `--primary --tint --success(-tint) --warn(-tint,-text) --danger(-tint) --control-border --panel --shell`; display font per theme.

Open assumptions: A12.
