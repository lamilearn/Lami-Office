# Security

## Reporting

Do not open a public issue for a vulnerability. Report it privately to the
repository owner (`lamilearn` on GitHub) with:

- what you can reach (URL, endpoint, or file path)
- what you got that you should not have
- steps to reproduce

You will get an acknowledgement, and credit in the fix commit if you want it.

## Threat model

Two kinds of traffic reach this service, and they are treated differently
because they have different trust levels.

| Traffic | Arrives via | Trusted? | What it can do |
|---|---|---|---|
| Public visitors | Cloudflare tunnel, carries `CF-Connecting-IP` / `CF-Ray` | No | Read `GET` endpoints, send one `POST /api/chat` per rate-limit window |
| LAN hosts | Direct connection from `trusted_networks` | Yes | `POST /api/event` ingest, `POST /api/a2a/send` |

Everything in `Handler` is written against that split:

- `Handler.is_public()` keys off the Cloudflare headers. A request through the
  tunnel can never be treated as LAN traffic by claiming a private source IP,
  because the header is checked first.
- `POST /api/a2a/send` rejects public traffic *and* then requires a trusted
  host. Both checks are there so neither is a single point of failure.
- `handle_chat()` treats the visitor's text as untrusted input. It is length
  capped, rate limited per IP, budget capped per day, and the prompt explicitly
  tells the agent to answer read-only without running tools.

## Secrets

Nothing sensitive is committed. The rules that make that true:

| Where | Tracked? | Holds |
|---|---|---|
| `.env.example` | yes | placeholders only |
| `.env.production`, `.env.development` | yes | non-secret config; secret keys are empty |
| `.env.production.secrets`, `.env.development.secrets` | **no** (`.gitignore`) | `A2A_SECRET`, `A2A_PEER_TOKENS` |

Compose is always invoked with both files:

```bash
docker compose --env-file .env.production --env-file .env.production.secrets up -d
```

`.gitignore` lists the negations for the tracked profiles *before* the
`.env.*.secrets` rule. Git applies the last matching rule, so the order matters —
reversing it silently lets the secrets file back in.

## Redaction

Before any text leaves the process, `sanitize_event()` runs it through
`clean_text()`, which strips URLs, email addresses, Windows and Unix file paths,
`${ENV_VAR}` references, and anything matching the token patterns in
`_SECRETS` (OpenAI keys, GitHub tokens, Slack tokens, and so on). The event
schema is also an allow-list: unknown keys and unknown event types are dropped,
not passed through.

If an operator needs an extra pattern redacted, `extra_redact` in `config.json`
takes a list of regexes.

## Known gaps

These are real and not yet fixed. Listed so nobody assumes they are covered.

- **Git history still contains a rotated secret.** `.env.development.secrets`
  was committed in an earlier revision. The file was removed from the tree and
  the tokens were rotated, but the old value remains in `origin/master`'s
  history until the branch is force-pushed. GitHub branch protection blocks
  that, so it is an open action.
- **No TLS between the office and the A2A peers.** They talk plain HTTP over the
  LAN, authenticated with a bearer token. An attacker on the LAN segment can
  read it.
- **Chat rate limiting is per IP.** Cloudflare forwards `CF-Connecting-IP`, so
  one visitor behind a shared NAT shares a budget with everyone else on it.
