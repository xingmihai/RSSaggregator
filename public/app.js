// ========== 状态管理 ==========
const state = {
  data: null,
  filter: 'all',
  keyword: '',
  sort: 'time',
  theme: localStorage.getItem('theme') ||
         (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
};

// ========== DOM ==========
const $ = (sel) => document.querySelector(sel);
const feedGrid = $('#feed-grid');
const searchEl = $('#search');
const clearBtn = $('#clear-search');
const filterChips = $('#filter-chips');
const sortBtns = document.querySelectorAll('.sort-btn');
const themeBtn = $('#theme-toggle');
const refreshBtn = $('#refresh-btn');
const backToTopBtn = $('#back-to-top');

// ========== 主题 ==========
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  $('.theme-icon').textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('theme', theme);
  state.theme = theme;
}

applyTheme(state.theme);

themeBtn.addEventListener('click', () => {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
});

// ========== 加载数据 ==========
async function loadFeed(showLoading = true) {
  if (showLoading) {
    feedGrid.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <p>加载中...</p>
      </div>
    `;
  }

  try {
    const res = await fetch('/data/feed.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.data = await res.json();
    renderStats();
    renderFilters();
    render();
  } catch (err) {
    feedGrid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <h3>加载失败</h3>
        <p>${escapeHtml(err.message)}</p>
        <p style="margin-top:0.5rem;font-size:0.8rem">
          请稍后重试，或检查 GitHub Actions 是否正常运行
        </p>
      </div>
    `;
  }
}

// ========== 统计 ==========
function renderStats() {
  const { stats } = state.data;
  $('#stat-sources').textContent = stats.sources;
  $('#stat-items').textContent = stats.items;

  const date = new Date(stats.updatedAt);
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);

  let timeText;
  if (diff < 60) timeText = '刚刚';
  else if (diff < 3600) timeText = `${Math.floor(diff / 60)} 分钟前`;
  else if (diff < 86400) timeText = `${Math.floor(diff / 3600)} 小时前`;
  else timeText = `${Math.floor(diff / 86400)} 天前`;

  $('#stat-time').textContent = timeText;
  $('#stat-time').title = date.toLocaleString('zh-CN');
}

// ========== 筛选器 ==========
function renderFilters() {
  const sources = [...new Set(state.data.items.map(i => i.sourceTitle))];

  // 全部按钮
  $('#count-all').textContent = state.data.items.length;

  // 来源按钮
  const existingChips = filterChips.querySelectorAll('[data-source]');
  existingChips.forEach(c => c.remove());

  sources.forEach(source => {
    const count = state.data.items.filter(i => i.sourceTitle === source).length;
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.dataset.filter = 'source';
    btn.dataset.source = source;
    btn.innerHTML = `
      <span>${escapeHtml(source)}</span>
      <span class="chip-count">${count}</span>
    `;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      state.filter = { type: 'source', value: source };
      render();
    });
    filterChips.appendChild(btn);
  });

  // "全部" 按钮事件
  const allBtn = filterChips.querySelector('[data-filter="all"]');
  allBtn.onclick = () => {
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    allBtn.classList.add('active');
    state.filter = 'all';
    render();
  };
}

// ========== 渲染列表 ==========
function render() {
  if (!state.data) return;

  let items = [...state.data.items];

  // 筛选
  if (state.filter === 'all') {
    // 全部
  } else if (typeof state.filter === 'object' && state.filter.type === 'source') {
    items = items.filter(i => i.sourceTitle === state.filter.value);
  }

  // 搜索
  if (state.keyword) {
    const kw = state.keyword.toLowerCase();
    items = items.filter(i =>
      i.title.toLowerCase().includes(kw) ||
      i.sourceTitle.toLowerCase().includes(kw) ||
      (i.summary || '').toLowerCase().includes(kw)
    );
  }

  // 排序
  if (state.sort === 'source') {
    items.sort((a, b) => a.sourceTitle.localeCompare(b.sourceTitle) ||
                          new Date(b.pubDate) - new Date(a.pubDate));
  } else {
    items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  }

  // 渲染
  if (items.length === 0) {
    const empty = $('#empty-template').content.cloneNode(true);
    feedGrid.innerHTML = '';
    feedGrid.appendChild(empty);
    return;
  }

  const template = $('#card-template');
  feedGrid.innerHTML = '';
  items.forEach((item, i) => {
    const card = template.content.cloneNode(true);
    const article = card.querySelector('.card');

    article.style.animationDelay = `${Math.min(i * 30, 300)}ms`;

    card.querySelector('.card-source').textContent = item.sourceTitle;
    card.querySelector('.card-date').textContent = formatDate(item.pubDate);

    const titleLink = card.querySelector('.card-title a');
    titleLink.textContent = item.title;
    titleLink.href = item.link;

    const summary = card.querySelector('.card-summary');
    if (item.summary) {
      summary.textContent = item.summary;
    } else {
      summary.style.display = 'none';
    }

    const authorEl = card.querySelector('.card-author');
    if (item.author) {
      authorEl.innerHTML = `👤 ${escapeHtml(item.author)}`;
    } else {
      authorEl.innerHTML = `🔗 ${escapeHtml(new URL(item.link).hostname.replace('www.', ''))}`;
    }

    feedGrid.appendChild(card);
  });
}

// ========== 工具函数 ==========
function escapeHtml(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);

  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} 天前`;

  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

// ========== 事件绑定 ==========

// 搜索
searchEl.addEventListener('input', (e) => {
  state.keyword = e.target.value.trim();
  clearBtn.classList.toggle('visible', !!state.keyword);
  render();
});

clearBtn.addEventListener('click', () => {
  searchEl.value = '';
  state.keyword = '';
  clearBtn.classList.remove('visible');
  render();
  searchEl.focus();
});

// 排序
sortBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    sortBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.sort = btn.dataset.sort;
    render();
  });
});

// 刷新
refreshBtn.addEventListener('click', async () => {
  const icon = refreshBtn.querySelector('.refresh-icon');
  icon.classList.add('spinning');
  await loadFeed(false);
  setTimeout(() => icon.classList.remove('spinning'), 500);
});

// 返回顶部
backToTopBtn.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

window.addEventListener('scroll', () => {
  backToTopBtn.classList.toggle('visible', window.scrollY > 400);
}, { passive: true });

// 快捷键
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
    e.preventDefault();
    searchEl.focus();
  }
  if (e.key === 'Escape' && document.activeElement === searchEl) {
    searchEl.blur();
    clearBtn.click();
  }
});

// 启动
loadFeed();

// 每 5 分钟自动刷新统计
setInterval(() => {
  if (state.data) renderStats();
}, 300000);
