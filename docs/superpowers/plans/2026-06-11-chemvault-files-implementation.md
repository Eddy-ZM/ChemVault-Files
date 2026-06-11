# ChemVault Files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build ChemVault Files as a private Cloudflare-backed file-management workbench with R2 object storage, D1 metadata, project/folder/tag organization, upload/download/delete flows, and ChemVault visual fidelity.

**Architecture:** Astro renders a single workbench page with focused components and a vanilla TypeScript client controller. Cloudflare Pages Functions expose `/api/*` endpoints, while shared server helpers validate payloads, generate R2 keys, query D1, and keep route files small. The MVP implements direct upload through a Pages Function while preserving an upload-session contract that can later switch to presigned or multipart R2 uploads.

**Tech Stack:** Astro 6, TypeScript, Vitest, Cloudflare Pages Functions, Cloudflare D1, Cloudflare R2, Wrangler, `@cloudflare/workers-types`, code-native HTML/CSS UI, generated concept screenshot at `docs/superpowers/concepts/2026-06-11-chemvault-files-workbench-concept.png`.

---

## File Structure

- Create `docs/superpowers/concepts/2026-06-11-chemvault-files-workbench-concept.png`: accepted visual reference for implementation and final fidelity QA.
- Create `docs/superpowers/plans/2026-06-11-chemvault-files-implementation.md`: this plan.
- Modify `package.json`: add test, typecheck, Wrangler, and local Pages commands.
- Modify `tsconfig.json`: include Cloudflare and Vitest types.
- Create `vitest.config.ts`: Node-environment unit test config.
- Create `wrangler.jsonc`: Pages, D1, R2, and owner email configuration.
- Create `migrations/0001_chemvault_files.sql`: D1 schema plus seed projects/tags/folders.
- Create `src/lib/chemvault-files/types.ts`: shared app data types.
- Create `src/lib/chemvault-files/validation.ts`: payload validation, slugging, name limits.
- Create `src/lib/chemvault-files/r2-key.ts`: safe R2 key generation.
- Create `src/lib/chemvault-files/client-state.ts`: pure filtering, selection, formatting, and upload queue reducers.
- Create `src/components/BrandMark.astro`: reusable ChemVault mark.
- Create `src/components/AppShell.astro`: top-level workbench markup.
- Create `src/components/Sidebar.astro`: project/folder/tag rail.
- Create `src/components/Workspace.astro`: status band, upload zone, queue, file table.
- Create `src/components/Inspector.astro`: selected-file metadata and actions.
- Create `src/pages/index.astro`: route shell that imports the components and client script.
- Create `src/styles/chemvault-files.css`: design-system tokens and responsive styling.
- Create `src/scripts/chemvault-files.ts`: browser controller for API loading, filtering, upload queue, selection, download, delete, and configuration-missing states.
- Create `functions/_lib/http.ts`: JSON responses, error helpers, request parsing.
- Create `functions/_lib/env.ts`: typed bindings and owner identity fallback.
- Create `functions/_lib/db.ts`: D1 repositories for projects, folders, tags, files, and upload sessions.
- Create `functions/_lib/file-service.ts`: upload init, completion, patch, delete, and download helpers.
- Create `functions/api/health.ts`: `GET /api/health`.
- Create `functions/api/library.ts`: `GET /api/library`.
- Create `functions/api/files/init.ts`: `POST /api/files/init`.
- Create `functions/api/files/upload.ts`: `PUT /api/files/upload?fileId=...&sessionId=...`.
- Create `functions/api/files/complete.ts`: `POST /api/files/complete`.
- Create `functions/api/files/[id].ts`: `PATCH` and `DELETE /api/files/:id`.
- Create `functions/api/files/[id]/download.ts`: `GET /api/files/:id/download`.
- Create `functions/api/folders.ts`: `POST /api/folders`.
- Create `functions/api/tags.ts`: `POST /api/tags`.
- Create `tests/validation.test.ts`: validation and slug tests.
- Create `tests/r2-key.test.ts`: R2 key tests.
- Create `tests/client-state.test.ts`: filtering, selection, formatting, and upload queue tests.
- Create `tests/http.test.ts`: API helper tests.
- Create `tests/file-service.test.ts`: service-layer tests using in-memory D1/R2 fakes.
- Create `README.md`: replace starter content with local development, Cloudflare setup, and deployment notes.

---

## Task 1: Tooling, Concept Reference, And Config

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `wrangler.jsonc`
- Keep: `docs/superpowers/concepts/2026-06-11-chemvault-files-workbench-concept.png`

- [ ] **Step 1: Confirm concept image is present**

Run:

```bash
file docs/superpowers/concepts/2026-06-11-chemvault-files-workbench-concept.png
```

Expected: `PNG image data, 1568 x 1003`.

- [ ] **Step 2: Install development dependencies**

Run:

```bash
npm install -D vitest wrangler @cloudflare/workers-types @astrojs/check typescript
```

Expected: `package.json` and `package-lock.json` change, and install exits with code 0.

- [ ] **Step 3: Add scripts to `package.json`**

Set scripts to include these entries:

```json
{
  "dev": "astro dev",
  "build": "astro build",
  "preview": "astro preview",
  "astro": "astro",
  "test": "vitest run",
  "test:watch": "vitest",
  "check": "astro check && npm test",
  "pages:dev": "npm run build && wrangler pages dev dist --compatibility-date=2026-06-11",
  "types:cf": "wrangler types"
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    restoreMocks: true,
  },
});
```

- [ ] **Step 5: Update `tsconfig.json`**

