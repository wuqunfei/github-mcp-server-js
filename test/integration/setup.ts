// Integration setup. Unlike test/setup.ts we do NOT disable net-connect —
// these tests intentionally hit the real GitHub API. Individual suites
// self-skip when GITHUB_TOKEN is missing.
