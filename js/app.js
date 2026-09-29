/**
 * app.js – Productivity Hub frontend
 * Vanilla JS SPA with full API integration.
 */

'use strict';

/* ══════════════════════════════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════════════════════════════ */
const State = {
  view: 'tasks',          // 'tasks' | 'notes' | 'archive' | 'search'
  tasks: [],
  notes: [],
  archivedTasks: [],
  archivedNotes: [],
  tags: [],
  filterTagId: null,
  searchQuery: '',
  searchResults: { tasks: [], notes: [] },
  editingTask: null,
  editingNote: null,
  pendingSubtasks: [],     // for the task modal (new subtasks not yet saved)
};

/* ══════════════════════════════════════════════════════════════════════════════
   API HELPERS
══════════════════════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════════════════════
   LOCAL DB (Replacing API)
══════════════════════════════════════════════════════════════════════════════ */
const Db = {
  tasks: [], notes: [], tags: [],
  load() {
    const json = localStorage.getItem('productivity_db');
    if (json) {
      const data = JSON.parse(json);
      this.tasks = data.tasks || [];
      this.notes = data.notes || [];
      this.tags = data.tags || [];
    } else {
      this.tags = [{ id: 1, name: 'welcome', color: '#6366f1', created_at: new Date().toISOString() }];
      this.tasks = [{
        id: Date.now(), title: 'Welcome to Productivity Hub!', description: 'Get started by creating your first task.',
        priority: 'high', due_date: '', is_complete: false, is_pinned: true, is_archived: false,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        tag_ids: [1],
        subtasks: [{ id: Date.now() + 1, title: 'Try checking this subtask', is_done: false, position: 0 }]
      }];
      this.notes = [{
        id: Date.now() + 2, title: 'Getting Started', body: 'Welcome! You can write your notes here.\n\nMarkdown is supported too.',
        is_pinned: false, is_archived: false,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        tag_ids: [1]
      }];
      this.save();
    }
  },
  save() {
    localStorage.setItem('productivity_db', JSON.stringify({
      tasks: this.tasks, notes: this.notes, tags: this.tags
    }));
  },
  hydrateTask(t) {
    return { ...t, tags: t.tag_ids.map(id => this.tags.find(tag => tag.id === id)).filter(Boolean) };
  },
  hydrateNote(n) {
    return { ...n, tags: n.tag_ids.map(id => this.tags.find(tag => tag.id === id)).filter(Boolean) };
  }
};
Db.load();

