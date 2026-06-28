# ChemVault Files

Private ChemVault-style file-management workbench for research dossiers, spectra, datasets, methods, and manuscripts.

The app is built with Astro, Cloudflare Pages Functions, D1 metadata, and R2 object storage. Production authentication is delegated to ChemVault User at `user.chemvault.science`.

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

`file.chemvault.science` should be reachable without a Cloudflare Access challenge. File APIs authenticate through the ChemVault User shared `chemvault_session` cookie and validate the session by calling `https://user.chemvault.science/api/auth/me`.

Configure ChemVault User with `COOKIE_DOMAIN=.chemvault.science` so the same login session is sent to both `user.chemvault.science` and `file.chemvault.science`. The Files project uses `USER_AUTH_ORIGIN`, `USER_LOGIN_URL`, `COOKIE_NAME`, and `COOKIE_DOMAIN` from `wrangler.jsonc`.

## Preview And Sharing

Authenticated users can preview PDF, image, CSV, text, and JCAMP-style files through `/api/files/:id/preview`. Unsupported files stay download-only.

Share links are created from the inspector. They are read-only by default, support preset or custom expiration times, and only allow downloads when the creator enables the download option. Authenticated share URLs use `/share?token=...`; public share URLs use `/share-public?token=...`. Both pages read metadata from `/api/shares/:token` and stream preview/download content through token-checked API routes. Non-public share tokens require a ChemVault User login; public tokens do not.

Preview, download, share creation, share access, and shared downloads are written to the `file_activity` table.

## Deployment

1. Configure the Pages project to build with `npm run build`.
2. Set the output directory to `dist`.
3. Bind `FILES_BUCKET` to the `chemvault-files` R2 bucket.
4. Bind `FILES_DB` to the `chemvault-files` D1 database.
5. Set `PRIVATE_OWNER_EMAIL` and `FILES_ADMIN_EMAILS` to the Super administrator email addresses used by ChemVault User.
6. Set `USER_AUTH_ORIGIN=https://user.chemvault.science`, `USER_LOGIN_URL=https://user.chemvault.science/login`, `COOKIE_NAME=chemvault_session`, and `COOKIE_DOMAIN=.chemvault.science`.
7. Apply D1 migrations before first upload. The upload API also repairs the file visibility columns and role-access table if an older D1 schema is missing them.
8. Disable the Cloudflare Access application or policy for `file.chemvault.science`; the app now performs its own user-system authentication before file APIs read or write R2 objects.

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

## License

This repository is source-available but not open source. Public visibility is
for review and reference only; no rights are granted to use, copy, modify,
distribute, host, deploy, or create derivative works without prior written
permission from Ziwen Mu or the repository owner.

See [LICENSE](./LICENSE). All rights reserved.
