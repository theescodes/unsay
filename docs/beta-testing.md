# Testing Unsay on your account

Unsay was built and tested against one claude.ai account. claude.ai's API is undocumented, so an
account unlike that one can get answers Unsay has never seen. A few people trying it on their own
accounts find that out before the Chrome Web Store reviews do. Thanks for being one of them.

## Who helps most

Anyone is welcome, and "it all worked" is a useful report. These accounts answer open questions
([docs/api-notes.md](api-notes.md) has the details):

- **More than 100 chats.** claude.ai sends the list in pages of 100; only a first page has been
  seen so far.
- **Chats in projects** (claude.ai/projects). What claude.ai says about a chat's project has never
  been seen with a project in it.
- **A Team or Enterprise plan, or more than one account** in claude.ai's account switcher.

## What it can do to your account

- Loading the list and opening the diagnostics delete nothing.
- A chat is only deleted after you reviewed it and typed `delete N` to confirm. Starred chats are
  left alone unless you tick "Include starred chats".
- Deleting is permanent: claude.ai can't restore a deleted chat. To keep a copy, claude.ai can
  export your data from its settings first.

## What to try

1. Install the latest release as the [README](../README.md#install-from-a-release) describes.
2. Open claude.ai and click Unsay's icon in the toolbar. Let it load the list.
3. Compare with claude.ai, roughly:
   - the panel's total against your chats on claude.ai/recents;
   - each project's count in the **Project** filter against that project's page;
   - the **Account** list (shown with more than one account) against claude.ai's account
     switcher.
4. Optional, to test deleting: start three throwaway chats with a message each and rename them
   so their titles start with `unsay test`. In the panel, type `unsay test` into **Title
   contains**, review, confirm and delete. Then check claude.ai: the chats are gone (the sidebar
   can take a few minutes to catch up). To test the chat open in the tab, keep one of them open
   while you delete.
5. Choose **Diagnostics** at the bottom left of the panel, read the text, then choose **Copy**.
6. [Open a compatibility report](https://github.com/theescodes/unsay/issues/new?template=compatibility.yml)
   and paste it there. If something went wrong, say what; if not, that is worth knowing too.

## What the diagnostics hold

- The Unsay version, your browser and platform, and the date.
- For each claude.ai account: claude.ai's flags for it (like `chat`), and whether the panel shows
  it, has it selected, and whether claude.ai last had it open.
- Counts: chats loaded, starred, in projects, the number of projects; whether claude.ai sent the
  list newest first.
- The outcome counts of the last run, and the technical details of the last error, with ids
  blanked out.
- For each kind of request Unsay made: how often claude.ai answered with which status, the slowest
  answer, and the names of headers about rate limits.
- The shape of claude.ai's answers: field names, the kind of each value (text, date, id,
  true/false, …) and how many had it.

Never chat titles, chat contents, ids, account or project names, or your email address. The text
stays in the tab until you copy it; Unsay sends nothing anywhere.
