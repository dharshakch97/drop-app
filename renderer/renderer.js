// top of renderer.js
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

const feed = document.getElementById('feed');
const composer = document.getElementById('composer');
const contentInput = document.getElementById('content');
const tagsInput = document.getElementById('tags');
const searchInput = document.getElementById('search');
const dropzone = document.getElementById('dropzone');
const clipboardToggle = document.getElementById('clipboardToggle');

dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
});

dropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');

    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
        const sourcePath = window.dropApp.getPathForFile(file); // or file.path on older Electron
        await window.dropApp.saveFile(sourcePath, file.name);
    }
    renderFeed(searchInput.value);
});

function formatTime(ts) {
    return new Date(ts).toLocaleString();
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

const isFile = (entry) => entry.type === 'file';

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
        const bodyHtml = entry.type === 'file'
            ? `<div class="entry-file">
                📄 <span class="file-name">${escapeHtml(entry.title)}</span>
                <button data-action="open-file" data-file="${entry.content}">Open</button>
                <button data-action="reveal-file" data-file="${entry.content}">Show in folder</button>
            </div>`
            : `<pre class="entry-content">${escapeHtml(entry.content)}</pre>`;
        card.innerHTML = `
      <div class="entry-header">
        <span class="entry-time">${formatTime(entry.created_at)}</span>
        <div class="entry-actions">
          <button data-action="pin" data-id="${entry.id}">${entry.pinned ? '★' : '☆'}</button>
          ${!isFile ? `<button data-action="copy" data-id="${entry.id}">Copy</button>` : ''}
          <button data-action="delete" data-id="${entry.id}">✕</button>
        </div>
      </div>
      ${bodyHtml}
      ${entry.type === 'clipboard' ? '<div class="entry-tags">📋 clipboard</div>' : entry.tags ? `<div class="entry-tags">${escapeHtml(entry.tags)}</div>` : ''}
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
        const contentEl = btn.closest('.entry').querySelector('.entry-content');
        if (!contentEl) return;
        navigator.clipboard.writeText(contentEl.textContent);
        btn.textContent = 'Copied!';
        setTimeout(() => (btn.textContent = 'Copy'), 1000);
    } else if (action === 'open-file') {
        window.dropApp.openFile(btn.dataset.file);
    } else if (action === 'reveal-file') {
        window.dropApp.revealFile(btn.dataset.file);
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

window.dropApp.getClipboardEnabled().then((enabled) => {
    clipboardToggle.checked = enabled;
});

clipboardToggle.addEventListener('change', () => {
    window.dropApp.setClipboardEnabled(clipboardToggle.checked);
});

window.dropApp.onEntriesChanged(() => renderFeed(searchInput.value));

renderFeed();