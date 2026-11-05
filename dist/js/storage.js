/* Safe localStorage wrapper: corrupt data or a full disk never breaks the app. */
const Store = (() => {
  const KEYS = {
    docs: 'cableflow-docs-v2',
    settings: 'cableflow-settings-v2',
    draft: 'cableflow-draft-v2'
  };

  const read = (key, fallback) => {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v ?? fallback;
    } catch {
      return fallback;
    }
  };

  /** Returns true on success, false if the browser refused (quota / private mode). */
  const write = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  };

  const remove = (key) => {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  };

  return {
    getDocs: () => {
      const d = read(KEYS.docs, []);
      return Array.isArray(d) ? d : [];
    },
    setDocs: (docs) => write(KEYS.docs, docs),
    getSettings: () => {
      const s = read(KEYS.settings, {});
      return s && typeof s === 'object' ? s : {};
    },
    setSettings: (s) => write(KEYS.settings, s),
    getDraft: () => read(KEYS.draft, null),
    setDraft: (d) => write(KEYS.draft, d),
    clearDraft: () => remove(KEYS.draft)
  };
})();
