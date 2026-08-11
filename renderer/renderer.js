const feed = document.getElementById('feed');
const composer = document.getElementById('composer');
const contentInput = document.getElementById('content');
const tagsInput = document.getElementById('tags');
const searchInput = document.getElementById('search');

function formatTime(ts) {
    return new Date(ts).toLocaleString();
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

async function renderFeed(search = '') {
    const entries = await window.dropApp.list({ search });
    feed.innerHTML = '';

    if (entries.length === 0) {
        feed.innerHTML = '<p class="empty">Nothing here yet. Paste something below.</p>';
        return;
    }

    for (const entry of entries) {
        const card = document.createElement('div');
        card.className = 'entry' + (entry.pinned ? ' pinned' : '');
        card.innerHTML = `
      <div class="entry-header">
        <span class="entry-time">${formatTime(entry.created_at)}</span>
        <div class="entry-actions">
          <button data-action="pin" data-id="${entry.id}">${entry.pinned ? '★' : '☆'}</button>
          <button data-action="copy" data-id="${entry.id}">Copy</button>
          <button data-action="delete" data-id="${entry.id}">✕</button>
        </div>
      </div>
      <pre class="entry-content">${escapeHtml(entry.content)}</pre>
      ${entry.tags ? `<div class="entry-tags">${escapeHtml(entry.tags)}</div>` : ''}
    `;
        feed.appendChild(card);
    }
}

feed.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const { action, id } = btn.dataset;

    if (action === 'pin') {
        await window.dropApp.togglePin(id);
        renderFeed(searchInput.value);
    } else if (action === 'delete') {
        await window.dropApp.remove(id);
        renderFeed(searchInput.value);
    } else if (action === 'copy') {
        const text = btn.closest('.entry').querySelector('.entry-content').textContent;
        navigator.clipboard.writeText(text);
        btn.textContent = 'Copied!';
        setTimeout(() => (btn.textContent = 'Copy'), 1000);
    }
});

composer.addEventListener('submit', async (e) => {
    e.preventDefault();
    const content = contentInput.value.trim();
    if (!content) return;

    await window.dropApp.create({
        type: 'snippet',
        content,
        tags: tagsInput.value.trim(),
    });

    contentInput.value = '';
    tagsInput.value = '';
    renderFeed(searchInput.value);
});

let searchTimeout;
searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => renderFeed(searchInput.value), 200);
});

renderFeed();