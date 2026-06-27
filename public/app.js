// public/app.js
const state = {
  data: null,
  filter: 'all',
  keyword: ''
};

const feedList = document.getElementById('feed-list');
const statsEl = document.getElementById('stats');
const searchEl = document.getElementById('search');

// 加载数据
async function loadFeed() {
  try {
    // Vercel/Netlify/Cloudflare 都能直接访问 public/data/feed.json
    const res = await fetch('/data/feed.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.data = await res.json();
    renderStats();
    render();
  } catch (err) {
    feedList.innerHTML = `
      <div class="empty">
        <p>❌ 加载失败：${err.message}</p>
        <p style="margin-top:1rem;font-size:0.85rem">
          请先运行 <code>npm run update</code> 生成 feed.json
        </p>
      </div>
    `;
  }
}

function renderStats() {
  const { stats } = state.data;
  const updateTime = new Date(stats.updatedAt).toLocaleString('zh-CN');
  statsEl.innerHTML = `
    <span>📚 ${stats.sources} 个源</span>
    <span>📰 ${stats.items} 篇文章</span>
    <span>🕒 ${updateTime} 更新</span>
    ${stats.failed > 0 ? `<span style="color:#ef4444">⚠️ ${stats.failed} 失败</span>` : ''}
  `;
}

function render() {
  const items = state.data.items.filter(item => {
    if (state.filter !== 'all') {
      // 简单的分类匹配（实际应根据 sources.json 的 category 字段）
      const matchCategory = matchCategoryFilter(item, state.filter);
      if (!matchCategory) return false;
    }
    if (state.keyword) {
      const kw = state.keyword.toLowerCase();
      const inTitle = item.title.toLowerCase().includes(kw);
      const inSource = item.sourceTitle.toLowerCase().includes(kw);
      if (!inTitle && !inSource) return false;
    }
    return true;
  });

  if (items.length === 0) {
    feedList.innerHTML = '<div class="empty">暂无匹配文章</div>';
    return;
  }

  feedList.innerHTML = items.map(item => {
    const date = new Date(item.pubDate).toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    });
    return `
      <article class="feed-item">
        <h3 class="feed-item-title">
          <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">
            ${escapeHtml(item.title)}
          </a>
        </h3>
        <div class="feed-item-meta">
          <span class="tag">${escapeHtml(item.sourceTitle)}</span>
          ${item.author ? `<span>👤 ${escapeHtml(item.author)}</span>` : ''}
          <span>🕒 ${date}</span>
        </div>
        ${item.summary ? `<p class="feed-item-summary">${escapeHtml(item.summary)}</p>` : ''}
      </article>
    `;
  }).join('');
}

function matchCategoryFilter(item, filter) {
  const sources = {
    tech: ['Hacker News', 'Vercel', 'Cloudflare', 'Lobsters'],
    'open-source': ['GitHub']
  };
  const matches = sources[filter] || [];
  return matches.some(s => item.sourceTitle.includes(s));
}

function escapeHtml(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

// 事件绑定
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.filter = btn.dataset.filter;
    render();
  });
});

searchEl.addEventListener('input', (e) => {
  state.keyword = e.target.value.trim();
  render();
});

loadFeed();
