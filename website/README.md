# Flowgenix public site (Cursor verification)

Ship **`index.html`**, **`logo.png`**, and **`flowgenix-logo.png`** together.

Cursor’s [extension verification](https://cursor.com/docs/configuration/extensions) requires:

1. A link **from your site** to your **Open VSX** listing (see **Installation** in `index.html`).
2. The **homepage** on your **Open VSX** extension page set to **this site’s URL** (after deploy).
3. A forum post in [Extension Verification](https://forum.cursor.com/c/showcase/extension-verification/23).

## Option A — GitHub Pages (Actions artifact)

Workflow: [`.github/workflows/static.yml`](../.github/workflows/static.yml) uses **`upload-pages-artifact`** + **`deploy-pages`** (no `gh-pages` branch, no `configure-pages`).

### One-time setup

1. Repo → **Settings** → **Pages**
2. **Build and deployment** → **Source**: **GitHub Actions** (not “Deploy from a branch”) → **Save**
3. Push to `main` or run the workflow manually. Approve the **`github-pages`** environment if GitHub prompts you.

Your site will be at `https://<user>.github.io/<repo>/` where **`<repo>`** is the GitHub repository slug (`github.com/<user>/<repo>`).

### If the deploy job fails

- **Source must be GitHub Actions** — branch-based Pages and this workflow do not work together until you switch the source.
- Use the **Visit site** link on the **Pages** settings page for the canonical URL.

## Option B — Netlify (often simplest)

1. Sign in at [app.netlify.com](https://app.netlify.com)
2. **Add new site** → **Import an existing project** → connect this GitHub repo
3. Netlify reads root [`netlify.toml`](../netlify.toml): publish directory **`website`**, no real build step
4. Deploy — you get a URL like `https://random-name.netlify.app` (rename in **Site settings → Domain**)

Use that HTTPS URL for Open VSX **Homepage** and Cursor verification.

## Other hosts

- **Vercel / Cloudflare Pages:** set the published/root directory to **`website`** (or upload the files inside `website/`).

## After deploy

1. Set `package.json` → `"homepage"` to your live URL (optional).
2. On [open-vsx.org](https://open-vsx.org/), set extension **Homepage** to the same URL.
3. Post on the Cursor forum (Extension Verification) with your site URL.

Open VSX: [mdozairq.Flowgenix](https://open-vsx.org/extension/mdozairq/Flowgenix)
