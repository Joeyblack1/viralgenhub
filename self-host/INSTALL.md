# Self-hosting ViralGenHub

ViralGenHub is a social media scheduler: a calendar, per-platform previews, a media library, a public API and an MCP server. It is an AGPL-3.0 fork of [Postiz](https://github.com/gitroomhq/postiz-app). We are not affiliated with Postiz or Gitroom. The hosted version is at [viralgenhub.com](https://viralgenhub.com). This page is for running your own copy.

## What you need

- A Linux machine or VPS with Docker Engine and the Docker Compose plugin (v2.23 or newer; `docker compose version`).
- **x86-64 (amd64).** The image is built for linux/amd64 only. On ARM (Raspberry Pi, Ampere, Apple Silicon) it runs only under emulation, which is slow.
- About **3 GB of free RAM** and 5 GB of disk. Postgres, Redis, Elasticsearch and Temporal run alongside the app.
- For real use: a domain name and a reverse proxy with HTTPS (Caddy, Traefik, nginx). Most platforms only accept HTTPS callback URLs.

## Install

1. Get the two files (replace the tag with the latest release):
   ```bash
   mkdir viralgenhub && cd viralgenhub
   curl -fsSLO https://raw.githubusercontent.com/ViralGenHub/viralgenhub/vgh-1.0.0/self-host/docker-compose.yml
   curl -fsSL -o .env https://raw.githubusercontent.com/ViralGenHub/viralgenhub/vgh-1.0.0/self-host/.env.example
   ```
2. Set the address in `.env`:
   - Trying it on the same machine: leave `VGH_URL=http://localhost:4007` and `NOT_SECURED=true`.
   - On a server: `VGH_URL=https://social.example.com` (your domain, no trailing slash) and **delete** the `NOT_SECURED` line.
3. Fill the four secrets (this writes random values into `.env`):
   ```bash
   sed -i.bak \
     -e "s|^JWT_SECRET=\$|JWT_SECRET=$(openssl rand -hex 32)|" \
     -e "s|^POSTGRES_PASSWORD=\$|POSTGRES_PASSWORD=$(openssl rand -hex 16)|" \
     -e "s|^TEMPORAL_DB_PASSWORD=\$|TEMPORAL_DB_PASSWORD=$(openssl rand -hex 16)|" \
     -e "s|^TOKEN_ENCRYPTION_KEY=\$|TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)|" .env && rm .env.bak
   ```
   Keep a copy of `.env` somewhere safe. If you lose `TOKEN_ENCRYPTION_KEY`, every connected account has to be connected again.
4. Start it:
   ```bash
   docker compose up -d
   docker compose ps     # wait until viralgenhub shows "healthy" (the first start takes 2 to 4 minutes)
   ```
5. Open `VGH_URL` in a browser and sign up. The first account is yours.
6. Close sign-ups: set `DISABLE_REGISTRATION=true` in `.env`, then `docker compose up -d`.

### Behind a reverse proxy
The app listens on `127.0.0.1:4007` by default (`VGH_BIND`, `VGH_PORT`). Point your proxy at it. Caddy example:
```
social.example.com {
    reverse_proxy 127.0.0.1:4007
}
```
The app accepts images up to 30 MB and videos up to 1 GB, so let uploads that large through the proxy (nginx: `client_max_body_size 1g;`; Caddy has no limit by default).

## Connecting platforms

Each platform needs **your own developer app** on that platform, with its keys in `.env` (variable names are in `docker-compose.yml`). The callback (redirect) URL for every platform is:

```
<VGH_URL>/integrations/social/<platform>
```
for example `https://social.example.com/integrations/social/tiktok`. After changing `.env`, run `docker compose up -d`.

Platforms that need no developer app (you paste a key or a server address in the app): Bluesky, Mastodon on other servers, Lemmy, Nostr, dev.to, WordPress, Listmonk.

Things to know:
- **TikTok:** posting needs your TikTok app approved for the Content Posting API, and the approval is per app. The composer in this fork follows TikTok's Content Sharing Guidelines (no privacy default, interactions off until ticked, commercial-content disclosure), which is what TikTok's review checks, but the review itself is yours.
- **X (Twitter):** X charges per post. `X_MONTHLY_BUDGET_USD` and `X_PAUSE_AT_USD` stop posting before your own spend limit.
- **Meta, YouTube, LinkedIn Pages, Pinterest:** each platform reviews your app before strangers can use it; until then only accounts you add as testers in the platform's developer console can connect.
- The ViralGenHub Chrome extension (used for Skool) only talks to the hosted app, not to self-hosted copies.

## Plans and billing
With no `STRIPE_*` keys (the default here), billing is off and every workspace has every feature, with no channel or post limits.

## Updating
1. Read the release notes: https://github.com/ViralGenHub/viralgenhub/releases
2. Set `VGH_TAG` in `.env` to the new tag.
3. Back up the database first:
   ```bash
   docker compose exec -T postgres pg_dump -U vgh viralgenhub | gzip > backup-$(date +%F).sql.gz
   ```
4. `docker compose pull && docker compose up -d`. Database migrations run when the app starts.

Avoid `:latest`; pin a release tag so you know what you run.

## Backups
Back up `.env`, the Postgres dump above, and the `uploads` volume (`docker run --rm -v viralgenhub_uploads:/u -v "$PWD":/b alpine tar czf /b/uploads-$(date +%F).tgz -C /u .`).

## Help and source
- Questions and bugs: [GitHub issues](https://github.com/ViralGenHub/viralgenhub/issues). Security problems: support@viralgenhub.com (see SECURITY.md), not a public issue.
- Licence: AGPL-3.0. If you change the code and let other people use your copy over a network, you must offer them your modified source.
- Most of Postiz's [documentation](https://docs.postiz.com) applies too; where it differs from this page, this page is right for ViralGenHub.
