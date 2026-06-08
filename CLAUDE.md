# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a hybrid enterprise website in active migration from Classic ASP to Node.js + SQLite. The repository contains:
- **Runtime entry**: Root `server.mjs` is the single startup entry; `package.json` exposes root-level scripts
- **Deploy package**: `dist/` is generated locally as the unified upload package
- **Published site**: `html/` contains generated static HTML, assets, uploads, and deployment files
- **Runtime data**: `data/` contains local SQLite runtime data, defaulting to `data/site.sqlite`
- **Modern layer**: Node.js application in `system/server/` using **Fastify** framework, providing REST APIs, admin backend, and static site generation
- **Admin UI**: React + TypeScript + Vite application in `system/admin/`, served under `/admin/`
- **Templates**: HTML templates in `system/templates/blue/` for static page generation

The Node.js layer has been **fully refactored with Fastify framework** (2026-06-08), replacing the previous 5,880-line monolithic HTTP server with a modular, maintainable architecture.

## Development Commands

Prefer the root-level single entry for daily development and deployment:

```bash
# Root entry
npm start                    # Start unified server on PORT, default 3000
npm run dev                  # Build admin UI, then start server with --watch
npm run build                # Build unified dist/ deployment package
npm run build:dist           # Explicitly build unified dist/ deployment package
npm run build:admin          # Build only system/admin
npm run build:site           # Generate only html/
```

Server maintenance commands run through `system/server/`:

```bash
# Install server dependencies
npm --prefix system/server install

# Database management
npm --prefix system/server run db:init              # Initialize SQLite database from schema
npm --prefix system/server run db:export-access     # Export CSV from legacy Access database
npm --prefix system/server run db:import            # Import CSV files from system/server/import/
npm --prefix system/server run db:repair-encoding   # Fix legacy encoding issues

# Admin management
npm --prefix system/server run admin:create -- <username> <password>

# Static site generation
npm --prefix system/server run build:static     # Generate static HTML into html/
STATIC_OUTPUT_DIR=preview npm --prefix system/server run build:static
```

Deployment package flow:

```bash
# Local machine
npm run build

# Server, after uploading dist/ contents
npm --prefix system/server install --omit=dev
npm run build:site
PORT=3000 HOST=0.0.0.0 NODE_ENV=production npm start
```

Do not upload local `html/` as part of normal deployment. The server should generate `html/` from its own `data/site.sqlite` and `system/templates/`.

Environment variables:
- `PORT`: Server port (default: 3000)
- `HOST`: Server host (default: 127.0.0.1)
- `DATABASE_PATH`: SQLite database path (default: root `data/site.sqlite`)
- `LOG_LEVEL`: Log level (default: info, use debug for verbose)
- `NODE_ENV`: Environment (development/production)
- `COOKIE_SECRET`: Cookie encryption secret (must change in production!)
- `UPLOAD_MAX_SIZE_KB`: Upload size limit (default: 400KB)
- `ACCESS_SOURCE`: Path to legacy Access .mdb file for export
- `CSV_ENCODING`: Encoding for CSV imports (default: utf-8, use `gbk` for legacy files)
- `RESET_TABLES`: Set to `1` to reset tables before import
- `STATIC_OUTPUT_DIR`: Output directory for static generation; defaults to root `html/`

## Architecture (Fastify-based)

### Project Structure

