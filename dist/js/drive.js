/* Google Drive backup (optional). The Google script is only loaded when Drive is used.
   Each document keeps its Drive file id, so saving again UPDATES the same file. */
const Drive = (() => {
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
  const FIELDS = 'id,name,webViewLink';

  let token = '';
  let expiresAt = 0;
  let gsiPromise = null;

  const hasToken = () => !!token && Date.now() < expiresAt;

  function loadGsi() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    if (gsiPromise) return gsiPromise;
    gsiPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        gsiPromise = null;
        reject(new Error('could not load Google sign-in (check your network)'));
      };
      document.head.append(s);
    });
    return gsiPromise;
  }

  function requestToken(clientId) {
    return new Promise((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (r) => {
          if (r.error) return reject(new Error('Google authorisation failed'));
          token = r.access_token;
          expiresAt = Date.now() + Math.max(0, (Number(r.expires_in) || 3600) - 60) * 1000;
          resolve(token);
        },
        error_callback: (e) => reject(new Error(e?.type === 'popup_closed' ? 'sign-in window closed' : 'Google authorisation failed'))
      });
      client.requestAccessToken({ prompt: token ? '' : 'consent' });
    });
  }

  async function connect(clientId) {
    if (!clientId) throw new Error('enter your Google Client ID first');
    await loadGsi();
    return requestToken(clientId);
  }

  async function ensureToken(clientId) {
    if (hasToken()) return token;
    return connect(clientId);
  }

  function multipart(metadata, doc) {
    const boundary = 'cableflow_' + Date.now();
    const { driveFileId, ...clean } = doc; // don't upload our own bookkeeping field
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n`,
      JSON.stringify(clean, null, 2),
      `\r\n--${boundary}--`
    ]);
    return { body, contentType: `multipart/related; boundary=${boundary}` };
  }

  async function send(url, method, doc, metadata) {
    const { body, contentType } = multipart(metadata, doc);
    return fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
      body
    });
  }

  /** Create or update the backup. Resolves to {id, name, webViewLink}. */
  async function backup(doc, clientId) {
    await ensureToken(clientId);
    const metadata = { name: `${doc.docNumber} - ${doc.customerName}.json`, mimeType: 'application/json' };

    let res = null;
    if (doc.driveFileId) {
      res = await send(`${UPLOAD}/${encodeURIComponent(doc.driveFileId)}?uploadType=multipart&fields=${FIELDS}`, 'PATCH', doc, metadata);
      if (res.status === 404) res = null; // file was deleted in Drive: create a new one
    }
    if (!res) res = await send(`${UPLOAD}?uploadType=multipart&fields=${FIELDS}`, 'POST', doc, metadata);

    if (!res.ok) {
      if (res.status === 401) { token = ''; expiresAt = 0; }
      throw new Error(res.status === 401 ? 'session expired, click Save again' : `upload failed (${res.status})`);
    }
    return res.json();
  }

  return { connect, backup, hasToken, preload: () => loadGsi().catch(() => {}) };
})();
