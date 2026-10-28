# ViralGenHub browser extension

Derived from the Postiz browser extension (https://github.com/gitroomhq/postiz-app),
Copyright (c) Gitroom / Postiz contributors, licensed AGPL-3.0. This fork keeps that
licence (see /LICENSE at the repository root). Changes: ViralGenHub branding and icons,
origins restricted to app.viralgenhub.com, narrower host permissions, origin check on
the refresh backend URL.

Build: `pnpm --filter ./apps/extension run build` (zip at apps/extension/extension.zip);
`... run build:firefox` for the Firefox (AMO) variant, `build:staging` /
`build:staging:firefox` for the staging variants. Store releases: `sh scripts/make-release.sh <dir>`
builds the Chrome/Edge zip, the Firefox zip and the AMO source zip from one clean copy.
