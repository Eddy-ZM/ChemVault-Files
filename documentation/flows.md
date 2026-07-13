# Critical Flows

| Flow | Actor/precondition | Protected steps and side effects | Deny/failure behavior |
| --- | --- | --- | --- |
| Upload/quarantine | Signed-in user with write access | Server derives owner/project, creates private row, issues bounded upload, marks completion `pending` | Invalid size/type/scope denied; object stays unreadable until clean |
| Malware scan | Scheduled scanner with callback secret | Lists oldest pending/error rows, downloads quarantined bytes, scans, posts clean/rejected/error | Unauthorized callback denied; stale definitions fail the run; errors remain quarantined for retry |
| Preview/download/share | Viewer with effective role or valid share | Server loads non-deleted file, resolves policy, requires clean scan, streams private/no-store bytes | Pending/rejected/error/deleted files denied even to owners/public links |
| Files to Lab | Owner starts analysis | Files verifies access/clean status and signs a bounded handoff carrying file/project context | Other owner, unsafe file, expired/invalid handoff denied |
| Lab artifact writeback | Lab service after successful analysis | Separate credential creates derived artifact with source, generator, analysis, and user correlation | Duplicate request is idempotent; failed write is never reported saved |
| Lifecycle export/delete | User Center service | Dedicated credential exports/deletes owner-scoped metadata/objects idempotently | Missing authority denied; partial failure remains retryable |
