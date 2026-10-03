document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();

  const loginView = document.getElementById('login-view');
  const dashboardView = document.getElementById('dashboard-view');
  const loginForm = document.getElementById('login-form');
  const loginMessage = document.getElementById('login-message');
  const dashboardMessage = document.getElementById('dashboard-message');
  const adminEmail = document.getElementById('admin-email');
  let posts = [];

  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers
      }
    });
    if (response.status === 204) return null;
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
    return result;
  }

  function showDashboard(email) {
    loginView.classList.add('hidden');
    dashboardView.classList.remove('hidden');
    adminEmail.textContent = email;
    loadLeads();
    loadPosts();
  }

  function showLogin(message = '') {
    dashboardView.classList.add('hidden');
    loginView.classList.remove('hidden');
    loginMessage.textContent = message;
  }

  function setMessage(message, isError = false) {
    dashboardMessage.textContent = message;
    dashboardMessage.style.color = isError ? '#fda4af' : '#34d399';
  }

  function addText(parent, tagName, text, className = '') {
    const element = document.createElement(tagName);
    element.textContent = text;
    if (className) element.className = className;
    parent.append(element);
    return element;
  }

  async function loadLeads() {
    const list = document.getElementById('leads-list');
    list.replaceChildren();
    try {
      const { leads } = await request('/api/admin/leads');
      if (!leads.length) {
        addText(list, 'p', 'No requests received yet.', 'admin-empty');
        return;
      }
      for (const lead of leads) {
        const row = document.createElement('article');
        row.className = 'admin-lead';
        const details = document.createElement('div');
        addText(details, 'h3', lead.name);
        const metadata = document.createElement('div');
        metadata.className = 'admin-lead-meta';
        const emailLink = document.createElement('a');
        emailLink.href = `mailto:${lead.email}`;
        emailLink.textContent = lead.email;
        metadata.append(emailLink);
        addText(metadata, 'span', lead.kind === 'quote' ? 'Quote request' : 'Consultation');
        addText(metadata, 'span', new Date(`${lead.createdAt}Z`).toLocaleString());
        details.append(metadata);
        addText(details, 'p', lead.projectFocus);
        if (lead.estimateScope) addText(details, 'p', `Estimate: ${lead.estimateScope}${lead.estimateAmount === null ? '' : ` | $${Number(lead.estimateAmount).toLocaleString()} USD`}`);
        if (lead.brief) addText(details, 'p', lead.brief);

        const status = document.createElement('select');
        status.setAttribute('aria-label', `Status for ${lead.name}'s request`);
        for (const value of ['new', 'contacted', 'closed']) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = value[0].toUpperCase() + value.slice(1);
          option.selected = lead.status === value;
          status.append(option);
        }
        status.addEventListener('change', async () => {
          try {
            await request(`/api/admin/leads/${lead.id}`, { method: 'PATCH', body: JSON.stringify({ status: status.value }) });
            setMessage('Request status updated.');
          } catch (error) {
            setMessage(error.message, true);
          }
        });
        row.append(details, status);
        list.append(row);
      }
    } catch (error) {
      list.replaceChildren();
      addText(list, 'p', error.message, 'admin-empty');
    }
  }

  async function loadPosts(selectedId = null) {
    const list = document.getElementById('posts-list');
    list.replaceChildren();
    try {
      const result = await request('/api/admin/posts');
      posts = result.posts;
      if (!posts.length) addText(list, 'p', 'No posts saved yet.', 'admin-empty');
      for (const post of posts) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `admin-post-item${post.id === selectedId ? ' is-selected' : ''}`;
        button.addEventListener('click', () => selectPost(post.id));
        addText(button, 'strong', post.title);
        addText(button, 'small', `${post.category} · ${post.published ? 'Published' : 'Draft'}`);
        list.append(button);
      }
      if (selectedId !== null) selectPost(selectedId, false);
    } catch (error) {
      addText(list, 'p', error.message, 'admin-empty');
    }
  }

  function selectPost(id, updateList = true) {
    const post = posts.find((item) => item.id === id);
    if (!post) return;
    const form = document.getElementById('post-form');
    form.elements.id.value = post.id;
    form.elements.title.value = post.title;
    form.elements.category.value = post.category;
    form.elements.excerpt.value = post.excerpt;
    form.elements.body.value = post.body;
    form.elements.published.checked = post.published;
    document.getElementById('delete-post-button').hidden = false;
    if (updateList) {
      document.querySelectorAll('.admin-post-item').forEach((button) => button.classList.remove('is-selected'));
      const selected = [...document.querySelectorAll('.admin-post-item')].find((button) => button.querySelector('strong')?.textContent === post.title);
      selected?.classList.add('is-selected');
    }
  }

  function resetPostForm() {
    document.getElementById('post-form').reset();
    document.getElementById('post-id').value = '';
    document.getElementById('delete-post-button').hidden = true;
    document.querySelectorAll('.admin-post-item').forEach((button) => button.classList.remove('is-selected'));
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginMessage.textContent = '';
    const form = new FormData(loginForm);
    try {
      const result = await request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') })
      });
      loginForm.reset();
      showDashboard(result.email);
    } catch (error) {
      loginMessage.textContent = error.message;
    }
  });

  document.getElementById('logout-button').addEventListener('click', async () => {
    try {
      await request('/api/auth/logout', { method: 'POST' });
      showLogin();
    } catch (error) {
      setMessage(error.message, true);
    }
  });

  document.querySelectorAll('.admin-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach((item) => {
        const active = item === tab;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-selected', String(active));
      });
      document.querySelectorAll('[data-panel]').forEach((panel) => {
        panel.classList.toggle('hidden', panel.dataset.panel !== tab.dataset.tab);
      });
    });
  });

  document.getElementById('refresh-leads').addEventListener('click', loadLeads);
  document.getElementById('new-post-button').addEventListener('click', resetPostForm);
  document.getElementById('post-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const post = {
      title: data.get('title'),
      category: data.get('category'),
      excerpt: data.get('excerpt'),
      body: data.get('body'),
      published: data.get('published') === 'on'
    };
    const id = data.get('id');
    try {
      await request(id ? `/api/admin/posts/${id}` : '/api/admin/posts', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(post)
      });
      setMessage(id ? 'Post updated.' : 'Post created.');
      resetPostForm();
      await loadPosts();
    } catch (error) {
      setMessage(error.message, true);
    }
  });

  document.getElementById('delete-post-button').addEventListener('click', async () => {
    const id = document.getElementById('post-id').value;
    if (!id || !window.confirm('Delete this post? This cannot be undone.')) return;
    try {
      await request(`/api/admin/posts/${id}`, { method: 'DELETE' });
      setMessage('Post deleted.');
      resetPostForm();
      await loadPosts();
    } catch (error) {
      setMessage(error.message, true);
    }
  });

  request('/api/auth/me')
    .then((result) => showDashboard(result.email))
    .catch(() => showLogin());
});
