/**
 * print.js - 试卷重练排版与打印导出引擎
 * 将错题组织成标准试卷格式，支持按单元专项组卷、留白作答、卷末参考解析附录、自动分页与打印
 */

class PracticePaperEngine {
  constructor() {
    this.selectedQuestionIds = new Set();
    this.customSpacingMap = {};
    this.options = {
      title: 'A Level / CNCC 错题复盘与重做强化试卷',
      subtitle: '姓名：__________   班级：__________   用时：______分钟   得分：__________',
      fontSize: 'medium',      // 'small' (9.5pt), 'medium' (10.5pt), 'large' (12pt)
      spacing: 'auto',         // 'auto' (按小问数量智能留白), 'none' (0px), 'compact' (80px), 'medium' (160px), 'large' (300px)
      includeSolutions: false, // 是否在卷末附带参考解析
      showExamInfo: false,     // 组卷不显示题目来源考试
      showReasons: false,      // 题目是否显示错因
      showUnitBadge: true      // 是否显示所属单元标签
    };
  }

  /**
   * 按小问数量计算默认留白高度（px）：
   * 1~2 问留 140px，3 问留 240px，4 问留 340px，更多小问递增加大
   */
  getDefaultSpacingPx(q) {
    if (!q || q.questionType === 'multiple_choice') return 0;
    const partCount = (Array.isArray(q.parts) && q.parts.length > 0) ? q.parts.length : 1;
    if (partCount <= 2) return 140;
    if (partCount === 3) return 240;
    return Math.min(520, 340 + (partCount - 4) * 60);
  }

  /**
   * 获取某道题最终生效的留白高度（px）
   */
  getQuestionSpacing(q) {
    if (!q || q.questionType === 'multiple_choice') return 0;
    if (Object.prototype.hasOwnProperty.call(this.customSpacingMap, q.id)) {
      return Math.max(0, Math.min(800, Number(this.customSpacingMap[q.id]) || 0));
    }
    const mode = this.options.spacing || 'auto';
    if (mode === 'none') return 0;
    if (mode === 'compact') return 80;
    if (mode === 'medium') return 160;
    if (mode === 'large') return 300;
    return this.getDefaultSpacingPx(q);
  }

  setQuestionSpacing(questionId, px) {
    const clamped = Math.max(0, Math.min(800, Math.round(Number(px) || 0)));
    this.customSpacingMap[questionId] = clamped;
  }

  resetQuestionSpacing(questionId) {
    delete this.customSpacingMap[questionId];
  }

  clearCustomSpacing() {
    this.customSpacingMap = {};
  }

  toggleSelect(id) {
    if (this.selectedQuestionIds.has(id)) {
      this.selectedQuestionIds.delete(id);
    } else {
      this.selectedQuestionIds.add(id);
    }
  }

  selectAll(questions) {
    questions.forEach(q => this.selectedQuestionIds.add(q.id));
  }

  deselectAll() {
    this.selectedQuestionIds.clear();
  }

  selectByUnit(questions, subjectId, unitIdOrIds) {
    this.selectedQuestionIds.clear();
    const isArray = Array.isArray(unitIdOrIds);
    questions.forEach(q => {
      const matchSub = !subjectId || subjectId === 'all' || q.subjectId === subjectId;
      let matchUnit = true;
      if (isArray) {
        matchUnit = unitIdOrIds.length === 0 || unitIdOrIds.includes(q.unitId);
      } else {
        matchUnit = !unitIdOrIds || unitIdOrIds === 'all' || q.unitId === unitIdOrIds;
      }
      if (matchSub && matchUnit) {
        this.selectedQuestionIds.add(q.id);
      }
    });
  }

  getSelectedCount() {
    return this.selectedQuestionIds.size;
  }

