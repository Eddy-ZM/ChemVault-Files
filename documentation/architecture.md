# Architecture

ChemVault Files owns file metadata in D1 and object bytes in R2. Pages Functions implement authenticated upload, access policy, preview, download, sharing, lifecycle deletion, Files-to-Lab handoff, safety scan callbacks, and derived-artifact ingestion.

Files is the system of record for source files and trusted derived artifacts. Lab references source file IDs and writes generated artifacts back with provenance metadata.