Use Astro's strict config and include Cloudflare/Vitest types:

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "types": ["@cloudflare/workers-types", "vitest/globals"]
  }
}
```

- [ ] **Step 6: Create `wrangler.jsonc`**

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "chemvault-files",
  "compatibility_date": "2026-06-11",
  "pages_build_output_dir": "dist",
  "vars": {
    "PRIVATE_OWNER_EMAIL": "owner@chemvault.science",
    "ENVIRONMENT": "local"
  },
  "r2_buckets": [
    {
      "binding": "FILES_BUCKET",
      "bucket_name": "chemvault-files"
    }
  ],
  "d1_databases": [
    {
      "binding": "FILES_DB",
      "database_name": "chemvault-files",
      "database_id": "00000000-0000-0000-0000-000000000000"
    }
  ]
}
```

- [ ] **Step 7: Verify tooling config**

Run:

```bash
npx vitest run --passWithNoTests
```

Expected before tests exist: Vitest reports that no test files were found and exits with code 0 because `--passWithNoTests` is set.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts wrangler.jsonc docs/superpowers/concepts/2026-06-11-chemvault-files-workbench-concept.png
git commit -m "chore: add ChemVault Files tooling"
```

---

## Task 2: Shared Types, Validation, And R2 Key Generation

**Files:**
- Create: `src/lib/chemvault-files/types.ts`
- Create: `src/lib/chemvault-files/validation.ts`
- Create: `src/lib/chemvault-files/r2-key.ts`
- Create: `tests/validation.test.ts`
- Create: `tests/r2-key.test.ts`

- [ ] **Step 1: Write failing validation tests**

Create `tests/validation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  assertFileInitPayload,
  normalizeSlug,
  sanitizeVisibleName,
} from "../src/lib/chemvault-files/validation";

describe("ChemVault Files validation", () => {
  it("normalizes names into stable slugs", () => {
    expect(normalizeSlug("  2024 Q2 Catalysis Program  ")).toBe("2024-q2-catalysis-program");
    expect(normalizeSlug("NMR / Raw Data + CDCl3")).toBe("nmr-raw-data-cdcl3");
  });

  it("preserves readable filenames while removing unsafe path characters", () => {
    expect(sanitizeVisibleName("../Compound 14/1H.jdx")).toBe("Compound 14_1H.jdx");
    expect(sanitizeVisibleName("   ")).toBe("untitled-file");
  });

  it("accepts a valid file init payload", () => {
    const payload = assertFileInitPayload({
      name: "Compound_14_1H.jdx",
      size: 13214592,
      mimeType: "chemical/x-jcamp-dx",
      projectId: "project_spectra",
      folderId: "folder_spectra",
      tags: ["NMR", "1H", "CDCl3"],
    });

    expect(payload.name).toBe("Compound_14_1H.jdx");
    expect(payload.tags).toEqual(["NMR", "1H", "CDCl3"]);
  });

  it("rejects invalid file init payloads with clear messages", () => {
    expect(() => assertFileInitPayload({ name: "", size: 1, projectId: "p" })).toThrow("File name is required");
    expect(() => assertFileInitPayload({ name: "a.pdf", size: 0, projectId: "p" })).toThrow("File size must be greater than zero");
    expect(() => assertFileInitPayload({ name: "a.pdf", size: 1 })).toThrow("Project is required");
  });
});
```

- [ ] **Step 2: Run validation test and verify RED**

```bash
npm test -- tests/validation.test.ts
```

Expected: FAIL because `validation.ts` does not exist.

- [ ] **Step 3: Write failing R2 key tests**

Create `tests/r2-key.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildR2Key } from "../src/lib/chemvault-files/r2-key";

describe("R2 key generation", () => {
  it("builds server-owned keys without raw path traversal", () => {
    const key = buildR2Key({
      projectSlug: "2024-q2-catalysis-program",
      fileId: "file_abc123",
      originalName: "../Compound 14/1H.jdx",
      now: new Date("2026-06-11T12:30:00.000Z"),
    });

    expect(key).toBe("files/2024-q2-catalysis-program/2026/06/file_abc123/Compound 14_1H.jdx");
    expect(key).not.toContain("..");
  });
});
```

- [ ] **Step 4: Run R2 key test and verify RED**

```bash
npm test -- tests/r2-key.test.ts
```

Expected: FAIL because `r2-key.ts` does not exist.

- [ ] **Step 5: Create shared app types**

Create `src/lib/chemvault-files/types.ts`:

```ts
export type FileStatus = "pending" | "uploading" | "ready" | "failed" | "deleted";
export type UploadMode = "direct" | "presigned" | "multipart";
export type UploadSessionStatus = "created" | "uploading" | "complete" | "aborted" | "failed";

export interface ProjectRecord {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface FolderRecord {
  id: string;
  projectId: string;
  parentId: string | null;
  name: string;
  slug: string;
  path: string;
  createdAt: string;
  updatedAt: string;
}

export interface TagRecord {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  createdAt: string;
}

export interface FileRecord {
  id: string;
  projectId: string;
  folderId: string | null;
  displayName: string;
  originalName: string;
  r2Key: string;
  mimeType: string | null;
  sizeBytes: number;
  status: FileStatus;
  checksum: string | null;
  uploadSessionId: string | null;
  actorEmail: string | null;
  downloadCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  tags: TagRecord[];
}

export interface LibraryResponse {
  projects: ProjectRecord[];
  folders: FolderRecord[];
  tags: TagRecord[];
  files: FileRecord[];
}

export interface FileInitPayload {
  name: string;
  size: number;
  mimeType: string | null;
  projectId: string;
  folderId: string | null;
  tags: string[];
}
```

- [ ] **Step 6: Implement validation helpers**

Create `src/lib/chemvault-files/validation.ts` with exported functions:

```ts
import type { FileInitPayload } from "./types";

const MAX_NAME_LENGTH = 160;
const MAX_TAG_LENGTH = 40;

export function normalizeSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "untitled";
}

export function sanitizeVisibleName(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\.\.+/g, "")
    .replace(/\s+/g, " ")
    .slice(0, MAX_NAME_LENGTH)
    .trim();
  return cleaned || "untitled-file";
}

