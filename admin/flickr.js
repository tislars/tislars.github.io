(() => {
  const USER_ID = '191583412@N04';
  const KEY_STORAGE = 'flickr-api-key';
  const API_URL = 'https://api.flickr.com/services/rest/';
  const PER_PAGE = 60;
  const MAX_PER_ROW = 3;
  const FLICKR_URL = String.raw`https?:\/\/(?:www\.)?flickr\.com\/photos\/[^\s/]+\/\d+[^\s]*`;
  const INVALID_KEY = 100;

  const readKey = () => {
    try {
      return localStorage.getItem(KEY_STORAGE) ?? '';
    } catch {
      return '';
    }
  };

  const writeKey = (key) => {
    try {
      if (key) localStorage.setItem(KEY_STORAGE, key);
      else localStorage.removeItem(KEY_STORAGE);
    } catch {
      /* storage unavailable: the key only lasts until the dialog closes */
    }
  };

  let sessionKey = readKey();

  async function call(method, params) {
    const url = new URL(API_URL);
    url.search = new URLSearchParams({ method, api_key: sessionKey, format: 'json', nojsoncallback: '1', ...params });
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Flickr antwoordde met status ${res.status}.`);
    const data = await res.json();
    if (data.stat !== 'ok') throw Object.assign(new Error(data.message || 'Onbekende fout van Flickr.'), { code: data.code });
    return data;
  }

  async function loadPage(album, page) {
    const common = { user_id: USER_ID, extras: 'url_q', per_page: String(PER_PAGE), page: String(page) };
    const data = album
      ? (await call('flickr.photosets.getPhotos', { ...common, photoset_id: album })).photoset
      : (await call('flickr.people.getPublicPhotos', common)).photos;
    return { photos: data.photo, pages: Number(data.pages) };
  }

  const photoUrl = (id) => `https://www.flickr.com/photos/${USER_ID}/${id}/`;

  const STYLE = `
    .fp { width: min(56rem, calc(100vw - 2rem)); max-height: calc(100vh - 2rem); padding: 0; border: 0; border-radius: 8px; font: 14px/1.4 system-ui, sans-serif; color: #1c2620; background: #fff; }
    .fp::backdrop { background: rgb(14 26 36 / 0.6); }
    .fp [hidden] { display: none !important; }
    .fp form { display: grid; grid-template-rows: auto auto 1fr auto; max-height: calc(100vh - 2rem); }
    .fp header, .fp footer { display: flex; gap: 0.5rem; align-items: center; padding: 0.75rem 1rem; }
    .fp header { border-bottom: 1px solid #d5dacd; }
    .fp footer { border-top: 1px solid #d5dacd; }
    .fp h2 { margin: 0 auto 0 0; font-size: 1.1rem; }
    .fp .status { margin: 0; padding: 0 1rem; color: #5a6650; }
    .fp .status:not(:empty) { padding-block: 0.5rem; }
    .fp .status.error { color: #a02c2c; }
    .fp .key { display: grid; gap: 0.5rem; padding: 1rem; }
    .fp .key input { padding: 0.5rem; font: inherit; }
    .fp .body { overflow: auto; padding: 1rem; }
    .fp .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 0.5rem; }
    .fp .grid button { position: relative; padding: 0; border: 3px solid transparent; border-radius: 4px; background: #eef0eb; cursor: pointer; aspect-ratio: 1; }
    .fp .grid button[aria-pressed='true'] { border-color: #e8b23a; }
    .fp .grid button[aria-pressed='true']::after { content: attr(data-order); position: absolute; top: 4px; right: 4px; min-width: 1.4em; border-radius: 999px; background: #e8b23a; color: #0e1a24; font-weight: 700; }
    .fp .grid img { display: block; width: 100%; height: 100%; object-fit: cover; }
    .fp .more { display: block; margin: 1rem auto 0; }
    .fp button.text { border: 0; background: none; color: inherit; text-decoration: underline; cursor: pointer; }
    .fp .count { margin-right: auto; }
    .fp footer button, .fp .key button, .fp .more { padding: 0.45rem 0.9rem; font: inherit; cursor: pointer; }
  `;

  function el(tag, { dataset, ...props } = {}, ...children) {
    const node = Object.assign(document.createElement(tag), props);
    Object.assign(node.dataset, dataset);
    node.append(...children);
    return node;
  }

  /** Opens the picker; resolves to the chosen Flickr photo URLs in click order, or null when cancelled. */
  function pickPhotos({ max }) {
    if (!document.getElementById('fp-style')) document.head.append(el('style', { id: 'fp-style', textContent: STYLE }));

    return new Promise((resolve) => {
      const selected = [];
      let album = '';
      let page = 0;
      let pages = 0;
      let request = 0;

      const status = el('p', { className: 'status', role: 'status' });
      const albumSelect = el('select', { ariaLabel: 'Album' }, el('option', { value: '', textContent: "Alle foto's" }));
      const changeKey = el('button', { type: 'button', className: 'text', textContent: 'API-key wijzigen' });
      const keyInput = el('input', { type: 'password', autocomplete: 'off', placeholder: 'Flickr API-key', ariaLabel: 'Flickr API-key' });
      const keySave = el('button', { type: 'button', textContent: 'Opslaan' });
      const keyForget = el('button', { type: 'button', className: 'text', textContent: 'Key wissen' });
      const keyForm = el(
        'div',
        { className: 'key', hidden: true },
        el('p', {
          textContent:
            'Vul je Flickr API-key in. Hij wordt alleen in deze browser bewaard (localStorage) en nergens anders opgeslagen.',
        }),
        keyInput,
        el('div', {}, keySave, ' ', keyForget),
      );
      const grid = el('div', { className: 'grid' });
      const more = el('button', { type: 'button', className: 'more', textContent: 'Meer laden', hidden: true });
      const count = el('span', { className: 'count' });
      const cancel = el('button', { type: 'button', textContent: 'Annuleren' });
      const insert = el('button', { type: 'submit', textContent: 'Invoegen', disabled: true });
      const dialog = el(
        'dialog',
        { className: 'fp' },
        el(
          'form',
          { method: 'dialog' },
          el('header', {}, el('h2', { textContent: "Foto's uit Flickr" }), albumSelect, changeKey),
          status,
          el('div', { className: 'body' }, keyForm, grid, more),
          el('footer', {}, count, cancel, insert),
        ),
      );

      const setStatus = (text, error = false) => {
        status.textContent = text;
        status.classList.toggle('error', error);
      };

      const updateSelection = () => {
        grid.querySelectorAll('button').forEach((b) => {
          const order = selected.indexOf(b.dataset.id);
          b.setAttribute('aria-pressed', String(order >= 0));
          b.dataset.order = order >= 0 && max > 1 ? String(order + 1) : '';
        });
        count.textContent = max > 1 ? `${selected.length} van max. ${max} gekozen` : '';
        insert.disabled = selected.length === 0;
      };

      const toggle = (id) => {
        const i = selected.indexOf(id);
        if (i >= 0) selected.splice(i, 1);
        else if (max === 1) selected.splice(0, 1, id);
        else if (selected.length < max) selected.push(id);
        else return setStatus(`Je kunt maximaal ${max} foto's tegelijk kiezen.`);
        setStatus('');
        updateSelection();
      };

      const fail = (error) => {
        if (error.code === INVALID_KEY) {
          showKeyForm('Deze API-key wordt niet geaccepteerd door Flickr.');
        } else {
          setStatus(`Foto's laden lukte niet: ${error.message}`, true);
        }
      };

      const showKeyForm = (message = '') => {
        keyForm.hidden = false;
        grid.hidden = true;
        more.hidden = true;
        keyInput.value = sessionKey;
        setStatus(message, Boolean(message));
        keyInput.focus();
      };

      const loadMore = async () => {
        const current = request;
        more.disabled = true;
        setStatus("Foto's laden…");
        try {
          const result = await loadPage(album, page + 1);
          if (current !== request) return;
          page += 1;
          pages = result.pages;
          grid.append(
            ...result.photos.map((p) =>
              el(
                'button',
                { type: 'button', title: p.title, onclick: () => toggle(p.id), dataset: { id: p.id } },
                el('img', { src: p.url_q, alt: p.title || 'Flickr-foto', loading: 'lazy' }),
              ),
            ),
          );
          for (const b of grid.querySelectorAll('button:not([aria-pressed])')) b.setAttribute('aria-pressed', 'false');
          updateSelection();
          setStatus(grid.childElementCount ? '' : 'Geen foto’s gevonden.');
        } catch (error) {
          fail(error);
        } finally {
          more.disabled = false;
          more.hidden = page >= pages;
        }
      };

      const reload = async () => {
        request += 1;
        grid.replaceChildren();
        page = 0;
        pages = 0;
        await loadMore();
      };

      const start = async () => {
        keyForm.hidden = true;
        grid.hidden = false;
        try {
          const { photosets } = await call('flickr.photosets.getList', { user_id: USER_ID });
          albumSelect.replaceChildren(
            albumSelect.options[0],
            ...photosets.photoset.map((s) => el('option', { value: s.id, textContent: s.title._content })),
          );
        } catch (error) {
          return fail(error);
        }
        await reload();
      };

      keySave.onclick = () => {
        sessionKey = keyInput.value.trim();
        if (!sessionKey) return showKeyForm('Vul een API-key in.');
        writeKey(sessionKey);
        start();
      };
      keyInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          keySave.click();
        }
      };
      keyForget.onclick = () => {
        sessionKey = '';
        writeKey('');
        showKeyForm('De key is gewist.');
      };
      changeKey.onclick = () => showKeyForm();
      albumSelect.onchange = () => {
        album = albumSelect.value;
        reload();
      };
      more.onclick = loadMore;
      cancel.onclick = () => dialog.close();
      dialog.onclose = () => {
        dialog.remove();
        resolve(dialog.returnValue === 'insert' ? selected.map(photoUrl) : null);
      };
      insert.value = 'insert';

      document.body.append(dialog);
      dialog.showModal();
      updateSelection();
      if (sessionKey) start();
      else showKeyForm();
    });
  }

  window.flickrPicker = { pickPhotos };

  if (!window.CMS) return;
  const h = CMS.React.createElement;

  CMS.registerFieldType('flickr', ({ value, onChange, forID, classNameWrapper }) =>
    h(
      'div',
      { style: { display: 'flex', gap: '0.5rem' } },
      h('input', {
        id: forID,
        className: classNameWrapper,
        style: { flex: 1 },
        value: value ?? '',
        placeholder: 'Flickr-foto-URL',
        onChange: (e) => onChange(e.target.value),
      }),
      h(
        'button',
        {
          type: 'button',
          onClick: async () => {
            const urls = await pickPhotos({ max: 1 });
            if (urls?.length) onChange(urls[0]);
          },
        },
        'Kies uit Flickr',
      ),
    ),
  );

  // Insert-only: inserted URLs end up as plain photo lines, which the build renders as a photo or a photo row.
  CMS.registerEditorComponent({
    id: 'flickr-photo',
    type: 'inline',
    label: 'Foto uit Flickr',
    icon: 'add_photo_alternate',
    pattern: new RegExp(FLICKR_URL),
    fromInline: (match) => ({ url: match[0] }),
    toInline: ({ url }) => url ?? '',
    toPreview: ({ url }) => {
      const count = url?.split('\n').filter(Boolean).length ?? 0;
      return count > 1 ? `📷 ${count} Flickr-foto's naast elkaar` : `📷 Flickr-foto ${url?.match(/\/photos\/[^/]+\/(\d+)/)?.[1] ?? ''}`;
    },
    onInsert: async () => {
      const urls = await pickPhotos({ max: MAX_PER_ROW });
      return urls?.length ? { url: urls.join('\n') } : null;
    },
    onEdit: async () => {
      const urls = await pickPhotos({ max: MAX_PER_ROW });
      return urls?.length ? { url: urls.join('\n') } : null;
    },
  });
})();
