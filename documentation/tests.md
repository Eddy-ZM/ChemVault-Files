# Verification Map

## Existing coverage

| Use case | Rule/negative case | Evidence | Status |
| --- | --- | --- | --- |
| Access policy | Owner/roles/share are resolved server-side; other users denied | permissions/access/share tests | CI required |
| Upload/validation | Invalid payloads and unsafe states cannot become readable | validation, upload, preview-repair tests | CI required |
| Malware gate | Pending/rejected/error cannot preview, download, share, bulk-download, or enter Lab | file preview/security tests and scan endpoints | CI required |
| Artifact/lifecycle | Service credentials remain separate; provenance/idempotency/delete rules hold | artifact/lifecycle tests | CI required |
| Native/API contracts | Browser, Windows, Apple, and package client decode the authority contract | client/API and Swift tests | Platform workflows |

## Proposed tests

| Test | Type | Expected result |
| --- | --- | --- |
| Deployed malware canary | Guarded live | Clean fixture becomes readable; EICAR fixture is rejected; failed scan remains quarantined |
| Backlog SLO | Guarded live | Queue summary exposes total/oldest age and alerts after one hour |
| Files → Lab → artifact | Guarded live | Owner-clean file creates one provenance-linked artifact; replay is idempotent |

## Gaps

- No local test proves GitHub notification routing reaches an operator when backlog warnings occur.
- Quarantined objects have no automatic destructive TTL; retention/deletion follows account/file policy until an approved quarantine policy exists.
- CI gates are `npm run check`, API-client build, and production build; Cloudflare bindings require canaries.
