/**
 * sync.js - Supabase 多设备云端实时同步与账号认证引擎
 */

class CloudSyncManager {
  constructor() {
    this.defaultUrl = 'https://aqvnepcfsuloshwyqpow.supabase.co';
    this.defaultKey = 'sb_publishable_NvftQhrdrlh-f7NOztO3xw_dW7Xw_q5';
    this.storageKeys = {
      url: 'supabase_project_url',
      key: 'supabase_publishable_key',
      lastSyncedAt: 'supabase_last_synced_at',
      cloudEpoch: 'supabase_cloud_epoch'
    };

    this.client = null;
    this.user = null;
    this.syncStatus = 'idle'; // 'idle' | 'syncing' | 'synced' | 'error'
    this.lastError = '';
    this.lastSyncedAt = localStorage.getItem(this.storageKeys.lastSyncedAt) || '';
    this.isSyncing = false;
    this._onChangeListeners = [];
  }

  getConfig() {
    return {
      url: (localStorage.getItem(this.storageKeys.url) || this.defaultUrl).trim().replace(/\/+$/, ''),
      key: (localStorage.getItem(this.storageKeys.key) || this.defaultKey).trim()
    };
  }

  onChange(fn) {
    if (typeof fn === 'function') this._onChangeListeners.push(fn);
  }

  _notify() {
    this._onChangeListeners.forEach(fn => {
      try { fn(this.getStatusSummary()); } catch (_) {}
    });
  }

  getStatusSummary() {
    return {
      ready: !!this.client,
      loggedIn: !!this.user,
      email: this.user ? (this.user.email || '') : '',
      syncStatus: this.syncStatus,
      lastSyncedAt: this.lastSyncedAt,
      lastError: this.lastError
    };
  }

  async init() {
    const cfg = this.getConfig();
    if (!cfg.url || !cfg.key || typeof window === 'undefined' || !window.supabase || !window.supabase.createClient) {
      return null;
    }

    if (!this.client) {
      this.client = window.supabase.createClient(cfg.url, cfg.key);
      this.client.auth.onAuthStateChange((_event, session) => {
        this.user = session ? session.user : null;
        if (!this.user) {
          this.syncStatus = 'idle';
        }
        this._notify();
      });
    }

    try {
      const { data } = await this.client.auth.getSession();
      this.user = data && data.session ? data.session.user : null;
      this._notify();
    } catch (err) {
      console.warn('Supabase session init failed:', err);
    }
    return this.user;
  }

  isLoggedIn() {
    return !!(this.client && this.user);
  }

  _wrapNetworkError(err) {
    const msg = (err && err.message) ? String(err.message) : String(err || '未知错误');
    if (/^(Load failed|Failed to fetch|NetworkError)/i.test(msg)) {
      return new Error(`无法连接 Supabase 云端服务器 (${msg})，请检查当前设备网络，或确认已开启可访问 supabase.co 的代理/VPN`);
    }
    return err instanceof Error ? err : new Error(msg);
  }

  async signUp(email, password) {
    await this.init();
    if (!this.client) throw new Error('Supabase SDK 尚未加载完成，请检查网络或刷新重试');
    const redirectTo = window.location.origin && window.location.origin !== 'null'
      ? `${window.location.origin}${window.location.pathname}`
      : undefined;
    try {
      const { data, error } = await this.client.auth.signUp({
        email: String(email || '').trim(),
        password: String(password || ''),
        options: redirectTo ? { emailRedirectTo: redirectTo } : undefined
      });
      if (error) throw error;
      if (data && data.session && data.session.user) {
        this.user = data.session.user;
        this._notify();
      }
      return data;
    } catch (err) {
      throw this._wrapNetworkError(err);
    }
  }

  async signIn(email, password) {
    await this.init();
    if (!this.client) throw new Error('Supabase SDK 尚未加载完成，请检查网络或刷新重试');
    try {
      const { data, error } = await this.client.auth.signInWithPassword({
        email: String(email || '').trim(),
        password: String(password || '')
      });
      if (error) throw error;
      this.user = data && data.user ? data.user : null;
      this._notify();
      return data;
    } catch (err) {
      throw this._wrapNetworkError(err);
    }
  }