```
system/server/
├── src/
│   ├── app.mjs                   # Fastify application entry point
│   ├── server.mjs                # Startup script
│   ├── config.mjs                # Environment and configuration
│   ├── db.mjs                    # SQLite database wrapper
│   ├── static-builder.mjs        # Static HTML generation engine (unchanged)
│   ├── static-file-handler.mjs   # Custom static file serving (case-insensitive)
│   ├── middleware/
│   │   └── auth.mjs              # Authentication middleware & decorators
│   ├── routes/
│   │   ├── auth.mjs              # Login/logout routes
│   │   ├── legacy.mjs            # Frontend dynamic routes (search, forms)
│   │   ├── api/                  # REST API routes (modular)
│   │   │   ├── products.mjs
│   │   │   ├── news.mjs
│   │   │   ├── jobs.mjs
│   │   │   ├── messages.mjs
│   │   │   ├── contacts.mjs
│   │   │   ├── uploads.mjs
│   │   │   ├── admin.mjs
│   │   │   └── site-config.mjs
│   │   └── admin/                # Backend admin routes
│   │       ├── index.mjs         # Dashboard & menu pages
│   │       └── static-gen.mjs    # Static generation UI
│   ├── services/                 # Business logic layer (unchanged)
│   └── utils/                    # Utility functions (unchanged)
├── scripts/                      # CLI tools for database and admin management
├── schema/schema.sql             # SQLite database schema
├── ../../data/site.sqlite        # SQLite runtime database (not in git)
└── import/                       # CSV files for data import
```

### Key Architectural Patterns

**1. Fastify Framework**
- High-performance Node.js web framework
- Plugin ecosystem for cookies, multipart, CORS
- Built-in schema validation and serialization
- Async/await throughout

**2. Modular Routes**
- Routes organized by feature domain
- Each route file: 100-200 lines, single responsibility
- Easy to find, modify, and test independently
- No merge conflicts when multiple developers work on different features

**3. Middleware System**
- `authHook`: Global hook to load session from cookie/token
- `requireAuth`: Decorator to protect routes requiring authentication
- Centralized error handling in `app.mjs`

**4. Static File Serving**
- Custom handler in `static-file-handler.mjs`
- Case-insensitive path matching for legacy URL compatibility
- Tries multiple path candidates: `/Product/123.html` → `/product/123.html`

**5. Service Layer (Unchanged)**
- All business logic in `src/services/` unchanged
- Database queries and domain logic
- Services are imported by route handlers

**6. Static Site Generation (Unchanged)**
- `static-builder.mjs` reads data from SQLite and renders HTML
- Templates in `system/templates/blue/` use placeholders: `#BM_*#`, `#hope_*#`
- Generated files are written to root `html/` by default

### Database Schema

Core tables:
- `admins`, `admin_sessions` - Authentication and session management
- `product_categories`, `products`, `product_photos` - Product catalog
- `news_categories`, `news` - News/articles
- `jobs` - Job listings
- `messages` - Contact form submissions
- `contacts` - Contact information
- `corporation_categories` - About/company structure pages
- `site_config`, `meta_types`, `template_variants`, `custom_labels` - Site configuration

### REST API Endpoints

### REST API Endpoints

Health & Config:
- `GET /api/health` - Health check
- `GET /api/site-config` - Site configuration (public)
- `PUT /api/site-config` - Update config (auth required)

Products:
- `GET /api/products` - List products (query: category_id, featured, visible, limit, offset)
- `GET /api/products/search?q=keyword` - Search products
- `GET /api/products/:id` - Product details
- `POST /api/products` - Create product (auth required)
- `PUT /api/products/:id` - Update product (auth required)
- `DELETE /api/products/:id` - Delete product (auth required)

News:
- `GET /api/news` - List news (query: category_id, featured, limit, offset)
- `GET /api/news/:id` - News details
- `POST /api/news` - Create news (auth required)
- `PUT /api/news/:id` - Update news (auth required)
- `DELETE /api/news/:id` - Delete news (auth required)

Jobs:
- `GET /api/jobs` - List jobs
- `GET /api/jobs/:id` - Job details
- `POST /api/jobs` - Create job (auth required)
- `PUT /api/jobs/:id` - Update job (auth required)
- `DELETE /api/jobs/:id` - Delete job (auth required)

Messages:
- `POST /api/messages` - Submit message (public)
- `GET /api/messages` - List messages (auth required)
- `GET /api/messages/:id` - Message details (auth required)
- `PUT /api/messages/:id` - Update message (auth required)
- `DELETE /api/messages/:id` - Delete message (auth required)

