# Architecture

ChemVault Files is the suite system of record for private source files and trusted derived artifacts. Astro provides the web surface; Cloudflare Pages Functions own upload, metadata, folder/role policy, preview/download, sharing, lifecycle, Lab handoff, scanner callbacks, and artifact ingestion. D1 stores metadata/policy and R2 stores bytes. Native Apple/Windows clients consume the same authority APIs.

## Trust boundaries

- User identity and service access are verified against ChemVault User; request email/owner fields are not trusted.
- Browser uploads create private metadata and quarantined R2 objects; no read/share/Lab path may bypass `scan_status=clean`.
- Scanner, Lab handoff, artifact writeback, and lifecycle calls use four distinct machine credentials.
- Lab receives only owner-authorized, scan-clean objects and returns derived artifacts with source provenance.

## Known risks/assumptions

- D1 enforces no native RLS, so every query must apply server-derived access policy.
- Malware scanning is asynchronous; backlog age is a release/operations signal, not a reason to expose pending files.
- Public links remain revocable and never override quarantine or deletion state.

There is no email or embedded AI. Scheduled malware scanning is documented in `cron.md`.

## Related documents

- [Flows](flows.md)
- [Permissions](permissions.md)
- [Variables](variables.md)
- [Tests](tests.md)
- [Scheduled scanning](cron.md)
