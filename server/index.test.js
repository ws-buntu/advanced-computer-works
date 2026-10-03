const assert = require('node:assert/strict');
const { test } = require('node:test');
const bcrypt = require('bcryptjs');
const { DatabaseSync } = require('node:sqlite');
const { createApp } = require('./index');
const { initializeDatabase } = require('./db');

test('lead intake, admin sessions, and blog publishing use persistent API data', async (context) => {
  const database = new DatabaseSync(':memory:');
  initializeDatabase(database);
  database.prepare('INSERT INTO admins (email, password_hash) VALUES (?, ?)').run(
    'admin@example.test',
    await bcrypt.hash('Correct-Horse-Battery-Staple-1', 4)
  );

  const server = createApp({ database, sessionSecret: 'test-session-secret-long-enough' }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';

  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    database.close();
  });

  const publicPosts = await fetch(`${baseUrl}/api/posts`).then((response) => response.json());
  assert.equal(publicPosts.posts.length, 3);

  const unauthorized = await fetch(`${baseUrl}/api/admin/leads`);
  assert.equal(unauthorized.status, 401);

  const invalidLead = await fetch(`${baseUrl}/api/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'x', email: 'not-an-email', projectFocus: '' })
  });
  assert.equal(invalidLead.status, 400);

  const leadResponse = await fetch(`${baseUrl}/api/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Test Client',
      email: 'CLIENT@example.test',
      projectFocus: 'Cloud migration',
      brief: 'Move a small service to a managed cloud platform.',
      leadType: 'quote',
      estimateScope: 'Cloud Migration & Setup',
      estimateAmount: 7500
    })
  });
  assert.equal(leadResponse.status, 201);

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.test', password: 'Correct-Horse-Battery-Staple-1' })
  });
  assert.equal(loginResponse.status, 200);
  cookie = loginResponse.headers.getSetCookie()[0].split(';')[0];

  const leads = await fetch(`${baseUrl}/api/admin/leads`, { headers: { Cookie: cookie } }).then((response) => response.json());
  assert.equal(leads.leads[0].email, 'client@example.test');
  assert.equal(leads.leads[0].estimateAmount, 7500);
  assert.equal(leads.leads[0].status, 'new');

  const updateLead = await fetch(`${baseUrl}/api/admin/leads/${leads.leads[0].id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ status: 'contacted' })
  });
  assert.equal(updateLead.status, 200);

  const createPost = await fetch(`${baseUrl}/api/admin/posts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      title: 'A practical backup strategy',
      category: 'Resilience',
      excerpt: 'A concise guide to backups and recovery checks.',
      body: 'Keep multiple copies, separate failure domains, and regularly test restoring important business data.',
      published: true
    })
  });
  assert.equal(createPost.status, 201);
  const createdPost = await createPost.json();
  assert.equal(createdPost.slug, 'a-practical-backup-strategy');

  const publishedPosts = await fetch(`${baseUrl}/api/posts`).then((response) => response.json());
  assert.ok(publishedPosts.posts.some((post) => post.slug === createdPost.slug));
  assert.equal('body' in publishedPosts.posts[0], false);

  const updatePost = await fetch(`${baseUrl}/api/admin/posts/${createdPost.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      title: 'A safer recovery plan',
      category: 'Resilience',
      excerpt: 'Updated guidance for recovery checks and backups.',
      body: 'Keep multiple copies, separate failure domains, and regularly test restoring important business data.',
      published: false
    })
  });
  assert.equal(updatePost.status, 200);
  const unpublishedPosts = await fetch(`${baseUrl}/api/posts`).then((response) => response.json());
  assert.ok(!unpublishedPosts.posts.some((post) => post.id === createdPost.id));

  const deletePost = await fetch(`${baseUrl}/api/admin/posts/${createdPost.id}`, {
    method: 'DELETE',
    headers: { Cookie: cookie }
  });
  assert.equal(deletePost.status, 204);

  const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie } });
  assert.equal(logout.status, 204);
  const signedOut = await fetch(`${baseUrl}/api/admin/leads`, { headers: { Cookie: cookie } });
  assert.equal(signedOut.status, 401);
});
