// The folio's editor (Hans, 3 Nov: "press e on any page and it gives me the content editable that I can just type new
// stuff and remove sections or descriptions ... then copy a prompt back to you"; then "also add a section, or comment on
// a section so we can regenerate things, and the changes shown in an edit panel on the right-hand side").
// sketch.html marks what can change:
//   data-edit="intro, paragraph 2"                  a piece of text: type over it
//   data-edit-block="feature \"Drag any number\""   a whole section
// Hovering either offers Comment (a note, e.g. "regenerate this, shorter"), Add after (a new section to write) and Remove.
// The panel on the right lists every change, each one line until opened, with an undo; Copy prompt puts them all on the
// clipboard as one request for Claude. E turns editing on and off (Esc also leaves). Changes are kept in localStorage
// across pages and reloads; leaving edit mode puts the page back as it was drawn (only the prompt carries the changes,
// until they are made in the source).
(() => {
  const KEY = 'edit.log';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  let log = load(), on = false, obs = null, uid = Date.now();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(log)); } catch {} render(); };
  const page = () => location.hash.length > 1 ? (document.querySelector('.detail-title')?.textContent.trim() || location.hash.slice(1)) : 'Home';
  // the words as written: textContent, not innerText, which reads "" while the page under a header is still hidden
  const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
  const els = new Map();                                   // page|label -> its element on the page now
  const at = (pg, label) => els.get(`${pg}|${label}`);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- the page: marked pieces become editable, commentable, removable ----------
  function track(el) {
    if (el.__ed) return;
    const label = el.dataset.edit ?? el.dataset.editBlock, block = el.dataset.editBlock != null;
    // a section is quoted by its own words (title / description), not its buttons
    const words = block ? [...el.querySelectorAll('[data-edit]')].map(text).filter(Boolean).join(' / ') : '';
    el.__ed = { label, block, orig: words || text(el), html: el.innerHTML, pg: page() };
    els.set(`${el.__ed.pg}|${label}`, el);
    if (!block) {
      el.contentEditable = 'plaintext-only'; if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
      el.spellcheck = true; el.addEventListener('input', onInput);
    }
    show(el);
  }
  function show(el) {                                       // what the log says about this piece, drawn on it
    const { pg, label, block } = el.__ed, mine = log.filter(e => e.page === pg && e.label === label);
    const t = mine.find(e => e.kind === 'text');
    if (!block && t && text(el) !== t.after) el.innerText = t.after;
    el.classList.toggle('edit-removed', mine.some(e => e.kind === 'remove'));
    el.classList.toggle('edit-commented', mine.some(e => e.kind === 'comment'));
    log.filter(e => e.page === pg && e.kind === 'add' && e.anchor === label).forEach(e => addNode(el, e));
  }
  function untrack(el) {
    if (!el.__ed) return;
    el.removeAttribute('contenteditable'); el.removeEventListener('input', onInput);
    el.classList.remove('edit-removed', 'edit-commented');
    if (!el.__ed.block && text(el) !== el.__ed.orig) el.innerHTML = el.__ed.html;
    els.delete(`${el.__ed.pg}|${el.__ed.label}`); delete el.__ed;
  }
  function onInput(ev) {
    const el = ev.currentTarget, { pg, label, orig } = el.__ed, now = text(el);
    let e = log.find(x => x.page === pg && x.label === label && x.kind === 'text');
    if (now === orig) { if (e) log.splice(log.indexOf(e), 1); }
    else if (e) e.after = now; else log.push({ id: ++uid, kind: 'text', page: pg, label, before: orig, after: now });
    save();
  }
  // a new section, written in place right after the piece it was added to
  function addNode(anchor, e) {
    const have = document.querySelector(`[data-edit-new="${e.id}"]`); if (have) return have;
    const n = document.createElement('div'); n.className = 'edit-added'; n.dataset.editNew = e.id;
    n.contentEditable = 'plaintext-only'; if (n.contentEditable !== 'plaintext-only') n.contentEditable = 'true';
    n.textContent = e.text; n.setAttribute('placeholder', 'New section: write it here, or say what it should be');
    n.addEventListener('input', () => { e.text = n.textContent.trim(); save(); });
    anchor.after(n); return n;
  }

  // ---------- the hover tools ----------
  const tools = document.createElement('div'); tools.className = 'edit-tools';
  tools.innerHTML = '<button data-t="comment">Comment</button><button data-t="add">Add after</button><button data-t="remove"></button>';
  let toolFor = null;
  function place(el) {
    toolFor = el; const r = el.getBoundingClientRect(), gone = el.classList.contains('edit-removed');
    tools.querySelector('[data-t="remove"]').textContent = gone ? 'Restore' : el.__ed.block ? 'Remove section' : 'Remove';
    tools.hidden = false;
    const room = innerWidth - (side.classList.contains('folded') ? 60 : 340);
    tools.style.top = `${Math.max(4, r.top - 16)}px`; tools.style.left = `${Math.max(4, Math.min(room - tools.offsetWidth, r.right - tools.offsetWidth))}px`;
  }
  tools.addEventListener('click', (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    const t = ev.target.closest('button')?.dataset.t, el = toolFor; if (!t || !el?.__ed) return;
    const { pg, label, orig } = el.__ed;
    if (t === 'remove') {
      const e = log.find(x => x.page === pg && x.label === label && x.kind === 'remove');
      if (e) log.splice(log.indexOf(e), 1); else log.push({ id: ++uid, kind: 'remove', page: pg, label, before: orig });
      save(); show(el); place(el);
    }
    if (t === 'add') {
      const e = { id: ++uid, kind: 'add', page: pg, anchor: label, text: '' }; log.push(e); save();
      addNode(el, e).focus();
    }
    if (t === 'comment') ask(el);
  });
  // a comment: a small note box under the piece; Enter keeps it, Esc drops it
  const note = document.createElement('div'); note.className = 'edit-note';
  note.innerHTML = '<textarea rows="3" placeholder="What should change? e.g. regenerate this shorter, or make it a list"></textarea><div><button data-n="save">Comment</button><button data-n="cancel">Cancel</button></div>';
  let noteFor = null;
  function ask(el) {
    noteFor = el; const { pg, label } = el.__ed, e = log.find(x => x.page === pg && x.label === label && x.kind === 'comment');
    const r = el.getBoundingClientRect(), room = innerWidth - (side.classList.contains('folded') ? 60 : 340);
    note.style.top = `${Math.max(8, Math.min(innerHeight - 160, r.bottom + 8))}px`; note.style.left = `${Math.max(8, Math.min(room - 320, r.left))}px`;
    note.hidden = false; const ta = note.querySelector('textarea'); ta.value = e?.comment || ''; ta.focus();
  }
  function keepNote() {
    const el = noteFor; if (!el?.__ed) { note.hidden = true; return; }
    const { pg, label, orig } = el.__ed, v = note.querySelector('textarea').value.trim();
    const e = log.find(x => x.page === pg && x.label === label && x.kind === 'comment');
    if (!v) { if (e) log.splice(log.indexOf(e), 1); }
    else if (e) e.comment = v; else log.push({ id: ++uid, kind: 'comment', page: pg, label, before: orig, comment: v });
    note.hidden = true; save(); show(el);
  }
  note.addEventListener('click', (ev) => { const n = ev.target.closest('button')?.dataset.n; if (n === 'save') keepNote(); if (n === 'cancel') note.hidden = true; });
  note.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); keepNote(); }
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); note.hidden = true; }
  });

  // ---------- the panel ----------
  const side = document.createElement('aside'); side.className = 'edit-side'; side.setAttribute('aria-label', 'Edits');
  side.innerHTML = `<div class="edit-side-head"><b>Editing</b><span class="edit-n"></span><button data-a="fold" title="Fold the panel" aria-label="Fold the panel">›</button></div>
    <div class="edit-side-acts"><button data-a="copy" class="edit-primary">Copy prompt</button><button data-a="clear">Clear</button><button data-a="done">Done <kbd>E</kbd></button></div>
    <div class="edit-list"></div>
    <p class="edit-help">Type over any outlined words. Hover a piece for Comment, Add after and Remove. Changes stay here across pages until you clear them.</p>`;
  const list = side.querySelector('.edit-list');
  const what = (e) => e.kind === 'text' ? 'Changed' : e.kind === 'remove' ? 'Removed' : e.kind === 'comment' ? 'Comment on' : 'Added after';
  function render() {
    side.querySelector('.edit-n').textContent = log.length ? `${log.length}` : '';
    const pages = [...new Set(log.map(e => e.page))];
    list.innerHTML = pages.length ? pages.map(pg => `<details class="edit-page" open><summary>${esc(pg)} <span>${log.filter(e => e.page === pg).length}</span></summary>${
      log.filter(e => e.page === pg).map(e => `<details class="edit-item edit-${e.kind}"><summary><i>${what(e)}</i> ${esc(e.label || e.anchor)}<button data-undo="${e.id}" title="Undo this" aria-label="Undo this">×</button></summary><div class="edit-body">${
        e.kind === 'text' ? `<p class="was">${esc(e.before)}</p><p class="now">${esc(e.after)}</p>`
        : e.kind === 'remove' ? `<p class="was">${esc(e.before)}</p>`
        : e.kind === 'comment' ? `<p class="now">${esc(e.comment)}</p>`
        : `<p class="now">${esc(e.text || '(not written yet)')}</p>`}</div></details>`).join('')}</details>`).join('')
      : '<p class="edit-empty">No changes yet.</p>';
  }
  function undo(id) {
    const e = log.find(x => x.id === +id); if (!e) return;
    log.splice(log.indexOf(e), 1);
    const el = at(e.page, e.label || e.anchor);
    if (e.kind === 'text' && el?.__ed) el.innerHTML = el.__ed.html;
    if (e.kind === 'add') document.querySelector(`[data-edit-new="${e.id}"]`)?.remove();
    save(); if (el?.__ed) show(el);
  }
  side.addEventListener('click', (ev) => {
    const u = ev.target.closest('[data-undo]'); if (u) { ev.preventDefault(); undo(u.dataset.undo); return; }
    const b = ev.target.closest('button'), a = b?.dataset.a;
    if (a === 'copy') copy(b);
    if (a === 'done') exit();
    if (a === 'fold') { side.classList.toggle('folded'); document.body.classList.toggle('edit-side-on', !side.classList.contains('folded')); }
    if (a === 'clear' && (!log.length || confirm(`Clear ${log.length} change${log.length === 1 ? '' : 's'}?`))) {
      log = []; save(); document.querySelectorAll('.edit-added').forEach(n => n.remove());
      els.forEach(el => { if (!el.__ed.block && text(el) !== el.__ed.orig) el.innerHTML = el.__ed.html; show(el); });
    }
  });

  // ---------- the prompt ----------
  function prompt() {
    const q = (s) => `"${s.length > 240 ? s.slice(0, 237) + '…' : s}"`;
    // a change as just the words that changed, with a little of what is round them so it can be found
    const diff = (a, b) => {
      if (a.length < 140 && b.length < 140) return `change ${q(a)} to ${q(b)}`;
      let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
      let j = 0; while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
      const pre = a.slice(Math.max(0, i - 40), i), post = a.slice(a.length - j, a.length - j + 40);
      const ctx = (s) => `"${i > 40 ? '…' : ''}${pre}${s}${post}${a.length - j + 40 < a.length ? '…' : ''}"`;
      return `change ${ctx(a.slice(i, a.length - j))} to ${ctx(b.slice(i, b.length - j))}`;
    };
    const line = (e) => e.kind === 'text' ? `- ${e.label}: ${diff(e.before, e.after)}`
      : e.kind === 'remove' ? `- Remove ${e.label}: ${q(e.before)}`
      : e.kind === 'comment' ? `- Comment on ${e.label} (rework it as asked): ${q(e.comment)}. It reads now: ${q(e.before)}`
      : `- Add a new section after ${e.anchor}: ${e.text ? q(e.text) : '(write it: fit it to the page around it)'}`;
    const lines = [`Folio edits from the editor on sketch.html (${new Date().toLocaleDateString()}):`, ''];
    for (const pg of [...new Set(log.map(e => e.page))]) {
      lines.push(pg === 'Home' ? 'Home page' : `${pg} (project page)`, ...log.filter(e => e.page === pg).map(line), '');
    }
    lines.push('Make these in the source (data.js, the README text build-readmes.py reads, or sketch.html, wherever each lives); where a comment asks for something new, write or regenerate it. Keep index.html as it is, check it on the page, then commit and push.');
    return lines.join('\n');
  }
  async function copy(b) {
    const t = prompt();
    try { await navigator.clipboard.writeText(t); }
    catch { const ta = document.createElement('textarea'); ta.value = t; document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy prompt'; }, 1400);
  }

  // ---------- on and off ----------
  const scan = () => document.querySelectorAll('[data-edit], [data-edit-block]').forEach(track);
  function enter() {
    if (on) return; on = true; document.documentElement.dataset.editing = '';
    document.body.append(side, tools, note); tools.hidden = true; note.hidden = true;
    if (innerWidth < 760) side.classList.add('folded');                          // a phone: the page first, the list a tap away
    document.body.classList.toggle('edit-side-on', !side.classList.contains('folded'));
    scan(); render();
    obs = new MutationObserver(() => scan()); obs.observe(document.body, { childList: true, subtree: true });
  }
  function exit() {
    if (!on) return; on = false; delete document.documentElement.dataset.editing;
    obs?.disconnect(); obs = null;
    document.querySelectorAll('[data-edit], [data-edit-block]').forEach(untrack);
    document.querySelectorAll('.edit-added').forEach(n => n.remove());
    side.remove(); tools.remove(); note.remove(); document.body.classList.remove('edit-side-on'); document.activeElement?.blur?.();
  }

  document.addEventListener('pointerover', (ev) => {
    if (!on || tools.contains(ev.target) || note.contains(ev.target) || side.contains(ev.target)) return;
    const el = ev.target.closest?.('[data-edit], [data-edit-block]');
    if (el?.__ed) place(el); else tools.hidden = true;
  });
  addEventListener('scroll', () => { if (on && toolFor && !tools.hidden) place(toolFor); }, { passive: true });
  // while editing, a click in marked text places the caret instead of opening a project or following its link
  addEventListener('click', (ev) => { if (on && ev.target.closest?.('[data-edit], [data-edit-block], .edit-added') && !ev.target.closest('.edit-tools')) { ev.preventDefault(); ev.stopPropagation(); } }, true);
  addEventListener('pointerdown', (ev) => { if (on && ev.target.closest?.('[data-edit], [data-edit-block], .edit-added')) ev.stopPropagation(); }, true);
  addEventListener('keydown', (ev) => {
    const typing = ev.target.closest?.('input, textarea, select, [contenteditable]');
    if (on && ev.key === 'Escape' && !note.contains(ev.target)) { ev.preventDefault(); ev.stopImmediatePropagation(); exit(); return; }
    if ((ev.key === 'e' || ev.key === 'E') && !ev.metaKey && !ev.ctrlKey && !ev.altKey && !typing) { ev.preventDefault(); ev.stopImmediatePropagation(); on ? exit() : enter(); }
  }, true);
  window.__editor = { toggle: () => (on ? exit() : enter()), get on() { return on; }, get count() { return log.length; }, prompt };
})();
