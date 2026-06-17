# ChemVault Files

Private ChemVault-style file-management workbench for research dossiers, spectra, datasets, methods, and manuscripts.

The app is built with Astro, Cloudflare Pages Functions, D1 metadata, and R2 object storage. It is designed for owner-only use now, with a reserved login/account surface for a future identity handoff to `mail.chemvault.science`.

The file inspector supports metadata, inline previews for safe file types, read-only share links, optional shared-download access, and a per-file activity timeline.

## Local Development

Install dependencies:

```sh
npm install
```

Run the static Astro UI:

```sh
npm run dev
```

Run checks:

```sh
npm run check
```

Build production assets:

```sh
npm run build
```

## Cloudflare Pages Local Dev

Apply the local D1 migration:

```sh
npx wrangler d1 migrations apply chemvault-files --local
```

Start Pages with Functions:

```sh
npm run pages:dev
```

The app will use local simulated D1 and R2 bindings through Wrangler. If bindings are missing, the UI falls back to a readable preview state and clearly marks configuration as missing.

## Cloudflare Resources

Enable R2 in the Cloudflare dashboard before creating the production R2 bucket. Cloudflare returns `10042: Please enable R2 through the Cloudflare Dashboard` until the account has R2 enabled.

After R2 is enabled, create the production R2 bucket:

```sh
npx wrangler r2 bucket create chemvault-files
```

The production D1 database ID is configured in `wrangler.jsonc`. Apply migrations remotely before the first deploy:

```sh
npx wrangler d1 migrations apply chemvault-files --remote
```

Cloudflare Pages does not accept `account_id` inside `wrangler.jsonc`. If local Wrangler commands cannot infer the account, provide it as an environment variable instead:

```sh
CLOUDFLARE_ACCOUNT_ID=20f69e8d2aebbadbff2b6ffa36efee50 npx wrangler d1 migrations apply chemvault-files --remote
```

## Private Access

Protect `files.chemvault.science` with Cloudflare Access before exposing production traffic. Allow only the owner email for now.

The top-right account chip and owner email plumbing are intentionally reserved so the app can later connect directly to `mail.chemvault.science`.

## Preview And Sharing

Authenticated users can preview PDF, image, CSV, text, and JCAMP-style files through `/api/files/:id/preview`. Unsupported files stay download-only.

Share links are created from the inspector. They are read-only by default, expire after 1, 7, or 30 days, and only allow downloads when the creator enables the download option. Public share URLs use `/share?token=...`; the page reads metadata from `/api/shares/:token` and streams preview/download content through token-checked API routes.

Preview, download, share creation, share access, and shared downloads are written to the `file_activity` table.

## Deployment

1. Configure the Pages project to build with `npm run build`.
2. Set the output directory to `dist`.
3. Bind `FILES_BUCKET` to the `chemvault-files` R2 bucket.
4. Bind `FILES_DB` to the `chemvault-files` D1 database.
5. Set `PRIVATE_OWNER_EMAIL` to the owner email.
6. Apply D1 migrations before first upload.
7. Keep Cloudflare Access enabled for the main app; public share API routes still validate opaque share tokens before reading R2 objects.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Astro static UI development |
| `npm run build` | Production Astro build |
| `npm run preview` | Preview built Astro output |
| `npm test` | Vitest unit tests |
| `npm run check` | Astro check plus unit tests |
| `npm run pages:dev` | Build and run Cloudflare Pages Functions locally |
| `npm run types:cf` | Generate Cloudflare binding types |
