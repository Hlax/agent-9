# Connect your domain and turn the Twin on

Steps to deploy the Twin apps and serve them on your domain so you can use it in production.

---

## 1. Decide what to deploy and where

You have three Next.js apps:

| App | Purpose | Port (dev) |
|-----|---------|------------|
| **Studio** | Harvey UI, chat, sessions, review, API (identity, artifacts, proposals, cron) | 3000 |
| **Public site** | Public habitat (identity, avatar, works, habitat payload) | 3002 |
| **Habitat-staging** | Staging habitat / proposal preview (optional) | 3001 |

**Minimum for “Twin on my domain”:** Deploy **Studio** and **Public site**. Staging is optional.

**Domain plan (recommended):**
- **Public site** → **root domain** (e.g. `yourdomain.com` or `www.yourdomain.com`) — the main public-facing site.
- **Studio** → **subdomain** (e.g. `studio.yourdomain.com`) — Harvey UI and API.
- **Habitat-staging** → **subdomain** (e.g. `staging.yourdomain.com`) — optional staging/preview.

**Host:** Any platform that runs Node and can build Next.js (e.g. **Vercel**, Netlify, Railway). Vercel is the simplest for this repo.

---

## 2. Deploy Studio (main app)

1. **Connect the repo** to your host (e.g. Vercel: Import Project → this GitHub repo).
2. **Set root directory / build app:**  
   - Root: repo root.  
   - **Build command:** `pnpm build` (builds all) or build only Studio, e.g. `pnpm --filter studio build`.  
   - **Output / install:** Many hosts run `pnpm install` and `pnpm run build` from root; if the host expects a single app, set **Root Directory** to `apps/studio` and use that app’s `package.json` (and adjust build to `next build`).
3. **Environment variables (production):** Set these for Studio (see also `apps/studio/.env.example` and `docs/05_build/DEPLOY_READINESS.md`):

   | Variable | Value |
   |----------|--------|
   | `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key |
   | `OPENAI_API_KEY` | Your OpenAI API key |
   | `CRON_SECRET` | Strong random string (e.g. `openssl rand -hex 32`) |
   | `APP_URL` | **Your Studio URL**, e.g. `https://studio.yourdomain.com` (no trailing slash) |

   Optional: `MAX_TOKENS_PER_SESSION`, `LOW_TOKEN_THRESHOLD`, model overrides.

4. **Deploy.** Note the default URL (e.g. `https://twin-studio-xxx.vercel.app`).

---

## 3. Add your domain to Studio

1. In your host’s dashboard: **Project → Settings → Domains** (or equivalent).
2. **Add domain:** e.g. `studio.yourdomain.com` (or `twin.yourdomain.com`).
3. **DNS:** The host will show what to add (usually a CNAME or A record):
   - **Vercel:** CNAME `studio.yourdomain.com` → `cname.vercel-dns.com` (or the project’s target they show).
   - Or A record to the IP they give.
4. Wait for DNS to propagate (minutes to a few hours). Host will show “Verified” when ready.
5. **HTTPS:** Usually automatic (Let’s Encrypt) once the domain is verified.

**Then:** Set **`APP_URL`** in Studio’s env to that URL (e.g. `https://studio.yourdomain.com`) and redeploy if you had used a placeholder.

---

## 4. Deploy Public site and Habitat-staging

**Env vars (these two apps do not need Studio’s Supabase/OpenAI/CRON):**

| App | Root Directory | Env variable (required) |
|-----|----------------|-------------------------|
| **Habitat-staging** | `apps/habitat-staging` | `NEXT_PUBLIC_STUDIO_URL` = Studio URL (e.g. `https://your-studio.vercel.app`) |
| **Public site** | `apps/public-site` | `NEXT_PUBLIC_STUDIO_URL` = Studio URL (same) |

Each app has a `vercel.json` that runs install/build from repo root (monorepo). Create one Vercel project per app, set Root Directory, add the env var, deploy.

**Public site (detailed):**

