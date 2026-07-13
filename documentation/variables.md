# Runtime Variables

| Name/binding | Used by | Scope/source | Rotation | Failure behavior/risk |
| --- | --- | --- | --- | --- |
| `FILES_DB`, `FILES_BUCKET` | Metadata/policy and bytes | Cloudflare server bindings | Resource migration | Upload/read unavailable |
| `USER_AUTH_ORIGIN`, session config | Identity/access checks | Server variables | User service migration | Protected operations fail closed |
| Administrator/owner allowlists | Support administration | Server variables | Role change | Overbroad values grant elevated access; audit changes |
| `LAB_HANDOFF_SECRET` | Files → Lab | Shared server secret | 90 days/incident | Handoff denied |
| `ARTIFACT_WRITE_SECRET` | Lab → Files | Shared server secret, distinct | 90 days/incident | Writeback denied |
| `FILE_SCAN_CALLBACK_SECRET` | Scanner list/download/callback | GitHub and Pages secret | 90 days/incident | Files remain quarantined |
| `LIFECYCLE_SERVICE_SECRET` | Account export/delete | Shared server secret | 90 days/incident | Lifecycle denied |
| `FILES_ORIGIN` | Scanner target | Workflow variable | Domain migration | Scanner cannot reach queue |

No machine secret is client-public. Before go-live, apply D1 migrations, verify R2 CORS/limits, configure the four distinct credentials, run a clean/rejected/error canary, and confirm backlog alerts are delivered.
