(function () {
  'use strict';

  // This client intentionally uses the site's public key, never a user session.
  const fields = 'id,slug,title,description,image,prep_time,cook_time,servings,sauce,tag,tag_color,ingredients,instructions,created_at,published';
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function create(baseUrl, publicKey) {
    return async function readRecipes(query = {}) {
      const url = new URL('/rest/v1/recipes', baseUrl);
      url.search = new URLSearchParams({ select: fields, ...query }).toString();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: { apikey: publicKey, 'Accept-Profile': 'kusinamate_api' },
          credentials: 'omit',
          signal: controller.signal
        });
        if (!response.ok) throw new Error('Recipe request failed (' + response.status + ')');
        const rows = await response.json();
        if (!Array.isArray(rows) || rows.some(row =>
          !row || typeof row !== 'object' || Array.isArray(row) ||
          typeof row.id !== 'string' || !uuid.test(row.id) ||
          typeof row.slug !== 'string' || !row.slug.trim() ||
          typeof row.title !== 'string' || !row.title.trim() ||
          (row.ingredients != null && (!Array.isArray(row.ingredients) || row.ingredients.some(value => typeof value !== 'string'))) ||
          (row.instructions != null && (!Array.isArray(row.instructions) || row.instructions.some(value => typeof value !== 'string')))
        )) throw new Error('Invalid recipe response');
        for (const row of rows) {
          row.ingredients ??= [];
          row.instructions ??= [];
        }
        return rows;
      } finally {
        clearTimeout(timeout);
      }
    };
  }

  function message(element, text, failed = false) {
    element.replaceChildren();
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    paragraph.style.cssText = 'text-align:center;color:#777;grid-column:1/-1;';
    element.appendChild(paragraph);
    element.style.display = '';
    element.setAttribute('role', failed ? 'alert' : 'status');
    element.setAttribute('aria-live', 'polite');
  }

  function escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
  }

  function imageUrl(value) {
    if (typeof value !== 'string' || !value) return '';
    try {
      const url = new URL(value, window.location.href);
      return url.protocol === 'https:' || url.origin === window.location.origin ? url.href : '';
    } catch (_) { return ''; }
  }

  function color(value) {
    return /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#D4380D';
  }

  window.RecipeApi = { create, message, escape, imageUrl, color, isUuid: value => uuid.test(value || '') };
})();
