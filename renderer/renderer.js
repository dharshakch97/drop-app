const feed = document.getElementById('feed');
const feedWrapper = document.getElementById('feed-wrapper');
const searchInput = document.getElementById('search');
const viewSwitcher = document.getElementById('view-switcher');
const canvasSvg = document.getElementById('canvas-svg');
const dropOverlay = document.getElementById('drop-overlay');
const linkModal = document.getElementById('link-modal');
const closeLinkModal = document.getElementById('close-link-modal');
const linkCandidatesList = document.getElementById('link-candidates-list');
const addCardBtn = document.getElementById('add-card-btn');
const cardFileInput = document.getElementById('card-file-input');

// State
let currentView = localStorage.getItem('drop_view_mode') || 'canvas';
let allEntries = [];
let editingCardId = null; // ID of card currently in edit mode
let activeAttachmentQueue = []; // Attachments being edited
let activeFileTargetCardId = null;

// Sync View Switcher UI
function syncViewButtons() {
    if (!viewSwitcher || !feed) return;
    viewSwitcher.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === currentView);
    });
    feed.className = `feed view-${currentView}`;
}
syncViewButtons();

function formatTime(ts) {
    return new Date(ts).toLocaleString();
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function parseJson(str, fallback) {
    if (typeof str === 'object' && str !== null) return str;
    try {
        return JSON.parse(str);
    } catch (e) {
        return fallback;
    }
}

// Convert File object to Base64 data string
function fileToAttachment(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            resolve({
                id: 'att_' + Math.random().toString(36).substr(2, 9),
                name: file.name,
                type: file.type,
                size: file.size,
                data: e.target.result,
            });
        };
        reader.readAsDataURL(file);
    });
}

// Attach File trigger
function triggerFileInputForCard(cardId) {
    activeFileTargetCardId = cardId;
    if (cardFileInput) cardFileInput.click();
}

if (cardFileInput) {
    cardFileInput.addEventListener('change', async () => {
        if (!cardFileInput.files.length) return;
        for (const file of cardFileInput.files) {
            const att = await fileToAttachment(file);
            activeAttachmentQueue.push(att);
        }
        cardFileInput.value = '';
        renderEditAttachmentTray();
    });
}

function renderEditAttachmentTray() {
    const container = document.getElementById('edit-attachments-preview');
    if (!container) return;
    container.innerHTML = '';

    activeAttachmentQueue.forEach((att, index) => {
        const chip = document.createElement('div');
        chip.className = 'attachment-preview-chip';
        const isImg = att.type && att.type.startsWith('image/');
        chip.innerHTML = `
            ${isImg ? `<img src="${att.data}" alt="${escapeHtml(att.name)}"/>` : '📄'}
            <span>${escapeHtml(att.name)}</span>
            <span class="remove-attach" data-index="${index}">✕</span>
        `;
        container.appendChild(chip);
    });
}

// Paste Handler for Images
document.addEventListener('paste', async (e) => {
    if (!editingCardId) return;
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    let pasted = false;

    for (const item of items) {
        if (item.kind === 'file') {
            const file = item.getAsFile();
            if (file) {
                const att = await fileToAttachment(file);
                activeAttachmentQueue.push(att);
                pasted = true;
            }
        }
    }

    if (pasted) {
        renderEditAttachmentTray();
    }
});

// Drag and drop onto window creates or attaches to item
let dragTimer;
window.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (dropOverlay) dropOverlay.classList.add('active');
    clearTimeout(dragTimer);
});

window.addEventListener('dragleave', () => {
    dragTimer = setTimeout(() => {
        if (dropOverlay) dropOverlay.classList.remove('active');
    }, 100);
});

window.addEventListener('drop', async (e) => {
    e.preventDefault();
    if (dropOverlay) dropOverlay.classList.remove('active');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const newAttachments = [];
        for (const file of e.dataTransfer.files) {
            const att = await fileToAttachment(file);
            newAttachments.push(att);
        }

        // If editing a card, add to queue
        if (editingCardId) {
            activeAttachmentQueue.push(...newAttachments);
            renderEditAttachmentTray();
        } else {
            // Create a new card on canvas at drop position or scroll position
            const posX = Math.max(40, (feedWrapper ? feedWrapper.scrollLeft : 0) + e.clientX - 100);
            const posY = Math.max(40, (feedWrapper ? feedWrapper.scrollTop : 0) + e.clientY - 100);

            const newEntry = await window.dropApp.create({
                content: `Dropped files (${newAttachments.length})`,
                tags: '#files',
                attachments: newAttachments,
                layout_pos: { x: posX, y: posY },
            });
            editingCardId = newEntry.id;
            activeAttachmentQueue = newAttachments;
            renderFeed(searchInput ? searchInput.value : '');
        }
    }
});

