# Critical Flows

| Flow | Actor/precondition | Protected steps and side effects | Deny/failure behavior |
| --- | --- | --- | --- |
| Upload/quarantine | Signed-in user with write access and verified billing plan | Server resolves plan, computes owner-only usage, enforces 100 MB/10 GB/100 GB/custom quota at init and PUT, creates private row, issues bounded upload, marks completion `pending` | Missing production billing authority, over-quota, invalid size/type/scope denied; object stays unreadable until clean |
| Storage usage | Signed-in user | Return only actor-owned active bytes plus server-resolved plan/quota | Shared/visible files do not consume the viewer's quota; browser quota claims are ignored |
| Malware scan | Scheduled scanner with callback secret | Lists oldest pending/error rows, downloads quarantined bytes, scans, posts clean/rejected/error | Unauthorized callback denied; stale definitions fail the run; errors remain quarantined for retry |
| Preview/download/share | Viewer with effective role or valid share | Server loads non-deleted file, resolves policy, requires clean scan, streams private/no-store bytes | Pending/rejected/error/deleted files denied even to owners/public links |
| Files to Lab | Owner starts analysis | Files verifies access/clean status and signs a bounded handoff carrying file/project context | Other owner, unsafe file, expired/invalid handoff denied |
| Lab artifact writeback | Lab service after successful analysis | Separate credential creates derived artifact with source, generator, analysis, and user correlation | Duplicate request is idempotent; failed write is never reported saved |
| Lifecycle export/delete | User Center service | Dedicated credential exports/deletes owner-scoped metadata/objects idempotently | Missing authority denied; partial failure remains retryable |