  /**
   * 生成试卷预览与打印 HTML
   */
  generatePaperHtml(allQuestions, allSubjects, allExams) {
    const questions = allQuestions.filter(q => this.selectedQuestionIds.has(q.id));
    if (questions.length === 0) {
      return `
        <div class="text-center py-16 text-slate-400">
          <div class="text-5xl mb-3">📝</div>
          <p class="text-base font-medium">尚未选择任何重练题目</p>
          <p class="text-sm mt-1">请在上方按学科或单元勾选题目，或者点击“单元专项组卷”快速生成练习卷</p>
        </div>
      `;
    }

    const subMap = new Map(allSubjects.map(s => [s.id, s]));
    const examMap = new Map(allExams.map(e => [e.id, e]));

    // 单元名称速查映射
    const unitNameMap = new Map();
    allSubjects.forEach(s => {
      if (s.units && Array.isArray(s.units)) {
        s.units.forEach(u => unitNameMap.set(u.id, u.name));
      }
    });

    // 题目列表
    let questionsHtml = '';
    questions.forEach((q, idx) => {
      const sub = subMap.get(q.subjectId);
      const unitName = unitNameMap.get(q.unitId);
      const isMcq = q.questionType === 'multiple_choice';
      const spacingPx = this.getQuestionSpacing(q);
      const isCustomSpacing = Object.prototype.hasOwnProperty.call(this.customSpacingMap, q.id);
      const partCount = (Array.isArray(q.parts) && q.parts.length > 0) ? q.parts.length : 1;
      const renderedContent = window.markdownRenderer.render(q.content);

      questionsHtml += `
        <div class="print-avoid-break mb-6 pb-4 border-b border-slate-200 dark:border-slate-800 last:border-b-0">
          <div class="print-question-header flex items-start justify-between gap-3 mb-2">
            <div class="flex flex-wrap items-center gap-2">
              <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-900 text-white font-bold text-xs">
                ${idx + 1}
              </span>
              ${sub ? `<span class="px-2 py-0.5 rounded text-xs font-semibold text-white" style="background-color: ${window.app.safeColor(sub.color)}">${window.markdownRenderer.escapeHtml(sub.name)}</span>` : ''}
              ${this.options.showUnitBadge && unitName ? `<span class="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">单元: ${window.markdownRenderer.escapeHtml(unitName)}</span>` : ''}
              ${q.paperCode ? `<span class="px-2 py-0.5 rounded text-xs font-mono font-bold bg-amber-50 text-amber-800 border border-amber-300">${window.markdownRenderer.escapeHtml(q.paperCode)}</span>` : ''}
              ${this.options.showExamInfo && exam ? `<span class="text-xs text-slate-500">来源：${window.markdownRenderer.escapeHtml(exam.title || '')}</span>` : ''}
            </div>
          </div>

          <!-- 题目正文 -->
          <div class="markdown-body text-slate-800 dark:text-slate-200 pl-8 my-2 leading-relaxed">
            ${renderedContent}
          </div>
          ${this.options.showReasons && Array.isArray(q.reasons) && q.reasons.length ? `<div class="pl-8 text-xs text-slate-500">错因：${window.markdownRenderer.escapeHtml(q.reasons.join('、'))}</div>` : ''}

          <!-- 答题演算留白区域（选择题不需要作答区域；预览时支持单题实时调节留白高度） -->
          ${!isMcq ? (spacingPx > 0 ? `
            <div data-write-area-qid="${window.markdownRenderer.escapeHtml(String(q.id))}" class="practice-write-area ml-8 mt-3 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/30 p-2.5 text-xs text-slate-400 select-none flex flex-col justify-between transition-[min-height] duration-150" style="min-height: ${spacingPx}px;">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="text-[10px] font-mono tracking-wider opacity-70">【答题与演算留白区${partCount > 1 ? ` · ${partCount}小问` : ''}】</span>
                <div class="no-print flex flex-wrap items-center gap-1.5 bg-white/90 dark:bg-slate-900/90 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-2xs text-[11px] text-slate-600 dark:text-slate-300">
                  <button type="button" onclick="app.adjustPracticeQuestionSpacing(${window.app.inlineArg(q.id)}, -40)" class="w-5 h-5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 font-bold leading-none" title="减少 40px">−</button>
                  <input type="range" min="0" max="600" step="20" value="${Math.min(600, spacingPx)}" oninput="app.previewPracticeQuestionSpacing(${window.app.inlineArg(q.id)}, this.value)" onchange="app.setPracticeQuestionSpacing(${window.app.inlineArg(q.id)}, this.value)" class="w-20 sm:w-28 accent-indigo-600 cursor-pointer" title="拖动调节本题留白高度" />
                  <button type="button" onclick="app.adjustPracticeQuestionSpacing(${window.app.inlineArg(q.id)}, 40)" class="w-5 h-5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 font-bold leading-none" title="增加 40px">+</button>
                  <span data-write-val-qid="${window.markdownRenderer.escapeHtml(String(q.id))}" class="font-mono font-bold text-indigo-600 dark:text-indigo-400 min-w-[38px] text-right">${spacingPx}px</span>
                  ${isCustomSpacing ? `<button type="button" onclick="app.resetPracticeQuestionSpacing(${window.app.inlineArg(q.id)})" class="text-[10px] text-slate-400 hover:text-rose-500 underline ml-0.5">默认</button>` : ''}
                </div>
              </div>
              <div class="text-right text-[10px] font-mono opacity-40">得分：______</div>
            </div>
          ` : `
            <div class="no-print ml-8 mt-2 flex items-center gap-2 text-[11px] text-slate-400">
              <span>本题当前无留白</span>
              <button type="button" onclick="app.setPracticeQuestionSpacing(${window.app.inlineArg(q.id)}, ${this.getDefaultSpacingPx(q)})" class="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-semibold border border-slate-200 dark:border-slate-700 transition">+ 添加作答留白 (${this.getDefaultSpacingPx(q)}px)</button>
            </div>
          `) : ''}
        </div>
      `;
    });

    // 卷末参考解析（若开启）
    let solutionsHtml = '';
    if (this.options.includeSolutions) {
      solutionsHtml += `
        <div class="print-page-break pt-6 mt-8 border-t-2 border-dashed border-slate-400">
          <div class="text-center mb-6">
            <h2 class="text-xl md:text-2xl font-black text-slate-900 tracking-wider">【Mark Scheme 参考答案与详细解析】</h2>
            <p class="text-xs text-slate-500 mt-1">请在自主重做完成后再行核对，分析思维断层与错因</p>
          </div>
      `;

      questions.forEach((q, idx) => {
        const unitName = unitNameMap.get(q.unitId);
        const renderedSolution = window.markdownRenderer.render(q.solution || '*暂无详细题解*');
        solutionsHtml += `
          <div class="print-avoid-break mb-6 pb-4 border-b border-slate-200">
            <div class="flex items-center gap-2 font-bold text-slate-900 mb-1.5">
              <span class="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center">${idx + 1}</span>
              <span class="text-sm">第 ${idx + 1} 题解析</span>
              ${q.paperCode ? `<span class="text-xs font-mono font-bold bg-amber-50 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded ml-1">${window.markdownRenderer.escapeHtml(q.paperCode)}</span>` : ''}
              ${unitName ? `<span class="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded">[${window.markdownRenderer.escapeHtml(unitName)}]</span>` : ''}
            </div>
            ${q.reasons && q.reasons.length > 0 ? `
              <div class="text-xs text-rose-600 mb-1.5 bg-rose-50 px-2 py-0.5 rounded inline-block">
                ⚠️ 曾犯错因：${window.markdownRenderer.escapeHtml(q.reasons.join('、'))}
              </div>
            ` : ''}
            <div class="markdown-body text-slate-800 text-sm pl-7 leading-relaxed">
              ${renderedSolution}
              ${q.solutionNote && q.solutionNote.trim() ? `
                <div class="mt-2.5 p-3 rounded-lg bg-amber-50/80 border border-amber-200 text-xs sm:text-sm">
                  <div class="font-bold text-amber-800 mb-1">💡 思路点拨与解题备注：</div>
                  <div class="markdown-body text-slate-800">${window.markdownRenderer.render(q.solutionNote)}</div>
                </div>
              ` : ''}
            </div>
          </div>
        `;
      });

      solutionsHtml += '</div>';
    }

    const fontClass = `paper-font-${this.options.fontSize || 'medium'}`;

    return `
      <div class="max-w-4xl mx-auto bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 p-6 md:p-8 shadow-md rounded-2xl border border-slate-200 dark:border-slate-800 ${fontClass}">
        <!-- 试卷卷头 (紧凑精炼，不占用过多页面空间) -->
        <div class="text-center border-b-2 border-slate-900 dark:border-slate-100 pb-3 mb-4">
          <h1 class="text-xl md:text-2xl font-black tracking-wide mb-1.5">${window.markdownRenderer.escapeHtml(this.options.title)}</h1>
          <div class="text-xs md:text-sm text-slate-600 dark:text-slate-400 font-mono tracking-wider">${window.markdownRenderer.escapeHtml(this.options.subtitle)}</div>
          <div class="text-[11px] text-slate-400 dark:text-slate-500 mt-1">共 ${questions.length} 道重练题目 · 生成时间：${new Date().toLocaleDateString('zh-CN')}</div>
        </div>

        <!-- 试卷试题列表 -->
        <div>
          ${questionsHtml}
        </div>

        <!-- 卷末解析 -->
        ${solutionsHtml}
      </div>
    `;
  }

  /**
   * 执行原生打印
   */
  print() {
    const prevClass = document.body.className;
    const fontClass = `paper-font-${this.options.fontSize || 'medium'}`;
    document.body.classList.add(fontClass);
    window.print();
    setTimeout(() => {
      document.body.className = prevClass;
    }, 500);
  }
}

// 导出全局单例
window.practicePaperEngine = new PracticePaperEngine();
