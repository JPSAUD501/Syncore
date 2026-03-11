# Security Policy

## Supported Scope

Syncore is still evolving quickly, but security reports are welcome for:

- the published `syncorejs` package
- the CLI and release flow
- runtime behavior that could affect data integrity, code execution, or unsafe
  cross-boundary access
- adapter behavior that could expose local data unexpectedly

Examples and docs can still surface security issues if they describe or enable
unsafe behavior, so report those as well when relevant.

## Reporting a Vulnerability

Please do not open a public GitHub Issue for a suspected security
vulnerability.

Preferred path:

- use GitHub private vulnerability reporting / security advisories for this repository

If private reporting is not available in your current context:

- open a GitHub Discussion only if the report is not sensitive
- otherwise contact the maintainer privately through GitHub before publishing details

When possible, include:

- affected version or commit
- impacted package or example
- reproduction steps
- severity and realistic impact
- any mitigation or workaround you already know

## Response Expectations

This project does not provide a formal enterprise SLA, but maintainers aim to:

- acknowledge initial receipt within a few business days
- triage severity and scope as soon as practical
- coordinate a fix or mitigation before broad public disclosure when possible

Response time may vary based on maintainer availability and report complexity.

## Disclosure Guidance

- Do not publish proof-of-concept exploit details before maintainers have had a
  reasonable opportunity to investigate and fix the issue.
- Once the issue is understood and remediated, maintainers may disclose the
  fix publicly through the usual release notes or security communication.

## Non-Security Bugs

If the issue is a normal bug, regression, or support question rather than a
security problem, use the standard community channels described in
[`SUPPORT.md`](SUPPORT.md).
