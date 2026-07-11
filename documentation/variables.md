# Runtime variables

Core bindings are `FILES_DB` and `FILES_BUCKET`. Identity integration uses `USER_AUTH_ORIGIN`, session settings, and optional administrator lists. Internal workflows use `LAB_HANDOFF_SECRET`, `FILE_SCAN_CALLBACK_SECRET`, `ARTIFACT_WRITE_SECRET`, and `LIFECYCLE_SERVICE_SECRET`.

Uploaded files remain unavailable until an external scanner calls the internal scan endpoint with the dedicated secret.