1. **Same host or another:** Create a second project for `apps/public-site`.
2. **Build:** Root = `apps/public-site`. Install/build use repo root via `vercel.json`.
3. **Environment variable:**

   | Variable | Value |
   |----------|--------|
   | `NEXT_PUBLIC_STUDIO_URL` | Studio’s public URL, e.g. `https://studio.yourdomain.com` (no trailing slash) |

   Public site calls Studio’s `/api/public/identity`, `/api/public/artifacts`, `/api/public/habitat-content` from the browser, so this must be the **public** Studio URL (your domain or the host’s default).

4. **Deploy**, then add your **root domain** (e.g. `yourdomain.com` or `www.yourdomain.com`) in that project’s **Settings → Domains**. Set DNS (CNAME or A) as Vercel instructs. This is your main public site.

---

## 5. Database migrations

Your DB is already linked (Supabase). Ensure all migrations are applied on the **production** DB:

- From your machine (or CI), with the project linked to the **production** project ref:  
  `pnpm db:migrate`  
  (or run the SQL from `supabase/migrations` in the Supabase SQL editor).

Critical for avatar + habitat: **20250310000004_habitat_v2_payload.sql** (and any other pending migrations).

---

## 6. Turn the Twin on

1. **Auth:** Use Supabase Auth for Harvey (sign up / invite the first user). Studio’s login uses Supabase; ensure in Supabase Dashboard → Authentication → URL configuration you have:
   - **Site URL:** your Studio URL (e.g. `https://studio.yourdomain.com`).
   - **Redirect URLs:** e.g. `https://studio.yourdomain.com/**`, `https://studio.yourdomain.com/login`.

2. **Cron (optional but recommended):** So the Twin runs sessions on a schedule:
   - **Vercel:** use Vercel Cron (e.g. `vercel.json` with `crons` calling `GET https://studio.yourdomain.com/api/cron/session` with header `x-cron-secret: <CRON_SECRET>`).
   - **External:** Any cron service (e.g. cron-job.org, GitHub Actions) that runs every few minutes:  
     `GET https://studio.yourdomain.com/api/cron/session`  
     Header: `x-cron-secret: <your CRON_SECRET>`.

3. **Enable runs:** In Studio, ensure the runtime is allowed to run (e.g. set **always_on** / “Always on” in the DB `runtime_config` or via your admin flow if you have one). Or trigger sessions manually from the Session page.

4. **First use:** Log in to Studio at `https://studio.yourdomain.com`, open Review → Surface (Name, Avatar, Habitat) and Session. After some runs (or cron), you’ll see proposals to approve for staging and for publication; the public site at your domain will show the published avatar and habitat.

---

## 7. Checklist

- [ ] Studio deployed and reachable at `https://studio.yourdomain.com` (subdomain).
- [ ] Studio env: `APP_URL`, Supabase, OpenAI, `CRON_SECRET` set.
- [ ] Public site deployed and reachable at `https://yourdomain.com` or `https://www.yourdomain.com` (root domain).
- [ ] Public site env: `NEXT_PUBLIC_STUDIO_URL` = Studio URL.
- [ ] (Optional) Habitat-staging at `https://staging.yourdomain.com` (subdomain).
- [ ] DNS: root domain → public-site project; subdomains `studio` and `staging` → Studio and staging projects; HTTPS working.
- [ ] Migrations applied (including 20250310000004).
- [ ] Supabase Auth Site URL and redirect URLs include your Studio domain.
- [ ] Cron configured (optional) and `CRON_SECRET` matches.
- [ ] Logged in as Harvey and able to approve proposals; public site shows identity/avatar/works/habitat after approval.

---

## Monorepo on Vercel (if you use it)

- **Option A:** One Vercel project per app (e.g. “Twin Studio”, “Twin Public”). For each, set Root Directory to `apps/studio` or `apps/public-site`, and build command to `pnpm install && pnpm build` (from that app directory).
- **Option B:** Use Vercel’s monorepo support: one project, multiple “outputs”. Configure so that:
  - One deployment builds and serves `apps/studio` (and exposes `/api/*`).
  - Another builds and serves `apps/public-site`.

If you tell me your host (e.g. Vercel, Netlify) and your exact domain names (e.g. `studio.yourdomain.com`, `yourdomain.com`), I can adapt this into a copy-paste checklist for that setup.