// View Switcher Listener
if (viewSwitcher) {
    viewSwitcher.addEventListener('click', (e) => {
        const btn = e.target.closest('.view-btn');
        if (!btn) return;
        currentView = btn.dataset.view;
        localStorage.setItem('drop_view_mode', currentView);
        syncViewButtons();
        renderFeed(searchInput ? searchInput.value : '');
    });
}

// "+ New Item" Button Click Handler
if (addCardBtn) {
    addCardBtn.addEventListener('click', async () => {
        const posX = Math.max(60, (feedWrapper ? feedWrapper.scrollLeft : 0) + 120 + Math.floor(Math.random() * 60));
        const posY = Math.max(60, (feedWrapper ? feedWrapper.scrollTop : 0) + 100 + Math.floor(Math.random() * 60));

        const newEntry = await window.dropApp.create({
            content: '',
            tags: '',
            color: 'indigo',
            font_style: 'sans',
            layout_pos: { x: posX, y: posY },
        });

        editingCardId = newEntry.id;
        activeAttachmentQueue = [];
        renderFeed(searchInput ? searchInput.value : '');
    });
}

// Main Render Function
async function renderFeed(search = '') {
    const rawEntries = await window.dropApp.list({ search });
    allEntries = rawEntries;
    if (!feed) return;
    feed.innerHTML = '';

    if (rawEntries.length === 0 && !editingCardId) {
        feed.innerHTML = '<p class="empty">Canvas is clear. Click "+ New Item" above to add your first card.</p>';
        if (canvasSvg) canvasSvg.querySelectorAll('path').forEach(p => p.remove());
        return;
    }

    rawEntries.forEach((entry, idx) => {
        const isEditing = (entry.id === editingCardId);
        const color = entry.color || 'default';
        const fontStyle = entry.font_style || 'sans';
        const attachments = parseJson(entry.attachments, []);
        const links = parseJson(entry.links, []);
        const pos = parseJson(entry.layout_pos, { x: 0, y: 0 });

        let posX = pos.x;
        let posY = pos.y;
        if (posX === 0 && posY === 0) {
            posX = 60 + (idx % 4) * 340;
            posY = 60 + Math.floor(idx / 4) * 280;
        }

        const card = document.createElement('div');
        card.className = `entry color-${color} font-${fontStyle}${entry.pinned ? ' pinned' : ''}${isEditing ? ' editing' : ''}`;
        card.id = `entry-${entry.id}`;
        card.dataset.id = entry.id;

        if (currentView === 'canvas') {
            card.style.left = `${posX}px`;
            card.style.top = `${posY}px`;
        } else {
            card.style.left = '';
            card.style.top = '';
        }

        if (isEditing) {
            // Render Card in Edit Mode
            activeAttachmentQueue = [...attachments];
            card.innerHTML = `
                <div class="card-editor">
                    <div class="card-editor-row">
                        <div class="color-swatch-list">
                            <span class="mini-swatch swatch-default ${color === 'default' ? 'active' : ''}" data-color="default" title="Slate"></span>
                            <span class="mini-swatch swatch-indigo ${color === 'indigo' ? 'active' : ''}" data-color="indigo" title="Indigo"></span>
                            <span class="mini-swatch swatch-emerald ${color === 'emerald' ? 'active' : ''}" data-color="emerald" title="Emerald"></span>
                            <span class="mini-swatch swatch-amber ${color === 'amber' ? 'active' : ''}" data-color="amber" title="Amber"></span>
                            <span class="mini-swatch swatch-rose ${color === 'rose' ? 'active' : ''}" data-color="rose" title="Rose"></span>
                            <span class="mini-swatch swatch-violet ${color === 'violet' ? 'active' : ''}" data-color="violet" title="Violet"></span>
                            <span class="mini-swatch swatch-cyan ${color === 'cyan' ? 'active' : ''}" data-color="cyan" title="Cyan"></span>
                        </div>
                        <select class="card-editor-select" id="card-font-select">
                            <option value="sans" ${fontStyle === 'sans' ? 'selected' : ''}>Sans (Inter)</option>
                            <option value="mono" ${fontStyle === 'mono' ? 'selected' : ''}>Mono (Code)</option>
                            <option value="serif" ${fontStyle === 'serif' ? 'selected' : ''}>Serif (Playfair)</option>
                            <option value="handwriting" ${fontStyle === 'handwriting' ? 'selected' : ''}>Handwriting (Caveat)</option>
                        </select>
                    </div>
                    <textarea class="card-editor-textarea" id="card-content-input" placeholder="Type task or note content..." rows="3">${escapeHtml(entry.content)}</textarea>
                    <input type="text" class="card-editor-input" id="card-tags-input" placeholder="Tags (comma separated)..." value="${escapeHtml(entry.tags)}" />
                    
                    <div class="card-editor-row">
                        <button type="button" class="entry-actions button" id="btn-attach-card">📎 Attach File</button>
                    </div>
                    <div id="edit-attachments-preview" class="attachments-preview" style="margin-top:4px;"></div>

                    <div class="card-editor-footer">
                        <button type="button" class="card-editor-btn btn-cancel" data-action="cancel-edit" data-id="${entry.id}">Cancel</button>
                        <button type="button" class="card-editor-btn" data-action="save-card" data-id="${entry.id}">Done</button>
                    </div>
                </div>
            `;
            setTimeout(() => {
                renderEditAttachmentTray();
                const ta = card.querySelector('#card-content-input');
                if (ta) ta.focus();
            }, 0);

        } else {
            // Render Card in Display Mode
            let attachmentsHtml = '';
            if (attachments.length > 0) {
                attachmentsHtml = `<div class="entry-attachments">`;
                attachments.forEach(att => {
                    const isImg = att.type && att.type.startsWith('image/');
                    if (isImg) {
                        attachmentsHtml += `
                            <div class="attachment-card">
                                <img src="${att.data}" alt="${escapeHtml(att.name)}" onclick="window.open('${att.data}', '_blank')" />
                            </div>
                        `;
                    } else {
                        attachmentsHtml += `
                            <div class="attachment-card">
                                <a href="${att.data}" download="${escapeHtml(att.name)}" class="attachment-doc">
                                    📎 <span class="doc-name">${escapeHtml(att.name)}</span>
                                </a>
                            </div>
                        `;
                    }
                });
                attachmentsHtml += `</div>`;
            }

            let tagsHtml = '';
            if (entry.tags) {
                const tagList = entry.tags.split(',').map(t => t.trim()).filter(Boolean);
                if (tagList.length > 0) {
                    tagsHtml = `<div class="entry-tags">${tagList.map(t => `<span class="tag-pill">${escapeHtml(t)}</span>`).join('')}</div>`;
                }
            }

            let linksHtml = '';
            if (links.length > 0) {
                linksHtml = `<div class="entry-links">➔ Linked to ${links.length} card(s)</div>`;
            }

            card.innerHTML = `
                <div class="entry-header">
                    <div class="entry-meta">
                        <span class="entry-color-badge swatch color-${color}"></span>
                        <span class="entry-time">${formatTime(entry.created_at)}</span>
                    </div>
                    <div class="entry-actions">
                        <button data-action="edit" data-id="${entry.id}" title="Edit Card">✏️</button>
                        <button data-action="link" data-id="${entry.id}" title="Unidirectional Link/Unlink">🔗 Link</button>
                        <button data-action="pin" data-id="${entry.id}" title="Pin/Unpin">${entry.pinned ? '★' : '☆'}</button>
                        <button data-action="copy" data-id="${entry.id}" title="Copy Content">Copy</button>
                        <button data-action="delete" data-id="${entry.id}" class="btn-danger" title="Delete">✕</button>
                    </div>
                </div>
                <pre class="entry-content">${escapeHtml(entry.content || '(Empty note)')}</pre>
                ${attachmentsHtml}
                ${tagsHtml}
                ${linksHtml}
            `;
        }

        feed.appendChild(card);

        // Enable spatial drag on canvas
        if (currentView === 'canvas') {
            makeDraggable(card, entry.id);
        }
    });

    if (currentView === 'canvas') {
        renderCanvasConnections();
    } else {
        if (canvasSvg) canvasSvg.querySelectorAll('path').forEach(p => p.remove());
    }
}