  async signOut() {
    if (!this.client) return;
    await this.client.auth.signOut();
    this.user = null;
    this.syncStatus = 'idle';
    this.lastError = '';
    this._notify();
  }

  async pushItem(itemType, itemId, dataObj, deleted = false) {
    if (!this.isLoggedIn()) return;
    const nowIso = new Date().toISOString();
    try {
      const { error } = await this.client
        .from('notebook_items')
        .upsert({
          user_id: this.user.id,
          item_type: itemType,
          item_id: String(itemId),
          data: dataObj || {},
          updated_at: (dataObj && dataObj.updatedAt) ? dataObj.updatedAt : nowIso,
          deleted: !!deleted
        }, { onConflict: 'user_id,item_type,item_id' });
      if (error) throw error;
      this.lastSyncedAt = nowIso;
      localStorage.setItem(this.storageKeys.lastSyncedAt, this.lastSyncedAt);
      this.syncStatus = 'synced';
      this.lastError = '';
      this._notify();
    } catch (err) {
      console.warn('Cloud pushItem error:', err);
      this.syncStatus = 'error';
      this.lastError = err.message || '云端上传失败';
      this._notify();
    }
  }

  async _upsertBatch(rows) {
    if (!rows || rows.length === 0) return;
    const chunkSize = 25;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await this.client
        .from('notebook_items')
        .upsert(chunk, { onConflict: 'user_id,item_type,item_id' });
      if (error) throw error;
    }
  }

  // Fetch the complete dataset before any local replacement. Refuse inconsistent reads.
  async _fetchAllCloudRows() {
    const rows = [];
    const pageSize = 100;
    let expectedCount = null;
    while (true) {
      const { data, error, count } = await this.client.from('notebook_items')
        .select('item_type, item_id, data, updated_at, deleted', { count: 'exact' })
        .eq('user_id', this.user.id)
        .order('item_type', { ascending: true })
        .order('item_id', { ascending: true })
        .range(rows.length, rows.length + pageSize - 1);
      if (error) throw error;
      if (!Array.isArray(data) || !Number.isInteger(count) || (expectedCount !== null && count !== expectedCount)) {
        throw new Error('云端数据读取不完整或正在变化，请重试；本地数据未被覆盖');
      }
      expectedCount = count;
      rows.push(...data);
      if (rows.length === expectedCount) return rows;
      if (!data.length || rows.length > expectedCount) throw new Error('云端数据读取不完整，请重试；本地数据未被覆盖');
    }
  }

  async _collectLocalRows() {
    const uid = this.user.id;
    const nowIso = new Date().toISOString();
    const subjects = await window.db.getAllSubjects();
    const exams = await window.db.getAllExams();
    const questions = await window.db.getAllQuestions();
    const assessmentConfigs = await window.db.getAssessmentConfigs();
    const categoryScores = await window.db.getCategoryScores();

    const rows = [];
    subjects.forEach(s => {
      rows.push({
        user_id: uid,
        item_type: 'subject',
        item_id: String(s.id),
        data: s,
        updated_at: s.updatedAt || nowIso,
        deleted: false
      });
    });
    exams.forEach(e => {
      rows.push({
        user_id: uid,
        item_type: 'exam',
        item_id: String(e.id),
        data: e,
        updated_at: e.updatedAt || e.createdAt || nowIso,
        deleted: false
      });
    });
    questions.forEach(q => {
      rows.push({
        user_id: uid,
        item_type: 'question',
        item_id: String(q.id),
        data: q,
        updated_at: q.updatedAt || q.createdAt || nowIso,
        deleted: false
      });
    });
    rows.push({
      user_id: uid,
      item_type: 'meta',
      item_id: 'subject_assessment_configs',
      data: assessmentConfigs || {},
      updated_at: nowIso,
      deleted: false
    });
    rows.push({
      user_id: uid,
      item_type: 'meta',
      item_id: 'subject_category_scores',
      data: categoryScores || {},
      updated_at: nowIso,
      deleted: false
    });
    if (window.geminiAI && window.geminiAI.hasAnySyncableConfig()) {
      const aiPayload = window.geminiAI.exportSyncPayload();
      rows.push({
        user_id: uid,
        item_type: 'meta',
        item_id: 'ai_config',
        data: aiPayload,
        updated_at: aiPayload.updatedAt || nowIso,
        deleted: false
      });
    }
    return rows;
  }

  async pushAllLocalToCloud(replaceCloud = false) {
    if (!this.isLoggedIn()) throw new Error('请先登录云同步账号');
    this.isSyncing = true;
    this.syncStatus = 'syncing';
    this.lastError = '';
    this._notify();

    try {
      const rows = await this._collectLocalRows();
      const newEpoch = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      if (replaceCloud || !localStorage.getItem(this.storageKeys.cloudEpoch)) {
        rows.push({
          user_id: this.user.id,
          item_type: 'meta',
          item_id: 'cloud_epoch',
          data: { epoch: newEpoch },
          updated_at: new Date().toISOString(),
          deleted: false
        });
      }
      if (replaceCloud) {
        const { error } = await this.client.rpc('replace_notebook_items', { items: rows });
        if (error) throw new Error(`安全覆盖未完成；请先在 Supabase 应用 security.sql：${error.message}`);
      } else {
        await this._upsertBatch(rows);
      }

      if (replaceCloud || !localStorage.getItem(this.storageKeys.cloudEpoch)) {
        localStorage.setItem(this.storageKeys.cloudEpoch, newEpoch);
      }
      this.lastSyncedAt = new Date().toISOString();
      localStorage.setItem(this.storageKeys.lastSyncedAt, this.lastSyncedAt);
      this.syncStatus = 'synced';
      return { uploaded: rows.length };
    } catch (err) {
      this.syncStatus = 'error';
      this.lastError = err.message || '上传云端失败';
      throw err;
    } finally {
      this.isSyncing = false;
      this._notify();
    }
  }

  async syncNow() {
    if (!this.isLoggedIn() || this.isSyncing) return { skipped: true };
    this.isSyncing = true;
    this.syncStatus = 'syncing';
    this.lastError = '';
    this._notify();

    try {
      const cloudRows = await this._fetchAllCloudRows();

      // 清理历史明文密钥和可改变请求目标的地址，不再从云端恢复它们。
      const aiRow = (cloudRows || []).find(row => row.item_type === 'meta' && row.item_id === 'ai_config' && !row.deleted);
      if (aiRow && aiRow.data) {
        const sanitized = { ...aiRow.data };
        let needsScrub = false;
        for (const provider of ['gemini', 'deepseek']) {
          if (sanitized[provider] && typeof sanitized[provider] === 'object') {
            sanitized[provider] = { ...sanitized[provider] };
            for (const field of ['apiKey', 'baseUrl']) {
              if (Object.prototype.hasOwnProperty.call(sanitized[provider], field)) {
                delete sanitized[provider][field];
                needsScrub = true;
              }
            }
          }
        }
        if (needsScrub) {
          await this._upsertBatch([{ user_id: this.user.id, item_type: 'meta', item_id: 'ai_config', data: sanitized, updated_at: aiRow.updated_at, deleted: false }]);
          aiRow.data = sanitized;
        }
      }

      // 云端为空（例如首次从存有错题的 Mac 登录）：自动将本地全量上传至云端并建立 epoch
      if (!cloudRows || cloudRows.length === 0) {
        const rows = await this._collectLocalRows();
        const newEpoch = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        rows.push({
          user_id: this.user.id,
          item_type: 'meta',
          item_id: 'cloud_epoch',
          data: { epoch: newEpoch },
          updated_at: new Date().toISOString(),
          deleted: false
        });
        await this._upsertBatch(rows);
        localStorage.setItem(this.storageKeys.cloudEpoch, newEpoch);
        this.lastSyncedAt = new Date().toISOString();
        localStorage.setItem(this.storageKeys.lastSyncedAt, this.lastSyncedAt);
        this.syncStatus = 'synced';
        return { pulled: 0, pushed: rows.length };
      }

      // 若云端存在新的覆盖纪元（主设备执行过「用本机数据覆盖云端」或首次在新设备登录），清空本地旧/脏数据并以云端为准，绝不把脏数据反推回云端
      const epochRow = cloudRows.find(r => r.item_type === 'meta' && r.item_id === 'cloud_epoch' && !r.deleted);
      const cloudEpoch = epochRow && epochRow.data ? String(epochRow.data.epoch || '') : '';
      const localEpoch = localStorage.getItem(this.storageKeys.cloudEpoch) || '';
      if (cloudEpoch && cloudEpoch !== localEpoch) {
        await window.db.replaceCloudRecords(cloudRows || []);
        let resetPulled = 0;
        for (const row of cloudRows) {
          if (row.deleted) continue;
          if (row.item_type === 'meta') {
            if (row.item_id === 'subject_assessment_configs') {
              await window.db.saveAssessmentConfigs(row.data || {}, true);
            } else if (row.item_id === 'subject_category_scores') {
              await window.db.saveCategoryScores(row.data || {}, true);
            } else if (row.item_id === 'ai_config' && window.geminiAI) {
              window.geminiAI.importSyncPayload({ ...(row.data || {}), updatedAt: row.updated_at || (row.data && row.data.updatedAt) || '' });
            }
            continue;
          }
          const itemData = { ...(row.data || {}), id: row.item_id };

          resetPulled++;
        }
        localStorage.setItem(this.storageKeys.cloudEpoch, cloudEpoch);
        this.lastSyncedAt = new Date().toISOString();
        localStorage.setItem(this.storageKeys.lastSyncedAt, this.lastSyncedAt);
        this.syncStatus = 'synced';
        return { pulled: resetPulled, pushed: 0, resetLocal: true };
      }

      const [localSubs, localExams, localQuestions] = await Promise.all([
        window.db.getAllSubjects(),
        window.db.getAllExams(),
        window.db.getAllQuestions()
      ]);

      const localMap = new Map();
      localSubs.forEach(s => localMap.set(`subject:${s.id}`, s));
      localExams.forEach(e => localMap.set(`exam:${e.id}`, e));
      localQuestions.forEach(q => localMap.set(`question:${q.id}`, q));

      const cloudMap = new Map();
      cloudRows.forEach(r => cloudMap.set(`${r.item_type}:${r.item_id}`, r));

      let pulled = 0;
      const toPush = [];

      // 1. 云端 -> 本地
      for (const row of cloudRows) {
        if (row.item_type === 'meta' && row.item_id === 'cloud_epoch') continue;
        const key = `${row.item_type}:${row.item_id}`;
        const localItem = localMap.get(key);
        const cloudTime = new Date(row.updated_at || 0).getTime();

        if (row.deleted) {
          if (localItem) {
            if (row.item_type === 'subject') await window.db.deleteSubject(row.item_id, true);
            else if (row.item_type === 'exam') await window.db.deleteExam(row.item_id, true);
            else if (row.item_type === 'question') await window.db.deleteQuestion(row.item_id, true);
            pulled++;
          }
          continue;
        }

        if (row.item_type === 'meta') {
          if (row.item_id === 'subject_assessment_configs') {
            await window.db.saveAssessmentConfigs(row.data || {}, true);
            pulled++;
          } else if (row.item_id === 'subject_category_scores') {
            await window.db.saveCategoryScores(row.data || {}, true);
            pulled++;
          } else if (row.item_id === 'ai_config' && window.geminiAI) {
            const localPayload = window.geminiAI.exportSyncPayload();
            const localAiTime = localPayload.updatedAt ? new Date(localPayload.updatedAt).getTime() : 0;
            if (!window.geminiAI.hasAnySyncableConfig() || cloudTime >= localAiTime) {
              window.geminiAI.importSyncPayload({ ...(row.data || {}), updatedAt: row.updated_at || (row.data && row.data.updatedAt) || '' });
              pulled++;
            } else {
              toPush.push({
                user_id: this.user.id,
                item_type: 'meta',
                item_id: 'ai_config',
                data: localPayload,
                updated_at: localPayload.updatedAt || new Date().toISOString(),
                deleted: false
              });
            }
          }
          continue;
        }

        const localTime = localItem ? new Date(localItem.updatedAt || localItem.createdAt || 0).getTime() : 0;
        if (!localItem || cloudTime >= localTime) {
          const itemData = { ...(row.data || {}), id: row.item_id };
          if (row.item_type === 'subject') await window.db.saveSubject(itemData, true);
          else if (row.item_type === 'exam') await window.db.saveExam(itemData, true);
          else if (row.item_type === 'question') await window.db.saveQuestion(itemData, true);
          pulled++;
        } else {
          // 本地更新更晚，推回云端
          toPush.push({
            user_id: this.user.id,
            item_type: row.item_type,
            item_id: String(row.item_id),
            data: localItem,
            updated_at: localItem.updatedAt || localItem.createdAt || new Date().toISOString(),
            deleted: false
          });
        }
      }

      // 2. 本地独有条目 -> 推到云端（但排除已在云端标记为 deleted 的条目）
      for (const [key, localItem] of localMap.entries()) {
        if (!cloudMap.has(key)) {
          const [itemType, ...rest] = key.split(':');
          const itemId = rest.join(':');
          toPush.push({
            user_id: this.user.id,
            item_type: itemType,
            item_id: itemId,
            data: localItem,
            updated_at: localItem.updatedAt || localItem.createdAt || new Date().toISOString(),
            deleted: false
          });
        }
      }

      if (!cloudMap.has('meta:ai_config') && window.geminiAI && window.geminiAI.hasAnySyncableConfig()) {
        const localPayload = window.geminiAI.exportSyncPayload();
        toPush.push({
          user_id: this.user.id,
          item_type: 'meta',
          item_id: 'ai_config',
          data: localPayload,
          updated_at: localPayload.updatedAt || new Date().toISOString(),
          deleted: false
        });
      }

      if (toPush.length > 0) {
        await this._upsertBatch(toPush);
      }

      this.lastSyncedAt = new Date().toISOString();
      localStorage.setItem(this.storageKeys.lastSyncedAt, this.lastSyncedAt);
      this.syncStatus = 'synced';
      return { pulled, pushed: toPush.length };
    } catch (err) {
      console.error('Supabase syncNow failed:', err);
      this.syncStatus = 'error';
      this.lastError = err.message || '云同步失败';
      throw err;
    } finally {
      this.isSyncing = false;
      this._notify();
    }
  }

  async pullOverwriteLocal() {
    if (!this.isLoggedIn()) throw new Error('请先登录云同步账号');
    this.isSyncing = true;
    this.syncStatus = 'syncing';
    this.lastError = '';
    this._notify();

    try {
      const cloudRows = await this._fetchAllCloudRows();

      await window.db.replaceCloudRecords(cloudRows || []);
      let pulled = 0;
      let cloudEpoch = '';
      for (const row of (cloudRows || [])) {
        if (row.deleted) continue;
        if (row.item_type === 'meta') {
          if (row.item_id === 'cloud_epoch' && row.data && row.data.epoch) {
            cloudEpoch = String(row.data.epoch);
          } else if (row.item_id === 'subject_assessment_configs') {
            await window.db.saveAssessmentConfigs(row.data || {}, true);
          } else if (row.item_id === 'subject_category_scores') {
            await window.db.saveCategoryScores(row.data || {}, true);
          } else if (row.item_id === 'ai_config' && window.geminiAI) {
            window.geminiAI.importSyncPayload({ ...(row.data || {}), updatedAt: row.updated_at || (row.data && row.data.updatedAt) || '' });
          }
          continue;
        }
        const itemData = { ...(row.data || {}), id: row.item_id };

        pulled++;
      }
      if (cloudEpoch) {
        localStorage.setItem(this.storageKeys.cloudEpoch, cloudEpoch);
      }
      this.lastSyncedAt = new Date().toISOString();
      localStorage.setItem(this.storageKeys.lastSyncedAt, this.lastSyncedAt);
      this.syncStatus = 'synced';
      return { pulled };
    } catch (err) {
      this.syncStatus = 'error';
      this.lastError = err.message || '从云端覆盖本机失败';
      throw err;
    } finally {
      this.isSyncing = false;
      this._notify();
    }
  }
}

window.cloudSync = new CloudSyncManager();
