# Runtime Variables

| Name/binding | Used by | Scope/source | Rotation | Failure behavior/risk |
| --- | --- | --- | --- | --- |
| `FILES_DB`, `FILES_BUCKET` | Metadata/policy and bytes | Cloudflare server bindings | Resource migration | Upload/read unavailable |
| `USER_AUTH_ORIGIN`, session config | Identity/access checks | Server variables | User service migration | Protected operations fail closed |
| `BILLING_API_ORIGIN`, `BILLING_SERVICE_SECRET` | Server plan lookup | Main billing API plus shared server secret | 90 days/incident | Enforced production uploads fail closed; never expose secret to clients |
| `BILLING_ENFORCEMENT_MODE` | Billing rollout gate | Server variable | Release decision | Use `shadow` only before commercial launch; production go-live requires `enforce` |
| Plan storage quota variables | Free/Pro/Team/Enterprise caps | Server variables | Pricing/package change | Invalid values fall back to 100 MB/10 GB/100 GB/1 TB safety defaults |
| Administrator/owner allowlists | Support administration | Server variables | Role change | Overbroad values grant elevated access; audit changes |
| `LAB_HANDOFF_SECRET` | Files → Lab | Shared server secret | 90 days/incident | Handoff denied |
| `ARTIFACT_WRITE_SECRET` | Lab → Files | Shared server secret, distinct | 90 days/incident | Writeback denied |
| `FILE_SCAN_CALLBACK_SECRET` | Scanner list/download/callback | GitHub and Pages secret | 90 days/incident | Files remain quarantined |
| `LIFECYCLE_SERVICE_SECRET` | Account export/delete | Shared server secret | 90 days/incident | Lifecycle denied |
| `FILES_ORIGIN` | Scanner target | Workflow variable | Domain migration | Scanner cannot reach queue |

No machine secret is client-public. Before go-live, apply D1 migrations, verify R2 CORS/limits, configure the existing machine credentials plus billing secret, switch billing enforcement to `enforce`, run Free/Pro/Team quota canaries, run a clean/rejected/error scan canary, and confirm alerts are delivered.
