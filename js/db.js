/**
 * db.js - IndexedDB 本地持久化存储层
 * 支持大规模错题数据、图片附件、考试记录与学科管理
 */

const DB_NAME = 'ErrorNotebookDB';
const DB_VERSION = 1;

class NotebookDB {
  constructor() {
    this.db = null;
    this.isReady = false;
    this.readyPromise = this.init();
  }

  init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 学科存储表
        if (!db.objectStoreNames.contains('subjects')) {
          const subjectStore = db.createObjectStore('subjects', { keyPath: 'id' });
          subjectStore.createIndex('order', 'order', { unique: false });
        }

        // 考试场次与成绩存储表
        if (!db.objectStoreNames.contains('exams')) {
          const examStore = db.createObjectStore('exams', { keyPath: 'id' });
          examStore.createIndex('date', 'date', { unique: false });
        }

        // 错题主表
        if (!db.objectStoreNames.contains('questions')) {
          const questionStore = db.createObjectStore('questions', { keyPath: 'id' });
          questionStore.createIndex('subjectId', 'subjectId', { unique: false });
          questionStore.createIndex('examId', 'examId', { unique: false });
          questionStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // 系统设置表
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        this.isReady = true;
        // iOS/iPadOS Safari 切后台或锁屏时会主动关闭 IndexedDB 连接，监听后自动置空以便下次重连
        this.db.onclose = () => {
          this.db = null;
          this.isReady = false;
          this.readyPromise = null;
        };
        this.db.onversionchange = () => {
          try { this.db && this.db.close(); } catch (_) {}
          this.db = null;
          this.isReady = false;
          this.readyPromise = null;
        };
        resolve(this.db);
      };

