# Security policy

Unsay deletes data. Bugs that could delete the wrong thing are treated as security
issues, not just bugs.

## Reporting

Please use GitHub's **private vulnerability reporting** on this repository (Security tab →
"Report a vulnerability"). Don't open a public issue for anything below.

You'll get an answer within a few days. Fixes ship as a new release and the advisory is published
once the store has the fixed version.

## Supported versions

Only the latest release gets fixes.

## In scope

- Anything that could delete a chat the user did not select, skip the review/confirmation step,
  or delete starred chats without the user opting in.
- Any data (chat titles, IDs, session cookies) leaving the browser, or reaching an origin other
  than claude.ai.
- Permission creep: a build requesting more than the permissions listed in the README.
- A release zip or store package that does not match the tagged source and its build attestation.
- Supply-chain problems in the dependencies or the release workflow.

## Out of scope

- claude.ai itself. Report those to Anthropic.
- Changes to claude.ai's internal API that make the extension stop working. That's a normal bug.
