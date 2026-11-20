// Run with JavaScriptCore by prepending js/ai.js and js/sync.js (see commands below).
(async () => {
  localStorage.setItem('openai_api_key', 'secret-test-key');
  localStorage.setItem('openai_base_url', 'https://private.example');
  const exported = window.geminiAI.exportSyncPayload();
  if (JSON.stringify(exported).includes('secret-test-key') || JSON.stringify(exported).includes('private.example')) throw Error('sensitive settings exported');
  window.geminiAI.importSyncPayload({ deepseek: { apiKey: 'remote-key', baseUrl: 'https://evil.example' } });
  if (localStorage.getItem('openai_api_key') !== 'secret-test-key' || localStorage.getItem('openai_base_url') !== 'https://private.example') throw Error('remote settings overwrote local secrets');
  localStorage.setItem('supabase_cloud_epoch', 'epoch');
  let saved;
  window.db = {
    getAllSubjects: async () => [], getAllExams: async () => [], getAllQuestions: async () => [],
    saveQuestion: async q => { saved = q; }, saveSubject: async () => {}, saveExam: async () => {},
    saveAssessmentConfigs: async () => {}, saveCategoryScores: async () => {}
  };
  window.geminiAI = null;
  const rows = [{ item_type: 'meta', item_id: 'cloud_epoch', data: { epoch: 'epoch' }, deleted: false },
    { item_type: 'question', item_id: 'q1', data: { title: 'cloud' }, updated_at: '2026-01-01T00:00:00Z', deleted: false }];
  const manager = window.cloudSync;
  manager.user = { id: 'user' };
  manager.client = { from: () => ({ select: () => ({ eq: () => ({ order() { return this; }, range: async () => ({ data: rows, count: rows.length, error: null }) }) }) }) };
  await manager.syncNow();
  if (!saved || saved.id !== 'q1' || saved.title !== 'cloud') throw Error('cloud record was not saved');
  print('security smoke PASS');
})().catch(e => { print('FAIL ' + e); throw e; });