export function assertNonEmptyName(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
  const cleaned = sanitizeVisibleName(value);
  if (cleaned.length > MAX_NAME_LENGTH) {
    throw new Error(`${label} must be ${MAX_NAME_LENGTH} characters or fewer`);
  }
  return cleaned;
}

export function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.slice(0, MAX_TAG_LENGTH))
    .filter((entry) => {
      const slug = normalizeSlug(entry);
      if (seen.has(slug)) return false;
      seen.add(slug);
      return true;
    });
}

export function assertFileInitPayload(value: unknown): FileInitPayload {
  const payload = value as Record<string, unknown>;
  const name = assertNonEmptyName(payload.name, "File name");
  const size = Number(payload.size);
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error("File size must be greater than zero");
  }
  const projectId = typeof payload.projectId === "string" ? payload.projectId.trim() : "";
  if (!projectId) {
    throw new Error("Project is required");
  }
  return {
    name,
    size,
    mimeType: typeof payload.mimeType === "string" && payload.mimeType.trim() ? payload.mimeType.trim() : null,
    projectId,
    folderId: typeof payload.folderId === "string" && payload.folderId.trim() ? payload.folderId.trim() : null,
    tags: normalizeTags(payload.tags),
  };
}
```

- [ ] **Step 7: Implement R2 key helper**

Create `src/lib/chemvault-files/r2-key.ts`:

```ts
import { sanitizeVisibleName } from "./validation";

interface BuildR2KeyInput {
  projectSlug: string;
  fileId: string;
  originalName: string;
  now?: Date;
}

export function buildR2Key(input: BuildR2KeyInput): string {
  const now = input.now ?? new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return [
    "files",
    input.projectSlug,
    year,
    month,
    input.fileId,
    sanitizeVisibleName(input.originalName),
  ].join("/");
}
```

- [ ] **Step 8: Verify GREEN**

```bash
npm test -- tests/validation.test.ts tests/r2-key.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/chemvault-files/types.ts src/lib/chemvault-files/validation.ts src/lib/chemvault-files/r2-key.ts tests/validation.test.ts tests/r2-key.test.ts
git commit -m "test: add file validation and R2 key helpers"
```

---

## Task 3: D1 Schema, Seeds, And Server Repositories

**Files:**
- Create: `migrations/0001_chemvault_files.sql`
- Create: `functions/_lib/db.ts`
- Create: `functions/_lib/env.ts`
- Create: `tests/schema.test.ts`

- [ ] **Step 1: Write failing schema test**

Create `tests/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("migrations/0001_chemvault_files.sql", "utf8");

