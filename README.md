# The Ordinary

A minimal Next.js foundation with a coming-soon page for production and a gated development area to build underneath before launch.

Built by [440Hz](https://440hz.uk).

The public homepage is a **coming soon** page. Features are built under `/app` and stay gated until `NEXT_PUBLIC_SITE_LAUNCHED=true`.

## Live

- **https://theordinary-440hz.vercel.app**
- Main branch: [theordinary-git-main-440hz.vercel.app](https://theordinary-git-main-440hz.vercel.app)

Merging to GitHub `main` automatically deploys production on the 440hz Vercel team. Attach a custom domain later in Vercel if you want a cleaner URL.

## Stack

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS v4
- pnpm

## Getting started

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

- **Coming soon page:** [http://localhost:3000](http://localhost:3000)
- **Development scaffold:** [http://localhost:3000/app](http://localhost:3000/app)

In development, the `/app` routes are always accessible so you can build without toggling environment variables.

## Environment variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SITE_URL` | Public site URL for metadata and OG tags |
| `NEXT_PUBLIC_SITE_LAUNCHED` | Set to `true` when ready to launch the full site |
| `SITE_PREVIEW_SECRET` | Optional secret to preview `/app` on production before launch |

### Preview mode (production)

Before launch, visit `/app?preview=<SITE_PREVIEW_SECRET>` to enable a 7-day preview cookie and test the app on your live domain.

## Project structure

```
app/
  page.tsx           # Coming soon (public pre-launch)
  app/               # Build area — add your features here
  api/health/        # Health check endpoint
components/
  coming-soon.tsx    # Coming soon UI
lib/
  site-config.ts     # Site name, tagline, launch helpers
middleware.ts        # Launch gate
```

## Launch checklist

1. Build out your features under `app/app/`
2. Update copy and branding in `lib/site-config.ts`
3. Replace `public/og-image.svg` with your final OG asset
4. Set `NEXT_PUBLIC_SITE_URL` to your production domain
5. Set `NEXT_PUBLIC_SITE_LAUNCHED=true` in Vercel
6. Remove or rotate `SITE_PREVIEW_SECRET` after launch

## Security

- Dependencies are kept minimal (~8 production packages)
- GitHub Dependabot opens weekly update PRs
- CI runs lint, build, and `pnpm audit` on every push

## History

This repo started from the Vercel Platforms Starter Kit (commit `0b16deb`) and was reset to a clean foundation in August 2026. The original template remains in git history if needed.

## License

Private — 440Hz
