# Chrome Web Store listing

Everything the Chrome Web Store dashboard asks for, kept next to the code it describes. Most of it
has no API and is copied into the dashboard by hand. A pull request that adds a permission or an
origin updates the justifications here, together with the README's permission table.

## Package

Upload `unsay-X.Y.Z-chrome.zip` from the [GitHub release](https://github.com/theescodes/unsay/releases)
of that version: the zip built and attested in CI, never a local build. The store's copy then has
the same files as the release, which anyone can check against the tagged source.

## Store listing

| Field          | Value                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| Title          | From the manifest: `Unsay — bulk-delete your claude.ai chats`                                            |
| Summary        | From the manifest: `Bulk-delete your claude.ai chats with filters. Open source, runs only on claude.ai.` |
| Category       | Productivity › Tools                                                                                     |
| Language       | English                                                                                                  |
| Homepage URL   | `https://github.com/theescodes/unsay`                                                                    |
| Support URL    | `https://github.com/theescodes/unsay/issues`                                                             |
| Mature content | No                                                                                                       |

### Description

```text
Unsay bulk-deletes your claude.ai chats, with filters and a review step.

claude.ai can delete several chats at once, but its "Select all" only covers the chats currently loaded in the list, and there are no filters. Unsay adds a panel on claude.ai that:

• loads your whole chat list, not just the rows on screen
• filters by last activity, title and project, and leaves starred chats alone unless you opt in
• shows you exactly what will be deleted and lets you untick anything
• asks you to type the number of chats to confirm
• deletes in small batches, can be stopped, and then checks that every chat is really gone
• gives you a CSV receipt of what was deleted
• works with several claude.ai accounts and follows claude.ai's light or dark theme

How to use it: open claude.ai, click Unsay's icon in the toolbar, pick your filters, review the list and confirm.

Deleting is permanent: claude.ai can't restore a deleted chat. To keep a copy, export your data from claude.ai's settings first.

PRIVACY
• Runs only on claude.ai and talks only to claude.ai, with the session you are signed in with.
• No analytics, no tracking, no servers of its own, no remote code. Your chat titles never leave your browser.
• Stores nothing: closing or reloading the tab clears everything.

OPEN SOURCE
Unsay is free and open source (GPL-3.0) and ships unminified. Each release is built in public CI from a tagged commit, with a signed build attestation, and the store gets that same zip.
Source, issues and releases: https://github.com/theescodes/unsay

Not covered: Claude Code and Cowork sessions, which claude.ai keeps out of the chat list.

Unsay is not affiliated with or endorsed by Anthropic. "Claude" is a trademark of Anthropic.
```

### Graphic assets

| Field            | File                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------- |
| Store icon       | `public/icon/128.png`                                                                   |
| Screenshots      | `brand/store/screenshot-1-filter.png` … `screenshot-5-accounts-dark.png`, in that order |
| Small promo tile | `brand/store/promo-small.png`                                                           |
| Marquee tile     | `brand/store/promo-marquee.png`                                                         |

`pnpm screenshots` renders the screenshots from the built extension on the browser tests' fake
claude.ai, with invented chats; `pnpm icons` renders the icon and both tiles. Re-render the
screenshots when the panel's look changes, and upload them with the next version.

## Privacy practices

**Single purpose**

```text
Unsay deletes the user's own claude.ai chats in bulk: it lists them in a panel on claude.ai, lets the user filter and review them, and deletes only the chats the user confirms.
```

**Permission justifications.** The manifest asks for no `permissions`. Its only host access is the
content script on claude.ai:

| Asked for                             | Justification                                                                                                                                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host permission `https://claude.ai/*` | `Unsay's panel runs on claude.ai and calls claude.ai's own web API with the user's existing session to list the user's chats and delete the ones they confirm. It runs on no other site and contacts no other server.` |

**Remote code:** No. Everything runs from the package; it loads no scripts and evaluates no code.

**Data usage.** Tick these, because Unsay handles them in the browser, even though none of it
leaves the browser (the store counts local handling too):

| Category                            | What Unsay handles                                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Personally identifiable information | The claude.ai account names it shows in the account picker; claude.ai often puts the user's email in them. |
| Website content                     | Chat titles, ids, dates, starred flags and project names from claude.ai's chat list.                       |

Leave the other categories unticked: Unsay reads no message contents, credentials, payment,
health, location or browsing data. Then certify all three statements: no sale or transfer of
user data to third parties, no use unrelated to the single purpose, no use for creditworthiness or
lending.

**Privacy policy URL:** `https://github.com/theescodes/unsay/blob/main/PRIVACY.md`

## Distribution

Free, public, all regions.

## Test instructions

Not needed: any claude.ai account works, including a free one. If a reviewer asks anyway:

```text
1. Sign in at https://claude.ai with any account (a free account works) and start two or three chats.
2. Click Unsay's icon in the toolbar. A panel opens on claude.ai and loads the chat list.
3. Pick filters, choose "Review", untick anything you want to keep, choose "Continue", type the confirmation shown (for example "delete 3") and choose "Delete".
4. The deleted chats are gone from claude.ai; the panel offers a CSV receipt.
Unsay contacts no server other than claude.ai.
```