describe("D1 schema", () => {
  it("defines the approved metadata tables", () => {
    for (const tableName of ["projects", "folders", "files", "tags", "file_tags", "upload_sessions"]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${tableName}`);
    }
  });

  it("seeds the initial ChemVault project sections", () => {
    for (const projectName of ["Dossiers", "Methods", "Spectra", "Datasets", "Manuscripts"]) {
      expect(sql).toContain(`'${projectName}'`);
    }
  });
});
```

- [ ] **Step 2: Run schema test and verify RED**

```bash
npm test -- tests/schema.test.ts
```

Expected: FAIL because `migrations/0001_chemvault_files.sql` does not exist.

- [ ] **Step 3: Create D1 migration**

Create `migrations/0001_chemvault_files.sql` with the approved schema and seed records:

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  parent_id TEXT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (parent_id) REFERENCES folders(id)
);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  folder_id TEXT,
  display_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  mime_type TEXT,
  size_bytes INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'uploading', 'ready', 'failed', 'deleted')),
  checksum TEXT,
  upload_session_id TEXT,
  actor_email TEXT,
  download_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (folder_id) REFERENCES folders(id)
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  color TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS file_tags (
  file_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (file_id, tag_id),
  FOREIGN KEY (file_id) REFERENCES files(id),
  FOREIGN KEY (tag_id) REFERENCES tags(id)
);

CREATE TABLE IF NOT EXISTS upload_sessions (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('direct', 'presigned', 'multipart')),
  status TEXT NOT NULL CHECK (status IN ('created', 'uploading', 'complete', 'aborted', 'failed')),
  part_size_bytes INTEGER,
  part_count INTEGER,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (file_id) REFERENCES files(id)
);

CREATE INDEX IF NOT EXISTS idx_files_status ON files(status);
CREATE INDEX IF NOT EXISTS idx_files_project_folder ON files(project_id, folder_id);
CREATE INDEX IF NOT EXISTS idx_files_updated_at ON files(updated_at);
CREATE INDEX IF NOT EXISTS idx_folders_project ON folders(project_id);
CREATE INDEX IF NOT EXISTS idx_file_tags_tag ON file_tags(tag_id);

INSERT OR IGNORE INTO projects (id, name, slug, description, sort_order, created_at, updated_at) VALUES
  ('project_dossiers', 'Dossiers', 'dossiers', 'Project-style research files and evidence bundles.', 10, '2026-06-11T00:00:00.000Z', '2026-06-11T00:00:00.000Z'),
  ('project_methods', 'Methods', 'methods', 'Protocols, reproducibility notes, and method documentation.', 20, '2026-06-11T00:00:00.000Z', '2026-06-11T00:00:00.000Z'),
  ('project_spectra', 'Spectra', 'spectra', 'NMR, IR, MS, and raw instrument exports.', 30, '2026-06-11T00:00:00.000Z', '2026-06-11T00:00:00.000Z'),
  ('project_datasets', 'Datasets', 'datasets', 'CSV, HDF5, archives, and processed research datasets.', 40, '2026-06-11T00:00:00.000Z', '2026-06-11T00:00:00.000Z'),
  ('project_manuscripts', 'Manuscripts', 'manuscripts', 'Drafts, reports, supplementary information, and figures.', 50, '2026-06-11T00:00:00.000Z', '2026-06-11T00:00:00.000Z');

INSERT OR IGNORE INTO folders (id, project_id, parent_id, name, slug, path, created_at, updated_at) VALUES
  ('folder_spectra', 'project_spectra', NULL, 'Spectra', 'spectra', '/Spectra', '2026-06-11T00:00:00.000Z', '2026-06-11T00:00:00.000Z'),
  ('folder_datasets', 'project_datasets', NULL, 'Datasets', 'datasets', '/Datasets', '2026-06-11T00:00:00.000Z', '2026-06-11T00:00:00.000Z');

INSERT OR IGNORE INTO tags (id, name, slug, color, created_at) VALUES
  ('tag_nmr', 'NMR', 'nmr', '#0071e3', '2026-06-11T00:00:00.000Z'),
  ('tag_raw_data', 'Raw Data', 'raw-data', '#1d7f42', '2026-06-11T00:00:00.000Z'),
  ('tag_pdf', 'PDF', 'pdf', '#d70015', '2026-06-11T00:00:00.000Z');
```

- [ ] **Step 4: Create environment helper**

Create `functions/_lib/env.ts`:

```ts
export interface Env {
  FILES_DB?: D1Database;
  FILES_BUCKET?: R2Bucket;
  PRIVATE_OWNER_EMAIL?: string;
  ENVIRONMENT?: string;
}

export function getActorEmail(request: Request, env: Env): string {
  const accessEmail = request.headers.get("Cf-Access-Authenticated-User-Email");
  return accessEmail || env.PRIVATE_OWNER_EMAIL || "owner@chemvault.science";
}

export function hasRequiredBindings(env: Env): { d1: boolean; r2: boolean } {
  return {
    d1: Boolean(env.FILES_DB),
    r2: Boolean(env.FILES_BUCKET),
  };
}
```

- [ ] **Step 5: Create D1 repository helpers**

Create `functions/_lib/db.ts` with functions named exactly:

```ts
import type { FileRecord, FolderRecord, LibraryResponse, ProjectRecord, TagRecord } from "../../src/lib/chemvault-files/types";

export function requireDb(db: D1Database | undefined): D1Database {
  if (!db) throw new Error("D1 binding FILES_DB is not configured");
  return db;
}

export async function listLibrary(db: D1Database): Promise<LibraryResponse> {
  const [projects, folders, tags, files] = await Promise.all([
    db.prepare("SELECT * FROM projects ORDER BY sort_order, name").all(),
    db.prepare("SELECT * FROM folders ORDER BY path").all(),
    db.prepare("SELECT * FROM tags ORDER BY name").all(),
    db.prepare("SELECT * FROM files WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 500").all(),
  ]);

  const tagRows = tags.results as Record<string, unknown>[];
  const fileRows = files.results as Record<string, unknown>[];

  return {
    projects: (projects.results as Record<string, unknown>[]).map(mapProject),
    folders: (folders.results as Record<string, unknown>[]).map(mapFolder),
    tags: tagRows.map(mapTag),
    files: await mapFilesWithTags(db, fileRows),
  };
}

export async function mapFilesWithTags(db: D1Database, fileRows: Record<string, unknown>[]): Promise<FileRecord[]> {
  if (fileRows.length === 0) return [];
  const ids = fileRows.map((row) => String(row.id));
  const placeholders = ids.map(() => "?").join(",");
  const tagResult = await db
    .prepare(`SELECT ft.file_id, t.* FROM file_tags ft JOIN tags t ON t.id = ft.tag_id WHERE ft.file_id IN (${placeholders})`)
    .bind(...ids)
    .all();
  const tagsByFile = new Map<string, TagRecord[]>();
  for (const row of tagResult.results as Record<string, unknown>[]) {
    const fileId = String(row.file_id);
    const current = tagsByFile.get(fileId) ?? [];
    current.push(mapTag(row));
    tagsByFile.set(fileId, current);
  }
  return fileRows.map((row) => ({ ...mapFile(row), tags: tagsByFile.get(String(row.id)) ?? [] }));
}

export function mapProject(row: Record<string, unknown>): ProjectRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    description: row.description === null ? null : String(row.description),
    sortOrder: Number(row.sort_order),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapFolder(row: Record<string, unknown>): FolderRecord {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    parentId: row.parent_id === null ? null : String(row.parent_id),
    name: String(row.name),
    slug: String(row.slug),
    path: String(row.path),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapTag(row: Record<string, unknown>): TagRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    color: row.color === null ? null : String(row.color),
    createdAt: String(row.created_at),
  };
}

export function mapFile(row: Record<string, unknown>): Omit<FileRecord, "tags"> {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    folderId: row.folder_id === null ? null : String(row.folder_id),
    displayName: String(row.display_name),
    originalName: String(row.original_name),
    r2Key: String(row.r2_key),
    mimeType: row.mime_type === null ? null : String(row.mime_type),
    sizeBytes: Number(row.size_bytes),
    status: String(row.status) as FileRecord["status"],
    checksum: row.checksum === null ? null : String(row.checksum),
    uploadSessionId: row.upload_session_id === null ? null : String(row.upload_session_id),
    actorEmail: row.actor_email === null ? null : String(row.actor_email),
    downloadCount: Number(row.download_count),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deletedAt: row.deleted_at === null ? null : String(row.deleted_at),
  };
}
```

- [ ] **Step 6: Run tests**

```bash
npm test -- tests/schema.test.ts tests/validation.test.ts tests/r2-key.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add migrations/0001_chemvault_files.sql functions/_lib/env.ts functions/_lib/db.ts tests/schema.test.ts
git commit -m "feat: add D1 schema and repository helpers"
```

---

## Task 4: HTTP Helpers, Health Route, And Library Route

**Files:**
- Create: `functions/_lib/http.ts`
- Create: `functions/api/health.ts`
- Create: `functions/api/library.ts`
- Create: `tests/http.test.ts`

- [ ] **Step 1: Write failing HTTP helper tests**

Create `tests/http.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { errorJson, okJson, parseJsonBody } from "../functions/_lib/http";

