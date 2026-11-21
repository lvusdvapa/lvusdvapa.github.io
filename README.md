# LVUSDVAPA.org — Visual & Performing Arts website

The live Las Virgenes Unified School District Visual & Performing Arts site.
Plain HTML/CSS/JS — no build step. Whatever is in `index.html` is the live site.

## What's here
- **index.html** — the entire site (markup, styles, and script in one file).
- **CNAME** — contains `lvusdvapa.org`. This is what makes the public address
  always read **lvusdvapa.org** (never a github address).
- **.nojekyll** — tells GitHub Pages to serve the files exactly as-is.

## How it goes live (GitHub Pages)
1. Create a GitHub account (free) and a new repository.
2. Upload these files to the repo (index.html, CNAME, .nojekyll).
3. Repo → **Settings → Pages** → Source = `main` branch, folder = `/ (root)` → Save.
4. In the same Pages screen, set the custom domain to **lvusdvapa.org** and
   check **Enforce HTTPS** once it's available.

## Pointing the domain (done once, in the Wix domain settings)
The domain lives at Wix. In Wix's domain DNS settings, add the records GitHub
asks for on the Pages screen. For an apex domain (lvusdvapa.org) those are:

**A records → host `@`:**
- 185.199.108.153
- 185.199.109.153
- 185.199.110.153
- 185.199.111.153

**AAAA records (IPv6) → host `@`:**
- 2606:50c0:8000::153
- 2606:50c0:8001::153
- 2606:50c0:8002::153
- 2606:50c0:8003::153

**CNAME → host `www`** → `USERNAME.github.io` (fill in once the repo exists).

DNS can take anywhere from a few minutes to a few hours to take effect.
(Source: GitHub Pages docs — managing a custom domain.)

## Making changes later
Edit `index.html` in the repo (or hand the change to Claude). Commit → the site
redeploys automatically in ~1 minute. The address stays lvusdvapa.org throughout.

## Note on images
Some images currently load from lvusd.org's File Manager. They already work on a
non-LVUSD domain (the preview proved it). If any image is ever blocked, the fix is
to add that image file into this repo and point to it locally.
