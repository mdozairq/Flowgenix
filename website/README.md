# Flowgenix public site (Cursor verification)

Ship **`index.html`**, **`logo.png`**, and **`flowgenix-logo.png`** together.

Cursor’s [extension verification](https://cursor.com/docs/configuration/extensions) requires:

1. A link **from your site** to your **Open VSX** listing (see **Installation** in `index.html`).
2. The **homepage** on your **Open VSX** extension page set to **this site’s URL** (after deploy).
3. A forum post in [Extension Verification](https://forum.cursor.com/c/showcase/extension-verification/23).

## GitHub Pages (recommended for this repo)

Workflow: [`.github/workflows/static.yml`](../.github/workflows/static.yml) pushes the **`website/`** folder to the **`gh-pages`** branch.

### One-time GitHub settings

1. Run the workflow once (push to `main` or **Actions → Run workflow**).
2. Repo → **Settings** → **Pages**
3. **Build and deployment** → **Source**: **Deploy from a branch** (not “GitHub Actions”).
4. **Branch**: `gh-pages` → **Folder**: `/ (root)` → Save.

Your site will be at `https://<user>.github.io/<repo>/`.

This avoids `actions/configure-pages`, which fails with **“Get Pages site failed”** until Pages is switched to **GitHub Actions** as the source (separate setup).

### Custom domain (optional)

Add it under the same **Pages** settings page.

## Other hosts

- **Vercel / Netlify / Cloudflare Pages:** root directory = `website`.
- **Any static host:** upload the contents of `website/`.

## After deploy

1. Set `package.json` → `"homepage"` to your live URL (optional).
2. On [open-vsx.org](https://open-vsx.org/), set extension **Homepage** to the same URL.
3. Post on the Cursor forum (Extension Verification) with your site URL.

Open VSX: [mdozairq.Flowgenix](https://open-vsx.org/extension/mdozairq/Flowgenix)