describe("HTTP helpers", () => {
  it("returns JSON success responses", async () => {
    const response = okJson({ status: "ok" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("returns structured JSON errors", async () => {
    const response = errorJson("Missing R2 binding", 503, "CONFIGURATION_MISSING");
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "CONFIGURATION_MISSING",
        message: "Missing R2 binding",
      },
    });
  });

  it("parses JSON request bodies", async () => {
    const request = new Request("https://files.chemvault.science/api/files/init", {
      method: "POST",
      body: JSON.stringify({ name: "Compound_14_1H.jdx" }),
    });
    await expect(parseJsonBody(request)).resolves.toEqual({ name: "Compound_14_1H.jdx" });
  });
});
```

- [ ] **Step 2: Run HTTP tests and verify RED**

```bash
npm test -- tests/http.test.ts
```

Expected: FAIL because `http.ts` does not exist.

- [ ] **Step 3: Implement HTTP helpers**

Create `functions/_lib/http.ts`:

```ts
export function okJson(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init.headers,
    },
  });
}

export function errorJson(message: string, status = 400, code = "BAD_REQUEST"): Response {
  return okJson({ error: { code, message } }, { status });
}

export async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}

export function routeError(error: unknown): Response {
  const message = error instanceof Error ? error.message : "Unexpected server error";
  const status = message.includes("not configured") ? 503 : 400;
  const code = status === 503 ? "CONFIGURATION_MISSING" : "BAD_REQUEST";
  return errorJson(message, status, code);
}
```

- [ ] **Step 4: Implement health route**

Create `functions/api/health.ts`:

```ts
import type { Env } from "../_lib/env";
import { hasRequiredBindings } from "../_lib/env";
import { okJson } from "../_lib/http";

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const bindings = hasRequiredBindings(env);
  return okJson({
    status: bindings.d1 && bindings.r2 ? "ready" : "configuration-missing",
    api: "online",
    d1: bindings.d1 ? "online" : "missing",
    r2: bindings.r2 ? "online" : "missing",
    environment: env.ENVIRONMENT || "local",
  });
};
```

- [ ] **Step 5: Implement library route**

Create `functions/api/library.ts`:

```ts
import type { Env } from "../_lib/env";
import { listLibrary, requireDb } from "../_lib/db";
import { okJson, routeError } from "../_lib/http";

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    return okJson(await listLibrary(requireDb(env.FILES_DB)));
  } catch (error) {
    return routeError(error);
  }
};
```

- [ ] **Step 6: Verify GREEN**

```bash
npm test -- tests/http.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add functions/_lib/http.ts functions/api/health.ts functions/api/library.ts tests/http.test.ts
git commit -m "feat: add health and library API routes"
```

---

## Task 5: File, Folder, And Tag API Services

**Files:**
- Create: `functions/_lib/file-service.ts`
- Create: `functions/api/files/init.ts`
- Create: `functions/api/files/upload.ts`
- Create: `functions/api/files/complete.ts`
- Create: `functions/api/files/[id].ts`
- Create: `functions/api/files/[id]/download.ts`
- Create: `functions/api/folders.ts`
- Create: `functions/api/tags.ts`
- Create: `tests/file-service.test.ts`

- [ ] **Step 1: Write failing service tests**

Create `tests/file-service.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createFileInitDraft } from "../functions/_lib/file-service";
import { buildDownloadHeaders, coercePatchPayload } from "../functions/_lib/file-service";

describe("file service", () => {
  it("creates a direct upload draft with server generated ids and keys", () => {
    const draft = createFileInitDraft({
      payload: {
        name: "Compound_14_1H.jdx",
        size: 13214592,
        mimeType: "chemical/x-jcamp-dx",
        projectId: "project_spectra",
        folderId: "folder_spectra",
        tags: ["NMR"],
      },
      projectSlug: "2024-q2-catalysis-program",
      actorEmail: "owner@chemvault.science",
      now: new Date("2026-06-11T12:30:00.000Z"),
      idFactory: () => "file_abc123",
      sessionIdFactory: () => "upload_def456",
    });

    expect(draft.file.id).toBe("file_abc123");
    expect(draft.file.r2Key).toBe("files/2024-q2-catalysis-program/2026/06/file_abc123/Compound_14_1H.jdx");
    expect(draft.file.status).toBe("pending");
    expect(draft.session.mode).toBe("direct");
    expect(draft.session.status).toBe("created");
  });

  it("builds safe download headers", () => {
    const headers = buildDownloadHeaders({
      displayName: "Compound 14 1H.jdx",
      mimeType: "chemical/x-jcamp-dx",
      sizeBytes: 13214592,
    });

    expect(headers.get("content-type")).toBe("chemical/x-jcamp-dx");
    expect(headers.get("content-length")).toBe("13214592");
    expect(headers.get("content-disposition")).toContain('filename="Compound 14 1H.jdx"');
  });

  it("coerces patch payloads for rename, move, and tags", () => {
    expect(coercePatchPayload({
      displayName: "../Report.pdf",
      projectId: "project_manuscripts",
      folderId: "",
      tags: ["PDF", "SI", "PDF"],
    })).toEqual({
      displayName: "Report.pdf",
      projectId: "project_manuscripts",
      folderId: null,
      tags: ["PDF", "SI"],
    });
  });
});
```

- [ ] **Step 2: Run service tests and verify RED**

```bash
npm test -- tests/file-service.test.ts
```

Expected: FAIL because service functions do not exist.

- [ ] **Step 3: Implement service helpers**

Create `functions/_lib/file-service.ts` exporting `createFileInitDraft`, `buildDownloadHeaders`, and `coercePatchPayload`:

```ts
import { buildR2Key } from "../../src/lib/chemvault-files/r2-key";
import type { FileInitPayload, FileRecord, UploadMode, UploadSessionStatus } from "../../src/lib/chemvault-files/types";
import { assertFileInitPayload, normalizeTags, sanitizeVisibleName } from "../../src/lib/chemvault-files/validation";

