# Security Policy

## Supported version

Only the latest commit on `main` is supported.

## Report a vulnerability

Use GitHub Private Vulnerability Reporting for vulnerabilities involving credential exposure, cross-account targeting, confirmation bypass, unintended writes or deletes, command injection, or unsafe browser execution.

Do not publish secrets, account identifiers, production URLs, HAR files, screenshots containing business data, or exploit details in a public issue. A report should contain a minimal sanitized reproduction, affected Skill and script, expected behavior, and impact.

Security reports will be acknowledged when maintainers are available. No fixed response or remediation time is promised.

## Credential model

This repository must never contain or request passwords, cookies, tokens, API keys, browser profile data, or exported sessions. Authentication remains in the user's local Chrome session. Any change that persists or exports authentication material is out of scope and will not be accepted.
