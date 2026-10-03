const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function initializeDatabase(database) {
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      project_focus TEXT NOT NULL,
      brief TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL CHECK (kind IN ('consultation', 'quote')),
      estimate_scope TEXT NOT NULL DEFAULT '',
      estimate_amount INTEGER,
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'closed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      excerpt TEXT NOT NULL,
      body TEXT NOT NULL,
      published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL,
      data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS leads_created_at_idx ON leads(created_at DESC);
    CREATE INDEX IF NOT EXISTS posts_published_updated_idx ON posts(published, updated_at DESC);
    CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
  `);

  const postCount = database.prepare('SELECT COUNT(*) AS count FROM posts').get().count;
  if (postCount === 0) {
    const insert = database.prepare(`
      INSERT INTO posts (slug, title, category, excerpt, body, published)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    const starterPosts = [
      {
        slug: 'cloud-misconfigurations-data-exposure',
        title: 'Cloud misconfigurations are still the fastest path to data exposure.',
        category: 'Cloud Security',
        excerpt: 'Public sharing, weak defaults, and missing access reviews can turn simple storage mistakes into expensive operational risk.',
        body: 'Public sharing, weak defaults, and missing access reviews can turn simple storage mistakes into expensive operational risk. Review permissions regularly, remove unused identities, and monitor changes to exposed resources.'
      },
      {
        slug: 'small-security-controls-high-impact',
        title: 'The $50 security upgrade that blocks the majority of common attacks.',
        category: 'Infrastructure',
        excerpt: 'Effective protection often starts with a smaller, more disciplined control set rather than a large and expensive stack.',
        body: 'Effective protection often starts with a smaller, more disciplined control set rather than a large and expensive stack. Prioritize multi-factor authentication, timely patching, reliable backups, and tested recovery procedures.'
      },
      {
        slug: 'password-habits-business-security',
        title: 'Your password habits are usually more risky than your software stack.',
        category: 'Security',
        excerpt: 'Strong credential hygiene remains one of the lowest-cost improvements with the highest return for businesses of any size.',
        body: 'Strong credential hygiene remains one of the lowest-cost improvements with the highest return for businesses of any size. Use unique passwords, a trusted password manager, and multi-factor authentication for important accounts.'
      }
    ];
    for (const post of starterPosts) {
      insert.run(post.slug, post.title, post.category, post.excerpt, post.body);
    }
  }

  database.prepare(`
    UPDATE posts SET title = ?, updated_at = datetime('now')
    WHERE slug = ? AND title = ?
  `).run(
    'The $50 security upgrade that blocks the majority of common attacks.',
    'small-security-controls-high-impact',
    'The strongest security improvements often start small.'
  );
  database.prepare(`
    UPDATE posts SET title = ?, updated_at = datetime('now')
    WHERE slug = ? AND title = ?
  `).run(
    'Your password habits are usually more risky than your software stack.',
    'password-habits-business-security',
    'Your password habits can be riskier than your software stack.'
  );
}

function createDatabase(filename = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'acw.sqlite')) {
  if (filename !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  }
  const database = new DatabaseSync(filename);
  initializeDatabase(database);
  return database;
}

const database = createDatabase();

module.exports = { createDatabase, database, initializeDatabase };