export interface UploadSessionDraft {
  id: string;
  fileId: string;
  r2Key: string;
  mode: UploadMode;
  status: UploadSessionStatus;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface FileInitDraft {
  file: Omit<FileRecord, "tags">;
  session: UploadSessionDraft;
}

interface CreateFileInitDraftInput {
  payload: unknown;
  projectSlug: string;
  actorEmail: string;
  now?: Date;
  idFactory?: () => string;
  sessionIdFactory?: () => string;
}

export function createFileInitDraft(input: CreateFileInitDraftInput): FileInitDraft {
  const payload: FileInitPayload = assertFileInitPayload(input.payload);
  const now = input.now ?? new Date();
  const timestamp = now.toISOString();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  const fileId = input.idFactory?.() ?? crypto.randomUUID();
  const sessionId = input.sessionIdFactory?.() ?? crypto.randomUUID();
  const r2Key = buildR2Key({
    projectSlug: input.projectSlug,
    fileId,
    originalName: payload.name,
    now,
  });

  return {
    file: {
      id: fileId,
      projectId: payload.projectId,
      folderId: payload.folderId,
      displayName: payload.name,
      originalName: payload.name,
      r2Key,
      mimeType: payload.mimeType,
      sizeBytes: payload.size,
      status: "pending",
      checksum: null,
      uploadSessionId: sessionId,
      actorEmail: input.actorEmail,
      downloadCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    },
    session: {
      id: sessionId,
      fileId,
      r2Key,
      mode: "direct",
      status: "created",
      expiresAt,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  };
}

export function buildDownloadHeaders(input: { displayName: string; mimeType: string | null; sizeBytes: number }): Headers {
  const headers = new Headers();
  headers.set("content-type", input.mimeType || "application/octet-stream");
  headers.set("content-length", String(input.sizeBytes));
  headers.set("content-disposition", `attachment; filename="${sanitizeVisibleName(input.displayName)}"`);
  return headers;
}

export function coercePatchPayload(value: unknown): {
  displayName?: string;
  projectId?: string;
  folderId?: string | null;
  tags?: string[];
} {
  const input = value as Record<string, unknown>;
  const patch: ReturnType<typeof coercePatchPayload> = {};
  if (typeof input.displayName === "string") patch.displayName = sanitizeVisibleName(input.displayName);
  if (typeof input.projectId === "string" && input.projectId.trim()) patch.projectId = input.projectId.trim();
  if (typeof input.folderId === "string") patch.folderId = input.folderId.trim() || null;
  if (Array.isArray(input.tags)) patch.tags = normalizeTags(input.tags);
  return patch;
}
```

- [ ] **Step 4: Implement file API routes**

Create `functions/api/files/init.ts`:

```ts
// functions/api/files/init.ts
import type { Env } from "../../_lib/env";
import { getActorEmail } from "../../_lib/env";
import { requireDb } from "../../_lib/db";
import { createFileInitDraft } from "../../_lib/file-service";
import { okJson, parseJsonBody, routeError } from "../../_lib/http";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const db = requireDb(env.FILES_DB);
    const body = await parseJsonBody(request);
    const projectId = typeof (body as Record<string, unknown>).projectId === "string" ? String((body as Record<string, unknown>).projectId) : "";
    const project = await db.prepare("SELECT slug FROM projects WHERE id = ?").bind(projectId).first<{ slug: string }>();
    if (!project) throw new Error("Project was not found");
    const draft = createFileInitDraft({ payload: body, projectSlug: project.slug, actorEmail: getActorEmail(request, env) });
    await db.prepare(
      "INSERT INTO files (id, project_id, folder_id, display_name, original_name, r2_key, mime_type, size_bytes, status, checksum, upload_session_id, actor_email, download_count, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(draft.file.id, draft.file.projectId, draft.file.folderId, draft.file.displayName, draft.file.originalName, draft.file.r2Key, draft.file.mimeType, draft.file.sizeBytes, draft.file.status, draft.file.checksum, draft.file.uploadSessionId, draft.file.actorEmail, draft.file.downloadCount, draft.file.createdAt, draft.file.updatedAt, draft.file.deletedAt).run();
    await db.prepare(
      "INSERT INTO upload_sessions (id, file_id, r2_key, mode, status, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(draft.session.id, draft.session.fileId, draft.session.r2Key, draft.session.mode, draft.session.status, draft.session.expiresAt, draft.session.createdAt, draft.session.updatedAt).run();
    return okJson({ file: draft.file, session: draft.session, upload: { mode: "direct", method: "PUT", url: `/api/files/upload?fileId=${draft.file.id}&sessionId=${draft.session.id}` } }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
};
```

Create the remaining route files with these exact method names and database writes:

- `functions/api/files/upload.ts`: `onRequestPut` reads `fileId` and `sessionId` from `new URL(request.url).searchParams`, loads `r2_key` and `size_bytes` from `files`, writes `request.body` to `env.FILES_BUCKET.put(r2Key, request.body, { httpMetadata: { contentType: request.headers.get("content-type") || "application/octet-stream" } })`, updates `upload_sessions.status` to `uploading`, updates `files.status` to `uploading`, and returns `{ status: "uploaded", fileId, sessionId }`.
- `functions/api/files/complete.ts`: `onRequestPost` parses `{ fileId, sessionId }`, verifies the matching session row exists, calls `env.FILES_BUCKET.head(r2_key)`, updates `upload_sessions.status` to `complete`, updates `files.status` to `ready`, and returns `{ status: "ready", fileId }`.
- `functions/api/files/[id]/download.ts`: `onRequestGet` uses `context.params.id`, loads the ready file row, calls `env.FILES_BUCKET.get(r2_key)`, increments `download_count`, and returns `new Response(object.body, { headers: buildDownloadHeaders(file) })`.
- `functions/api/files/[id].ts`: `onRequestPatch` parses JSON and applies `coercePatchPayload`; it updates `display_name`, `project_id`, `folder_id`, and `updated_at`, replaces `file_tags` when tags are supplied, and returns `{ status: "updated", fileId }`. `onRequestDelete` sets `status = 'deleted'`, `deleted_at = now`, `updated_at = now`, attempts `env.FILES_BUCKET.delete(r2_key)`, and returns `{ status: "deleted", fileId }`.
- `functions/api/folders.ts`: `onRequestPost` parses `{ projectId, parentId, name }`, validates `name`, builds `slug` with `normalizeSlug`, builds `path` from parent path plus sanitized folder name, inserts the folder, and returns `{ folder }`.
- `functions/api/tags.ts`: `onRequestPost` parses `{ name, color }`, validates `name`, builds `slug`, inserts with `INSERT OR IGNORE`, selects the tag row, and returns `{ tag }`.

- [ ] **Step 5: Verify service tests GREEN**

```bash
npm test -- tests/file-service.test.ts tests/http.test.ts tests/validation.test.ts tests/r2-key.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add functions/_lib/file-service.ts functions/api/files/init.ts functions/api/files/upload.ts functions/api/files/complete.ts functions/api/files/[id].ts functions/api/files/[id]/download.ts functions/api/folders.ts functions/api/tags.ts tests/file-service.test.ts
git commit -m "feat: add file management API"
```

---

## Task 6: Frontend Workbench Markup And Styling

**Files:**
- Create: `src/components/BrandMark.astro`
- Create: `src/components/AppShell.astro`
- Create: `src/components/Sidebar.astro`
- Create: `src/components/Workspace.astro`
- Create: `src/components/Inspector.astro`
- Modify: `src/pages/index.astro`
- Create: `src/styles/chemvault-files.css`

- [ ] **Step 1: Create static component markup from concept**

Use the concept as the source of truth for layout:

- top bar with brand, `Files`, `private research file system`, search, `Upload files`, help icon, account chip;
- left rail with All Files, Recent, Starred, Trash, Projects & Folders, and Tags;
- center status band, upload queue, file table;
- right inspector with tabs, metadata, `Download`, and `Delete`.

- [ ] **Step 2: Replace `src/pages/index.astro`**

Use this structure:

```astro
---
import AppShell from "../components/AppShell.astro";
import "../styles/chemvault-files.css";
---

<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="generator" content={Astro.generator} />
    <meta name="theme-color" content="#f5f5f7" />
    <title>ChemVault Files | Private Research File System</title>
    <meta name="description" content="Private ChemVault file-management workbench for research dossiers, spectra, datasets, methods, and manuscripts." />
  </head>
  <body>
    <AppShell />
    <script>
      import { bootChemVaultFiles } from "../scripts/chemvault-files";
      bootChemVaultFiles();
    </script>
  </body>
</html>
```

- [ ] **Step 3: Create CSS tokens**

In `src/styles/chemvault-files.css`, start with:

```css
:root {
  color-scheme: light;
  --bg: #f5f5f7;
  --surface: #ffffff;
  --surface-soft: #fbfbfd;
  --text: #1d1d1f;
  --muted: #6e6e73;
  --line: rgba(0, 0, 0, 0.1);
  --strong-line: rgba(0, 0, 0, 0.22);
  --blue: #0071e3;
  --blue-strong: #0066cc;
  --green: #1d7f42;
  --red: #d70015;
  --shadow: 0 18px 54px rgba(0, 0, 0, 0.08);
  --radius: 8px;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
}
```

Then implement stable CSS grid dimensions:

- `.files-shell` as full-height app shell;
- `.files-topbar` height 68px;
- `.files-workbench` with `grid-template-columns: 314px minmax(520px, 1fr) 360px`;
- mobile breakpoint under 980px stacking rail, workspace, and inspector.

- [ ] **Step 4: Verify build**

```bash
npm run build
```

Expected: PASS and one route built.

- [ ] **Step 5: Commit**

```bash
git add src/components/BrandMark.astro src/components/AppShell.astro src/components/Sidebar.astro src/components/Workspace.astro src/components/Inspector.astro src/pages/index.astro src/styles/chemvault-files.css
git commit -m "feat: build ChemVault Files workbench UI"
```

---

## Task 7: Client State, API Wiring, And Upload Queue

**Files:**
- Create: `src/lib/chemvault-files/client-state.ts`
- Create: `tests/client-state.test.ts`
- Create: `src/scripts/chemvault-files.ts`
- Modify: `src/components/Workspace.astro` and `src/components/Inspector.astro` to add data attributes used by the controller

- [ ] **Step 1: Write failing client-state tests**

Create `tests/client-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { filterFiles, formatBytes, reduceUploadQueue } from "../src/lib/chemvault-files/client-state";
import type { FileRecord } from "../src/lib/chemvault-files/types";

const file: FileRecord = {
  id: "file_1",
  projectId: "project_spectra",
  folderId: "folder_spectra",
  displayName: "Compound_14_1H.jdx",
  originalName: "Compound_14_1H.jdx",
  r2Key: "files/spectra/2026/06/file_1/Compound_14_1H.jdx",
  mimeType: "chemical/x-jcamp-dx",
  sizeBytes: 13214592,
  status: "ready",
  checksum: null,
  uploadSessionId: null,
  actorEmail: "owner@chemvault.science",
  downloadCount: 0,
  createdAt: "2026-06-11T00:00:00.000Z",
  updatedAt: "2026-06-11T00:00:00.000Z",
  deletedAt: null,
  tags: [{ id: "tag_nmr", name: "NMR", slug: "nmr", color: "#0071e3", createdAt: "2026-06-11T00:00:00.000Z" }],
};

describe("client state", () => {
  it("formats bytes for file rows", () => {
    expect(formatBytes(13214592)).toBe("12.6 MB");
    expect(formatBytes(1288490188)).toBe("1.2 GB");
  });

  it("filters by search and tag", () => {
    expect(filterFiles([file], { search: "compound", tagSlug: "nmr", projectId: "project_spectra", folderId: null })).toHaveLength(1);
    expect(filterFiles([file], { search: "kinetics", tagSlug: "nmr", projectId: "project_spectra", folderId: null })).toHaveLength(0);
  });

  it("updates upload queue progress", () => {
    const queue = reduceUploadQueue([], { type: "add", id: "local_1", name: "raw.zip", sizeBytes: 100 });
    const progressed = reduceUploadQueue(queue, { type: "progress", id: "local_1", loadedBytes: 60 });
    expect(progressed[0]).toMatchObject({ progress: 60, status: "uploading" });
  });
});
```

- [ ] **Step 2: Run client tests and verify RED**

```bash
npm test -- tests/client-state.test.ts
```

Expected: FAIL because `client-state.ts` does not exist.

- [ ] **Step 3: Implement client-state helpers**

Create `src/lib/chemvault-files/client-state.ts` exporting `formatBytes`, `filterFiles`, and `reduceUploadQueue`. Use pure functions only so tests stay fast.

- [ ] **Step 4: Verify GREEN**

```bash
npm test -- tests/client-state.test.ts
```

Expected: PASS.

- [ ] **Step 5: Implement browser controller**

Create `src/scripts/chemvault-files.ts` with `bootChemVaultFiles()` that:

- fetches `/api/health` and renders status dots;
- fetches `/api/library` and renders projects, folders, tags, and file rows;
- falls back to seeded empty state if API returns configuration missing;
- wires search, project, folder, and tag filters;
- handles drag/drop and file input upload;
- calls `/api/files/init`, uploads to the returned `upload.url`, calls `/api/files/complete`, and refreshes the library;
- selects file rows and fills the right inspector;
- calls download URL through `window.location.href = /api/files/{id}/download`;
- calls `DELETE /api/files/{id}` and refreshes the library;
- shows structured JSON errors in the upload queue.

- [ ] **Step 6: Verify build and tests**

```bash
npm test
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/chemvault-files/client-state.ts tests/client-state.test.ts src/scripts/chemvault-files.ts src/components src/pages/index.astro
git commit -m "feat: wire ChemVault Files client interactions"
```

---

## Task 8: Docs, Local Cloudflare Verification, And Visual QA

**Files:**
- Modify: `README.md`
- Modify: `src/styles/chemvault-files.css` when browser QA finds visual drift
- Modify: `src/scripts/chemvault-files.ts` when browser QA finds interaction defects

- [ ] **Step 1: Replace starter README**

Write `README.md` with:

- project purpose;
- `npm install`;
- `npm run dev` for static UI;
- `npm run pages:dev` for Pages Functions;
- local D1 migration command: `npx wrangler d1 migrations apply chemvault-files --local`;
- R2 bucket creation command: `npx wrangler r2 bucket create chemvault-files`;
- production notes for replacing the sample `database_id`;
- Cloudflare Access note: protect `files.chemvault.science` and allow the owner's email;
- future `mail.chemvault.science` login note.

- [ ] **Step 2: Run unit tests**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Run production build**

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Run local Pages server**

```bash
npm run pages:dev
```

Expected: Wrangler serves `dist` with Functions and shows a local URL. Keep the server running for browser QA.

- [ ] **Step 5: Browser QA with the Browser plugin**

Use the Browser plugin to open the local Wrangler URL. Verify:

- desktop viewport loads without white screen;
- mobile viewport under 430px does not overflow horizontally;
- `Private Access`, `R2 online`, `D1 index`, and file table regions are visible;
- upload zone reacts to file selection or drag/drop;
- configuration-missing state is legible if local D1/R2 bindings are absent;
- selecting a file changes the inspector;
- search and tag filters update rows.

- [ ] **Step 6: Fidelity QA against generated concept**

Use `view_image` on:

- `docs/superpowers/concepts/2026-06-11-chemvault-files-workbench-concept.png`
- the latest browser screenshot captured during QA

Inspect at least:

- top bar copy and spacing;
- three-column workbench proportions;
- light gray/white palette and blue/green accents;
- upload queue and file table density;
- right inspector metadata layout;
- mobile stacking behavior.

Fix visible drift before final handoff.

- [ ] **Step 7: Commit docs and QA fixes**

```bash
git add README.md src/styles/chemvault-files.css src/scripts/chemvault-files.ts
git commit -m "docs: add ChemVault Files setup notes"
```

---

## Self-Review

Spec coverage:

- Main ChemVault-style workbench: Tasks 6, 7, and 8.
- R2 object storage and D1 metadata: Tasks 1, 3, 4, and 5.
- Project/folder/tag organization: Tasks 3, 4, 5, 6, and 7.
- Upload/download/delete flow: Tasks 5, 7, and 8.
- Large-file-ready contract: Task 5 uses `upload_sessions`, direct mode, and an upload URL contract that can switch to presigned or multipart mode later.
- Private owner access and login reservation: Tasks 1, 3, 6, 7, and 8.
- Configuration-missing UI: Tasks 4, 7, and 8.
- Testing and browser verification: Tasks 2, 3, 4, 5, 7, and 8.
- Generated concept fidelity: Tasks 6 and 8.

Placeholder scan:

- The plan avoids unresolved implementation slots.
- Task 5 gives exact exported helper code and exact route method names, query fields, database writes, R2 calls, and response shapes.

Type consistency:

- Shared names are consistent across tasks: `FileRecord`, `LibraryResponse`, `FileInitPayload`, `createFileInitDraft`, `buildDownloadHeaders`, `coercePatchPayload`, `formatBytes`, `filterFiles`, and `reduceUploadQueue`.
- Binding names are consistent: `FILES_DB`, `FILES_BUCKET`, `PRIVATE_OWNER_EMAIL`.
- Route paths are consistent with the spec and frontend upload flow.
