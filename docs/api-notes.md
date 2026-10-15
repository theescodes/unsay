# claude.ai API notes

claude.ai's web API is internal and undocumented. This file records what was actually observed,
so the zod schemas in `src/lib/core/schemas.ts`, the fixtures and `FakeClaude` can be checked
against something. Anything not observed is marked as such; the code must not rely on it.

## How this was gathered (2026-10-14 and 15)

- **Read-only probe:** a console script on claude.ai on the maintainer's account (one org, 82
  chats), GET requests only. It reported field names, types, counts and selected headers; no
  titles or ids.
- **Delete test:** the same way, on 3 throwaway chats created for it, after a `confirm()` listing
  their titles. The script did not finish (see "Deleting the open chat" below), so the result was
  reconstructed from which chats were gone afterwards.
- The endpoint paths come from an MIT-licensed console script
  (MatteoLeonesi/bulk-delete-claude-chat); the probe and the delete test confirmed the ones marked
  "observed" below.
- **Follow-up on 2026-10-15,** same account (76 chats by then): read-only console probes that
  printed field names, types and counts plus the paths of claude.ai's own requests in the tab (ids
  blanked), and runs of the extension itself.

## Endpoints

All under `https://claude.ai/api`, same origin as the page, authenticated by the session cookie
(`credentials: 'include'`). A content script's own `fetch` (isolated world, no page script
involved) gets the same session: verified on 2026-10-14 when the panel loaded the real list.

| Request                                                                       | Status   |
| ----------------------------------------------------------------------------- | -------- |
| `GET /organizations`                                                          | observed |
| `GET /organizations/{org}/chat_conversations?limit=100&offset=n`              | observed |
| `GET /organizations/{org}/chat_conversations/{uuid}`                          | observed |
| `GET /organizations/{org}/projects`                                           | observed |
| `POST /organizations/{org}/chat_conversations/delete_many`                    | observed |
| `DELETE /organizations/{org}/chat_conversations/{uuid}`, body `"<uuid>"` JSON | observed |

### Organizations

- A plain JSON array, no `{ data }` wrapper.
- Orgs with claude.ai chats have `"chat"` in `capabilities`; API-only orgs don't.
- The active org is in the `lastActiveOrg` cookie, which page scripts can read.

### Conversation list

- A plain JSON array. `limit` and `offset` are honoured.
- All 82 chats fit in one page of 100, so paging past the first page was **not** observed live;
  only `FakeClaude` exercises it.
- The sort order was not checked. `FakeClaude` assumes the newest activity first, like the
  sidebar.
- Fields per conversation in the morning probe: `uuid`, `name`, `summary`, `model`,
  `created_at`, `updated_at`, `settings`, `is_starred`, `is_archived`, `is_temporary`,
  `project_uuid`, `project`, `session_id`, `workspace_session_id`, `is_multiplayer`,
  `has_assistant_outputs`, `latest_assistant_output_kind`, `last_read_at`, `platform`,
  `current_leaf_message_uuid`, `user_uuid` (`morningConversation` in
  `src/lib/core/testing/fixtures.ts`).
- **By the evening the shape had changed** (two probes a few seconds apart, 81 chats, same
  result), and the extension's first real run stopped on it:
  - `project_uuid`, `session_id` and `user_uuid` are gone;
  - `last_read_at`, `has_assistant_outputs`, `latest_assistant_output_*` and
    `workspace_session_id` appear only on the chats that have a value;
  - `last_settled_at` and `workspace_upgraded` are new;
  - `project` is still there, `null` on every chat.

  `conversation` in the fixtures builds this shape.

- **Project membership** therefore comes from `project_uuid` when present, otherwise from
  `project`: `null` means not in a project, `{ uuid, name }` means that project. The filled shape
  of `project` has never been seen (see "Projects" below), so a shape the schema can't read leaves
  the membership _unknown_: such a chat only matches "any project", never "not in a project" or a
  specific project, so a project filter can't select it by mistake. If `project_uuid` and
  `project` disagree, the extension stops.

### The newer list: `chat_conversations_v2`