Contacts:
- `GET /api/contacts` - List contacts (public)
- `GET /api/contacts/:id` - Contact details (public)
- `POST /api/contacts` - Create contact (auth required)
- `PUT /api/contacts/:id` - Update contact (auth required)
- `DELETE /api/contacts/:id` - Delete contact (auth required)

Uploads:
- `POST /api/uploads?utype=prod|news` - Upload file (auth required, images only: jpg/jpeg/png/gif, max 400KB)

Admin:
- `GET /api/admin/me` - Current admin info (auth required)
- `GET /api/admin/list` - List admins (auth required)
- `POST /api/admin` - Create admin (auth required)
- `PUT /api/admin/:id` - Update admin (auth required)
- `PUT /api/admin/:id/password` - Update password (auth required)
- `DELETE /api/admin/:id` - Delete admin (auth required)

Authentication:
- `GET /admin/login` - Login page
- `POST /admin/login` - Login form handler (sets cookie)
- `GET /admin/logout` - Logout (clears cookie)
- `POST /admin/api/login` - API login (returns token in JSON)
- `POST /admin/api/logout` - API logout

Backend Pages:
- `GET /admin/dashboard` - Admin dashboard (auth required)
- `GET /admin/build` - Static generation UI (auth required)
- `POST /admin/build/generate?section=all|index|products|news|...` - Generate static pages (auth required)

Frontend Dynamic:
- `GET /search?keyword=xxx` - Search page
- `POST /ajaxcode/msg?action=add` - Submit message form
- `POST /ajaxcode/prodmsg?action=add` - Submit product inquiry

### Static File Serving

The server automatically serves public static files from root `html/`:
- `/index.html`, `/contact.html`, `/msg.html` - Main pages
- `/product/`, `/products/`, `/news/`, `/service/`, `/valve/` - Generated content
- `/images/`, `/css/`, `/js/`, `/upload/`, `/uploadfile/` - Static assets and uploads from `html/`
- Case-insensitive path matching for legacy compatibility (e.g., `/Product/123.html` → `/product/123.html`)

## Common Development Workflows

### Adding a New API Endpoint

1. Create or edit route file in `src/routes/api/`
2. Define route using Fastify API:
```javascript
export default async function myRoutes(app) {
  app.get('/my-endpoint', async (request, reply) => {
    // Use services layer
    const data = someService(request.query.param);
    return { success: true, data };
  });

  // Protected route
  app.post('/my-endpoint', {
    onRequest: [requireAuth]
  }, async (request, reply) => {
    // request.adminUser is available here
    return { success: true };
  });
}
```
3. Register route in `src/app.mjs`:
```javascript
await app.register(import('./routes/api/my-routes.mjs'), { prefix: '/api' });
```

### Adding a Backend Page

1. Create HTML response in `src/routes/admin/*.mjs`
2. Use `requireAuth` decorator to protect the route
3. Access `request.adminUser` for user info

### Modifying Static Generation

1. Edit `src/static-builder.mjs` (logic unchanged from before)
2. Update template placeholders if needed
3. Test with `npm run build:static`

### Adding Middleware

Create in `src/middleware/` and register as hook or decorator in `app.mjs`:
```javascript
app.addHook('onRequest', async (request, reply) => {
  // Global middleware
});

// Or use decorator pattern
await app.register(async (instance) => {
  instance.decorateRequest('myData', null);
  instance.addHook('onRequest', async (request) => {
    request.myData = await loadData();
  });
});
```

### Testing Changes

1. Start dev server: `npm run dev`
2. Test API: `curl http://127.0.0.1:3000/api/health`
3. Test auth: Login at `http://127.0.0.1:3000/admin/login`
4. Check logs in terminal for errors

## Important Notes

