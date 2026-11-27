// Attorney review console. Renders only with textContent, never as HTML, so queue text cannot inject markup.
(() => {
  const $ = (id) => document.getElementById(id);
  const tokenInput = $('token');
  try { tokenInput.value = sessionStorage.getItem('reviewToken') || ''; } catch {}

  const el = (tag, props = {}, ...children) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v);
    }
    for (const c of children) if (c) n.append(c);
    return n;
  };

  const api = async (path, opts = {}) => {
    const res = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenInput.value}`, ...(opts.headers || {}) } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    return body;
  };

  const status = (s) => { $('status').textContent = s; };

  async function decide(id, decision, finalText) {
    try {
      await api(`/v1/review/${encodeURIComponent(id)}/decision`, { method: 'POST', body: JSON.stringify(finalText === undefined ? { decision } : { decision, finalText }) });
      status(`Saved: ${decision}`);
      load();
    } catch (e) { status(e.message); }
  }

  function card(item) {
    const edit = el('textarea', { 'aria-label': 'Edited answer' });
    const hasDraft = !item.aiDraft.startsWith('(No AI draft');
    edit.value = hasDraft ? item.aiDraft : '';
    const open = item.status === 'open';
    const actions = open && el('div', { class: 'actions' },
      item.kind === 'legal_question' && hasDraft && el('button', { class: 'primary', text: 'Approve draft', onclick: () => decide(item.id, 'approve') }),
      el('button', { text: item.kind === 'legal_question' ? 'Send edited text' : 'Approve with edits', onclick: () => decide(item.id, 'edit_send', edit.value) }),
      el('button', { text: 'Call client', onclick: () => decide(item.id, 'call_client') }),
      el('button', { text: 'Reject', onclick: () => decide(item.id, 'reject') }),
    );
    return el('div', { class: 'card' },
      el('div', { class: 'meta', text: `${item.kind === 'assessment' ? 'Intake assessment' : 'Legal question'} · ${item.reason || 'no reason'} · ${item.status} · ${item.createdAt || ''} · client ${item.personId}` }),
      item.question && el('div', { class: 'label', text: 'Client asked' }),
      item.question && el('pre', { text: item.question }),
      el('div', { class: 'label', text: open ? 'AI draft (not sent)' : 'AI draft' }),
      el('pre', { text: item.aiDraft }),
      item.finalText && el('div', { class: 'label', text: 'Sent to client' }),
      item.finalText && el('pre', { text: item.finalText }),
      open && el('div', { class: 'label', text: 'Edit before sending' }),
      open && edit,
      actions,
    );
  }

  async function load() {
    try { sessionStorage.setItem('reviewToken', tokenInput.value); } catch {}
    status('Loading…');
    try {
      const f = $('filter').value;
      const { items } = await api(`/v1/review${f ? `?status=${encodeURIComponent(f)}` : ''}`);
      const list = $('list');
      list.replaceChildren(...(items.length ? items.map(card) : [el('p', { class: 'meta', text: 'Nothing here.' })]));
      status(`${items.length} item(s)`);
    } catch (e) { status(e.message); }
  }

  $('load').addEventListener('click', load);
  $('filter').addEventListener('change', load);
})();
