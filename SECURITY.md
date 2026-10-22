# Security

Weval handles API keys, session secrets, user-supplied blueprints, and calls
to external model providers. If you believe you have found a security
vulnerability, please report it privately instead of opening a public issue.

## Reporting

Email `nnojibe@gmail.com` with the subject `[Weval security]`, or use GitHub
Private Vulnerability Reporting on this repository when it is enabled.

Please include:

- A description of the issue and its impact
- Steps to reproduce, including the exact environment when possible
- Any relevant versions or commit SHAs

Do not include live secrets, API keys, session tokens, or personal data in the
report.

## Scope

- Application authentication and session handling
- Secret and key handling
- Blueprint execution and user-supplied input
- Storage and cloud provider configuration
- Dependencies with known vulnerabilities

## Response expectations

- Acknowledgment within 3 business days
- Triage and impact assessment within 7 business days
- Regular status updates until the issue is resolved or intentionally accepted

## Supported versions

Security fixes are targeted at the current `main` branch and the latest
release. Older releases are not guaranteed to receive backports.