      request.onerror = (event) => {
        this.isReady = false;
        this.readyPromise = null;
        console.error('IndexedDB open error:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  async ready() {
    if (!this.isReady || !this.db) {
      if (!this.readyPromise) {
        this.readyPromise = this.init();
      }
      await this.readyPromise;
    }
    return this.db;
  }

  // 通用事务操作（兼容 iOS Safari 连接被关闭后自动重连重试）
  async getStore(storeName, mode = 'readonly') {
    let db = await this.ready();
    try {
      const transaction = db.transaction(storeName, mode);
      return transaction.objectStore(storeName);
    } catch (err) {
      this.db = null;
      this.isReady = false;
      this.readyPromise = null;
      db = await this.ready();
      const transaction = db.transaction(storeName, mode);
      return transaction.objectStore(storeName);
    }
  }

  // --- 学科相关操作 ---
  async getAllSubjects() {
    const store = await this.getStore('subjects', 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async saveSubject(subject, skipCloud = false) {
    const store = await this.getStore('subjects', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(subject);
      request.onsuccess = () => {
        if (!skipCloud && window.cloudSync && window.cloudSync.isLoggedIn()) {
          window.cloudSync.pushItem('subject', subject.id, subject, false);
        }
        resolve(subject);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteSubject(id, skipCloud = false) {
    const store = await this.getStore('subjects', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => {
        if (!skipCloud && window.cloudSync && window.cloudSync.isLoggedIn()) {
          window.cloudSync.pushItem('subject', id, { id }, true);
        }
        resolve(true);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // --- 考试记录相关操作 ---
  async getAllExams() {
    const store = await this.getStore('exams', 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const exams = request.result || [];
        // 按日期倒序排
        exams.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        resolve(exams);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getExamById(id) {
    const store = await this.getStore('exams', 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async saveExam(exam, skipCloud = false) {
    const store = await this.getStore('exams', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(exam);
      request.onsuccess = () => {
        if (!skipCloud && window.cloudSync && window.cloudSync.isLoggedIn()) {
          window.cloudSync.pushItem('exam', exam.id, exam, false);
        }
        resolve(exam);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteExam(id, skipCloud = false) {
    const store = await this.getStore('exams', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => {
        if (!skipCloud && window.cloudSync && window.cloudSync.isLoggedIn()) {
          window.cloudSync.pushItem('exam', id, { id }, true);
        }
        resolve(true);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // --- 错题相关操作 ---
  async getAllQuestions() {
    const store = await this.getStore('questions', 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const questions = request.result || [];
        questions.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        resolve(questions);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getQuestionById(id) {
    const store = await this.getStore('questions', 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async saveQuestion(question, skipCloud = false) {
    const store = await this.getStore('questions', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(question);
      request.onsuccess = () => {
        if (!skipCloud && window.cloudSync && window.cloudSync.isLoggedIn()) {
          window.cloudSync.pushItem('question', question.id, question, false);
        }
        resolve(question);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteQuestion(id, skipCloud = false) {
    const store = await this.getStore('questions', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => {
        if (!skipCloud && window.cloudSync && window.cloudSync.isLoggedIn()) {
          window.cloudSync.pushItem('question', id, { id }, true);
        }
        resolve(true);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // --- 设置项 ---
  async getSetting(key, defaultValue = null) {
    const store = await this.getStore('settings', 'readonly');
    return new Promise((resolve) => {
      const request = store.get(key);
      request.onsuccess = () => {
        if (request.result && request.result.value !== undefined) {
          resolve(request.result.value);
        } else {
          resolve(defaultValue);
        }
      };
      request.onerror = () => resolve(defaultValue);
    });
  }

  async setSetting(key, value) {
    const store = await this.getStore('settings', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put({ key, value });
      request.onsuccess = () => resolve(value);
      request.onerror = () => reject(request.error);
    });
  }

  // --- 考核项目与权重配置 / 自评得分 ---
  async getAssessmentConfigs() {
    return await this.getSetting('subject_assessment_configs', {});
  }

  async saveAssessmentConfigs(configs, skipCloud = false) {
    const res = await this.setSetting('subject_assessment_configs', configs);
    if (!skipCloud && window.cloudSync && window.cloudSync.isLoggedIn()) {
      window.cloudSync.pushItem('meta', 'subject_assessment_configs', configs, false);
    }
    return res;
  }

  async getCategoryScores() {
    return await this.getSetting('subject_category_scores', {});
  }

  async saveCategoryScores(scores, skipCloud = false) {
    const res = await this.setSetting('subject_category_scores', scores);
    if (!skipCloud && window.cloudSync && window.cloudSync.isLoggedIn()) {
      window.cloudSync.pushItem('meta', 'subject_category_scores', scores, false);
    }
    return res;
  }

  // --- 数据全量导出与导入 ---
  async exportAllData() {
    const subjects = await this.getAllSubjects();
    const exams = await this.getAllExams();
    const questions = await this.getAllQuestions();
    const assessmentConfigs = await this.getAssessmentConfigs();
    const categoryScores = await this.getCategoryScores();
    return {
      version: 2,
      exportedAt: new Date().toISOString(),
      appName: 'ErrorNotebook',
      data: {
        subjects,
        exams,
        questions,
        assessmentConfigs,
        categoryScores
      }
    };
  }

  async importData(importedPayload, mode = 'merge') {
    if (!importedPayload || !importedPayload.data) {
      throw new Error('导入文件格式不正确，缺少数据主体');
    }
    const { subjects = [], exams = [], questions = [], assessmentConfigs = null, categoryScores = null } = importedPayload.data;

    if (mode === 'overwrite') {
      await this.clearAllData();
    }

    // 导入学科
    for (const sub of subjects) {
      await this.saveSubject(sub);
    }
    // 导入考试
    for (const ex of exams) {
      await this.saveExam(ex);
    }
    // 导入错题
    for (const q of questions) {
      await this.saveQuestion(q);
    }
    if (assessmentConfigs) {
      await this.saveAssessmentConfigs(assessmentConfigs);
    }
    if (categoryScores) {
      await this.saveCategoryScores(categoryScores);
    }

    return {
      importedSubjects: subjects.length,
      importedExams: exams.length,
      importedQuestions: questions.length
    };
  }

  async clearQuestionsAndExams() {
    const stores = ['exams', 'questions'];
    for (const storeName of stores) {
      const store = await this.getStore(storeName, 'readwrite');
      await new Promise((resolve, reject) => {
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }
  }

  // 在一个 IndexedDB 事务中替换三类记录，失败时由浏览器整体回滚。
  async replaceCloudRecords(rows) {
    const mapping = { subject: 'subjects', exam: 'exams', question: 'questions' };
    const records = rows.filter(row => !row.deleted && mapping[row.item_type]).map(row => {
      if (!row.item_id || !row.data || typeof row.data !== 'object' || Array.isArray(row.data)) {
        throw new Error('云端数据格式无效，已保留本地数据');
      }
      return { store: mapping[row.item_type], value: { ...row.data, id: row.item_id } };
    });
    const db = await this.ready();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['subjects', 'exams', 'questions'], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error || new Error('本地数据替换失败'));
      for (const name of ['subjects', 'exams', 'questions']) tx.objectStore(name).clear();
      for (const record of records) tx.objectStore(record.store).put(record.value);
    });
  }

  async clearAllData() {
    const stores = ['subjects', 'exams', 'questions'];
    for (const storeName of stores) {
      const store = await this.getStore(storeName, 'readwrite');
      await new Promise((resolve, reject) => {
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }
  }
}

// 导出全局单例
window.db = new NotebookDB();