- claude.ai's own sidebar lists chats with
  `GET …/chat_conversations_v2?limit=30&offset=0&archived=false&consistency=eventual` (seen in
  the tab's requests on 2026-10-15).
- The answer is an object, `{ data: [...], has_more, search_incomplete }`, not a plain array.
- On 2026-10-15 it held exactly the same 76 chats as the old list. Its items carry
  `project_uuid` again (`null`) next to `project`, plus fields the old list doesn't have
  (`needs_input`, `live_status`, `local_project_id`, …).
- `archived=true` returned no chats on that account, so whether the old list includes archived
  chats is unknown.
- The extension still reads the old list, which answers as before. If claude.ai removes it, the
  extension stops with "claude.ai changed" and deletes nothing; moving to v2 means a new schema
  for the wrapper and paging on `has_more`.

### Single conversation

`GET …/chat_conversations/{uuid}` answers 200 for an existing chat and 404 for a deleted one.
The extension doesn't use it; it was how the delete test was checked.

### Projects

`GET …/projects` is a plain array, empty on the probed account throughout (also in the variants
below). The extension takes project names from the conversations and makes no extra request.

Chats in classic chat projects have still not been observed: the account has none. Projects
created on 2026-10-15 for the test turned out to belong to other parts of claude.ai (next
section).

### Claude Code and Cowork

Both have projects and sessions of their own, kept apart from the chats:

- A **Cowork** project (claude.ai/cowork/projects) with a chat in it.
- A project created from claude.ai's projects page, which opened as a **Claude Code** project
  (`/code/project/chan_…`), with a chat in it that had a message.

On 2026-10-15 neither chat appeared in either conversation list (the count stayed the same), and
`/projects`, `/projects?include_harmony_projects=true` and `/projects_v2` all returned an empty
array. Opening the Code project made no request under `/api/` that a page script could see, so
Claude Code loads its sessions some other way. The extension neither sees nor deletes Code or
Cowork sessions.

### Rate limiting

No response had a header whose name contains `rate` or `retry`. No 429 was provoked, so what
one looks like is unknown. The deleter can only react to a 429 when it comes, and honours
`Retry-After` should one ever carry it.

## Deleting

### `delete_many`

Body `{ "conversation_uuids": [...] }`.

- **An unknown id does not block the known ones.** A batch of one real id plus a random UUID
  deleted the real chat.
- A batch of one id works.
- The response body was not captured (the script died before printing its report), so the
  extension ignores it and decides every outcome by re-reading the list.
- The maximum batch size is unknown. The MIT script sends 100; the extension sends 50.

### Single `DELETE`

Observed on 2026-10-15: the extension deletes the chat open in the tab with this request, on its
own (see below), and on the maintainer's account that chat was gone afterwards. So the JSON-string
body copied from the MIT script works. Status and response body were not captured; the extension
doesn't read them and decides by re-reading the list. Apart from the open chat, it uses this
endpoint as a fallback for a batch that fails outright.

### Deleting the open chat

Deleting the chat that is open in the tab makes claude.ai react in the page. On 2026-10-15, with
the extension on the maintainer's account (claude.ai in German), claude.ai closed the chat and
showed "Diese Sitzung ist nicht mehr verfügbar" ("This session is no longer available"). The page
did not reload: the panel stayed open and showed the done screen.

During the console-script test on 2026-10-14 the page evidently did reload: the console was
cleared and the script's state was gone. Whether claude.ai or the console script caused that is
unclear. A reload would end the content script mid-run, so the deleter still takes that chat
last, alone, after everything else is verified (`SweepOptions.deleteLast`). It costs nothing.

### The sidebar lags

After a delete, claude.ai's sidebar kept listing the deleted chats for a few minutes, even after
a reload, and opening one failed with a 404. The API list was already correct. The extension's
done screen has to say this, or users will think the delete failed.

## Known limits of the list read

The list is read with `limit`/`offset`. If the order changes during a read (a chat gets new
activity and moves to the top), one page can repeat an item and a chat can be skipped.
`listConversations` drops repeats by id. A skipped chat is harmless in the first read of a run
(it is treated as gone and not deleted), but in the verification read it would be reported as
deleted. That needs activity in another tab during the few requests of a re-read, so it is
accepted for now.

## Page integration

- Theme: `<html data-mode="light" | "dark">`; `data-theme` is always `"claude"`.
