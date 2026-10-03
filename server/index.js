require('dotenv').config();

const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { database: defaultDatabase } = require('./db');

const SITE_ROOT = path.resolve(__dirname, '..');
const SESSION_MAX_AGE = 8 * 60 * 60 * 1000;

class SQLiteSessionStore extends session.Store {
  constructor(database) {
    super();
    this.database = database;
    this.readSession = database.prepare('SELECT data FROM sessions WHERE sid = ? AND expires_at > ?');
    this.writeSession = database.prepare(`
      INSERT INTO sessions (sid, expires_at, data) VALUES (?, ?, ?)
      ON CONFLICT(sid) DO UPDATE SET expires_at = excluded.expires_at, data = excluded.data
    `);
    this.deleteSession = database.prepare('DELETE FROM sessions WHERE sid = ?');
  }

  get(sid, callback) {
    try {
      const row = this.readSession.get(sid, Date.now());
      callback(null, row ? JSON.parse(row.data) : null);
    } catch (error) {
      callback(error);
    }
  }

  set(sid, sessionData, callback = () => {}) {
    try {
      const expiresAt = sessionData.cookie?.expires
        ? new Date(sessionData.cookie.expires).getTime()
        : Date.now() + SESSION_MAX_AGE;
      this.writeSession.run(sid, expiresAt, JSON.stringify(sessionData));
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  touch(sid, sessionData, callback = () => {}) {
    this.set(sid, sessionData, callback);
  }

  destroy(sid, callback = () => {}) {
    try {
      this.deleteSession.run(sid);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }
}

const leadSchema = {
  name: (value) => typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= 100,
  email: (value) => typeof value === 'string' && value.trim().length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()),
  projectFocus: (value) => typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= 160,
  brief: (value) => value === undefined || (typeof value === 'string' && value.length <= 5000),
  leadType: (value) => value === undefined || value === 'consultation' || value === 'quote',
  estimateScope: (value) => value === undefined || (typeof value === 'string' && value.length <= 160),
  estimateAmount: (value) => value === undefined || value === null || (Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 100000000)
};

const postSchema = {
  title: (value) => typeof value === 'string' && value.trim().length >= 5 && value.trim().length <= 180,
  category: (value) => typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= 60,
  excerpt: (value) => typeof value === 'string' && value.trim().length >= 10 && value.trim().length <= 500,
  body: (value) => typeof value === 'string' && value.trim().length >= 10 && value.length <= 50000,
  published: (value) => typeof value === 'boolean'
};

function validateFields(value, schema) {
  return value && typeof value === 'object' && Object.entries(schema).every(([key, isValid]) => isValid(value[key]));
}

function slugify(value) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'article';
}

function createUniqueSlug(database, title, excludedId = null) {
  const base = slugify(title);
  let slug = base;
  let suffix = 2;
  while (database.prepare('SELECT id FROM posts WHERE slug = ? AND id != ?').get(slug, excludedId || 0)) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

function requireAdmin(request, response, next) {
  if (!request.session.adminId) {
    return response.status(401).json({ error: 'Sign in as an administrator to continue.' });
  }
  next();
}

function requireSameOrigin(request, response, next) {
  const origin = request.get('origin');
  if (origin) {
    const expectedOrigin = `${request.protocol}://${request.get('host')}`;
    if (origin !== expectedOrigin) {
      return response.status(403).json({ error: 'Request origin was not allowed.' });
    }
  }
  next();
}

function createApp({ database = defaultDatabase, sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex') } = {}) {
  const app = express();
  const production = process.env.NODE_ENV === 'production';
  if (production && !process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET must be configured in production.');
  }
  if (production) app.set('trust proxy', 1);

  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com', 'https://cdnjs.cloudflare.com'],
          scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"]
      }
    }
  }));
  app.use(express.json({ limit: '64kb' }));
  app.use(express.urlencoded({ extended: false, limit: '64kb' }));
  app.use(session({
    name: 'acw.sid',
    store: new SQLiteSessionStore(database),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: production,
      sameSite: 'strict',
      maxAge: SESSION_MAX_AGE
    }
  }));

  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });
  const leadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-8', legacyHeaders: false });

  app.get('/api/health', (request, response) => response.json({ status: 'ok' }));

  app.post('/api/leads', leadLimiter, requireSameOrigin, (request, response) => {
    if (!validateFields(request.body, leadSchema)) {
      return response.status(400).json({ error: 'Please check the submitted information and try again.' });
    }
    const lead = request.body;
    const estimateAmount = lead.estimateAmount === '' || lead.estimateAmount === undefined || lead.estimateAmount === null
      ? null
      : Number(lead.estimateAmount);
    const result = database.prepare(`
      INSERT INTO leads (name, email, project_focus, brief, kind, estimate_scope, estimate_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      lead.name.trim(),
      lead.email.trim().toLowerCase(),
      lead.projectFocus.trim(),
      (lead.brief || '').trim(),
      lead.leadType || 'consultation',
      (lead.estimateScope || '').trim(),
      estimateAmount
    );
    response.status(201).json({ id: Number(result.lastInsertRowid), message: 'Request received.' });
  });

  app.get('/api/posts', (request, response) => {
    const posts = database.prepare(`
      SELECT id, slug, title, category, excerpt, created_at, updated_at
      FROM posts WHERE published = 1 ORDER BY updated_at DESC, id DESC
    `).all();
    response.json({ posts });
  });

  app.post('/api/auth/login', loginLimiter, requireSameOrigin, async (request, response, next) => {
    try {
      const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
      const password = typeof request.body?.password === 'string' ? request.body.password : '';
      const admin = database.prepare('SELECT id, email, password_hash FROM admins WHERE email = ?').get(email);
      if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
        return response.status(401).json({ error: 'Email or password was incorrect.' });
      }
      request.session.regenerate((error) => {
        if (error) return next(error);
        request.session.adminId = admin.id;
        request.session.adminEmail = admin.email;
        request.session.save((saveError) => {
          if (saveError) return next(saveError);
          response.json({ email: admin.email });
        });
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/auth/me', (request, response) => {
    if (!request.session.adminId) return response.status(401).json({ error: 'Not signed in.' });
    response.json({ email: request.session.adminEmail });
  });

  app.post('/api/auth/logout', requireSameOrigin, (request, response, next) => {
    request.session.destroy((error) => {
      if (error) return next(error);
      response.clearCookie('acw.sid', { httpOnly: true, sameSite: 'strict', secure: production });
      response.status(204).end();
    });
  });

  app.get('/api/admin/leads', requireAdmin, (request, response) => {
    const leads = database.prepare(`
      SELECT id, name, email, project_focus AS projectFocus, brief, kind,
        estimate_scope AS estimateScope, estimate_amount AS estimateAmount,
        status, created_at AS createdAt
      FROM leads ORDER BY created_at DESC, id DESC
    `).all();
    response.json({ leads });
  });

  app.patch('/api/admin/leads/:id', requireSameOrigin, requireAdmin, (request, response) => {
    const id = Number(request.params.id);
    const status = request.body?.status;
    if (!Number.isSafeInteger(id) || id < 1 || !['new', 'contacted', 'closed'].includes(status)) {
      return response.status(400).json({ error: 'Invalid lead update.' });
    }
    const result = database.prepare('UPDATE leads SET status = ? WHERE id = ?').run(status, id);
    if (!result.changes) return response.status(404).json({ error: 'Lead not found.' });
    response.json({ status });
  });

  app.get('/api/admin/posts', requireAdmin, (request, response) => {
    const posts = database.prepare(`
      SELECT id, slug, title, category, excerpt, body, published,
        created_at AS createdAt, updated_at AS updatedAt
      FROM posts ORDER BY updated_at DESC, id DESC
    `).all().map((post) => ({ ...post, published: Boolean(post.published) }));
    response.json({ posts });
  });

  app.post('/api/admin/posts', requireSameOrigin, requireAdmin, (request, response) => {
    if (!validateFields(request.body, postSchema)) {
      return response.status(400).json({ error: 'Complete each post field with valid content.' });
    }
    const post = request.body;
    const slug = createUniqueSlug(database, post.title);
    const result = database.prepare(`
      INSERT INTO posts (slug, title, category, excerpt, body, published)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(slug, post.title.trim(), post.category.trim(), post.excerpt.trim(), post.body.trim(), Number(post.published));
    response.status(201).json({ id: Number(result.lastInsertRowid), slug });
  });

  app.put('/api/admin/posts/:id', requireSameOrigin, requireAdmin, (request, response) => {
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id < 1 || !validateFields(request.body, postSchema)) {
      return response.status(400).json({ error: 'Complete each post field with valid content.' });
    }
    const post = request.body;
    const slug = createUniqueSlug(database, post.title, id);
    const result = database.prepare(`
      UPDATE posts SET slug = ?, title = ?, category = ?, excerpt = ?, body = ?,
        published = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(slug, post.title.trim(), post.category.trim(), post.excerpt.trim(), post.body.trim(), Number(post.published), id);
    if (!result.changes) return response.status(404).json({ error: 'Post not found.' });
    response.json({ id, slug });
  });

  app.delete('/api/admin/posts/:id', requireSameOrigin, requireAdmin, (request, response) => {
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return response.status(400).json({ error: 'Invalid post.' });
    const result = database.prepare('DELETE FROM posts WHERE id = ?').run(id);
    if (!result.changes) return response.status(404).json({ error: 'Post not found.' });
    response.status(204).end();
  });

  app.get(['/admin', '/admin.html'], (request, response) => response.sendFile(path.join(SITE_ROOT, 'admin.html')));
  app.use((request, response, next) => {
    if (/^\/(?:server|data|node_modules|tests)(?:\/|$)/i.test(request.path) || /^\/(?:package(?:-lock)?\.json)$/.test(request.path)) {
      return response.sendStatus(404);
    }
    next();
  });
  app.use(express.static(SITE_ROOT, { dotfiles: 'deny', index: 'index.html', extensions: ['html'] }));
  app.use('/api', (request, response) => response.status(404).json({ error: 'API endpoint not found.' }));
  app.use((error, request, response, next) => {
    if (response.headersSent) return next(error);
    if (error.type === 'entity.too.large' || error.type === 'entity.parse.failed') {
      return response.status(error.type === 'entity.too.large' ? 413 : 400).json({ error: 'Invalid request body.' });
    }
    console.error(error);
    response.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  const cleanupTimer = setInterval(() => {
    database.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
  }, 6 * 60 * 60 * 1000);
  cleanupTimer.unref();
  return app;
}

if (require.main === module) {
  const app = createApp();
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.log(`ACW backend listening at http://localhost:${port}`);
    if (!defaultDatabase.prepare('SELECT id FROM admins LIMIT 1').get()) {
      console.log('No administrator exists yet. Run "npm run admin:password" to create one.');
    }
  });
}

module.exports = { createApp, validateFields };