// Make Card Draggable on Canvas
function makeDraggable(card, id) {
    let isDragging = false;
    let startX, startY, origLeft, origTop;

    const onMouseDown = (e) => {
        if (e.target.closest('button') || e.target.closest('a') || e.target.closest('img') || e.target.closest('input') || e.target.closest('textarea') || e.target.closest('select')) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        origLeft = parseInt(card.style.left || '0', 10);
        origTop = parseInt(card.style.top || '0', 10);
        card.style.zIndex = '10';

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const newLeft = Math.max(0, origLeft + dx);
        const newTop = Math.max(0, origTop + dy);
        card.style.left = `${newLeft}px`;
        card.style.top = `${newTop}px`;
        renderCanvasConnections();
    };

    const onMouseUp = async (e) => {
        if (!isDragging) return;
        isDragging = false;
        card.style.zIndex = '5';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        const x = parseInt(card.style.left, 10);
        const y = parseInt(card.style.top, 10);
        await window.dropApp.update(id, { layout_pos: { x, y } });
        const item = allEntries.find(e => e.id === id);
        if (item) item.layout_pos = JSON.stringify({ x, y });
    };

    card.addEventListener('mousedown', onMouseDown);
}

// Render Unidirectional SVG Arrow Wires connecting Source -> Target
function renderCanvasConnections() {
    if (!canvasSvg) return;
    canvasSvg.querySelectorAll('path').forEach(p => p.remove());
    if (currentView !== 'canvas') return;

    allEntries.forEach(sourceEntry => {
        const links = parseJson(sourceEntry.links, []);
        if (links.length === 0) return;

        const sourceEl = document.getElementById(`entry-${sourceEntry.id}`);
        if (!sourceEl) return;

        const sourceRect = {
            x: parseInt(sourceEl.style.left || '0', 10) + sourceEl.offsetWidth / 2,
            y: parseInt(sourceEl.style.top || '0', 10) + sourceEl.offsetHeight / 2,
        };

        links.forEach(targetId => {
            const targetEl = document.getElementById(`entry-${targetId}`);
            if (!targetEl) return;

            const targetRect = {
                x: parseInt(targetEl.style.left || '0', 10) + targetEl.offsetWidth / 2,
                y: parseInt(targetEl.style.top || '0', 10) + targetEl.offsetHeight / 2,
            };

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const midY = (sourceRect.y + targetRect.y) / 2;
            const d = `M ${sourceRect.x} ${sourceRect.y} C ${sourceRect.x} ${midY}, ${targetRect.x} ${midY}, ${targetRect.x} ${targetRect.y}`;
            path.setAttribute('d', d);
            path.setAttribute('class', 'canvas-wire');

            const color = sourceEntry.color || 'default';
            path.setAttribute('marker-end', `url(#arrow-${color})`);

            if (color === 'indigo') path.style.stroke = '#818cf8';
            else if (color === 'emerald') path.style.stroke = '#34d399';
            else if (color === 'amber') path.style.stroke = '#fbbf24';
            else if (color === 'rose') path.style.stroke = '#fb7185';
            else if (color === 'violet') path.style.stroke = '#c084fc';
            else if (color === 'cyan') path.style.stroke = '#38bdf8';
            else path.style.stroke = '#64748b';

            canvasSvg.appendChild(path);
        });
    });
}

