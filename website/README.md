# Flowgenix public site (Cursor verification)

This folder is a **static site** meant to be hosted on **your own domain** (not GitHub’s `github.io` README flow). Ship **`index.html`**, **`logo.png`** (hero), and **`flowgenix-logo.png`** (nav + favicon) together.

Cursor’s [extension verification](https://cursor.com/docs/configuration/extensions) requires:

1. A link **from your site** to your **Open VSX** listing (see **Installation** in `index.html`).
2. The **homepage** on your **Open VSX** extension page set to **this site’s URL** (after deploy).
3. A forum post in [Extension Verification](https://forum.cursor.com/c/showcase/extension-verification/23).

## Deploy (pick one)

- **Vercel / Netlify / Cloudflare Pages:** connect the repo and set the **root directory** to `website` (or upload only these files).
- **Any static host:** upload `index.html` to the document root of `https://your-domain.com`.

## After deploy

1. Note your live URL, e.g. `https://flowgenix.example.com` (must be a real hostname you control).
2. In the repo, set `package.json` → `"homepage": "https://your-domain.com"` (then republish the extension if you want the manifest to match).
3. On [open-vsx.org](https://open-vsx.org/), open your extension → edit metadata → set **Homepage** to the **same** URL.
4. Post on the Cursor forum (Extension Verification) with extension name **Flowgenix** and your website URL so they can confirm the Open VSX link appears in the installation section.

Open VSX listing: [mdozairq.Flowgenix](https://open-vsx.org/extension/mdozairq/Flowgenix)
