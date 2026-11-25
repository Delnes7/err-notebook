/* A headless compatibility service. All visible navigation and forms live in SwiftUI. */
(() => {
  'use strict';
  const app = window.app;
  app.render = app.renderHeader = app.renderExamsCharts = () => {};
  app.switchTab = () => {};
  app.showToast = (message, type) => { if (type === 'error' || type === 'warning') throw new Error(message); };
  let queue = Promise.resolve();
  const initialized = (async () => {
    await db.ready();
    await ensureSampleData(db);
    await app.refreshData();
    cloudSync.init().then(user => user ? cloudSync.syncNow() : null).then(() => window.webkit?.messageHandlers?.notebook?.postMessage({action:'dataChanged'})).catch(() => {});
  })();
  async function snapshot() {
    await app.refreshData();
    const config = geminiAI.getConfig();
    const assessments = app.subjects.map(subject => app.getSubjectAssessment(subject.id));
    return { subjects:app.subjects, questions:app.questions, exams:app.exams, assessments,
      assessmentConfigs:app.assessmentConfigs, categoryScores:app.categoryScores,
      sync:cloudSync.getStatusSummary(), cloudConfig:cloudSync.getConfig(),
      ai:{provider:config.provider,model:config.model,baseUrl:config.baseUrl,hasKey:!!config.apiKey},
      reasons:app.presetReasons };
  }

  async function put(type, value) {
    const map={question:'questions',exam:'exams',subject:'subjects'};
    if(!map[type] || !value || typeof value.id!=='string' || !value.id) throw Error('记录格式无效');
    value.updatedAt=new Date().toISOString();
    const connection=await db.ready();
    await new Promise((resolve,reject)=>{const tx=connection.transaction(map[type],'readwrite');tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||Error('保存失败'));tx.objectStore(map[type]).put(value)});
    if(cloudSync.isLoggedIn())await cloudSync.pushItem(type,value.id,value);
  }
  function setForm(form) {
    app.resetEditorForm();
    app.form={...app.form,...form};
    if(app.form.solutionMode==='none')app.form.solution='';
    if(app.form.questionType==='multiple_choice') {
      const valid=new Set((app.form.optionsList||[]).map(o=>o.key));
      for(const field of ['correctOptions','myOptions']) {
        let options=(app.form[field]||[]).filter(key=>valid.has(key));
        if(app.form.mcqType!=='multiple')options=options.slice(0,1);
        app.form[field]=options;
      }
      app.form.correctOption=app.form.correctOptions.join(', ');
      app.form.myOption=app.form.myOptions.join(', ');
    }
    app.compileQuestionContent(true);
    return app.form;
  }
  async function dispatch(action,p={}) {
    await initialized;
    switch(action) {
      case 'snapshot': return snapshot();
      case 'newQuestion': app.resetEditorForm(); return app.form;
      case 'editQuestion': app.editQuestion(p.id); return app.form;
      case 'compile': return setForm(p.form);
      case 'saveQuestion': {
        const f=setForm(p.form);if(!f.content.trim())throw Error('请填写题目正文');
        if(!app.subjects.some(s=>s.id===f.subjectId))throw Error('请选择学科');
        const previous=app.questions.find(q=>q.id===p.id)||{};
        const q={...previous,...f,id:p.id||('q_'+Date.now()+'_'+Math.random().toString(36).slice(2)),createdAt:previous.createdAt||new Date().toISOString(),
          difficulty:Math.max(1,Math.min(5,parseInt(f.difficulty,10)||3)),
          solution:f.questionType==='multiple_choice'?f.compiledSolution:f.solution,
          parts:f.questionType==='structured'&&f.structuredMode==='multi_part'?f.parts:null,
          mcqOptionsList:f.questionType==='multiple_choice'?f.optionsList:null,
          options:f.questionType==='multiple_choice'?Object.fromEntries((f.optionsList||[]).map(o=>[o.key,o.text])):null};
        delete q.optionsList;delete q.compiledSolution;await put('question',q);return snapshot();
      }
      case 'saveSubject': if(!p.record.name?.trim())throw Error('请填写学科名称');await put('subject',p.record);return snapshot();
      case 'saveExam': {
        const e={...p.record}; const sub=app.subjects.find(s=>s.id===e.subjectId);
        if(!e.title?.trim()||!sub)throw Error('请填写考试名称并选择学科');
        const curved=e.curvedScore!==''&&e.curvedScore!=null;
        const raw=Number(e.score),max=Number(e.maxScore),curve=Number(e.curvedScore);
        if((!curved&&(String(e.score??'').trim()===''||String(e.maxScore??'').trim()===''||!Number.isFinite(raw)||!Number.isFinite(max)||max<=0||raw<0))||(curved&&!Number.isFinite(curve)))throw Error('分数无效');
        e.score=raw;e.maxScore=max>0?max:100;e.rawPercentage=Math.round(raw/e.maxScore*1000)/10;
        e.curvedScore=curved?curve:null;e.isCurved=curved;e.percentage=curved?curve:e.rawPercentage;
        e.grade=app.calculateGrade(e.percentage,sub.curriculum);e.isFinal=String(e.category).includes('final');
        e.categoryName=app.getSubjectCategories(sub.id).find(c=>c.id===e.category)?.name||e.categoryName||e.category;
        e.type=e.categoryName;e.unitId=e.unitIds?.[0]||'';
        const existing = app.exams.find(exam => exam.id === e.id);
        e.legacyExamIds = existing?.legacyExamIds || [];
        await put('exam',e);return snapshot();
      }
      case 'delete': {
        const methods={question:'deleteQuestion',exam:'deleteExam',subject:'deleteSubject'};
        if(!methods[p.type])throw Error('无效记录类型');
        if (p.type === 'exam') {
          await app.removeExam(p.id);
        } else {
          await db[methods[p.type]](p.id);
        }
        return snapshot();
      }
      case 'assessment': {
        const cats=p.categories;
        if(!Array.isArray(cats)||!cats.length||cats.some(c=>!c.name?.trim()||!Number.isFinite(Number(c.weight))||Number(c.weight)<0)||Math.abs(cats.reduce((s,c)=>s+Number(c.weight),0)-100)>.01)throw Error('考核权重必须合计为 100%');
        if(new Set(cats.map(c=>c.id)).size!==cats.length)throw Error('考核项目不能重复');
        if(Object.values(p.scores||{}).some(value=>String(value).trim()!==''&&!Number.isFinite(Number(value))))throw Error('覆盖成绩必须为数字');
        const configs=await db.getAssessmentConfigs();configs[p.id]=cats;await db.saveAssessmentConfigs(configs);
        const scores=await db.getCategoryScores();scores[p.id]=p.scores||{};await db.saveCategoryScores(scores);return snapshot();
      }
      case 'backup': return JSON.stringify(await db.exportAllData());
      case 'restore': {
        const payload=JSON.parse(p.json),data=payload?.data;
        if(!data||!['subjects','exams','questions'].every(k=>Array.isArray(data[k])&&data[k].every(v=>v&&typeof v.id==='string'&&v.id)&&new Set(data[k].map(v=>v.id)).size===data[k].length))throw Error('备份文件格式无效');
        const conn=await db.ready();
        await new Promise((resolve,reject)=>{const tx=conn.transaction(['subjects','exams','questions','settings'],'readwrite');tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||Error('恢复失败'));for(const k of ['subjects','exams','questions']){const s=tx.objectStore(k);s.clear();for(const v of data[k])s.put(v)}for(const [key,value] of [['subject_assessment_configs',data.assessmentConfigs||{}],['subject_category_scores',data.categoryScores||{}]])tx.objectStore('settings').put({key,value})});
        return snapshot();
      }
      case 'sync': await cloudSync.syncNow();return snapshot();
      case 'foreground':
        if (cloudSync.isLoggedIn()) await cloudSync.syncNow().catch(() => {});
        return snapshot();
      case 'push': await cloudSync.pushAllLocalToCloud(true);return snapshot();
      case 'pull': await cloudSync.pullOverwriteLocal();return snapshot();
      case 'signIn': await cloudSync.signIn(p.email,p.password);return snapshot();
      case 'signUp': await cloudSync.signUp(p.email,p.password);return snapshot();
      case 'signOut': await cloudSync.signOut();return snapshot();
      case 'cloudSettings': {
        const url=new URL(p.url);if(url.protocol!=='https:'||url.username||url.password||!p.key?.trim())throw Error('请填写有效的 HTTPS 地址与公开密钥');
        await cloudSync.signOut();localStorage.setItem(cloudSync.storageKeys.url,url.href.replace(/\/$/,''));localStorage.setItem(cloudSync.storageKeys.key,p.key.trim());cloudSync.client=null;await cloudSync.init();return snapshot();
      }
      case 'aiConfig': { const cfg=geminiAI.getConfig(p.provider);delete cfg.apiKey;return cfg; }
      case 'aiSettings': {
        if(p.baseUrl){const url=new URL(p.baseUrl);if(url.protocol!=='https:'||url.username||url.password)throw Error('AI 服务必须使用有效的 HTTPS 地址');}
        geminiAI.saveConfig(p);await notebookNative.flushSecrets();return snapshot();
      }
      case 'testAI': return geminiAI.testConnection();
      case 'resetSamples':
        for(const sub of DEFAULT_SUBJECTS)await put('subject',sub);
        for(const exam of DEFAULT_EXAMS)await put('exam',exam);
        for(const q of DEFAULT_QUESTIONS)await put('question',q);
        return snapshot();
      case 'clearExamples':
        for(const q of app.questions)await db.deleteQuestion(q.id);
        for(const e of await db.getAllExams())await db.deleteExam(e.id);
        return snapshot();
      case 'clearLocal': await db.replaceCloudRecords([]);await db.saveAssessmentConfigs({},true);await db.saveCategoryScores({},true);return snapshot();
      case 'recognize': {
        setForm(p.form);const result=await geminiAI.recognizeQuestion({...p,subjects:app.subjects,currentSubjectId:p.form.subjectId});app.applyAiResultToForm(result);return app.form;
      }
      case 'recognizeMS': {
        setForm(p.form);const result=await geminiAI.recognizeMarkSchemeOnly({markSchemeImages:p.markSchemeImages,questionType:app.form.questionType,parts:app.form.parts,stem:app.form.stem});app.applyMarkSchemeOnlyToForm(result);return app.form;
      }
      case 'lookup': return geminiAI.lookupCiePaperCode({questionText:p.text,questionImages:p.images||[]});
      case 'rich': return markdownRenderer.render(p.text||'');
      case 'paper': {
        practicePaperEngine.selectedQuestionIds=new Set(p.ids);Object.assign(practicePaperEngine.options,p.options||{});practicePaperEngine.customSpacingMap=p.spacing||{};
        const html=practicePaperEngine.generatePaperHtml(app.questions,app.subjects,app.exams);
        document.getElementById('print-container').innerHTML=html;document.body.className='paper-font-'+(p.options?.fontSize||'medium');
        await document.fonts.ready;return html;
      }
      default:throw Error('不支持的操作');
    }
  }
  window.nativeService=(action,payload)=>{const task=queue.then(()=>dispatch(action,payload));queue=task.catch(()=>{});return task.then(value=>JSON.parse(JSON.stringify(value??null)))};
})();
