# ChemVault Files Design

Date: 2026-06-11
Status: approved for implementation planning

## Goal

ChemVault Files is the private file-management subsite for ChemVault. It should feel like the existing `chemvault.science` research portal, but its first screen is a usable file workbench rather than a marketing page.

The product is for the owner first. It should support real file uploads to Cloudflare R2, searchable metadata in Cloudflare D1, project/folder/tag organization, and a reserved login surface for a future `mail.chemvault.science` identity flow.

## Confirmed Decisions

- Use the visual language of `chemvault.science`: light gray background, white or translucent panels, thin borders, 8px radius, blue primary actions, green online status, dense academic workbench wording, and the ChemVault brand.
- Use Cloudflare Pages for the Astro frontend and Pages Functions for API routes.
- Use Cloudflare R2 for file objects.
- Use Cloudflare D1 for file metadata, projects, folders, tags, and upload sessions.
- Use project/folder navigation plus tags as the organization model.
- Build for large files by using a presigned or multipart upload architecture. The MVP may implement the simplest working upload first, but the API and UI should not block later large-file support.
- Keep the app private for the owner. Production access should be protected by Cloudflare Access, and the UI should reserve a login/account area for a later mail-based login system.

## Product Surface

The app opens directly into a workbench named ChemVault Files.

Top bar:

- ChemVault mark and `Files` subtitle.
- Global search for files, tags, folders, and projects.
- Account/login area showing private access state now and reserving space for future `mail.chemvault.science` login.
- Reserved theme toggle control compatible with the main site's light/dark direction.

Left rail:

- Project/library navigation with seed sections such as Dossiers, Methods, Spectra, Datasets, and Manuscripts.
- Folder tree under each project.
- Tag shortcuts and active filter states.

Center workspace:

- Drag-and-drop upload zone.
- Batch upload queue with progress, state, errors, retry affordances, and completion state.
- File table/list with name, type, project, folder, tags, size, updated time, and status.
- Search and tag filters.

Right inspector:

- Selected file details.
- File name, MIME type, size, R2 key, project, folder, tags, upload time, updated time, and upload actor.
- Actions for download, rename, move, retag, and delete.

Status band:

- API, D1, and R2 health.
- File count, recent upload, and storage usage where available.
- Clear configuration-missing messages during local development when Cloudflare bindings are absent.

## Architecture

Astro serves the application shell and static assets. Pages Functions expose API routes under `/api/*`.

R2 stores binary objects. R2 keys are generated server-side and should not directly use the user-visible filename. Suggested key shape:

```text
files/{projectSlug}/{yyyy}/{mm}/{fileId}/{sanitizedOriginalName}
```

D1 stores all queryable metadata and organization data. The app should list and search through D1 rather than by scanning R2 objects.

The frontend keeps local UI state for selected project, folder, tags, selected file, search query, and upload queue. Durable state is persisted through API calls.

## Data Model

`projects`

- `id` text primary key
- `name` text not null
- `slug` text unique not null
- `description` text
- `sort_order` integer not null default 0
- `created_at` text not null
- `updated_at` text not null

`folders`

- `id` text primary key
- `project_id` text not null
- `parent_id` text
- `name` text not null
- `slug` text not null
- `path` text not null
- `created_at` text not null
- `updated_at` text not null

`files`

- `id` text primary key
- `project_id` text not null
- `folder_id` text
- `display_name` text not null
- `original_name` text not null
- `r2_key` text unique not null
- `mime_type` text
- `size_bytes` integer not null
- `status` text not null, one of `pending`, `uploading`, `ready`, `failed`, `deleted`
- `checksum` text
- `upload_session_id` text
- `actor_email` text
- `download_count` integer not null default 0
- `created_at` text not null
- `updated_at` text not null
- `deleted_at` text

`tags`

- `id` text primary key
- `name` text unique not null
- `slug` text unique not null
- `color` text
- `created_at` text not null

`file_tags`

- `file_id` text not null
- `tag_id` text not null
- primary key on `file_id`, `tag_id`

`upload_sessions`

- `id` text primary key
- `file_id` text not null
- `r2_key` text not null
- `mode` text not null, one of `direct`, `presigned`, `multipart`
- `status` text not null, one of `created`, `uploading`, `complete`, `aborted`, `failed`
- `part_size_bytes` integer
- `part_count` integer
- `expires_at` text
- `created_at` text not null
- `updated_at` text not null

## API

`GET /api/health`