// Card Event Delegation
if (feed) {
    feed.addEventListener('click', async (e) => {
        // Mini swatch color selection in editor
        if (e.target.classList.contains('mini-swatch')) {
            const cardEl = e.target.closest('.entry');
            const color = e.target.dataset.color;
            cardEl.querySelectorAll('.mini-swatch').forEach(s => s.classList.remove('active'));
            e.target.classList.add('active');

            cardEl.className = cardEl.className.replace(/color-\w+/g, `color-${color}`);
            return;
        }

        // Attach File inside card editor
        if (e.target.id === 'btn-attach-card') {
            const cardEl = e.target.closest('.entry');
            triggerFileInputForCard(cardEl.dataset.id);
            return;
        }

        // Remove attachment chip
        if (e.target.classList.contains('remove-attach')) {
            const idx = parseInt(e.target.dataset.index, 10);
            activeAttachmentQueue.splice(idx, 1);
            renderEditAttachmentTray();
            return;
        }

        const btn = e.target.closest('button');
        if (!btn) return;
        const { action, id } = btn.dataset;

        if (action === 'edit') {
            editingCardId = id;
            renderFeed(searchInput ? searchInput.value : '');
        } else if (action === 'cancel-edit') {
            const cardEntry = allEntries.find(entry => entry.id === id);
            if (cardEntry && !cardEntry.content && (!cardEntry.attachments || cardEntry.attachments === '[]')) {
                await window.dropApp.remove(id);
            }
            editingCardId = null;
            renderFeed(searchInput ? searchInput.value : '');
        } else if (action === 'save-card') {
            const cardEl = document.getElementById(`entry-${id}`);
            const content = cardEl.querySelector('#card-content-input').value.trim();
            const tags = cardEl.querySelector('#card-tags-input').value.trim();
            const fontStyle = cardEl.querySelector('#card-font-select').value;
            const activeSwatch = cardEl.querySelector('.mini-swatch.active');
            const color = activeSwatch ? activeSwatch.dataset.color : 'default';

            await window.dropApp.update(id, {
                content,
                tags,
                color,
                font_style: fontStyle,
                attachments: activeAttachmentQueue,
            });

            editingCardId = null;
            renderFeed(searchInput ? searchInput.value : '');
        } else if (action === 'pin') {
            await window.dropApp.togglePin(id);
            renderFeed(searchInput ? searchInput.value : '');
        } else if (action === 'delete') {
            await window.dropApp.remove(id);
            renderFeed(searchInput ? searchInput.value : '');
        } else if (action === 'copy') {
            const text = btn.closest('.entry').querySelector('.entry-content').textContent;
            navigator.clipboard.writeText(text);
            btn.textContent = 'Copied!';
            setTimeout(() => (btn.textContent = 'Copy'), 1000);
        } else if (action === 'link') {
            openLinkModal(id);
        }
    });
}

