# Security Policy

## Supported versions

Clawtask is currently pre-1.0 and self-hosted. Security fixes are made on `main` first.

## Reporting a vulnerability

Please do not open a public GitHub issue for security reports.

Report privately to:

- Johnny Halife: johnny@southworks.com

Include:

- Affected version or commit
- Deployment shape, if relevant
- Steps to reproduce
- Impact
- Suggested fix, if known

## Security model

Clawtask is designed for private-network or Tailscale deployment.

Important boundaries:

- Single-user app; no public multi-user authentication model.
- Agent API keys are shown once and stored hashed in SQLite.
- The OpenClaw gateway URL is configured locally.
- Do not expose Clawtask directly to the public internet without adding an authentication and authorization layer.

## Known limitations

- Cancelling an agent task resets Clawtask state but does not forcibly interrupt an already-running agent turn.
- If an agent crashes before marking a task done, the task can remain `in_progress` until manually cancelled or updated.
