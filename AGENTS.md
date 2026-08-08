# Rules for AI Assistants

Read **[The SpiceDice Codex](.kiro/steering/spicedice-codex.md)** before making any
change in this package. It defines the five tenants (fairness, realistic feel,
minimal comments, leverage existing code, SOLID), the design tokens, the
Pits/SSE/PipWorks architecture contracts, and the deferred OCaml plan.

Quick rules:

- All randomness goes through PipWorks (`pipworks.js`) using `crypto.randomInt`.
- Animations must land exactly on the server's result — never show a mismatch.
- Vanilla Node + SSE only. No frameworks, no database, no runtime npm deps.
- Theme colors come from the CSS custom properties in `public/style.css`.
- Run `npm test` (node --test) before declaring any change done.