// Unidirectional Link / Unlink Modal
function openLinkModal(sourceId) {
    const sourceEntry = allEntries.find(e => e.id === sourceId);
    if (!sourceEntry || !linkCandidatesList || !linkModal) return;

    const existingLinks = parseJson(sourceEntry.links, []);
    linkCandidatesList.innerHTML = '';

    const candidates = allEntries.filter(e => e.id !== sourceId);

    if (candidates.length === 0) {
        linkCandidatesList.innerHTML = '<p class="modal-desc">No other cards available to link.</p>';
    } else {
        candidates.forEach(cand => {
            const isLinked = existingLinks.includes(cand.id);
            const item = document.createElement('div');
            item.className = 'link-candidate-item';
            
            const displayText = cand.content.trim() ? cand.content.slice(0, 38) : '(Untitled note)';
            item.innerHTML = `
                <div class="link-candidate-info">
                    <div class="link-candidate-text">${escapeHtml(displayText)}...</div>
                </div>
                <button class="link-btn-action ${isLinked ? 'unlink-action' : ''}" data-target-id="${cand.id}">
                    ${isLinked ? '✂️ Unlink' : '🔗 Link →'}
                </button>
            `;

            const actionBtn = item.querySelector('.link-btn-action');
            actionBtn.addEventListener('click', async () => {
                let updatedLinks = [...existingLinks];
                if (isLinked) {
                    // Toggle Off (Unlink)
                    updatedLinks = updatedLinks.filter(targetId => targetId !== cand.id);
                } else {
                    // Toggle On (Unidirectional Link: sourceId -> targetId)
                    updatedLinks.push(cand.id);
                }

                await window.dropApp.update(sourceId, { links: updatedLinks });
                linkModal.style.display = 'none';
                renderFeed(searchInput ? searchInput.value : '');
            });

            linkCandidatesList.appendChild(item);
        });
    }

    linkModal.style.display = 'flex';
}

if (closeLinkModal && linkModal) {
    closeLinkModal.addEventListener('click', () => {
        linkModal.style.display = 'none';
    });
}

// Search Filter Debounce
if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => renderFeed(searchInput.value), 200);
    });
}

// Initial Render
renderFeed();