# Security Policy

Supo is currently in alpha. Please treat the repository and deployed app as an early product under active development.

## Reporting Security Issues

Report security issues privately to the repository owner. Do not open public issues for vulnerabilities, leaked credentials, auth bypasses, tenant isolation bugs, or customer conversation exposure.

Include:

- A clear description of the issue.
- Steps to reproduce.
- Impacted route, page, or API.
- Any relevant logs or screenshots with secrets removed.

## Current Security Model

- Authentication is handled by Better Auth.
- Email/password users must verify email before entering app routes.
- Google and GitHub OAuth are supported.
- Tenancy is anchored to Better Auth `organization`.
- Super-admin access is separate from workspace membership and requires both verified email and env-configured Better Auth user id.
- Admin impersonation is intentionally disabled.
- High-risk admin actions are audited.
- Public widget conversations use `conversationId + conversationToken` for read, polling, escalation, and realtime subscription access.
- Production rate limiting uses Upstash Redis and fails closed if Redis env vars are missing.
- Suspicious new IP/user-agent fingerprints are logged, and owner alerts are sent for super-admin account fingerprints.

## Deferred Protections

The following are intentionally deferred until the product has a production domain and budget:

- Paid WAF rules.
- CAPTCHA or managed bot challenges.
- Domain-verified Resend sender.
- Invite-only signup or approved-domain signup.
- Dedicated security monitoring and incident response process.

## Owner Guidance

- Never commit `.env.local` or production secrets.
- Keep `BETTER_AUTH_ADMIN_USER_IDS` limited to the owner account.
- Use `sslmode=verify-full` in production `DATABASE_URL`.
- Rotate secrets immediately if they are exposed in logs, screenshots, Git history, or public issues.
- Run migrations before deploying code that depends on new columns.
