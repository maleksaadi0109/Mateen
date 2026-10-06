# مَتِين | Mateen

**مساعدك الذكي، للحفظ المتين.**

منصة لدراسة المتون العربية، ومتابعة التعلم والمراجعة، والاستعانة بمساعد
تعليمي، مع إحالة الأسئلة إلى المعلمين المعتمدين وفق ضوابط المنصة.

Mateen is an Arabic-first study platform for classical Islamic texts. It combines
reading, learning journeys, revision, experimental recitation support, and an
AI study assistant with consent-based teacher referrals. Its interface supports
Arabic and English; original religious passages remain Arabic.

> This README describes the current workspace, not a promise that every
> integration works immediately after cloning. Authentication, PostgreSQL,
> AI providers, private storage, and speech models require separate configuration.

## Contents

- [What the platform does](#what-the-platform-does)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [Optional integrations and limitations](#optional-integrations-and-limitations)
- [Development commands](#development-commands)
- [Tests](#tests)
- [Build and deployment](#build-and-deployment)
- [Troubleshooting](#troubleshooting)
- [Security and content rights](#security-and-content-rights)
- [Contributing](#contributing)

## What the platform does

### Learners

- Read available texts, select passages, and resume study.
- Follow learning journeys for **al-Arba'in al-Nawawiyya** and **Tuhfat al-Atfal**.
- Use revision activities, daily plans, progress views, and study reports.
- Ask the study assistant questions about supported material.
- Communicate with teachers through authorised, consent-based referrals.
- Switch between Arabic/RTL and English/LTR without replacing original texts
  or translating personal messages.

### Teachers

- Create a teacher profile and submit qualifications for review.
- Receive eligible referrals after approval.
- Provide text-based guidance through the messaging interface.

### Administrators and reviewers

- Review teacher applications and supporting documents.
- Manage scholarly sources, assessment review, assistant configuration,
  reported issues, and audit views, subject to the account's actual permissions.

### Important boundaries

- The catalog, approval state, and feature-readiness checks determine availability.
  A displayed “Coming soon” text is not an accessible course.
- AI explanations are not human scholarly approval, fatwas, or certificates.
- Recitation work is experimental. Engagement, reading, or a model transcript
  alone does not prove memorization or mastery.
- Teacher and reviewer access is not granted just by registering an account.

## Architecture

This repository is a **pnpm monorepo**, not a single frontend project.

| Location | Purpose |
| --- | --- |
| `artifacts/mateen-platform` | React 19 + Vite + TypeScript web app |
| `artifacts/api-server` | Express 5 API, authentication and application services |
| `artifacts/mateen-intro` | Separate introductory video artifact |
| `artifacts/mockup-sandbox` | Isolated component/design previews |
| `lib/db` | PostgreSQL connection, Drizzle schema and schema tools |
| `lib/api-spec` | OpenAPI source and client-generation configuration |
| `lib/api-client-react` | Generated client and React Query hooks |
| `lib/api-zod` | Generated API validation schemas |
| `scripts` | Python runtime setup and supporting tools |
| `docs` | Operational and technical documentation |

Authentication uses Clerk. The main data store is PostgreSQL. Private uploaded
files use Replit managed storage by default, with an optional private-disk
provider for standalone development. The current default
study model is OpenRouter's `google/gemini-2.5-flash` when an OpenRouter key is
configured; explicit configuration and separate NVIDIA preview tools still apply.

The public export includes application code and intended public brand assets,
not private source archives, learner recordings, browser captures or rendered
video exports. Optional video/design artifacts may need their locally authorised
media restored before they can reproduce the workspace's previews.

## Requirements

Recommended local environment:

- **Linux x86-64**, or **WSL2** on Windows.
- **Node.js 24**, with **pnpm 10**.
- A running **PostgreSQL** server and a separate local development database.
- **uv**, used by the existing build to install the locked Python runtime.
- Internet access for dependencies, authentication and optional AI calls.
- **Caddy** for the same-origin local reverse proxy described below.
- **FFmpeg/ffprobe** if you want to investigate audio features.

The workspace's dependency overrides exclude several non-Linux native packages.
Native macOS/Windows installs are therefore **not guaranteed** with the current
lockfile. Use Linux/WSL rather than assuming cross-platform support.

Python dependencies are pinned in `python-runtime.toml` and
`python-runtime.lock`. The runtime requires Python **3.13 or newer**.
Use the repository's installer instead of changing the lock or creating an
unrelated environment.

## Local setup

Run the following in your **local clone**, not against a production database.
Commands assume a Bash-compatible shell.

### 1. Clone and install

```bash
git clone https://github.com/maleksaadi0109/Mateen.git
cd Mateen

# If pnpm is not installed:
npm install --global pnpm@10

pnpm install --frozen-lockfile
cp .env.example .env.local
```

Install uv and Caddy using their official installation instructions:

- [uv installation](https://docs.astral.sh/uv/getting-started/installation/)
- [Caddy installation](https://caddyserver.com/docs/install)
- [PostgreSQL downloads](https://www.postgresql.org/download/)

On Linux, FFmpeg is available through your distribution's package manager.
Check the installed tools before starting:

```bash
node --version
pnpm --version
uv --version
caddy version
psql --version
```

### 2. Configure your local environment

Edit `.env.local` and supply **your own development credentials**.
The example file deliberately contains placeholders, not working keys.

- Point `DATABASE_URL` at a new, local development database.
- Configure matching Clerk development publishable/secret keys.
- Use the same Clerk publishable key for `CLERK_PUBLISHABLE_KEY` and
  `VITE_CLERK_PUBLISHABLE_KEY`.
- Leave `VITE_CLERK_PROXY_URL` unset for the development-key flow.
- Add an OpenRouter key only if you need live AI answers.

For a Replit-managed Clerk tenant, manage its settings in the workspace Auth
pane. For an independently hosted local environment, use a suitable Clerk
development application and its permitted local origins. Do not mix keys from
different applications or assume production proxy settings work on localhost.

Load the environment in **each terminal** used for the API or schema tools:

```bash
set -a
source .env.local
set +a
```

The scripts do not automatically load a root `.env.local` into the Express
process. Sourcing it explicitly also makes the Vite variables available.

### 3. Initialise the database schema

Create the development database using PostgreSQL's normal administration tools,
then apply the schema:

```bash
pnpm --filter @workspace/db run push
```

**Warning:** `drizzle-kit push` changes the database schema. Check
`DATABASE_URL` first. Do not use a production database or the `push-force`
command for this quickstart. A new local database does not contain the existing
workspace's users, private documents, source approvals, or study history.

### 4. Start the API — terminal A

From the repository root, after loading `.env.local`:

```bash
PORT=8080 pnpm --filter @workspace/api-server run dev
```

The development command builds and then starts the API. It is **not an
automatic TypeScript source watcher**: restart it after backend edits.

The build also installs the locked Python runtime into `.pythonlibs`.
The initial download can be large and take time. To check Python dependency
resolution without starting the API:

```bash
node scripts/install-python-runtime.mjs --check
```

Private collation datasets and scan evidence are deliberately excluded from the
public code export. The API can build and start without them, but their specific
review/import operations fail explicitly until authorised files are restored.
If you have permission, restore `passages.json` and `collation.json` under
`deliverables/aljam3-commentary/`, and `pdf-005.png`, `pdf-006.png`, `pdf-007.png`
under its `evidence/` directory. The build copies available files into the
private server output, not a browser-public directory.

### 5. Start the web app — terminal B

From the repository root, after loading `.env.local`:

```bash
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/mateen-platform run dev
```

### 6. Start the local proxy — terminal C

```bash
caddy run --config docs/Caddyfile.local --adapter caddyfile
```

Open **http://localhost:3000**, not the direct Vite port.

```text
Browser: localhost:3000
  ├── /api and /api/* → Express on localhost:8080
  └── all other paths → Vite on localhost:5173
```

The app calls relative `/api/...` URLs and uses cookie-based authentication.
Its Vite configuration does not define a local API proxy, and Express does not
enable cross-origin browser access. The reverse proxy gives both services the
same browser origin and forwards Vite's development WebSocket.

## Environment variables

Only names and placeholders are documented here. Never publish real values.

| Variable | Purpose | Requirement |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection string | API and schema tools |
| `CLERK_PUBLISHABLE_KEY` | Clerk server-side publishable key | Authentication |
| `CLERK_SECRET_KEY` | Clerk server secret key | Authentication |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk browser publishable key | Web app |
| `VITE_CLERK_PROXY_URL` | Optional Clerk proxy URL | Production/proxy configurations only |
| `OPENROUTER_API_KEY` | OpenRouter model access | Live OpenRouter assistant |
| `NVIDIA_API_KEY` | NVIDIA provider access | Explicit NVIDIA tools/models |
| `PORT` | Port for the process being started | Set separately per service |
| `BASE_PATH` | Web artifact base path | `/` for the main local app |
| `PRIVATE_OBJECT_DIR` | Private managed storage path | Upload-dependent features |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Public storage search paths | Storage-dependent features |
| `PRIVATE_STORAGE_PROVIDER` | `replit` (default) or `local` | Optional explicit standalone choice |
| `LOCAL_PRIVATE_STORAGE_DIR` | Absolute private directory outside the repository | Required for `local` |
| `LOCAL_PRIVATE_STORAGE_ORIGIN` | Browser-facing origin that routes `/api` to the API | Required for `local` |

Variables prefixed with `VITE_` are exposed to the browser. **Never** place
provider secret keys, database passwords, or Clerk secret keys in them.

## Optional integrations and limitations

### Private storage

The default `PRIVATE_STORAGE_PROVIDER=replit` keeps the existing managed storage
and credential service unchanged. Setting a bucket path alone does **not**
authorise access outside Replit. For standalone development, opt into real
private disk storage in `.env.local`:

```bash
PRIVATE_STORAGE_PROVIDER='local'
LOCAL_PRIVATE_STORAGE_DIR='/home/YOUR_USER/.local/share/mateen-private'
LOCAL_PRIVATE_STORAGE_ORIGIN='http://localhost:3000'
```

Replace the absolute path with one owned by the API process user **outside this
repository**, never a web server document root or static/public directory.
Use the origin you actually open in the browser (the local Caddy proxy above
uses port 3000), with `/api` routed to the API. Upload URLs must be absolute for
the existing audio API contract. Non-loopback origins must use HTTPS; do not put
credentials, paths or query strings in this setting.
The API creates the directory with mode `0700`, rejects symlinks and writes files
with mode `0600`. Do not share that directory with untrusted processes running
as the same OS user. Back up the entire directory privately, including its
generated `.upload-signing-key`, together with the corresponding database.
There is no public file route: downloads still use the authenticated owner or
independent-reviewer routes. Upload URLs are bearer capabilities, last at most
15 minutes (qualification PDFs: 10 minutes), permit PUT only, and accept at most
10 MiB. Do not log or share them. They can be reused until expiry; validated
documents and frozen recordings are written atomically to separate create-only
keys that can never receive an upload URL.

After sourcing `.env.local` as described above, verify storage before uploading:

```bash
pnpm --filter @workspace/api-server run storage:check
pnpm --filter @workspace/api-server run test:private-storage
```

The local check writes, reads and deletes a small private probe and checks
signing-key permissions; it fails with a clear error if storage is unavailable.
The Replit check uses private-prefix permissions, not bucket metadata access.
Neither check certifies the separate audio decoding or malware scanning tools:
qualification completion still fails closed without working ClamAV, and audio
validation still needs the documented runtime and FFmpeg.

Provider selection is explicit: there is **no automatic fallback, file copy,
database migration or rewrite of stored references**. Use a separate development
database when trying local storage. Existing Replit objects remain in Replit and
are unavailable while the local provider is selected; switch back to `replit`
to use them. Do not change providers on a database containing uploaded files
without a separately planned migration. The local provider is for a single
host with a persistent private disk, not ephemeral or multi-host deployments.
The database, reading UI and non-upload development work can be configured
without pretending the upload integration is available.

### AI assistant

A provider key alone does not publish sources or approve scholarly answers.
The selected model, available credits, assistant configuration, source policy
and evaluations also affect readiness. Missing credentials, invalid provider
output and network failures are treated as errors, not fabricated answers.

See:

- [Scholarly assistant operations](docs/scholarly-assistant-operations.md)
- [RAG documentation](docs/mateen-rag.md)
- [Content evaluation](docs/scholarly-content-evaluation.md)

### Speech and recitation

Installing Python packages is not enough to enable recitation. Readiness also
checks FFmpeg/ffprobe, runtime files, local model assets and their manifest.
Model assets in `.cache` are not distributed by a normal Git clone.

- [Recitation benchmark operations](docs/recitation-benchmark-operations.md)
- [Current live-recitation measurement status](docs/live-recitation-measurement-status.md)
- [Assessment/reviewer operations](docs/review-operations.md)

### Users and permissions

Create local accounts through the normal sign-up/onboarding flow. Existing
Clerk users and database records are not bundled with the source repository.
Teacher approval, content review and assessment review have separate controls.
Use the documented administrative process; never promote a learner or disable
authorisation merely to test a protected screen.

## Development commands

Run these from the repository root:

```bash
# TypeScript checks across the workspace
pnpm run typecheck

# Web app only
pnpm --filter @workspace/mateen-platform run typecheck

# English translation coverage
pnpm --filter @workspace/mateen-platform run i18n:audit

# Regenerate API client and validation schemas after OpenAPI changes
pnpm --filter @workspace/api-spec run codegen

# Locked Python runtime installation
node scripts/install-python-runtime.mjs
```

`lib/api-spec/openapi.yaml` is the API contract. Edit it and regenerate;
do not hand-edit generated client or validation output.

For UI copy, preserve both interface languages, parameterised English word
order and Arabic canonical text direction. Do not translate stored messages,
internal role IDs or study-source passages as part of interface localisation.

## Tests

Useful existing suites:

```bash
pnpm --filter @workspace/mateen-platform run test:message-drafts
pnpm --filter @workspace/mateen-platform run test:learning-preferences
pnpm --filter @workspace/mateen-platform run test:review-access
pnpm --filter @workspace/api-server run test:daily-plan
pnpm --filter @workspace/api-server run test:recitations
pnpm --filter @workspace/api-server run test:assessments
pnpm --filter @workspace/api-server run test:scholarly
```

The suites have different requirements; there is no single root `pnpm test`
command. Browser tests, live-provider checks and upload integration tests need
their respective configured services. Use synthetic test accounts, not private
learner data or production credentials.

See [scholarly regression documentation](docs/scholarly-regression-tests.md).
Some scholarly suites, including private collation/import checks, require authorised review datasets
and scan evidence. Recitation-page source-verification tests require the
original locally authorised source fixtures. They are not distributed with the
public code export.

The prepared-import suite currently has a known authorisation-policy mismatch:
it expects MFA enforcement for content reviewers, whereas the current
`requireAdmin` policy checks verified email and explicit content-review
permission. This suite is not fully passing; do not interpret its failure as
an AI-provider outage or silently weaken a test to claim success.

If a bundled HTTP test fails with `unable to determine transport target for
"pino-pretty"`, that is a test-bundle logging/worker-resolution issue. Do not
misreport it as a provider outage or remove application logging to hide it.

## Build and deployment

For the main website and API, with the required environment loaded:

```bash
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/mateen-platform run build
pnpm --filter @workspace/api-server run build
```

Outputs:

- Web assets: `artifacts/mateen-platform/dist/public`
- API entry: `artifacts/api-server/dist/index.mjs`
- API logging worker files: accompanying files in `artifacts/api-server/dist`

Start a built API with:

```bash
PORT=8080 NODE_ENV=production pnpm --filter @workspace/api-server run start
```

A standalone production host must additionally serve the web build, route
`/api/*` to the API, configure HTTPS and authentication, and supply the authorised
storage and model integrations. `docs/Caddyfile.local` is a **development-only**
configuration; do not use its Vite target for a production deployment.

`pnpm run build` at the root also checks and builds other workspace packages,
including supporting artifacts with their own environment requirements. Use
the filtered commands above when building only the main platform.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `PORT` or `BASE_PATH` missing | Use the service-specific commands above |
| UI opens but API calls return 404 | Open `localhost:3000` through Caddy; ensure both upstreams are running |
| Authentication fails | Matching Clerk development keys, allowed origins, and no leftover production proxy URL |
| `DATABASE_URL must be set` | Source `.env.local` in that terminal |
| PostgreSQL connection/schema error | Database is running; credentials are correct; development schema was applied |
| Assistant cannot generate an answer | Provider key/credits, model configuration, policy and readiness; inspect safe server logs |
| Upload or PDF preview fails | Run `storage:check`; select `local` with a private absolute directory for standalone use, or configure authorised Replit storage. Check ClamAV/audio runtime separately. |
| Recitation unavailable | Python runtime, FFmpeg/ffprobe, model assets and manifest |
| Native dependency installation fails | Current overrides favour Linux x86-64; use Linux/WSL |
| Backend edits do not appear | The API development command is build-and-start, not a watcher |
| Text remains Arabic in English mode | Original passages/messages are intentional; UI label dictionaries must cover render-time and catalog labels |

## Security and content rights

- Never commit `.env.local`, real API keys, session cookies, signed file URLs,
  learner recordings, or qualification documents.
- Keep private documents and student data private; source availability does
  not establish publication rights.
- Do not upload copyrighted scans or export private evidence to GitHub simply
  because they exist in a development workspace.
- Use a separate local database and synthetic accounts for development.
- Apply schema changes to production only through a reviewed migration process.
- The root `package.json` declares `MIT`, but this repository currently has no
  standalone `LICENSE` file. That declaration does **not** license book scans,
  third-party media or scholarly content. Confirm the intended code licence and
  each asset's rights before redistribution.

## Contributing

1. Create a branch for a focused change.
2. Preserve access controls and original study content.
3. Update the OpenAPI contract before changing API request/response shapes.
4. Include Arabic and English UI copy and check RTL/LTR layouts.
5. Run the affected tests, type checks and translation audit.
6. Document integration limitations rather than adding fake data or silent fallbacks.
7. Submit a pull request describing what changed and how it was verified.

If you are exporting a full development workspace rather than a fresh public
clone, use a clean checkout and an explicit code-file allowlist. `.gitignore`
does not remove files already tracked in Git or purge historical commits.
Private archives and source-review datasets must not be copied into that export.

---

### ملخص التشغيل بالعربية

ثبّت المتطلبات، ثم انسخ `.env.example` إلى `.env.local` واملأه بمفاتيح
التطوير واتصال قاعدة بيانات محلية. حمّل الملف في الطرفيات باستخدام
`set -a; source .env.local; set +a`، وطبّق المخطط على قاعدة التطوير فقط.
شغّل الخادم على `8080` والواجهة على `5173` وCaddy على `3000` بالأوامر أعلاه،
ثم افتح `http://localhost:3000`.

التخزين الخاص ونماذج الصوت ليست مرفقة تلقائيًا مع الكود. لا تنشر المفاتيح
ولا وثائق الطلاب، ولا تعتبر ردود المساعد اعتمادًا علميًا أو نتائج الحفظ
درجات موثقة دون تحقق.
