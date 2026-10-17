# ViralGenHub

Social media scheduling for creators, small businesses and agencies: connect your accounts, then plan, schedule and publish from one calendar.

- **Use it:** [app.viralgenhub.com](https://app.viralgenhub.com) (free plan available; paid plans at [viralgenhub.com/pricing](https://viralgenhub.com/pricing))
- **Website:** [viralgenhub.com](https://viralgenhub.com)
- **API and AI-assistant (MCP) connection:** [viralgenhub.com/developers](https://viralgenhub.com/developers)
- **Help:** [viralgenhub.com/faq](https://viralgenhub.com/faq) or support@viralgenhub.com

ViralGenHub is run by Talkiru Communications Ltd (England and Wales, company 17019377).

## Built on Postiz

ViralGenHub is a fork of [Postiz](https://github.com/gitroomhq/postiz-app), the open-source social media scheduler by Gitroom. Our changes on top of Postiz include:

- a TikTok composer that follows TikTok's Content Sharing Guidelines (privacy choice with no default, interaction settings, commercial content disclosure, consent text);
- our own branding, plans and billing;
- Postiz Cloud-only features hidden, and links pointing to ViralGenHub rather than Postiz.

Names such as `postiz` and `@gitroom/...` still appear in the code (package names, container names, the CLI). We keep them on purpose so we can keep taking fixes from upstream Postiz.

ViralGenHub is not affiliated with or endorsed by Postiz or Gitroom.

## Source code

This repository is the source of the service at app.viralgenhub.com, published under the AGPL-3.0 licence (see [LICENSE](LICENSE)). The original Postiz copyright and licence notices are kept.

- **The version running live** is on the branch [`viralgenhub/release-2026-10-15`](https://github.com/Joeyblack1/viralgenhub/tree/viralgenhub/release-2026-10-15).
- **To self-host,** follow the [Postiz documentation](https://docs.postiz.com/quickstart). The setup is the same.

## Security

Report security problems privately to support@viralgenhub.com (see [SECURITY.md](SECURITY.md)). Please don't open a public issue for them.

## Licence

[AGPL-3.0](LICENSE). Copyright for the original code belongs to the Postiz authors. Our changes are also released under AGPL-3.0.
