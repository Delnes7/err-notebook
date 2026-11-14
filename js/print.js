/**
 * print.js - 试卷重练排版与打印导出引擎
 * 将错题组织成标准试卷格式，支持按单元专项组卷、留白作答、卷末参考解析附录、自动分页与打印
 */

class PracticePaperEngine {
  constructor() {
    this.selectedQuestionIds = new Set();
    this.options = {
      title: 'A Level / CNCC 错题复盘与重做强化试卷',
      subtitle: '姓名：__________   班级：__________   用时：______分钟   得分：__________',
      fontSize: 'medium',      // 'small' (9.5pt), 'medium' (10.5pt), 'large' (12pt)
      spacing: 'compact',      // 'none' (0px紧凑无留白), 'compact' (40px), 'medium' (80px), 'large' (150px)
      includeSolutions: false, // 是否在卷末附带参考解析
      showExamInfo: true,      // 是否显示题目来源考试
      showReasons: false,      // 题目是否显示错因
      showUnitBadge: true      // 是否显示所属单元标签
    };
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

  selectByMastery(questions, masteryLevel = 0) {
    this.selectedQuestionIds.clear();
    questions.forEach(q => {
      if (q.mastery === masteryLevel) {
        this.selectedQuestionIds.add(q.id);
      }
    });
  }

  selectByUnit(questions, subjectId, unitIdOrIds, masteryLevel = null) {
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
      const matchMastery = masteryLevel === null || q.mastery === masteryLevel;
      if (matchSub && matchUnit && matchMastery) {
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

    const showWriteArea = this.options.spacing !== 'none';
    let spacingHeight = '80px';
    if (this.options.spacing === 'compact') spacingHeight = '40px';
    else if (this.options.spacing === 'large') spacingHeight = '150px';

    // 题目列表
    let questionsHtml = '';
    questions.forEach((q, idx) => {
      const sub = subMap.get(q.subjectId);
      const exam = examMap.get(q.examId);
      const unitName = unitNameMap.get(q.unitId);
      const renderedContent = window.markdownRenderer.render(q.content);

      questionsHtml += `
        <div class="print-avoid-break mb-6 pb-4 border-b border-slate-200 dark:border-slate-800 last:border-b-0">
          <div class="print-question-header flex items-start justify-between gap-3 mb-2">
            <div class="flex flex-wrap items-center gap-2">
              <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-900 text-white font-bold text-xs">
                ${idx + 1}
              </span>
              ${sub ? `<span class="px-2 py-0.5 rounded text-xs font-semibold text-white" style="background-color: ${sub.color}">${sub.name}</span>` : ''}
              ${this.options.showUnitBadge && unitName ? `<span class="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">单元: ${unitName}</span>` : ''}
              ${q.paperCode ? `<span class="px-2 py-0.5 rounded text-xs font-mono font-bold bg-amber-50 text-amber-800 border border-amber-300">CIE: ${q.paperCode}</span>` : ''}
              ${q.title ? `<span class="font-bold text-slate-800 dark:text-slate-200 text-sm ml-1">${q.title}</span>` : ''}
            </div>
            ${this.options.showExamInfo && exam ? `<span class="text-xs text-slate-500 whitespace-nowrap">来源：${exam.title}</span>` : ''}
          </div>

          <!-- 题目正文 -->
          <div class="markdown-body text-slate-800 dark:text-slate-200 pl-8 my-2 leading-relaxed">
            ${renderedContent}
          </div>

          <!-- 答题演算留白区域 -->
          ${showWriteArea ? `
            <div class="practice-write-area ml-8 mt-3 rounded-lg p-2.5 text-xs text-slate-400 select-none flex flex-col justify-between" style="min-height: ${spacingHeight};">
              <span class="text-[10px] font-mono tracking-wider opacity-60">【答题与演算留白区】</span>
              <div class="text-right text-[10px] font-mono opacity-40">得分：______</div>
            </div>
          ` : ''}
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
              <span class="text-sm">第 ${idx + 1} 题解析 ${q.title ? `(${q.title})` : ''}</span>
              ${q.paperCode ? `<span class="text-xs font-mono font-bold bg-amber-50 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded ml-1">[CIE: ${q.paperCode}]</span>` : ''}
              ${unitName ? `<span class="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded">[${unitName}]</span>` : ''}
            </div>
            ${q.reasons && q.reasons.length > 0 ? `
              <div class="text-xs text-rose-600 mb-1.5 bg-rose-50 px-2 py-0.5 rounded inline-block">
                ⚠️ 曾犯错因：${q.reasons.join('、')}
              </div>
            ` : ''}
            <div class="markdown-body text-slate-800 text-sm pl-7 leading-relaxed">
              ${renderedSolution}
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
          <h1 class="text-xl md:text-2xl font-black tracking-wide mb-1.5">${this.options.title}</h1>
          <div class="text-xs md:text-sm text-slate-600 dark:text-slate-400 font-mono tracking-wider">${this.options.subtitle}</div>
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