- **Encoding**: Legacy data may be in GB2312/GBK. Use `CSV_ENCODING=gbk` when importing old CSVs. The `repair-legacy-encoding.mjs` script can fix mojibake issues.
- **Path Case Sensitivity**: Static file handler normalizes paths for case-insensitive matching to handle legacy links
- **Static vs Dynamic**: Generated static HTML files are in gitignore. Only templates and source data are version controlled.
- **Services Layer**: Business logic in `src/services/` remains unchanged from the pre-Fastify version
- **Legacy Cleanup**: The static builder removes legacy marketing text patterns defined in `LEGACY_MARKETING_PATTERNS` and `LEGACY_PRODUCT_BRAND_PATTERNS`
- **Upload Limits**: Images are limited to 400KB by default (configurable via `UPLOAD_MAX_SIZE_KB`)
- **Database**: SQLite database is in root `data/` and not committed to git. Initialize it with `npm run db:init`.
- **Authentication**: Sessions are stored in `admin_sessions` table with expiration. Both cookie-based (for web) and token-based (for API) auth are supported.
- **Logging**: Fastify uses Pino for structured logging. Set `LOG_LEVEL=debug` for verbose output.

## Migration Notes (2026-06-08)

The Node.js layer was refactored from a 5,880-line monolithic HTTP server to a Fastify-based modular architecture:

**What Changed:**
- Replaced custom HTTP server with Fastify framework
- Split routes into 15+ modular files (~100-200 lines each)
- Added middleware system for authentication and error handling
- Integrated Fastify plugins for cookies, multipart uploads, CORS
- Custom static file handler for case-insensitive path matching

**What Stayed the Same:**
- All business logic in `src/services/` (unchanged)
- Static generation logic in `src/static-builder.mjs` (unchanged)
- Database schema and operations (unchanged)
- All utility functions (unchanged)

**URL Compatibility:**
- ✅ **Generated static HTML URLs**: 100% unchanged
- ✅ **Frontend dynamic URLs**: `/search`, `/ajaxcode/*` work as before
- ⚠️ **Backend admin URLs**: Simplified (old: `/spck/login.asp`, new: `/admin/login`)

**Backup:** Original `server.mjs` is backed up as `server.mjs.backup`

For detailed migration report, see `docs/fastify-migration-report.md`

## Git Workflow

- Commit message style (from recent history): Chinese descriptive format with type prefix, e.g., `重构(产品分类页): 提取生成逻辑并新增根分类首页`
- Generated static files are gitignored; only commit source files and templates
- Current branch: `main` (also the default PR target branch)
- When adding features, test locally before committing
- Services layer should not be modified unless fixing bugs or adding core functionality

## Troubleshooting

**Port already in use:**
```bash
lsof -i :3000  # Check what's using port 3000
PORT=8080 npm start  # Use different port
```

**Database locked:**
```bash
pkill -f "node src/server.mjs"  # Kill existing process
npm start
```

**Import fails:**
```bash
CSV_ENCODING=gbk npm run db:import  # Try different encoding
```

**Static generation fails:**
Check that database has data, templates exist in `system/templates/blue/`

**Authentication not working:**
Verify `COOKIE_SECRET` is set, check browser cookies, check session expiration in database

## Performance Considerations

- Fastify is one of the fastest Node.js frameworks (40k+ req/s)
- Static file serving has case-insensitive lookup overhead (acceptable for this use case)
- Database queries use SQLite's WAL mode for concurrent reads
- No ORM overhead - direct SQL queries via better-sqlite3
- Sessions are in-memory after first load, minimal DB hits

## Security

- Set strong `COOKIE_SECRET` in production
- Use HTTPS in production (configure reverse proxy)
- File uploads restricted to images only, 400KB max
- SQL injection prevented by parameterized queries
- CORS configured to allow all origins (adjust in production)
- Sessions expire after 24 hours
- No rate limiting yet (add if needed)

## Future Enhancements

Consider these for future iterations:
- Add Redis for session storage (scale horizontally)
- Build proper admin UI (Vue/React SPA)
- Add API rate limiting
- Generate OpenAPI/Swagger docs
- Add unit and integration tests
- Set up CI/CD pipeline
- Add request logging middleware
- Implement granular role-based permissions