/* ══════════════════════════════════════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════════════════════════════════════ */
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/* ══════════════════════════════════════════════════════════════════════════════
   DATE HELPERS
══════════════════════════════════════════════════════════════════════════════ */
function dueDateClass(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const due   = new Date(dateStr + 'T00:00:00');
  const diff  = Math.round((due - today) / 86400000);
  if (diff < 0)  return 'overdue';
  if (diff === 0) return 'today';
  if (diff <= 3)  return 'upcoming';
  return 'normal';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function dueDateLabel(dateStr) {
  if (!dateStr) return '';
  const cls = dueDateClass(dateStr);
  const today = new Date(); today.setHours(0,0,0,0);
  const due   = new Date(dateStr + 'T00:00:00');
  const diff  = Math.round((due - today) / 86400000);
  if (cls === 'overdue')  return `⚠ ${Math.abs(diff)}d overdue`;
  if (cls === 'today')    return '📅 Due today';
  if (cls === 'upcoming') return `⏰ Due in ${diff}d`;
  return `📆 ${formatDate(dateStr)}`;
}

/* ══════════════════════════════════════════════════════════════════════════════
   DATA LOADING
══════════════════════════════════════════════════════════════════════════════ */
function loadAll() {
  State.tags = Db.tags;
  
  let t = Db.tasks.map(x => Db.hydrateTask(x));
  let n = Db.notes.map(x => Db.hydrateNote(x));
  
  if (State.filterTagId) {
    t = t.filter(x => x.tag_ids.includes(State.filterTagId));
    n = n.filter(x => x.tag_ids.includes(State.filterTagId));
  }
  
  State.tasks = t.filter(x => !x.is_archived).sort((a,b) => b.is_pinned - a.is_pinned || new Date(b.created_at) - new Date(a.created_at));
  State.notes = n.filter(x => !x.is_archived).sort((a,b) => b.is_pinned - a.is_pinned || new Date(b.updated_at) - new Date(a.updated_at));
  State.archivedTasks = t.filter(x => x.is_archived);
  State.archivedNotes = n.filter(x => x.is_archived);
}

/* ══════════════════════════════════════════════════════════════════════════════
   RENDERING
══════════════════════════════════════════════════════════════════════════════ */

// ── Tag chips HTML ──────────────────────────────────────────────────────────

function renderTagChips(tags) {
  return tags.map(t => `
    <span class="tag-chip" style="background:${t.color}22;color:${t.color};border:1px solid ${t.color}44">
      #${t.name}
    </span>`).join('');
}

// ── Task Card ───────────────────────────────────────────────────────────────

function renderTaskCard(task, archived = false) {
  const dueClass = dueDateClass(task.due_date);
  const dueLabel = dueDateLabel(task.due_date);

  const subtasksDone = task.subtasks.filter(s => s.is_done).length;
  const subtasksTotal = task.subtasks.length;
  const pct = subtasksTotal ? Math.round((subtasksDone / subtasksTotal) * 100) : 0;

  let subtasksHtml = '';
  if (subtasksTotal > 0) {
    const items = task.subtasks.map(s => `
      <div class="subtask-item" data-subtask-id="${s.id}">
        <div class="subtask-cb ${s.is_done ? 'done' : ''}"
             onclick="toggleSubtask(${task.id}, ${s.id}, ${!s.is_done})"
             title="${s.is_done ? 'Mark incomplete' : 'Mark complete'}">
          ${s.is_done ? '✓' : ''}
        </div>
        <span class="subtask-label ${s.is_done ? 'done' : ''}">${escHtml(s.title)}</span>
      </div>`).join('');

    subtasksHtml = `
      <div class="subtask-progress">
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <span>${subtasksDone}/${subtasksTotal}</span>
      </div>
      <div class="subtask-list">${items}</div>`;
  }

  return `
  <div class="card priority-${task.priority} ${task.is_complete ? 'is-complete' : ''} ${task.is_pinned ? 'is-pinned' : ''}"
       data-task-id="${task.id}" style="animation-delay:${Math.random()*0.08}s">
    ${task.is_pinned ? '<span class="pin-icon">📌</span>' : ''}
    <div class="card-header">
      <div class="card-checkbox ${task.is_complete ? 'checked' : ''}"
           onclick="toggleTask(${task.id}, ${!task.is_complete})"
           title="${task.is_complete ? 'Mark incomplete' : 'Mark complete'}">
        ${task.is_complete ? '✓' : ''}
      </div>
      <div class="card-title-wrap">
        <div class="card-title">${escHtml(task.title)}</div>
      </div>
      <div class="card-actions">
        <button class="card-action-btn ${task.is_pinned ? 'pinned' : ''}"
                onclick="togglePin('task', ${task.id}, ${!task.is_pinned})"
                title="${task.is_pinned ? 'Unpin' : 'Pin'}">📌</button>
        <button class="card-action-btn" onclick="openTaskModal(${task.id})" title="Edit">✏️</button>
        ${archived
          ? `<button class="card-action-btn" onclick="unarchiveTask(${task.id})" title="Restore">♻️</button>
             <button class="card-action-btn danger" onclick="deleteTask(${task.id})" title="Delete permanently">🗑</button>`
          : `<button class="card-action-btn" onclick="archiveTask(${task.id})" title="Archive">📦</button>
             <button class="card-action-btn danger" onclick="deleteTask(${task.id})" title="Delete">🗑</button>`
        }
      </div>
    </div>
    ${task.description ? `<div class="card-description">${escHtml(task.description)}</div>` : ''}
    ${subtasksHtml}
    ${renderTagChips(task.tags)}
    <div class="card-footer">
      <span class="priority-badge ${task.priority}">${task.priority}</span>
      ${task.due_date ? `<span class="card-due ${dueClass}">${dueLabel}</span>` : ''}
    </div>
  </div>`;
}

// ── Note Card ───────────────────────────────────────────────────────────────

function renderNoteCard(note, archived = false) {
  const preview = marked.parse(note.body || '');
  return `
  <div class="card ${note.is_pinned ? 'is-pinned' : ''}"
       data-note-id="${note.id}" style="animation-delay:${Math.random()*0.08}s">
    ${note.is_pinned ? '<span class="pin-icon">📌</span>' : ''}
    <div class="card-header">
      <div class="card-title-wrap">
        <div class="card-title">${escHtml(note.title)}</div>
      </div>
      <div class="card-actions">
        <button class="card-action-btn ${note.is_pinned ? 'pinned' : ''}"
                onclick="togglePin('note', ${note.id}, ${!note.is_pinned})"
                title="${note.is_pinned ? 'Unpin' : 'Pin'}">📌</button>
        <button class="card-action-btn" onclick="openNoteModal(${note.id})" title="Edit">✏️</button>
        ${archived
          ? `<button class="card-action-btn" onclick="unarchiveNote(${note.id})" title="Restore">♻️</button>
             <button class="card-action-btn danger" onclick="deleteNote(${note.id})" title="Delete permanently">🗑</button>`
          : `<button class="card-action-btn" onclick="archiveNote(${note.id})" title="Archive">📦</button>
             <button class="card-action-btn danger" onclick="deleteNote(${note.id})" title="Delete">🗑</button>`
        }
      </div>
    </div>
    ${note.body ? `<div class="note-body-preview note-full-body">${preview}</div>` : ''}
    ${renderTagChips(note.tags)}
    <div class="card-footer">
      <span style="font-size:0.7rem;color:var(--text-muted)">
        ${new Date(note.updated_at).toLocaleDateString(undefined, {month:'short',day:'numeric'})}
      </span>
    </div>
  </div>`;
}

// ── Daily Progress Widget ────────────────────────────────────────────────────

function renderDailyProgress() {
  const widget = document.getElementById('dailyProgressWidget');
  if (!widget) return;
  
  if (State.view !== 'tasks') {
    widget.style.display = 'none';
    return;
  }
  
  widget.style.display = 'flex';
  
  const remainingTasks = State.tasks.filter(t => !t.is_complete).length;
  
  const today = new Date();
  const completedToday = State.tasks.filter(t => {
    if (!t.is_complete) return false;
    const updateDate = new Date(t.updated_at);
    return updateDate.getDate() === today.getDate() && 
           updateDate.getMonth() === today.getMonth() && 
           updateDate.getFullYear() === today.getFullYear();
  }).length;
  
  const totalRelevant = remainingTasks + completedToday;
  const pct = totalRelevant === 0 ? 0 : Math.round((completedToday / totalRelevant) * 100);
  
  let msg = "You're getting started";
  if (pct === 100 && totalRelevant > 0) msg = "You crushed it! 🎉";
  else if (pct >= 50) msg = "Halfway there! 🚀";
  else if (pct > 0) msg = "Making progress 📈";
  else if (totalRelevant === 0) msg = "No tasks for today 🌴";
  
  const dateDisplay = today.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  widget.innerHTML = `
    <div class="progress-header">
      <div class="progress-title">Daily progress</div>
      <div class="progress-date">${dateDisplay}</div>
    </div>
    
    <div class="progress-bar-container">
      <div class="progress-meta">
        <span>${msg}</span>
        <span class="progress-pct">${pct}%</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill-main" style="width: ${pct}%"></div>
      </div>
    </div>
    
    <div class="progress-stats">
      <div class="stat-box">
        <div class="stat-val">${remainingTasks}</div>
        <div class="stat-label">Tasks remaining</div>
      </div>
      <div class="stat-box">
        <div class="stat-val">${completedToday}</div>
        <div class="stat-label">Completed today</div>
      </div>
    </div>
  `;
}

// ── Cards Grid Renderer ─────────────────────────────────────────────────────

function renderGrid(container, items, renderFn, emptyTitle, emptyMsg, archived = false) {
  if (!items.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✨</div>
        <h3>${emptyTitle}</h3>
        <p>${emptyMsg}</p>
      </div>`;
    return;
  }

  const pinned   = items.filter(i => i.is_pinned);
  const unpinned = items.filter(i => !i.is_pinned);

  let html = '';
  if (pinned.length && unpinned.length) {
    html += `<div class="section-divider">📌 Pinned</div>`;
    html += pinned.map(i => renderFn(i, archived)).join('');
    html += `<div class="section-divider">All</div>`;
    html += unpinned.map(i => renderFn(i, archived)).join('');
  } else {
    html += items.map(i => renderFn(i, archived)).join('');
  }

  container.innerHTML = html;
}

// ── Sidebar Tags ─────────────────────────────────────────────────────────────

function renderSidebarTags() {
  const el = document.getElementById('tagFilterList');
  el.innerHTML = State.tags.map(t => `
    <button class="tag-filter-chip ${State.filterTagId === t.id ? 'active' : ''}"
            onclick="setTagFilter(${t.id})" id="tag-chip-${t.id}">
      <span class="tag-dot" style="background:${t.color}"></span>
      <span class="tag-name">#${t.name}</span>
      <span class="tag-actions">
        <button class="tag-action-btn" onclick="event.stopPropagation();deleteTag(${t.id})" title="Delete tag">✕</button>
      </span>
    </button>`).join('');

  // Update nav badges
  document.getElementById('tasksBadge').textContent = State.tasks.length;
  document.getElementById('notesBadge').textContent = State.notes.length;
  
  const today = new Date(); today.setHours(0,0,0,0);
  const pendingTasks = State.tasks.filter(t => !t.is_complete);
  
  const todayCount = pendingTasks.filter(t => t.due_date && Math.round((new Date(t.due_date + 'T00:00:00') - today) / 86400000) === 0).length;
  const tomorrowCount = pendingTasks.filter(t => t.due_date && Math.round((new Date(t.due_date + 'T00:00:00') - today) / 86400000) === 1).length;
  const upcomingCount = pendingTasks.filter(t => t.due_date && Math.round((new Date(t.due_date + 'T00:00:00') - today) / 86400000) > 1).length;

  const bToday = document.getElementById('todayBadge'); if(bToday) bToday.textContent = todayCount;
  const bTomorrow = document.getElementById('tomorrowBadge'); if(bTomorrow) bTomorrow.textContent = tomorrowCount;
  const bUpcoming = document.getElementById('upcomingBadge'); if(bUpcoming) bUpcoming.textContent = upcomingCount;
}

/* ══════════════════════════════════════════════════════════════════════════════
   VIEWS
══════════════════════════════════════════════════════════════════════════════ */

function switchView(view, skipLoad = false) {
  State.view = view;
  if (!skipLoad) loadAll();

// Update active nav button
  document.querySelectorAll('.nav-btn, .bot-nav-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = document.getElementById(`nav-${view}`);
  if (activeBtn) activeBtn.classList.add('active');
  const botBtn = document.getElementById(`bot-nav-${view}`);
  if (botBtn) botBtn.classList.add('active');

  // Hide all panels
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('searchResultsView').classList.remove('active');

  // Page title
  const titles = { tasks: 'All Tasks', today: 'Today', tomorrow: 'Tomorrow', upcoming: 'Upcoming', notes: 'Notes', archive: 'Archive' };
  document.getElementById('pageTitle').textContent = titles[view] || 'Productivity Hub';

  // Tag filter badge
  const filterBadge = document.getElementById('viewTagFilter');
  if (State.filterTagId && view !== 'archive') {
    const tag = State.tags.find(t => t.id === State.filterTagId);
    filterBadge.textContent = tag ? `#${tag.name}` : '';
    filterBadge.style.display = 'inline';
  } else {
    filterBadge.style.display = 'none';
  }

  // Show create button only for tasks/notes views
  const isTaskView = ['tasks', 'today', 'tomorrow', 'upcoming'].includes(view);
  const createBtn = document.getElementById('createBtn');
  createBtn.style.display = (isTaskView || view === 'notes') ? 'inline-flex' : 'none';
  createBtn.textContent = isTaskView ? '＋ New Task' : '＋ New Note';

  renderSidebarTags();

  if (isTaskView) {
    const panel = document.getElementById('tasksPanel');
    panel.classList.add('active');
    renderDailyProgress();
    
    let filteredTasks = State.tasks;
    const todayDate = new Date(); todayDate.setHours(0,0,0,0);
    
    if (view === 'today') {
      filteredTasks = State.tasks.filter(t => {
        if (!t.due_date || t.is_complete) return false;
        const due = new Date(t.due_date + 'T00:00:00');
        return Math.round((due - todayDate) / 86400000) === 0;
      });
    } else if (view === 'tomorrow') {
      filteredTasks = State.tasks.filter(t => {
        if (!t.due_date || t.is_complete) return false;
        const due = new Date(t.due_date + 'T00:00:00');
        return Math.round((due - todayDate) / 86400000) === 1;
      });
    } else if (view === 'upcoming') {
      filteredTasks = State.tasks.filter(t => {
        if (!t.due_date || t.is_complete) return false;
        const due = new Date(t.due_date + 'T00:00:00');
        return Math.round((due - todayDate) / 86400000) > 1;
      });
    }
    
    renderGrid(
      document.getElementById('tasksGrid'),
      filteredTasks,
      renderTaskCard,
      view === 'tasks' ? 'Your task list is empty' : `No tasks for ${view}`,
      'Add a task to get started.',
    );
  } else if (view === 'notes') {
    const panel = document.getElementById('notesPanel');
    panel.classList.add('active');
    renderGrid(
      document.getElementById('notesGrid'),
      State.notes,
      renderNoteCard,
      'Your notes are empty',
      'Add a note to start writing.',
    );
  } else if (view === 'archive') {
    const panel = document.getElementById('archivePanel');
    panel.classList.add('active');
    renderArchiveView();
  }
}

function renderArchiveView() {
  const el = document.getElementById('archiveContent');
  let html = '';

  if (!State.archivedTasks.length && !State.archivedNotes.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📦</div>
        <h3>Archive is empty</h3>
        <p>Archive completed tasks or notes to see them here.</p>
      </div>`;
    return;
  }

  if (State.archivedTasks.length) {
    html += `<div class="archive-section">
      <div class="archive-section-title">Archived Tasks (${State.archivedTasks.length})</div>
      <div class="cards-grid" id="archivedTasksGrid">
        ${State.archivedTasks.map(t => renderTaskCard(t, true)).join('')}
      </div>
    </div>`;
  }

  if (State.archivedNotes.length) {
    html += `<div class="archive-section">
      <div class="archive-section-title">Archived Notes (${State.archivedNotes.length})</div>
      <div class="cards-grid" id="archivedNotesGrid">
        ${State.archivedNotes.map(n => renderNoteCard(n, true)).join('')}
      </div>
    </div>`;
  }

  el.innerHTML = html;
}

/* ══════════════════════════════════════════════════════════════════════════════
   SEARCH
══════════════════════════════════════════════════════════════════════════════ */

let searchDebounce = null;

function onSearchInput(val) {
  clearTimeout(searchDebounce);
  val = val.trim();
  State.searchQuery = val;

  if (!val) {
    document.getElementById('searchResultsView').classList.remove('active');
    switchView(State.view === 'search' ? 'tasks' : State.view, true);
    return;
  }

  searchDebounce = setTimeout(async () => {
    try {
      State.searchQuery = val.toLowerCase();
      const t = Db.tasks.map(x => Db.hydrateTask(x)).filter(x => !x.is_archived && (x.title.toLowerCase().includes(State.searchQuery) || (x.description || '').toLowerCase().includes(State.searchQuery)));
      const n = Db.notes.map(x => Db.hydrateNote(x)).filter(x => !x.is_archived && (x.title.toLowerCase().includes(State.searchQuery) || (x.body || '').toLowerCase().includes(State.searchQuery)));
      State.searchResults = { tasks: t, notes: n };
      
      document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
      const sv = document.getElementById('searchResultsView');
      sv.classList.add('active');
      document.getElementById('pageTitle').textContent = `Search: "${val}"`;
      document.getElementById('viewTagFilter').style.display = 'none';
      document.getElementById('createBtn').style.display = 'none';
      renderSearchResults();
    } catch (e) { toast(e.message, 'error'); }
  }, 280);
}

function renderSearchResults() {
  const { tasks, notes } = State.searchResults;
  const el = document.getElementById('searchResultsContent');

  if (!tasks.length && !notes.length) {
    el.innerHTML = `<div class="search-empty">No results found for "${escHtml(State.searchQuery)}"</div>`;
    return;
  }

  let html = '';
  if (tasks.length) {
    html += `<div class="search-section-title">Tasks (${tasks.length})</div>
             <div class="cards-grid">${tasks.map(t => renderTaskCard(t)).join('')}</div>`;
  }
  if (notes.length) {
    html += `<div class="search-section-title" style="margin-top:24px">Notes (${notes.length})</div>
             <div class="cards-grid">${notes.map(n => renderNoteCard(n)).join('')}</div>`;
  }

  el.innerHTML = html;
}

/* ══════════════════════════════════════════════════════════════════════════════
   TAG FILTER
══════════════════════════════════════════════════════════════════════════════ */

function setTagFilter(tagId) {
  State.filterTagId = State.filterTagId === tagId ? null : tagId;
  if (State.view === 'archive') {
    State.filterTagId = null; // archive doesn't filter by tag
  }
  switchView(State.view === 'archive' ? 'tasks' : State.view);
}

/* ══════════════════════════════════════════════════════════════════════════════
   TASK ACTIONS
══════════════════════════════════════════════════════════════════════════════ */

function toggleTask(taskId, newComplete) {
  try {
    const t = Db.tasks.find(x => x.id === taskId);
    if(t) {
      t.is_complete = newComplete;
      if (newComplete && t.subtasks) {
        t.subtasks.forEach(s => s.is_done = true);
      }
      t.updated_at = new Date().toISOString();
      Db.save();
    }
    switchView(State.view, false);
  } catch (e) { toast(e.message, 'error'); }
}

function togglePin(type, id, newPinned) {
  try {
    const list = type === 'task' ? Db.tasks : Db.notes; const item = list.find(x => x.id === id); if(item) { item.is_pinned = newPinned; item.updated_at = new Date().toISOString(); Db.save(); }
    switchView(State.view, false);
  } catch (e) { toast(e.message, 'error'); }
}

function archiveTask(taskId) {
  try {
    const t = Db.tasks.find(x => x.id === taskId); if(t) { t.is_archived = true; t.updated_at = new Date().toISOString(); Db.save(); }
    toast('Task archived');
    switchView(State.view, false);
  } catch (e) { toast(e.message, 'error'); }
}

function unarchiveTask(taskId) {
  try {
    const t = Db.tasks.find(x => x.id === taskId); if(t) { t.is_archived = false; t.updated_at = new Date().toISOString(); Db.save(); }
    toast('Task restored');
    switchView(State.view, false);
  } catch (e) { toast(e.message, 'error'); }
}

function deleteTask(taskId) {
  if (!confirm('Delete this task permanently?')) return;
  try {
    Db.tasks = Db.tasks.filter(x => x.id !== taskId); Db.save();
    toast('Task deleted');
    switchView(State.view, false);
  } catch (e) { toast(e.message, 'error'); }
}

function toggleSubtask(taskId, subtaskId, newDone) {
  try {
    const t = Db.tasks.find(x => x.id === taskId); if(t) { const s = t.subtasks.find(x => x.id === subtaskId); if(s) { s.is_done = newDone; Db.save(); } }
    switchView(State.view, false);
  } catch (e) { toast(e.message, 'error'); }
}

/* ══════════════════════════════════════════════════════════════════════════════
   NOTE ACTIONS
══════════════════════════════════════════════════════════════════════════════ */

function archiveNote(noteId) {
  try {
    const n = Db.notes.find(x => x.id === noteId); if(n) { n.is_archived = true; n.updated_at = new Date().toISOString(); Db.save(); }
    toast('Note archived');
    switchView(State.view, false);
  } catch (e) { toast(e.message, 'error'); }
}

function unarchiveNote(noteId) {
  try {
    const n = Db.notes.find(x => x.id === noteId); if(n) { n.is_archived = false; n.updated_at = new Date().toISOString(); Db.save(); }
    toast('Note restored');
    switchView(State.view, false);
  } catch (e) { toast(e.message, 'error'); }
}

function deleteNote(noteId) {
  if (!confirm('Delete this note permanently?')) return;
  try {
    Db.notes = Db.notes.filter(x => x.id !== noteId); Db.save();
    toast('Note deleted');
    switchView(State.view, false);
  } catch (e) { toast(e.message, 'error'); }
}

/* ══════════════════════════════════════════════════════════════════════════════
   TASK MODAL
══════════════════════════════════════════════════════════════════════════════ */

function openTaskModal(taskId = null) {
  const task = taskId ? State.tasks.find(t => t.id === taskId)
                     || State.archivedTasks.find(t => t.id === taskId)
                     || (State.searchResults.tasks || []).find(t => t.id === taskId)
               : null;
  State.editingTask = task;
  State.pendingSubtasks = task ? task.subtasks.map(s => ({ ...s, _temp: false })) : [];

  const modal = document.getElementById('taskModal');
  document.getElementById('taskModalTitle').textContent = task ? 'Edit Task' : 'New Task';
  document.getElementById('taskTitle').value = task?.title || '';
  document.getElementById('taskDescription').value = task?.description || '';
  document.getElementById('taskPriority').value = task?.priority || 'medium';
  document.getElementById('taskDueDate').value = task?.due_date || '';
  document.getElementById('newSubtaskInput').value = '';

  // Tag selector
  renderModalTagSelector('taskTagSelector', task?.tags?.map(t => t.id) || []);

  // Subtasks list
  renderModalSubtaskList();

  openModal('taskModal');
}

function renderModalTagSelector(containerId, selectedIds = []) {
  const el = document.getElementById(containerId);
  el.innerHTML = State.tags.map(t => `
    <span class="tag-sel-chip ${selectedIds.includes(t.id) ? 'selected' : ''}"
          style="background:${t.color}22;color:${t.color};border-color:${t.color}44"
          onclick="toggleTagSel(this, ${t.id})"
          data-tag-id="${t.id}">
      #${t.name}
    </span>`).join('');
  if (!State.tags.length) el.innerHTML = '<span style="font-size:0.8rem;color:var(--text-muted)">No tags yet. Create one in the sidebar.</span>';
}

function toggleTagSel(el, tagId) {
  el.classList.toggle('selected');
}

function getSelectedTagIds(containerId) {
  return [...document.querySelectorAll(`#${containerId} .tag-sel-chip.selected`)]
    .map(el => parseInt(el.dataset.tagId));
}

function renderModalSubtaskList() {
  const el = document.getElementById('modalSubtaskList');
  el.innerHTML = State.pendingSubtasks.map((s, idx) => `
    <div class="modal-subtask-item">
      <span>${escHtml(s.title)}</span>
      <button class="del-sub-btn" onclick="removePendingSubtask(${idx})">✕</button>
    </div>`).join('');
}

function addPendingSubtask() {
  const input = document.getElementById('newSubtaskInput');
  const val = input.value.trim();
  if (!val) return;
  State.pendingSubtasks.push({ title: val, is_done: false, position: State.pendingSubtasks.length, _temp: true });
  input.value = '';
  renderModalSubtaskList();
}

function removePendingSubtask(idx) {
  State.pendingSubtasks.splice(idx, 1);
  renderModalSubtaskList();
}

function saveTask() {
  const title = document.getElementById('taskTitle').value.trim();
  if (!title) { toast('Title is required', 'error'); return; }

  const payload = {
    title,
    description: document.getElementById('taskDescription').value.trim() || null,
    priority:    document.getElementById('taskPriority').value,
    due_date:    document.getElementById('taskDueDate').value || null,
    tag_ids:     getSelectedTagIds('taskTagSelector'),
  };

try {
    if (State.editingTask) {
      const t = Db.tasks.find(x => x.id === State.editingTask.id);
      if (t) {
        Object.assign(t, payload, { updated_at: new Date().toISOString() });
        t.subtasks = State.pendingSubtasks.map(s => ({...s, id: s.id || Date.now() + Math.random(), _temp: undefined}));
        Db.save();
      }
      toast('Task updated');
    } else {
      const t = {
        id: Date.now(), ...payload, is_complete: false, is_pinned: false, is_archived: false,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        subtasks: State.pendingSubtasks.map(s => ({...s, id: Date.now() + Math.random(), _temp: undefined}))
      };
      Db.tasks.push(t);
      Db.save();
      toast('Task created');
    }
    closeModal('taskModal');
    switchView(State.view, false);
  } catch (e) { toast(e.message, 'error'); }
}

/* ══════════════════════════════════════════════════════════════════════════════
   NOTE MODAL
══════════════════════════════════════════════════════════════════════════════ */

function openNoteModal(noteId = null) {
  const note = noteId
    ? State.notes.find(n => n.id === noteId)
      || State.archivedNotes.find(n => n.id === noteId)
      || (State.searchResults.notes || []).find(n => n.id === noteId)
    : null;
  State.editingNote = note;

  document.getElementById('noteModalTitle').textContent = note ? 'Edit Note' : 'New Note';
  document.getElementById('noteTitle').value  = note?.title || '';
  document.getElementById('noteBody').value   = note?.body  || '';
  document.getElementById('notePreview').innerHTML = marked.parse(note?.body || '');

  renderModalTagSelector('noteTagSelector', note?.tags?.map(t => t.id) || []);
  setNoteTab('write');
  openModal('noteModal');
}

function setNoteTab(tab) {
  document.querySelectorAll('.note-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  const bodyEl    = document.getElementById('noteBody');
  const previewEl = document.getElementById('notePreview');
  if (tab === 'write') {
    bodyEl.style.display = 'block';
    previewEl.style.display = 'none';
  } else {
    previewEl.innerHTML = marked.parse(bodyEl.value);
    bodyEl.style.display = 'none';
    previewEl.style.display = 'block';
  }
}

function saveNote() {
  const title = document.getElementById('noteTitle').value.trim();
  if (!title) { toast('Title is required', 'error'); return; }

  const payload = {
    title,
    body:    document.getElementById('noteBody').value,
    tag_ids: getSelectedTagIds('noteTagSelector'),
  };

  try {
if (State.editingNote) {
      const n = Db.notes.find(x => x.id === State.editingNote.id);
      if (n) {
        Object.assign(n, payload, { updated_at: new Date().toISOString() });
        Db.save();
      }
      toast('Note updated');
    } else {
      const n = {
        id: Date.now(), ...payload, is_pinned: false, is_archived: false,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      };
      Db.notes.push(n);
      Db.save();
      toast('Note created');
    }
    closeModal('noteModal');
    switchView(State.view === 'search' ? 'notes' : State.view, false);
  } catch (e) { toast(e.message, 'error'); }
}

/* ══════════════════════════════════════════════════════════════════════════════
   TAG MODAL
══════════════════════════════════════════════════════════════════════════════ */

const PRESET_COLORS = [
  '#6366f1','#8b5cf6','#ec4899','#ef4444','#f97316',
  '#eab308','#22c55e','#14b8a6','#3b82f6','#06b6d4',
];

let selectedTagColor = PRESET_COLORS[0];

function openTagModal() {
  document.getElementById('tagName').value = '';
  selectedTagColor = PRESET_COLORS[0];
  renderColorPicker();
  openModal('tagModal');
}

function renderColorPicker() {
  const el = document.getElementById('colorPicker');
  el.innerHTML = PRESET_COLORS.map(c => `
    <div class="color-swatch ${c === selectedTagColor ? 'selected' : ''}"
         style="background:${c}"
         onclick="selectColor('${c}')"
         title="${c}"></div>`).join('');
}

function selectColor(color) {
  selectedTagColor = color;
  renderColorPicker();
  document.getElementById('tagColorInput').value = color;
}

function saveTag() {
  const name = document.getElementById('tagName').value.trim();
  if (!name) { toast('Tag name is required', 'error'); return; }
try {
    const existing = Db.tags.find(t => t.name.toLowerCase() === name.toLowerCase());
    if (existing) { toast(`Tag '${name}' already exists`, 'error'); return; }
    
    Db.tags.push({ id: Date.now(), name, color: selectedTagColor, created_at: new Date().toISOString() });
    Db.save();
    
    toast('Tag created');
    closeModal('tagModal');
    loadAll();
    renderSidebarTags();
  } catch (e) { toast(e.message, 'error'); }
}

function deleteTag(tagId) {
  if (!confirm('Delete this tag? It will be removed from all tasks and notes.')) return;
try {
    Db.tags = Db.tags.filter(t => t.id !== tagId);
    Db.tasks.forEach(t => t.tag_ids = t.tag_ids.filter(id => id !== tagId));
    Db.notes.forEach(n => n.tag_ids = n.tag_ids.filter(id => id !== tagId));
    Db.save();
    
    if (State.filterTagId === tagId) State.filterTagId = null;
    toast('Tag deleted');
    switchView(State.view, false);
  } catch (e) { toast(e.message, 'error'); }
}

/* ══════════════════════════════════════════════════════════════════════════════
   MODAL HELPERS
══════════════════════════════════════════════════════════════════════════════ */

function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

// Close on backdrop click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-backdrop')) {
    e.target.classList.remove('open');
  }
});

