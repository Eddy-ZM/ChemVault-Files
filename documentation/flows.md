# Critical flows

1. Upload initialization creates a private metadata record and upload session.
2. Upload completion leaves the object quarantined with `scan_status=pending`.
3. A scanner reads the object through the secret-protected internal route and reports `clean`, `rejected`, or `error`.
4. Preview, download, sharing, bulk download, and Lab import accept only ready, scan-cleared files.
5. Lab writes derived artifacts through a separate credential; the artifact records source file, analysis, generator, and user correlation.
