document.addEventListener('DOMContentLoaded', async () => {
  const grid = document.getElementById('blog-posts');
  if (!grid) return;

  try {
    const response = await fetch('/api/posts', { headers: { Accept: 'application/json' } });
    if (!response.ok) return;
    const { posts } = await response.json();
    if (!Array.isArray(posts)) return;

    const cards = posts.map((post) => {
      const article = document.createElement('article');
      article.className = 'article-card';
      const category = document.createElement('span');
      category.className = 'tag';
      category.textContent = post.category;
      const title = document.createElement('h3');
      title.textContent = post.title;
      const excerpt = document.createElement('p');
      excerpt.textContent = post.excerpt;
      const link = document.createElement('a');
      link.href = 'index.html#estimator';
      link.className = 'read-more';
      link.textContent = 'Discuss this topic';
      article.append(category, title, excerpt, link);
      return article;
    });
    grid.replaceChildren(...cards);
    if (window.lucide) lucide.createIcons();
  } catch {
    // Keep the static articles available when the page is opened without the local server.
  }
});
