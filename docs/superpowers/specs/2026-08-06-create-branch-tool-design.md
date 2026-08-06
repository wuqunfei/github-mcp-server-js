# Design: `create_branch` tool

## Summary

Add a new write tool, `create_branch`, to `/src/toolsets/repos.ts`. It creates a new branch in a GitHub repository from an existing branch name or commit SHA, wrapping octokit's `git.createRef` API.

## Motivation

The `repos` toolset currently exposes read tools for branches (`get_branch`, `list_branches`) and one write tool (`create_or_update_file`), but no way to create a new branch. `create_branch` fills that gap using the same conventions already established in the file.

## Scope

In scope:
- One new tool, `create_branch`, registered only in `read-write` permission mode.
- Resolving a source branch name or commit SHA into the SHA needed by `git.createRef`.
- Tests and README updates for the new tool.

Out of scope:
- Creating tag refs or other non-branch ref types.
- Deleting or updating existing refs.
- Defaulting `from` to the repository's default branch when omitted (out of scope — `from` is required).

## Design

### Location

Added to `/src/toolsets/repos.ts`, inside the existing `if (permission === 'read-write')` block, immediately after `create_or_update_file`. No changes needed to `/src/server.ts` — the `repos` toolset is already registered there.

### Input schema

```ts
inputSchema: z.object({
  ...ownerRepoSchema,          // owner, repo
  branch: z.string().describe('Name for the new branch (without refs/heads/ prefix)'),
  from: z.string().describe('Source branch name or commit SHA to create the new branch from'),
})
```

Both `branch` and `from` are required. No default-branch fallback if `from` is omitted — this is deliberately not supported to keep the tool's behavior explicit and avoid an extra implicit API call.

### Behavior

1. Attempt to resolve `from` as a branch name: `octokit.rest.repos.getBranch({ owner, repo, branch: from })`. On success, take `sha = response.data.commit.sha`.
2. If that call fails with HTTP status `404`, treat `from` as a literal commit SHA and use it directly as `sha`.
3. If that call fails with any other error (auth failure, rate limit, network error, etc.), propagate it immediately via `toToolError(error)` — do not fall through to treating `from` as a SHA.
4. Call `octokit.rest.git.createRef({ owner, repo, ref: \`refs/heads/${branch}\`, sha })`.
5. On success, return `toToolResult(response.data)`. On failure, return `toToolError(error)`.

### Error handling

Reuses the existing `toToolError()` helper from `common.ts`, consistent with every other tool in the file. Two realistic failure modes surface to the caller:

- `from` does not resolve to a valid branch or commit (`createRef` returns 422, e.g. "Object does not exist").
- `branch` already exists as a ref (`createRef` returns 422, e.g. "Reference already exists").

The 404-vs-other-error distinction in step 3 matters: octokit's `RequestError` includes a `.status` property. Checking `error.status === 404` specifically (rather than treating any thrown error as "not a branch, try as SHA") prevents a transient 500 or a 401 from being silently reinterpreted, which would otherwise surface a confusing downstream 422 from `createRef` instead of the real underlying error.

### Testing

Add to `/test/unit/toolsets/repos.test.ts`, following the existing `nock` + `vitest` pattern used for `create_or_update_file`:

- Happy path, `from` resolves as a branch name: mock `GET /repos/:owner/:repo/branches/:from` → 200, then `POST /repos/:owner/:repo/git/refs` → 201.
- Happy path, `from` is a raw commit SHA: mock branch lookup → 404, then assert `createRef` is called directly with that SHA (no further lookup).
- Error path: `createRef` fails (e.g. ref already exists) → result has `isError: true`.
- Read-only mode: `create_branch` is not present in `listTools()` output, matching the existing `create_or_update_file` read-only test.

### Documentation

Update `/README.md`:
- Add a row to the `repos` toolset table (after `create_or_update_file`, line ~157):
  ```
  | `create_branch` | W | Create a new branch from an existing branch or commit SHA. |
  ```
- Bump the total tool count on line 144 from **104 tools** to **105 tools**.

## Alternatives considered

- **Raw SHA-only input** (`ref`, `sha` passed straight through to `git.createRef`): simplest, matches the raw API exactly, but pushes branch-to-SHA resolution onto the caller. Rejected in favor of resolving `from` internally for caller convenience.
- **Full ref path input** (e.g. `refs/heads/foo`, `refs/tags/v1`): more general, supports any ref type. Rejected because the tool is scoped to branch creation only (mirrors `create_branch`, not a generic `create_ref`); tag/ref-type support can be added later as a separate tool if needed.
- **Regex-based SHA detection** instead of try-branch-then-404-fallback: avoids an extra API call when `from` is already a SHA, but risks misclassifying a branch name that happens to look like a hex string. Rejected for correctness in favor of the lookup-based approach.
- **Optional `from` defaulting to the repo's default branch**: convenient for the common "branch off main" case, but adds an implicit extra API call and hides behavior. Rejected — `from` is required.
