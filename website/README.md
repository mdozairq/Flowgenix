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

Your site will be at `https://<user>.github.io/<repo>/`, where **`<repo>` is the repository name on GitHub** (the slug in `github.com/<user>/<repo>`), not necessarily the VS Code extension name.

This avoids `actions/configure-pages`, which fails with **“Get Pages site failed”** until Pages is switched to **GitHub Actions** as the source (separate setup).

### Workflow green but `github.io/...` is 404

1. **Wire Pages to `gh-pages`.** A successful workflow only updates the branch. Open **Settings → Pages** and confirm **Source** is **Deploy from a branch**, **Branch** = `gh-pages`, **Folder** = `/ (root)`. Until that is saved, the site will not be served.
2. **Use the URL GitHub shows.** On the same **Pages** settings page, use **Visit site** (or the green banner URL). That is the canonical address; it always matches your real repo slug and casing.
3. **Repo name vs extension name.** If the GitHub repo is e.g. `cursor-hack`, the site is `https://<user>.github.io/cursor-hack/`, not `.../Flowgenix/`, unless you rename the repository.
4. **Private repository.** `https://github.com/<user>/<repo>` returns **404** to signed-out visitors, but **GitHub Pages** should still be reachable at `https://<user>.github.io/<repo>/` once step 1 is done. If **Pages** visibility is restricted (org policy / Enterprise), fix visibility in **Pages** settings.
5. **Propagation.** After the first successful configuration, wait a few minutes and hard-refresh; CDN can lag briefly.

Each workflow run logs **Expected site URL** and the **Pages settings** link in the job output.

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