- Returns API status and whether D1 and R2 bindings are available.
- Used by the status band and local configuration diagnostics.

`GET /api/library`

- Returns projects, folders, tags, and file records.
- Accepts optional query parameters for project, folder, tag, search, and status filters.

`POST /api/files/init`

- Creates or validates a file record and upload session.
- Accepts file name, size, MIME type, project, folder, and tags.
- Generates the R2 key server-side.
- Returns file id, upload session id, upload mode, and the data needed by the frontend to upload.

`POST /api/files/complete`

- Marks an upload session complete after R2 has the object.
- Sets file status to `ready`.
- Stores final metadata such as checksum when available.

`GET /api/files/:id/download`

- Streams the object from R2.
- Increments `download_count` in D1.
- Returns a clear 404 or deleted-state error when the record or object is missing.

`PATCH /api/files/:id`

- Supports rename, move, and retag actions.
- Validates names and tag payloads before writing D1.

`DELETE /api/files/:id`

- Soft-deletes the D1 record.
- The API may also delete the R2 object in the same request when the confirmed implementation chooses hard object deletion.
- The UI should present this as a destructive action.

`POST /api/folders`

- Creates a folder under a project or parent folder.

`POST /api/tags`

- Creates a tag if it does not already exist.

## Upload Flow

1. The user selects or drags files into the upload zone.
2. The frontend adds each file to an upload queue with `queued` status.
3. For each file, the frontend calls `POST /api/files/init`.
4. The backend validates metadata, creates a D1 file row and upload session, and returns upload instructions.
5. MVP direct upload may send the file through a Pages Function for smaller files.
6. Large-file-ready architecture should support presigned or multipart upload so file bytes can go to R2 without buffering whole objects in a Function.
7. After object upload succeeds, the frontend calls `POST /api/files/complete`.
8. The file row becomes `ready`, and the library list refreshes.

The frontend upload queue should be designed so moving from direct upload to presigned or multipart upload does not require replacing the UI.

## Authentication And Security

Production access should be protected by Cloudflare Access at the application boundary. The first policy should allow only the owner's email address.

The application UI should not implement a custom password system in the MVP. It should reserve a login/account area and clear copy for future mail-based login through `mail.chemvault.science`.

API routes should not trust a client-supplied actor. In production, actor identity should come from Cloudflare Access headers or JWT verification. Until that integration is wired, the code may use a configured owner email fallback for metadata only.

Validation requirements:

- Limit file, folder, project, and tag name lengths.
- Normalize tag slugs server-side.
- Generate file ids and R2 keys server-side.
- Do not use raw user filenames as trusted object paths.
- Return structured JSON errors.
- Use soft delete for D1 records by default.
- Show configuration errors in the UI when D1 or R2 bindings are missing.

## Implementation Scope

MVP implementation should include:

- Main ChemVault Files workbench UI in Astro.
- Responsive desktop and mobile layout.
- Seed project/folder/tag data for initial empty states.
- D1 schema migration.
- Cloudflare binding configuration for R2 and D1.
- API health route.
- Library list route.
- File init, upload, complete, download, patch, and delete routes.
- Folder and tag creation routes.
- Upload queue UI.
- File inspector.
- Search, project, folder, and tag filtering.
- Local configuration-missing state for API/UI.

Deferred follow-up scope:

- Full multipart upload completion if the MVP starts with direct upload.
- Virus scanning.
- PDF text extraction.
- Spectra preview rendering.
- OCR.
- AI-assisted tagging or summary.
- Sharing links.
- Team permissions.
- Final `mail.chemvault.science` identity integration.

## Testing And Verification

Required checks:

- `npm run build` passes.
- Local app starts successfully.
- Browser verification covers desktop and mobile widths.
- Core flow works: load library, upload a file, see it in the list, select it, download it, delete it, and filter/search it.
- API returns structured errors for missing D1 or R2 bindings.
- UI does not white-screen when bindings are absent.
- Text does not overflow controls on mobile.
- Visual style matches the main site direction: light gray background, ChemVault brand, restrained panels, blue primary actions, and green status affordances.

## Open Implementation Notes

- The design intentionally allows the MVP to choose between a direct upload implementation and a full multipart implementation, as long as the API contract and UI queue keep the large-file path available.
- Cloudflare Access setup is an operational deployment step and should be documented during implementation. The code should remain ready to read Access identity metadata later.
- The current domain reference is `chemvault.science`. The earlier spelling `chamvault.science` did not resolve during discovery.
