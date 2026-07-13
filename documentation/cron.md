# Scheduled Work

| Job | Schedule | Function/secret | Limits/retry | Idempotency and evidence |
| --- | --- | --- | --- | --- |
| Malware scan | Every 15 minutes | Lists/downloads/callbacks through `FILE_SCAN_CALLBACK_SECRET` | Up to 50 oldest files per run, 20-minute timeout; error rows retry next run | Status callback is repeat-safe; queue total/oldest age and ClamAV version appear in Actions summary/history |

The job stops if virus definitions cannot be refreshed. Backlog over 50 files or oldest age over one hour emits a workflow warning. Files stay quarantined on download/scan/callback failure. There is intentionally no automatic quarantine deletion until a separately approved retention rule exists.