// Close on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
  }
});


function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const overlay = document.getElementById('mobileOverlay');
  if (sb.classList.contains('open')) {
    sb.classList.remove('open');
    overlay.classList.remove('open');
  } else {
    sb.classList.add('open');
    overlay.classList.add('open');
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
   UTILITY
══════════════════════════════════════════════════════════════════════════════ */

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
}

/* ══════════════════════════════════════════════════════════════════════════════
   THEME
══════════════════════════════════════════════════════════════════════════════ */

function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.getElementById('themeToggle').textContent = '☀️';
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
    document.getElementById('themeToggle').textContent = '🌙';
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  document.getElementById('themeToggle').textContent = next === 'dark' ? '☀️' : '🌙';
}

/* ══════════════════════════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════════════════════════ */

function init() {
  initTheme();
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);

  // Nav buttons
  document.getElementById('nav-tasks').addEventListener('click', () => {
    State.filterTagId = null;
    switchView('tasks');
  });
  document.getElementById('nav-today').addEventListener('click', () => {
    State.filterTagId = null;
    switchView('today');
  });
  document.getElementById('nav-tomorrow').addEventListener('click', () => {
    State.filterTagId = null;
    switchView('tomorrow');
  });
  document.getElementById('nav-upcoming').addEventListener('click', () => {
    State.filterTagId = null;
    switchView('upcoming');
  });
  document.getElementById('nav-notes').addEventListener('click', () => {
    State.filterTagId = null;
    switchView('notes');
  });
  document.getElementById('nav-archive').addEventListener('click', () => {
    State.filterTagId = null;
    switchView('archive');
  });

  // Create button
  document.getElementById('createBtn').addEventListener('click', () => {
    if (State.view === 'tasks') openTaskModal();
    else openNoteModal();
  });

  // Search
  document.getElementById('globalSearch').addEventListener('input', e => onSearchInput(e.target.value));

  // Tag modal color input sync
  document.getElementById('tagColorInput').addEventListener('input', e => {
    selectedTagColor = e.target.value;
    renderColorPicker();
  });

  // Note body live preview
  document.getElementById('noteBody').addEventListener('input', () => {
    const previewEl = document.getElementById('notePreview');
    if (previewEl.style.display !== 'none') {
      previewEl.innerHTML = marked.parse(document.getElementById('noteBody').value);
    }
  });

  // Subtask add on Enter
  document.getElementById('newSubtaskInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addPendingSubtask(); }
  });

  // Initial load
  switchView('tasks');
}

document.addEventListener('DOMContentLoaded', init);
