# Privacy policy

Unsay is a browser extension that deletes your claude.ai chats in bulk. This policy says what it
does with your data.

In short: Unsay reads what it needs from claude.ai to show you your chats, deletes the ones you
confirm, and sends nothing anywhere else. Its developer receives no data from it, ever.

Effective 16 October 2026. It applies to Unsay from the Chrome Web Store and from the
[GitHub releases](https://github.com/theescodes/unsay/releases).

## What Unsay reads

Only on claude.ai, only while you use its panel, and only through claude.ai's own web API with the
session you are already signed in with, the same way the claude.ai web app does:

- **Your claude.ai accounts** (claude.ai calls them organizations): their names, ids and the
  flags claude.ai sends with them, so you can pick an account.
- **Which account claude.ai last had open**, from claude.ai's `lastActiveOrg` cookie, so the
  panel starts with that account. Unsay reads no other cookie; your browser attaches claude.ai's
  session cookie to the requests on its own, as it does for claude.ai's own pages.
- **Your chat list**: each chat's title, id, when it was created and last active, whether it is
  starred and which project it is in. This is what the filters and the review list show.

Unsay never reads what is inside your chats, your files, your email address, your payment
details or your claude.ai settings.

## What Unsay does with it

- It shows it to you in its panel and filters it the way you choose.
- It deletes the chats you reviewed and confirmed, by asking claude.ai to delete them, and then
  reloads the list to check they are gone.
- It keeps everything in the memory of the claude.ai tab. Closing or reloading the tab clears it.
  Unsay writes nothing to your browser's storage and has no storage permission.

## What leaves your browser

Nothing, except the requests to claude.ai described above. Unsay has no servers, no analytics, no
crash reporting, no advertising and no third-party services, and it loads no code from the
internet.

Two things are saved or shared only when you ask for them:

- **The receipt.** After a deletion you can download a CSV with each chat's outcome, title, dates
  and id. Your browser saves it on your computer; Unsay keeps no copy.
- **The diagnostics.** The panel's Diagnostics view describes claude.ai's answers by field
  names, kinds of values and counts, for bug reports. It holds no chat titles, ids, account or
  project names and no email address. It stays in the tab unless you copy it. If you paste it
  into a GitHub issue, GitHub's privacy policy applies to that issue.

## Permissions

Unsay runs on `https://claude.ai/*` and nowhere else, and asks for no other browser permission.
The [README](README.md#permissions) lists every part of its manifest and why it is there.

## Checking this

Unsay is open source under GPL-3.0 and ships unminified. Every release is built in public CI from
a tagged commit and carries a build attestation, so you can check that what you install is the
code in this repository.

## Changes

Changes to this policy are made in this file, and its history on GitHub shows each one. A change
that lets more data leave your browser would come with a new release and a note in its changelog.

## Contact

Questions about this policy: open an issue at
[github.com/theescodes/unsay/issues](https://github.com/theescodes/unsay/issues). For anything you
don't want to discuss in public, use private reporting on the repository's
[Security tab](https://github.com/theescodes/unsay/security).
