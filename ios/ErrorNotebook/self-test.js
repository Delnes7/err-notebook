(async () => {
  try {
    for (let i = 0; i < 100 && (!window.app || !document.querySelector('#main-content button')); i++) await new Promise(r => setTimeout(r, 100));
    if (!window.notebookNative || !window.katex || !window.Chart || !window.supabase) throw Error('bundled libraries unavailable');
    const database = await window.db.ready();
    if (!database) throw Error('IndexedDB unavailable on app origin');
    if (window.__notebookPersistenceMode) {
      const id = 'ios-persistence-test';
      if (window.__notebookPersistenceMode === 'write') {
        await window.db.saveQuestion({id, title:'Persisted', content:'Persisted', updatedAt:new Date().toISOString()});
        localStorage.setItem('openai_api_key', 'persisted-test-secret');
        await window.notebookNative.flushSecrets();
      } else {
        const records = await window.db.getAllQuestions();
        if (!records.some(q => q.id === id && q.title === 'Persisted')) throw Error('database did not persist');
        if (localStorage.getItem('openai_api_key') !== 'persisted-test-secret') throw Error('keychain did not persist');
        await window.db.deleteQuestion(id);
        localStorage.removeItem('openai_api_key');
        await window.notebookNative.flushSecrets();
      }
      await window.webkit.messageHandlers.notebook.postMessage({action:'selfTest',payload:{result:'PASS persistence ' + window.__notebookPersistenceMode}});
      return;
    }

    localStorage.setItem('openai_api_key', 'self-test-key');
    await window.notebookNative.flushSecrets();
    if (localStorage.getItem('openai_api_key') !== 'self-test-key') throw Error('keychain adapter');
    if (Object.keys(localStorage).includes('openai_api_key')) throw Error('key was stored in localStorage');
    localStorage.removeItem('openai_api_key');
    await window.notebookNative.flushSecrets();
    const fixture = await window.webkit.messageHandlers.notebook.postMessage({action:'selfTest',payload:{fixtureHEIC:true}});
    const bytes = Uint8Array.from(atob(fixture.base64), ch => ch.charCodeAt(0));
    const photo = await window.geminiAI.compressImage(new File([bytes], 'sample.heic', {type:'image/heic'}), 800, 0.85);
    if (photo.mimeType !== 'image/jpeg' || photo.width > 800 || !photo.base64) throw Error('HEIC native conversion');
    const frame = document.createElement('iframe');
    const denied = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { window.removeEventListener('message', listener); reject(Error('iframe bridge test timed out')); }, 3000);
      function listener(event) {
        if (event.source !== frame.contentWindow) return;
        clearTimeout(timeout); window.removeEventListener('message', listener);
        resolve(event.data === 'BRIDGE_DENIED');
      }
      window.addEventListener('message', listener);
    });
    frame.srcdoc = '<script>window.webkit.messageHandlers.notebook.postMessage({action:"saveSecret",payload:{key:"openai_api_key",value:"iframe"}}).then(()=>parent.postMessage("BRIDGE_ALLOWED","*")).catch(()=>parent.postMessage("BRIDGE_DENIED","*"))<\/script>';
    document.body.appendChild(frame);
    if (!await denied) throw Error('iframe was allowed to use native bridge');
    frame.remove();
    const subject = window.app.subjects[0];
    if (!subject) throw Error('default subjects unavailable');
    window.app.resetEditorForm();
    window.app.switchTab('add');
    document.querySelector('#editor-title').value = 'iOS 自动回归';
    window.app.form.parts[0].text = 'Calculate $x^2$.';
    await window.app.saveCurrentQuestion();
    const questions = await window.db.getAllQuestions();
    if (questions.length !== 1 || questions[0].title !== 'iOS 自动回归') throw Error('question save');
    window.app.editQuestion(questions[0].id);
    document.querySelector('#editor-title').value = 'iOS 已编辑';
    await window.app.saveCurrentQuestion();
    if ((await window.db.getAllQuestions())[0].title !== 'iOS 已编辑') throw Error('question edit');
    window.practicePaperEngine.selectedQuestionIds.add(questions[0].id);
    window.app.switchTab('practice');
    if (!document.querySelector('[data-write-area-qid]')) throw Error('practice preview');
    window.app.adjustPracticeQuestionSpacing(questions[0].id, 40);
    document.querySelector('#print-container').innerHTML = window.practicePaperEngine.generatePaperHtml(window.app.questions, window.app.subjects, window.app.exams);
    await document.fonts.ready;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const pdf = await window.webkit.messageHandlers.notebook.postMessage({action:'selfTest',payload:{inspectPDF:true}});
    if (!pdf.pages || pdf.bytes < 1000 || !pdf.text.includes('Calculate')) throw Error('native PDF rendering: ' + JSON.stringify(pdf));
    await window.db.saveAssessmentConfigs({[subject.id]:[
      {id:'attainment',name:'Attainment',weight:75}, {id:'skills',name:'Course Skills',weight:25}
    ]}, true);
    for (const [index, category, percentage] of [[1,'attainment',80],[2,'skills',100]]) {
      await window.db.saveExam({id:'ios-exam-' + index,subjectId:subject.id,title:'iOS Quiz ' + index,category,
        score:percentage,maxScore:100,percentage,grade:'A',date:'2026-11-23',unitIds:[subject.units[0].id]});
    }
    await window.app.refreshData();
    if (window.app.getSubjectAssessment(subject.id).overallScore !== 85) throw Error('weighted grades');
    const backup = await window.db.exportAllData();
    if (backup.data.questions.length !== 1) throw Error('backup');
    await window.db.replaceCloudRecords([{item_type:'question',item_id:questions[0].id,data:questions[0],deleted:false}]);
    if ((await window.db.getAllQuestions()).length !== 1) throw Error('atomic replacement');
    await window.db.importData(backup, 'overwrite');
    await window.app.refreshData();
    window.app.collapsedExamSections.delete('charts_section');
    window.app.switchTab('exams');
    window.app.renderExamsCharts();
    await new Promise(r => setTimeout(r, 300));
    if (!window.academicCharts.instances['chart-score-trend']?.width) throw Error('native chart rendering');
    if (!document.querySelector('#main-content').textContent.includes('成绩')) throw Error('grades');
    window.app.switchTab('practice');
    if (document.documentElement.scrollWidth > innerWidth + 1) throw Error('horizontal overflow');
    await window.webkit.messageHandlers.notebook.postMessage({action:'selfTest', payload:{result:'PASS offline / storage / keys / CRUD / practice / PDF / HEIC / backup / grades'}});
  } catch (error) {
    await window.webkit.messageHandlers.notebook.postMessage({action:'selfTest', payload:{result:'FAIL: ' + error.message}});
  }
})();
