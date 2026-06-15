# ChemVault Files

Private ChemVault-style file-management workbench for research dossiers, spectra, datasets, methods, and manuscripts.

The app is built with Astro, Cloudflare Pages Functions, D1 metadata, and R2 object storage. It is designed for owner-only use now, with a reserved login/account surface for a future identity handoff to `mail.chemvault.science`.

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

Create the production R2 bucket:

```sh
npx wrangler r2 bucket create chemvault-files
```

Create the production D1 database:

```sh
npx wrangler d1 create chemvault-files
```

After D1 is created, replace the sample `database_id` in `wrangler.jsonc` with the real ID from Cloudflare, then apply migrations remotely:

```sh
npx wrangler d1 migrations apply chemvault-files --remote
```

## Private Access

Protect `files.chemvault.science` with Cloudflare Access before exposing production traffic. Allow only the owner email for now.

The top-right account chip and owner email plumbing are intentionally reserved so the app can later connect directly to `mail.chemvault.science`.

## Deployment

1. Configure the Pages project to build with `npm run build`.
2. Set the output directory to `dist`.
3. Bind `FILES_BUCKET` to the `chemvault-files` R2 bucket.
4. Bind `FILES_DB` to the `chemvault-files` D1 database.
5. Set `PRIVATE_OWNER_EMAIL` to the owner email.
6. Apply D1 migrations before first upload.

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
