# claude.ai API notes

claude.ai's web API is internal and undocumented. This file records what was actually observed,
so the zod schemas in `src/lib/core/schemas.ts`, the fixtures and `FakeClaude` can be checked
against something. Anything not observed is marked as such; the code must not rely on it.

## How this was gathered (2026-10-14)

- **Read-only probe:** a console script on claude.ai on the maintainer's account (one org, 82
  chats), GET requests only. It reported field names, types, counts and selected headers; no
  titles or ids.
- **Delete test:** the same way, on 3 throwaway chats created for it, after a `confirm()` listing
  their titles. The script did not finish (see "Deleting the open chat" below), so the result was
  reconstructed from which chats were gone afterwards.
- The endpoint paths come from an MIT-licensed console script
  (MatteoLeonesi/bulk-delete-claude-chat); the probe and the delete test confirmed the ones marked
  "observed" below.

## Endpoints

All under `https://claude.ai/api`, same origin as the page, authenticated by the session cookie
(`credentials: 'include'`). A content script's own `fetch` (isolated world, no page script
involved) gets the same session: verified on 2026-10-14 when the panel loaded the real list.

| Request                                                                       | Status         |
| ----------------------------------------------------------------------------- | -------------- |
| `GET /organizations`                                                          | observed       |
| `GET /organizations/{org}/chat_conversations?limit=100&offset=n`              | observed       |
| `GET /organizations/{org}/chat_conversations/{uuid}`                          | observed       |
| `GET /organizations/{org}/projects`                                           | observed       |
| `POST /organizations/{org}/chat_conversations/delete_many`                    | observed       |
| `DELETE /organizations/{org}/chat_conversations/{uuid}`, body `"<uuid>"` JSON | **unverified** |

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
  `project`: `null` means not in a project, `{ uuid, name }` means that project. The filled
  shape of `project` has never been seen (the probed account has no projects), so a shape the
  schema can't read leaves the membership _unknown_. A chat with unknown membership only matches
  "any project", never "not in a project" or a specific project, so a project filter can't
  select it by mistake. If `project_uuid` and `project` disagree, the extension stops.

### Single conversation

`GET …/chat_conversations/{uuid}` answers 200 for an existing chat and 404 for a deleted one.
The extension doesn't use it; it was how the delete test was checked.

### Projects

`GET …/projects` is a plain array (empty on the probed account). Conversations carry their
project, so the extension takes project names from there and makes no extra request.

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

Not verified: the delete test died before it reached this step. The JSON-string body is copied
from the MIT script. The extension uses this endpoint only as a fallback for a batch that fails
outright, and the verification re-read catches it if it doesn't work.

### Deleting the open chat

Deleting the chat that is open in the tab makes claude.ai react in the page (a notice that a new
session is being started). During the delete test the page then evidently reloaded: the console
was cleared and the script's state was gone. A content script would die the same way mid-run. So the deleter takes that chat last, alone, after everything else is
verified (`SweepOptions.deleteLast`).

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
