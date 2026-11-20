/**
 * app.js - 错题本前端业务主控制器 (十一学校国际部 A Level & CNCC 适配版)
 * 核心升级：
 * 1. 全面适配真实的单科小考测验体系 (Quizzes & Assessments)，每次考试归属单科，每次总分不同
 * 2. 自动严格按照官方 Task Grade Scale 换算百分制与 Mark 等级 (图1 A Level & 图2 CNCC)
 * 3. 错题录入联动过滤当科学考，单元专项组卷无缝打通
 * 4. 彻底解决新建单元、编辑题目/Mark Scheme切换与公式工具栏交互
 */

class App {
  constructor() {
    this.currentTab = 'questions'; // 'questions' | 'add' | 'exams' | 'practice' | 'subjects' | 'settings'
    this.subjects = [];
    this.exams = [];
    this.questions = [];
    
    // 主题与显示设置 ('system' | 'light' | 'dark')
    this.theme = localStorage.getItem('theme') || 'system';
    this.questionFontSize = localStorage.getItem('question_font_size') || 'medium'; // 'normal' | 'medium' | 'large'

    // 错题库筛选条件
    this.filter = {
      subjectId: 'all',
      unitId: 'all',
      examId: 'all',
      mastery: 'all',
      reason: 'all',
      search: '',
      sortBy: 'newest'
    };

    // 考试小考页面专属筛选与图表联动状态
    this.examFilter = {
      subjectId: 'all',
      type: 'all',
      category: 'all',
      categories: ['attainment', 'skills', 'behavior', 'final'],
      chartSubjectId: 'all',
      chartCategory: 'all',
      chartCategories: ['attainment', 'skills', 'final'], // 考核项目多选状态 (Learning Behaviour 排除在折线图外)
      unitSubjectId: ''
    };

    // 状态缓存
    this.expandedSolutionIds = new Set();
    this.editingQuestionId = null;
    this.activeEditorTab = 'content'; // 'content' | 'solution'
    this.editorLayout = 'split'; // 'split' | 'edit' | 'preview'
    this.editorPreviewScope = 'all'; // 'all' (题目+题解全览) | 'content' (仅题目) | 'solution' (仅题解)
    this.markSchemeModal = null; // 官方 Mark Scheme 大窗口弹窗编辑缓存

    // Gemini AI 拍照/截图识图状态
    this.aiPanelOpen = true;
    this.aiState = {
      questionImages: [],   // [{ id, dataUrl, mimeType, base64, name }]
      markSchemeImages: [], // [{ id, dataUrl, mimeType, base64, name }]
      isRecognizing: false,
      isLookingUpCode: false,
      paperCodeLookup: null,
      autoGenerateSolution: true,
      lastError: '',
      pasteTarget: 'question', // 'question' | 'ms'
      cropModal: null          // { imgIndex, targetSlot, dataUrl, rect }
    };
    
    // 组卷专属选择状态 (unitIds 为空数组表示全部单元，非空表示多选的单元ID集合)
    this.practiceFilter = {
      subjectId: 'all',
      unitIds: []
    };

    // 自定义紧凑下拉菜单状态
    this.openDropdown = null; // 'filter-unit' | 'filter-exam' | 'practice-unit' | null
    this.dropdownSearch = {
      unit: '',
      exam: '',
      practiceUnit: ''
    };

    // GPA 与各科考核评估配置缓存
    this.assessmentConfigs = {};
    this.categoryScores = {};

    // 成绩页面可折叠区域记忆（首次打开默认全部折叠）
    const defaultCollapsedSections = ['gpa_dashboard', 'diagnostics', 'charts_section', 'exam_records'];
    try {
      const savedCollapsed = localStorage.getItem('bnds_exams_collapsed_sections_v2');
      this.collapsedExamSections = new Set(savedCollapsed ? JSON.parse(savedCollapsed) : defaultCollapsedSections);
    } catch (e) {
      this.collapsedExamSections = new Set(defaultCollapsedSections);
    }

    // 编辑器暂存数据
    this.form = {
      subjectId: '',
      unitId: '',
      examId: '',
      paperCode: '', // CIE 真题考卷题号 (如: W24-52-3)
      title: '',
      questionType: 'structured', // 'structured' | 'multiple_choice'
      structuredMode: 'multi_part', // 'multi_part' | 'single'
      stem: '',
      stemMarks: '',
      parts: [
        {
          id: 'part_1',
          label: '(a)',
          marks: '2',
          isWrong: true,
          text: '',
          solutionMode: 'mark_scheme_table',
          solutionRows: [{ question: '(a)', answer: '', marks: 'B1', guidance: '' }],
          solution: ''
        }
      ],
      // 选择题属性 (单选/多选 + 动态选项列表)
      mcqType: 'single', // 'single' | 'multiple'
      optionsList: [
        { key: 'A', text: '' },
        { key: 'B', text: '' },
        { key: 'C', text: '' },
        { key: 'D', text: '' }
      ],
      options: { A: '', B: '', C: '', D: '' },
      correctOption: 'A',
      correctOptions: ['A'],
      myOption: '',
      myOptions: [],
      content: '',
      // 题解与 Mark Scheme 结构化录入
      solutionMode: 'mark_scheme_table', // 'mark_scheme_table' | 'markdown'
      markSchemeRows: [
        { question: '(a)', answer: '', marks: 'B1', guidance: '' }
      ],
      solution: '',
      compiledSolution: '',
      reasons: [],
      mastery: 0,
      difficulty: 3
    };

    // 针对 A Level / CNCC 常见的错因标签
    this.presetReasons = [
      '概念模糊/定义不清', '公式记错/漏项', '符号与正负号马虎', 
      'Mark Scheme 答题点未踩中', '题目英语术语未读懂', '代数计算失误', 
      '分类讨论遗漏边界', '时间不足/未做完'
    ];
  }

  async init() {
    this.applyTheme(this.theme);
    const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    if (mq && typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', () => {
        if (this.theme === 'system') {
          this.applyTheme('system');
        }
      });
    }

    try {
      await window.db.ready();
      await window.ensureSampleData(window.db);
      await this.refreshData();
    } catch (e) {
      console.error('初始化数据失败:', e);
      this.showToast('加载本地数据库时出错，请刷新重试', 'error');
    }

    this.bindEvents();
    this.bindPasteEvent();
    this.render();

    // 初始化 Supabase 云端同步（若已登录则后台自动拉取/合并最新数据）
    if (window.cloudSync) {
      window.cloudSync.onChange(() => {
        this.renderHeader();
        if (this.currentTab === 'settings') {
          this.render();
        }
      });
      try {
        const user = await window.cloudSync.init();
        if (user) {
          await window.cloudSync.syncNow();
          await this.refreshData();
          this.render();
        }
      } catch (err) {
        console.warn('启动云同步失败:', err);
      }
    }
  }

  // --- 主题切换 ('system' | 'light' | 'dark') ---
  applyTheme(theme) {
    const valid = ['system', 'light', 'dark'].includes(theme) ? theme : 'system';
    this.theme = valid;
    localStorage.setItem('theme', valid);

    const prefersDark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const effective = valid === 'system' ? (prefersDark ? 'dark' : 'light') : valid;

    const html = document.documentElement;
    if (effective === 'dark') {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }

    const themeIcon = document.getElementById('theme-toggle-icon');
    if (themeIcon) {
      themeIcon.textContent = valid === 'system' ? '🌗' : (valid === 'dark' ? '🌙' : '☀️');
    }
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      const labelMap = { system: '跟随系统', light: '浅色模式', dark: '深色模式' };
      themeBtn.title = `当前外观：${labelMap[valid]}（点击切换：跟随系统 → 浅色 → 深色）`;
    }
    if (this.currentTab === 'exams') {
      this.renderExamsCharts();
    }
  }

  toggleTheme() {
    const nextMap = { system: 'light', light: 'dark', dark: 'system' };
    const next = nextMap[this.theme] || 'system';
    this.applyTheme(next);
    const labelMap = { system: '🌗 已切换为：跟随系统外观', light: '☀️ 已切换为：浅色模式', dark: '🌙 已切换为：深色模式' };
    this.showToast(labelMap[next], 'info');
    if (this.currentTab === 'settings') {
      this.render();
    }
  }

  // --- 官方 Task Grade Scale 核心等级换算函数 (图1 A Level & 图2 CNCC) ---
  calculateGrade(percentage, curriculum = 'A Level') {
    const p = Math.round(percentage * 10) / 10;
    if (curriculum === 'CNCC') {
      // 图2: CNCC 科目打分标准
      if (p >= 94.5) return 'A+';
      if (p >= 89.5) return 'A';
      if (p >= 84.5) return 'A-';
      if (p >= 79.5) return 'B';
      if (p >= 69.5) return 'C';
      if (p >= 59.5) return 'D';
      return 'F';
    } else {
      // 图1: A Level 科目打分标准
      if (p >= 89.5) return 'A*';
      if (p >= 79.5) return 'A';
      if (p >= 69.5) return 'B';
      if (p >= 59.5) return 'C';
      if (p >= 49.5) return 'D';
      if (p >= 40.0) return 'E';
      return 'U';
    }
  }

  getGradeBadgeStyle(grade) {
    const map = {
      'A*': 'bg-emerald-600 text-white shadow-emerald-500/25',
      'A+': 'bg-emerald-600 text-white shadow-emerald-500/25',
      'A': 'bg-blue-600 text-white shadow-blue-500/25',
      'A-': 'bg-teal-600 text-white shadow-teal-500/25',
      'B': 'bg-indigo-600 text-white shadow-indigo-500/25',
      'C': 'bg-amber-500 text-white shadow-amber-500/25',
      'D': 'bg-orange-500 text-white shadow-orange-500/25',
      'E': 'bg-rose-400 text-white shadow-rose-400/25',
      'F': 'bg-rose-700 text-white shadow-rose-700/25',
      'U': 'bg-rose-700 text-white shadow-rose-700/25'
    };
    return map[grade] || 'bg-slate-600 text-white';
  }

  // --- 数据刷新与智能平滑升级 ---
  async refreshData() {
    this.subjects = await window.db.getAllSubjects();
    this.exams = await window.db.getAllExams();
    this.questions = await window.db.getAllQuestions();

    let hasSubjectUpdates = false;

    // 1. 智能补全学科 Units
    for (const sub of this.subjects) {
      if (!sub.units || sub.units.length === 0) {
        const nameLower = (sub.name || '').toLowerCase();
        let defaultUnits = [];
        if (nameLower.includes('s1') || nameLower.includes('统计') || nameLower.includes('stat')) {
          defaultUnits = [
            { id: 'u_s1_data', name: '[S1] Representation of Data 数据统计与箱线图' },
            { id: 'u_s1_perm', name: '[S1] Permutations & Combinations 排列组合' },
            { id: 'u_s1_prob', name: '[S1] Probability 互斥、独立与条件概率' },
            { id: 'u_s1_drv', name: '[S1] Discrete Random Variables 离散变量与期望' },
            { id: 'u_s1_norm', name: '[S1] Normal Distribution 正态分布与标化计算' }
          ];
        } else if (nameLower.includes('p1') || nameLower.includes('纯数') || nameLower.includes('pure 1')) {
          defaultUnits = [
            { id: 'u_p1_quad', name: '[P1] Quadratics 二次函数与判别式' },
            { id: 'u_p1_func', name: '[P1] Functions 复合函数与反函数' },
            { id: 'u_p1_geom', name: '[P1] Coordinate Geometry 解析几何与圆' },
            { id: 'u_p1_circ', name: '[P1] Circular Measure 弧度制与扇形' },
            { id: 'u_p1_trig', name: '[P1] Trigonometry 三角函数与恒等式' },
            { id: 'u_p1_series', name: '[P1] Series 二项式与数列(AP/GP)' },
            { id: 'u_p1_diff', name: '[P1] Differentiation 微分与极值' },
            { id: 'u_p1_integ', name: '[P1] Integration 定积分与面积' }
          ];
        } else if (nameLower.includes('phys') || nameLower.includes('物')) {
          defaultUnits = [
            { id: 'u_phy_kin', name: 'Kinematics 运动学' },
            { id: 'u_phy_dyn', name: 'Dynamics 动力学与动量' },
            { id: 'u_phy_forces', name: 'Forces & Equilibrium 受力平衡' },
            { id: 'u_phy_work', name: 'Work, Energy & Power 功与能量' },
            { id: 'u_phy_waves', name: 'Waves 机械波性质' },
            { id: 'u_phy_elec', name: 'Electricity 直流电路与分压器' }
          ];
        } else if (nameLower.includes('econ') || nameLower.includes('经')) {
          defaultUnits = [
            { id: 'u_econ_ideas', name: 'Basic Economic Ideas 基础概念与PPC' },
            { id: 'u_econ_price', name: 'Price System & Elasticity 供求与弹性' },
            { id: 'u_econ_interv', name: 'Government Intervention 政府微观干预' },
            { id: 'u_econ_market', name: 'Market Failure 市场失灵' },
            { id: 'u_econ_macro', name: 'Macro Economy 宏观经济指标' }
          ];
        }
        if (defaultUnits.length > 0) {
          sub.units = defaultUnits;
          await window.db.saveSubject(sub);
          hasSubjectUpdates = true;
        }
      }
    }

    if (hasSubjectUpdates) {
      this.subjects = await window.db.getAllSubjects();
    }

    // 2. 平滑升级旧格式的大考记录至单科小考测验体系
    let hasExamUpdates = false;
    for (const ex of this.exams) {
      if (ex.scores && Object.keys(ex.scores).length > 0 && ex.score === undefined) {
        const subIds = Object.keys(ex.scores);
        if (subIds.length > 0) {
          const firstSubId = subIds[0];
          const sc = ex.scores[firstSubId];
          const sub = this.subjects.find(s => s.id === firstSubId);
          ex.subjectId = firstSubId;
          ex.score = sc.score || 0;
          ex.maxScore = sc.maxScore || 100;
          ex.percentage = ex.maxScore > 0 ? Math.round((ex.score / ex.maxScore) * 1000) / 10 : 0;
          ex.grade = this.calculateGrade(ex.percentage, sub ? sub.curriculum : 'A Level');
          ex.type = 'Unit Test';
          await window.db.saveExam(ex);
          hasExamUpdates = true;
        }
      }
    }
    if (hasExamUpdates) {
      this.exams = await window.db.getAllExams();
    }

    // 2.5 保证所有 exam 均具备 unitIds 数组（支持一次考试包含不止一个单元）
    let hasExamUnitUpdates = false;
    for (const exam of this.exams) {
      if (!exam.unitIds || !Array.isArray(exam.unitIds)) {
        exam.unitIds = exam.unitId ? [exam.unitId] : [];
        exam.unitId = exam.unitIds[0] || '';
        await window.db.saveExam(exam);
        hasExamUnitUpdates = true;
      }
    }

    if (hasExamUnitUpdates) {
      this.exams = await window.db.getAllExams();
    }

    // 3. 智能错题自愈：修复没有有效 subjectId 的错题
    const validSubjectIds = new Set(this.subjects.map(s => s.id));
    let hasQuestionUpdates = false;

    for (const q of this.questions) {
      if (!q.subjectId || !validSubjectIds.has(q.subjectId)) {
        let targetSub = null;
        const text = (q.content + ' ' + (q.title || '')).toLowerCase();
        if (text.includes('ball') || text.includes('probability') || text.includes('prob') || text.includes('random')) {
          targetSub = this.subjects.find(s => s.name.toLowerCase().includes('s1') || s.name.includes('统计') || s.name.includes('数学'));
        } else if (text.includes('integral') || text.includes('derivative') || text.includes('curve')) {
          targetSub = this.subjects.find(s => s.name.toLowerCase().includes('p1') || s.name.includes('纯数'));
        } else if (text.includes('current') || text.includes('volt') || text.includes('resistor') || text.includes('force')) {
          targetSub = this.subjects.find(s => s.name.toLowerCase().includes('phys') || s.name.includes('物'));
        }

        if (!targetSub && this.subjects.length > 0) {
          targetSub = this.subjects[0];
        }

        if (targetSub) {
          q.subjectId = targetSub.id;
          if ((!q.unitId || q.unitId === '') && targetSub.units && targetSub.units.length > 0) {
            const matchedUnit = targetSub.units.find(u => {
              const uLower = u.name.toLowerCase();
              return (text.includes('prob') && uLower.includes('prob')) || 
                     (text.includes('perm') && uLower.includes('perm')) ||
                     (text.includes('integ') && uLower.includes('integ'));
            });
            q.unitId = matchedUnit ? matchedUnit.id : targetSub.units[0].id;
          }
          await window.db.saveQuestion(q);
          hasQuestionUpdates = true;
        }
      }
    }

    if (hasQuestionUpdates) {
      this.questions = await window.db.getAllQuestions();
    }

    // 4. 加载考核评估配置与自评得分
    try {
      this.assessmentConfigs = (await window.db.getAssessmentConfigs()) || {};
      this.categoryScores = (await window.db.getCategoryScores()) || {};
    } catch (e) {
      console.warn('加载考核评估数据失败:', e);
    }

    // 5. 确保 Mathematics 整合纯数 P1 与 统计 S1 为单一科目
    const p1 = this.subjects.find(s => s.id === 'sub-al-math-p1' || s.name === 'Maths P1');
    const s1 = this.subjects.find(s => s.id === 'sub-al-math-s1' || s.name === 'Maths S1');
    let mathSub = this.subjects.find(s => s.id === 'sub-al-math' || s.name === 'Mathematics');

    if (p1 || s1 || (mathSub && mathSub.isParent)) {
      const unitsMap = new Map();
      if (window.DEFAULT_SUBJECTS && window.DEFAULT_SUBJECTS[0] && Array.isArray(window.DEFAULT_SUBJECTS[0].units)) {
        window.DEFAULT_SUBJECTS[0].units.forEach(u => unitsMap.set(u.id, u));
      }
      if (mathSub && Array.isArray(mathSub.units)) {
        mathSub.units.forEach(u => unitsMap.set(u.id, u));
      }
      if (p1 && Array.isArray(p1.units)) {
        p1.units.forEach(u => unitsMap.set(u.id, u));
      }
      if (s1 && Array.isArray(s1.units)) {
        s1.units.forEach(u => unitsMap.set(u.id, u));
      }

      if (!mathSub) {
        mathSub = {
          id: 'sub-al-math',
          name: 'Mathematics',
          chineseName: '数学 (纯数P1/统计S1)',
          code: '9709',
          curriculum: 'A Level',
          color: '#4f46e5',
          bgClass: 'bg-indigo-600',
          lightBg: 'bg-indigo-50 dark:bg-indigo-950/40',
          defaultMaxScore: 100,
          order: 0
        };
      }
      mathSub.units = Array.from(unitsMap.values());
      delete mathSub.isParent;
      delete mathSub.childSubjectIds;
      delete mathSub.parentId;
      await window.db.saveSubject(mathSub);

      if (p1) {
        try { await window.db.deleteSubject(p1.id); } catch(e){}
      }
      if (s1) {
        try { await window.db.deleteSubject(s1.id); } catch(e){}
      }

      // 迁移所有错题归属学科到 sub-al-math
      for (const q of this.questions) {
        if (q.subjectId === 'sub-al-math-p1' || q.subjectId === 'sub-al-math-s1') {
          q.subjectId = 'sub-al-math';
          await window.db.saveQuestion(q);
        }
      }

      // 迁移所有考试归属学科到 sub-al-math
      for (const exam of this.exams) {
        if (exam.subjectId === 'sub-al-math-p1' || exam.subjectId === 'sub-al-math-s1') {
          exam.subjectId = 'sub-al-math';
          await window.db.saveExam(exam);
        }
      }

      this.subjects = await window.db.getAllSubjects();
      this.questions = await window.db.getAllQuestions();
      this.exams = await window.db.getAllExams();
    }

    // 6. 保证 form 选中的学科与单元在有效范围内
    if (this.subjects.length > 0) {
      const isSubValid = this.subjects.some(s => s.id === this.form.subjectId);
      if (!isSubValid) {
        this.form.subjectId = this.subjects[0].id;
      }
      const activeSub = this.subjects.find(s => s.id === this.form.subjectId);
      if (activeSub && activeSub.units && activeSub.units.length > 0) {
        const isUnitValid = activeSub.units.some(u => u.id === this.form.unitId);
        if (!isUnitValid) {
          this.form.unitId = activeSub.units[0].id;
        }
      }
    }
  }

  // --- 路由与标签页切换 ---
  switchTab(tabId) {
    this.currentTab = tabId;
    this.render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // --- 粘贴图片拦截 (直接转 Base64 插入 Markdown) ---
  bindPasteEvent() {
    const handlePaste = (e, textareaId) => {
      const clipboardData = e.clipboardData || window.clipboardData;
      if (!clipboardData) return;

      const items = clipboardData.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          e.preventDefault();
          const file = item.getAsFile();
          const reader = new FileReader();
          reader.onload = (event) => {
            const base64 = event.target.result;
            const textarea = (typeof textareaId === 'string') ? document.getElementById(textareaId) : textareaId;
            if (textarea) {
              const imageMd = `\n![](${base64})\n`;
              const start = textarea.selectionStart !== undefined ? textarea.selectionStart : textarea.value.length;
              const end = textarea.selectionEnd !== undefined ? textarea.selectionEnd : textarea.value.length;
              if (textarea.setRangeText) {
                textarea.setRangeText(imageMd, start, end, 'end');
              } else {
                textarea.value = textarea.value.slice(0, start) + imageMd + textarea.value.slice(end);
              }
              textarea.dispatchEvent(new Event('input', { bubbles: true }));
              this.showToast('✅ 剪贴板截图已自动插入为正文插图！', 'success');
            }
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    };

    document.addEventListener('paste', (e) => {
      if (e.target && e.target.tagName === 'TEXTAREA') {
        handlePaste(e, e.target);
        return;
      }

      // 在「录入错题」页面非文本框焦点时，允许直接 Cmd+V 将剪贴板图片添加到 AI 识图队列
      if (this.currentTab === 'add' && (!e.target || e.target.tagName !== 'INPUT')) {
        const clipboardData = e.clipboardData || window.clipboardData;
        const items = clipboardData && clipboardData.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            e.preventDefault();
            const file = items[i].getAsFile();
            if (file) {
              const inMsZone = e.target && e.target.closest && e.target.closest('#ai-ms-dropzone');
              const target = inMsZone ? 'ms' : (this.aiState.pasteTarget || 'question');
              this.addAiImageFile(target, file);
            }
            break;
          }
        }
      }
    });
  }

  // --- 事件绑定 ---
  bindEvents() {
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        if (this.currentTab === 'add') {
          e.preventDefault();
          this.saveCurrentQuestion();
        }
      }
    });

    document.addEventListener('click', (e) => {
      if (this.openDropdown && !e.target.closest('.custom-dropdown-container')) {
        this.closeAllDropdowns();
      }
    });
  }

  escapeHtml(text) {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  inlineArg(value) {
    return this.escapeHtml(JSON.stringify(String(value ?? '')));
  }

  safeColor(value) {
    return /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(String(value || '')) ? value : '#6366f1';
  }

  safeLink(value) {
    try {
      const url = new URL(String(value));
      return ['https:', 'http:'].includes(url.protocol) ? this.escapeHtml(url.href) : '#';
    } catch (_) { return '#'; }
  }

  toggleDropdown(name) {
    this.openDropdown = (this.openDropdown === name) ? null : name;
    document.querySelectorAll('.custom-dropdown-menu').forEach(el => {
      const menuName = el.getAttribute('data-dropdown-menu');
      if (menuName === this.openDropdown) {
        el.classList.remove('hidden');
        const input = el.querySelector('input[type="text"]');
        if (input) setTimeout(() => input.focus(), 10);
      } else {
        el.classList.add('hidden');
      }
    });
  }

  closeAllDropdowns() {
    this.openDropdown = null;
    document.querySelectorAll('.custom-dropdown-menu').forEach(el => el.classList.add('hidden'));
  }

  // --- 错题操作 ---
  compileQuestionContent(skipDomRead = false) {
    if (this.form.questionType === 'multiple_choice') {
      const stemEl = !skipDomRead && document.getElementById('editor-mcq-stem');
      if (stemEl) this.form.stem = stemEl.value;
      const solEl = !skipDomRead && document.getElementById('editor-mcq-solution');
      if (solEl && this.form.solutionMode !== 'mark_scheme_table') {
        this.form.solution = solEl.value;
      }

      const stem = this.form.stem || '';
      const optsList = this.form.optionsList || [
        { key: 'A', text: '' }, { key: 'B', text: '' }, { key: 'C', text: '' }, { key: 'D', text: '' }
      ];
      const optionsMd = optsList.map(o => `- **${o.key}.** ${o.text || ''}`).join('\n');
      this.form.content = stem ? `${stem}\n\n${optionsMd}` : optionsMd;

      const isMulti = this.form.mcqType === 'multiple';
      const correctArr = (this.form.correctOptions && this.form.correctOptions.length > 0)
        ? this.form.correctOptions
        : (this.form.correctOption ? [this.form.correctOption] : ['A']);
      const myArr = (this.form.myOptions && this.form.myOptions.length > 0)
        ? this.form.myOptions
        : (this.form.myOption ? [this.form.myOption] : []);

      const correctStr = correctArr.join(', ');
      const myStr = myArr.join(', ');
      const typeLabel = isMulti ? '【正确答案（多选/不定项）】' : '【正确答案】';
      const myOptText = myStr ? ` *(当时错选/漏选: \`${myStr}\`)*` : '';
      const solHeader = `**${typeLabel}**：\`${correctStr}\`${myOptText}\n\n`;

      if (this.form.solutionMode === 'mark_scheme_table') {
        this.compileMarkSchemeTable();
      }
      this.form.compiledSolution = solHeader + (this.form.solution || '*暂无详细解析*');
    } else if (this.form.structuredMode === 'multi_part') {
      const stemEl = !skipDomRead && document.getElementById('editor-stem');
      if (stemEl) this.form.stem = stemEl.value;
      const stemMarksEl = !skipDomRead && document.getElementById('editor-stem-marks');
      if (stemMarksEl) this.form.stemMarks = stemMarksEl.value;

      const stem = this.form.stem || '';
      const parts = this.form.parts || [];
      const partsMd = parts.map(p => {
        const marksStr = p.marks ? ` *[${p.marks}]*` : '';
        const wrongBadge = p.isWrong ? ' ⚠️ `[错题重点突破]`' : '';
        const afterBlock = (p.afterText && p.afterText.trim()) ? `\n\n${p.afterText.trim()}` : '';
        return `**${p.label || '(a)'}**${marksStr}${wrongBadge}\n${p.text || ''}${afterBlock}`;
      }).join('\n\n');

      const stemWithMarks = (stem && parts.length === 0 && this.form.stemMarks)
        ? `${stem} *[${this.form.stemMarks}]*`
        : stem;
      this.form.content = stemWithMarks ? (partsMd ? `${stemWithMarks}\n\n${partsMd}` : stemWithMarks) : partsMd;

      // 编译所有小问的 Mark Scheme 表格为剑桥官方四列表格 (自动略过选择不录入题解的小问)
      const activeParts = parts.filter(p => p.solutionMode !== 'none');
      const hasAnyRows = activeParts.some(p => p.solutionRows && p.solutionRows.length > 0);
      if (hasAnyRows) {
        let md = `| Question | Answer | Marks | Guidance |\n| :---: | :--- | :---: | :--- |\n`;
        activeParts.forEach(p => {
          if (p.solutionMode !== 'markdown' && p.solutionRows && p.solutionRows.length > 0) {
            p.solutionRows.forEach((r, rIdx) => {
              // 剑桥官方标准：小问的第一行自动填入小题题号（如 (c) 或 7(c)），同小问后续步骤留空以体现连带分步骤
              const q = (rIdx === 0 ? (r.question || p.label || '') : (r.question || '')).replace(/\|/g, '\\|').trim();
              const a = (r.answer || '').replace(/\|/g, '\\|').replace(/\n/g, '<br>').trim();
              const m = (r.marks || '').replace(/\|/g, '\\|').trim();
              const g = (r.guidance || '').replace(/\|/g, '\\|').replace(/\n/g, '<br>').trim();
              md += `| ${q} | ${a} | **${m}** | ${g} |\n`;
            });
          } else if (p.solution && p.solution.trim()) {
            md += `| ${p.label || ''} | ${p.solution.replace(/\|/g, '\\|').replace(/\n/g, '<br>')} | **${p.marks || ''}** |  |\n`;
          }
        });
        this.form.solution = md;
      } else if (activeParts.length > 0) {
        const solPartsMd = activeParts.map(p => {
          return `#### 【${p.label} 参考题解与 Mark Scheme】\n${p.solution || '*未录入解题步骤*'}`;
        }).join('\n\n');
        this.form.solution = solPartsMd;
      } else if (this.form.solutionMode === 'mark_scheme_table' && Array.isArray(this.form.markSchemeRows) && this.form.markSchemeRows.length > 0) {
        let md = `| Question | Answer | Marks | Guidance |\n| :---: | :--- | :---: | :--- |\n`;
        this.form.markSchemeRows.forEach(r => {
          const q = (r.question || '').replace(/\|/g, '\\|').trim();
          const a = (r.answer || '').replace(/\|/g, '\\|').replace(/\n/g, '<br>').trim();
          const m = (r.marks || '').replace(/\|/g, '\\|').trim();
          const g = (r.guidance || '').replace(/\|/g, '\\|').replace(/\n/g, '<br>').trim();
          md += `| ${q} | ${a} | **${m}** | ${g} |\n`;
        });
        this.form.solution = md;
      } else if (this.form.solutionMode === 'markdown') {
        const stemSolEl = !skipDomRead && document.getElementById('editor-stem-solution');
        if (stemSolEl) this.form.solution = stemSolEl.value;
      } else {
        this.form.solution = '';
      }
    } else {
      const contentEl = !skipDomRead && document.getElementById('editor-content');
      if (contentEl) this.form.content = contentEl.value;
      if (this.form.solutionMode === 'mark_scheme_table') {
        this.compileMarkSchemeTable();
      } else {
        const solEl = !skipDomRead && document.getElementById('editor-solution');
        if (solEl) this.form.solution = solEl.value;
      }
    }

    const noteEl = !skipDomRead && document.getElementById('editor-solution-note');
    if (noteEl) this.form.solutionNote = noteEl.value;

    // 同步刷新预览 (支持 完整卷面预览 / 仅题目预览 / 仅题解预览自由切换)
    const previewEl = document.getElementById('editor-preview');
    if (previewEl) {
      const scope = this.editorPreviewScope || 'all';
      const contentText = (this.form.content || '').trim();
      const solRaw = ((this.form.questionType === 'multiple_choice' ? this.form.compiledSolution : this.form.solution) || '').trim();
      const solNote = (this.form.solutionNote || '').trim();

      let textToPreview = '';
      if (scope === 'content') {
        textToPreview = contentText || '*暂无题目正文，请在左侧输入...*';
      } else if (scope === 'solution') {
        textToPreview = solRaw 
          ? `### 📋 参考题解与 Mark Scheme 评分细则\n\n${solRaw}` 
          : (solNote ? '' : '*暂未录入参考题解与 Mark Scheme 评分步骤*');
      } else {
        // 'all': 卷面全览模式 (题目正文 + 官方 Mark Scheme 题解表格)
        const sections = [];
        sections.push(contentText || '*暂无题目正文，请在左侧输入...*');
        if (solRaw) {
          sections.push(`---\n\n### 📋 官方 Mark Scheme / 参考题解预览\n\n${solRaw}`);
        } else if (!solNote) {
          sections.push(`---\n\n*💡 提示：录入题解后即可在此实时预览官方 Mark Scheme 表格*`);
        }
        textToPreview = sections.join('\n\n');
      }

      const mainHtml = textToPreview ? window.markdownRenderer.render(textToPreview) : '';
      const noteHtml = (scope !== 'content' && solNote) ? `
        <div class="mt-4 p-3.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60">
          <div class="text-xs font-bold text-amber-800 dark:text-amber-300 mb-1.5 flex items-center gap-1.5">
            <span>💡</span><span>思路点拨与解题备注</span>
          </div>
          <div class="markdown-body text-slate-800 dark:text-slate-200 text-xs sm:text-sm leading-relaxed">
            ${window.markdownRenderer.render(solNote)}
          </div>
        </div>
      ` : '';
      previewEl.innerHTML = `${mainHtml}${noteHtml}`;
    }
  }

  updateSolutionNote(val) {
    this.form.solutionNote = val;
    this.compileQuestionContent(true);
  }

  setQuestionType(type) {
    this.form.questionType = type;
    this.compileQuestionContent();
    this.render();
  }

  setStructuredMode(mode) {
    this.form.structuredMode = mode;
    this.compileQuestionContent();
    this.render();
  }

  // --- 选择题多选 & 动态增减选项管理 ---
  setMcqType(type) {
    this.form.mcqType = type;
    if (type === 'single') {
      if (this.form.correctOptions && this.form.correctOptions.length > 0) {
        this.form.correctOption = this.form.correctOptions[0];
        this.form.correctOptions = [this.form.correctOptions[0]];
      } else {
        this.form.correctOption = 'A';
        this.form.correctOptions = ['A'];
      }
      if (this.form.myOptions && this.form.myOptions.length > 0) {
        this.form.myOption = this.form.myOptions[0];
        this.form.myOptions = [this.form.myOptions[0]];
      }
    } else {
      if (!this.form.correctOptions || this.form.correctOptions.length === 0) {
        this.form.correctOptions = [this.form.correctOption || 'A'];
      }
      if (!this.form.myOptions || this.form.myOptions.length === 0) {
        this.form.myOptions = this.form.myOption ? [this.form.myOption] : [];
      }
    }
    this.compileQuestionContent();
    this.render();
  }

  addMcqOption() {
    if (!this.form.optionsList) this.form.optionsList = [];
    const currentKeys = this.form.optionsList.map(o => o.key);
    const nextKey = String.fromCharCode(65 + currentKeys.length);
    this.form.optionsList.push({ key: nextKey, text: '' });
    if (!this.form.options) this.form.options = {};
    this.form.options[nextKey] = '';
    this.compileQuestionContent();
    this.render();
  }

  removeMcqOption(idx) {
    if (!this.form.optionsList || this.form.optionsList.length <= 2) {
      this.showToast('选择题至少需要保留 2 个选项！', 'info');
      return;
    }
    const removed = this.form.optionsList.splice(idx, 1)[0];
    if (removed && removed.key) {
      delete this.form.options[removed.key];
      this.form.correctOptions = (this.form.correctOptions || []).filter(k => k !== removed.key);
      this.form.myOptions = (this.form.myOptions || []).filter(k => k !== removed.key);
      if (this.form.correctOption === removed.key) {
        this.form.correctOption = this.form.correctOptions[0] || 'A';
      }
      if (this.form.myOption === removed.key) {
        this.form.myOption = this.form.myOptions[0] || '';
      }
    }
    this.compileQuestionContent();
    this.render();
  }

  updateMcqOptionText(key, value) {
    if (!this.form.options) this.form.options = {};
    this.form.options[key] = value;
    if (this.form.optionsList) {
      const target = this.form.optionsList.find(o => o.key === key);
      if (target) target.text = value;
    }
    this.compileQuestionContent();
  }

  toggleMcqCorrectOption(key) {
    if (this.form.mcqType === 'single') {
      this.form.correctOption = key;
      this.form.correctOptions = [key];
    } else {
      if (!this.form.correctOptions) this.form.correctOptions = [];
      if (this.form.correctOptions.includes(key)) {
        if (this.form.correctOptions.length <= 1) {
          this.showToast('多选题至少需指定 1 个正确答案！', 'info');
          return;
        }
        this.form.correctOptions = this.form.correctOptions.filter(k => k !== key);
      } else {
        this.form.correctOptions.push(key);
      }
      this.form.correctOptions.sort();
      this.form.correctOption = this.form.correctOptions.join(', ');
    }
    this.compileQuestionContent();
    this.render();
  }

  toggleMcqMyOption(key) {
    if (this.form.mcqType === 'single') {
      if (this.form.myOption === key) {
        this.form.myOption = '';
        this.form.myOptions = [];
      } else {
        this.form.myOption = key;
        this.form.myOptions = [key];
      }
    } else {
      if (!this.form.myOptions) this.form.myOptions = [];
      if (this.form.myOptions.includes(key)) {
        this.form.myOptions = this.form.myOptions.filter(k => k !== key);
      } else {
        this.form.myOptions.push(key);
      }
      this.form.myOptions.sort();
      this.form.myOption = this.form.myOptions.join(', ');
    }
    this.compileQuestionContent();
    this.render();
  }

  // --- Mark Scheme / 题解结构化 4 列表格录入与图形化编辑 ---
  setSolutionMode(mode) {
    this.form.solutionMode = mode;
    if (mode === 'mark_scheme_table') {
      if (!this.form.markSchemeRows || this.form.markSchemeRows.length === 0) {
        if (this.form.solution && this.form.solution.includes('| Question')) {
          this.form.markSchemeRows = this.parseMarkdownTableToRows(this.form.solution);
        } else {
          const defaultQ = (this.form.parts && this.form.parts[0]?.label) || this.form.paperCode || '(a)';
          this.form.markSchemeRows = [
            { question: defaultQ, answer: '', marks: 'B1', guidance: '' }
          ];
        }
      }
      this.compileMarkSchemeTable();
    }
    this.compileQuestionContent();
    this.render();
  }

  setPartSolutionMode(partIdx, mode) {
    if (!this.form.parts || !this.form.parts[partIdx]) return;
    const part = this.form.parts[partIdx];
    part.solutionMode = mode;
    if (mode === 'mark_scheme_table') {
      if (!part.solutionRows || part.solutionRows.length === 0) {
        if (part.solution && part.solution.includes('| Question')) {
          part.solutionRows = this.parseMarkdownTableToRows(part.solution);
        } else {
          part.solutionRows = [
            { question: part.label || '(a)', answer: part.solution || '', marks: 'B1', guidance: '' }
          ];
        }
      }
      this.compilePartMarkSchemeTable(partIdx);
    } else if (mode === 'none') {
      part.solution = '';
    }
    this.compileQuestionContent();
    this.render();
  }

  setEditorPreviewScope(scope) {
    this.editorPreviewScope = scope;
    this.compileQuestionContent();
    this.render();
  }

  addMarkSchemeRow() {
    if (!this.form.markSchemeRows) this.form.markSchemeRows = [];
    const len = this.form.markSchemeRows.length;
    let nextQ = '(a)';
    if (len > 0) {
      nextQ = this.form.markSchemeRows[len - 1].question || '(a)';
    } else if (this.form.parts && this.form.parts[0]?.label) {
      nextQ = this.form.parts[0].label;
    }
    this.form.markSchemeRows.push({
      question: nextQ,
      answer: '',
      marks: 'M1',
      guidance: ''
    });
    this.compileMarkSchemeTable();
    this.compileQuestionContent();
    this.render();
  }

  removeMarkSchemeRow(idx) {
    if (!this.form.markSchemeRows || this.form.markSchemeRows.length <= 1) {
      this.showToast('至少保留一行评分步骤！', 'info');
      return;
    }
    this.form.markSchemeRows.splice(idx, 1);
    this.compileMarkSchemeTable();
    this.compileQuestionContent();
    this.render();
  }

  updateMarkSchemeRow(idx, field, value) {
    if (!this.form.markSchemeRows || !this.form.markSchemeRows[idx]) return;
    this.form.markSchemeRows[idx][field] = value;
    this.compileMarkSchemeTable();
    this.compileQuestionContent();
  }

  addPartMarkSchemeRow(partIdx) {
    if (!this.form.parts || !this.form.parts[partIdx]) return;
    const part = this.form.parts[partIdx];
    if (!part.solutionRows) part.solutionRows = [];
    const nextQ = part.label || '(a)';
    part.solutionRows.push({
      question: nextQ,
      answer: '',
      marks: 'M1',
      guidance: ''
    });
    this.compilePartMarkSchemeTable(partIdx);
    this.compileQuestionContent();
    this.render();
  }

  removePartMarkSchemeRow(partIdx, rIdx) {
    if (!this.form.parts || !this.form.parts[partIdx]) return;
    const part = this.form.parts[partIdx];
    if (!part.solutionRows || part.solutionRows.length <= 1) {
      this.showToast('小问至少保留一行评分步骤！', 'info');
      return;
    }
    part.solutionRows.splice(rIdx, 1);
    this.compilePartMarkSchemeTable(partIdx);
    this.compileQuestionContent();
    this.render();
  }

  updatePartMarkSchemeRow(partIdx, rIdx, field, value) {
    if (!this.form.parts || !this.form.parts[partIdx]) return;
    const part = this.form.parts[partIdx];
    if (!part.solutionRows || !part.solutionRows[rIdx]) return;
    part.solutionRows[rIdx][field] = value;
    this.compilePartMarkSchemeTable(partIdx);
    this.compileQuestionContent();
  }

  compilePartMarkSchemeTable(partIdx) {
    const part = this.form.parts[partIdx];
    if (!part || !part.solutionRows) return;
    let md = `| Question | Answer | Marks | Guidance |\n| :---: | :--- | :---: | :--- |\n`;
    part.solutionRows.forEach(r => {
      const q = (r.question || '').replace(/\|/g, '\\|').trim();
      const a = (r.answer || '').replace(/\|/g, '\\|').replace(/\n/g, '<br>').trim();
      const m = (r.marks || '').replace(/\|/g, '\\|').trim();
      const g = (r.guidance || '').replace(/\|/g, '\\|').replace(/\n/g, '<br>').trim();
      md += `| ${q} | ${a} | **${m}** | ${g} |\n`;
    });
    part.solution = md;
  }

  addQuickMarkSchemeStep(partIdx, markType) {
    if (partIdx !== null && partIdx !== undefined) {
      const part = this.form.parts[partIdx];
      if (!part) return;
      if (!part.solutionRows) part.solutionRows = [];
      part.solutionRows.push({
        question: markType.startsWith('Total') ? '' : (part.label || '(a)'),
        answer: '',
        marks: markType,
        guidance: ''
      });
      this.compilePartMarkSchemeTable(partIdx);
    } else {
      if (!this.form.markSchemeRows) this.form.markSchemeRows = [];
      this.form.markSchemeRows.push({
        question: markType.startsWith('Total') ? '' : (this.form.paperCode || '(a)'),
        answer: '',
        marks: markType,
        guidance: ''
      });
      this.compileMarkSchemeTable();
    }
    this.compileQuestionContent();
    this.render();
  }

  compileMarkSchemeTable() {
    if (this.form.solutionMode !== 'mark_scheme_table') return;
    const rows = this.form.markSchemeRows || [];
    if (rows.length === 0) return;

    let md = `| Question | Answer | Marks | Guidance |\n| :---: | :--- | :---: | :--- |\n`;
    rows.forEach(r => {
      const q = (r.question || '').replace(/\|/g, '\\|').trim();
      const a = (r.answer || '').replace(/\|/g, '\\|').replace(/\n/g, '<br>').trim();
      const m = (r.marks || '').replace(/\|/g, '\\|').trim();
      const g = (r.guidance || '').replace(/\|/g, '\\|').replace(/\n/g, '<br>').trim();
      md += `| ${q} | ${a} | **${m}** | ${g} |\n`;
    });
    this.form.solution = md;

    const previewEl = document.getElementById('editor-preview');
    if (previewEl && this.activeEditorTab === 'solution') {
      previewEl.innerHTML = window.markdownRenderer.render(this.form.solution);
    }
  }

  // 剑桥官方 Mark Scheme 4 列表格图形化输入界面渲染器
  renderMarkSchemeTableUI(rows, partIdx = null) {
    const isPart = partIdx !== null && partIdx !== undefined;
    const defaultQ = isPart ? (this.form.parts[partIdx]?.label || '(a)') : '(a)';
    const safeRows = (rows && rows.length > 0) ? rows : [
      { question: defaultQ, answer: '', marks: 'B1', guidance: '' }
    ];

    const rowsHtml = safeRows.map((r, rIdx) => {
      const qVal = this.escapeHtml(r.question || defaultQ);
      const aVal = this.escapeHtml(r.answer || '');
      const mVal = this.escapeHtml(r.marks || '');
      const gVal = this.escapeHtml(r.guidance || '');

      const onQ = isPart ? `app.updatePartMarkSchemeRow(${partIdx}, ${rIdx}, 'question', this.value)` : `app.updateMarkSchemeRow(${rIdx}, 'question', this.value)`;
      const onA = isPart ? `app.updatePartMarkSchemeRow(${partIdx}, ${rIdx}, 'answer', this.value)` : `app.updateMarkSchemeRow(${rIdx}, 'answer', this.value)`;
      const onM = isPart ? `app.updatePartMarkSchemeRow(${partIdx}, ${rIdx}, 'marks', this.value)` : `app.updateMarkSchemeRow(${rIdx}, 'marks', this.value)`;
      const onG = isPart ? `app.updatePartMarkSchemeRow(${partIdx}, ${rIdx}, 'guidance', this.value)` : `app.updatePartMarkSchemeRow(${rIdx}, 'guidance', this.value)`;
      const onDel = isPart ? `app.removePartMarkSchemeRow(${partIdx}, ${rIdx})` : `app.removeMarkSchemeRow(${rIdx})`;

      return `
        <tr class="border-b border-slate-200/70 dark:border-slate-800/80 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
          ${!isPart ? `
            <td class="p-2 align-top text-center w-28 border-r border-slate-200/60 dark:border-slate-800/60">
              <input type="text" value="${qVal}" oninput="${onQ}" placeholder="(a) 或 7(c)" class="w-full px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-center bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500" />
            </td>
          ` : ''}
          <td class="p-2.5 align-top border-r border-slate-200/60 dark:border-slate-800/60">
            <textarea rows="3" oninput="${onA}" placeholder="解题核心关键步骤与答案 (支持 LaTeX $...$ 及截图粘贴)..." class="w-full min-h-[58px] p-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500 resize-y leading-relaxed">${aVal}</textarea>
          </td>
          <td class="p-2.5 align-top text-center w-28 border-r border-slate-200/60 dark:border-slate-800/60">
            <input type="text" list="cambridge-marks-list" value="${mVal}" oninput="${onM}" placeholder="B1/M1/A1" class="w-full px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-center bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 focus:ring-1 focus:ring-indigo-500" />
          </td>
          <td class="p-2.5 align-top border-r border-slate-200/60 dark:border-slate-800/60">
            <textarea rows="3" oninput="${onG}" placeholder="评分细则与容错指引 (支持 Markdown / LaTeX)..." class="w-full min-h-[58px] p-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500 resize-y leading-relaxed">${gVal}</textarea>
          </td>
          <td class="p-2 align-middle text-center w-12">
            <button type="button" onclick="${onDel}" class="w-7 h-7 mx-auto rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center font-bold text-sm transition cursor-pointer" title="删除此行步骤">&times;</button>
          </td>
        </tr>
      `;
    }).join('');

    const onAddRow = isPart ? `app.addPartMarkSchemeRow(${partIdx})` : `app.addMarkSchemeRow()`;
    const pParam = isPart ? `${partIdx}` : `null`;

    return `
      <div class="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-2xs bg-white dark:bg-slate-900">
        <div class="overflow-x-auto">
          <table class="w-full min-w-[540px] text-left border-collapse text-xs">
            <thead>
              <tr class="bg-slate-100/90 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700">
                ${!isPart ? `
                  <th class="py-2.5 px-2.5 text-center font-bold w-28 border-r border-slate-200/60 dark:border-slate-700/60">
                    ① Question<br><span class="text-[10px] text-slate-400 font-normal">题号 / 小问</span>
                  </th>
                ` : ''}
                <th class="py-2.5 px-3 font-bold border-r border-slate-200/60 dark:border-slate-700/60">
                  ${isPart ? '①' : '②'} Answer / Scheme<br><span class="text-[10px] text-slate-400 font-normal">解题关键步骤与答案 (支持 LaTeX $...$ 及截图粘贴)</span>
                </th>
                <th class="py-2.5 px-2 text-center font-bold w-28 border-r border-slate-200/60 dark:border-slate-700/60">
                  ${isPart ? '②' : '③'} Marks<br><span class="text-[10px] text-slate-400 font-normal">评分代号 (B1/M1/A1)</span>
                </th>
                <th class="py-2.5 px-3 font-bold border-r border-slate-200/60 dark:border-slate-700/60">
                  ${isPart ? '③' : '④'} Guidance<br><span class="text-[10px] text-slate-400 font-normal">评分细则与容错指引</span>
                </th>
                <th class="py-2.5 px-1 text-center font-bold w-12">操作</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
        <div class="p-2.5 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div class="flex flex-wrap items-center gap-1.5">
            <button type="button" onclick="${onAddRow}" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs flex items-center gap-1.5 transition cursor-pointer">
              <span>➕ 添加一行评分步骤 (Add Row)</span>
            </button>
            <button type="button" onclick="app.addQuickMarkSchemeStep(${pParam}, 'B1')" class="px-2 py-1 rounded-md text-[11px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer">
              + B1
            </button>
            <button type="button" onclick="app.addQuickMarkSchemeStep(${pParam}, 'M1')" class="px-2 py-1 rounded-md text-[11px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer">
              + M1
            </button>
            <button type="button" onclick="app.addQuickMarkSchemeStep(${pParam}, 'A1')" class="px-2 py-1 rounded-md text-[11px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer">
              + A1
            </button>
            <button type="button" onclick="app.addQuickMarkSchemeStep(${pParam}, 'B1 FT')" class="px-2 py-1 rounded-md text-[11px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer">
              + B1 FT
            </button>
            <button type="button" onclick="app.addQuickMarkSchemeStep(${pParam}, 'Total: 5')" class="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer">
              + 总分行
            </button>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" onclick="app.openMarkSchemeModal(${pParam})" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition cursor-pointer flex items-center gap-1.5 shadow-2xs" title="弹出独立大窗口，提供舒适的超大输入区域与多行编辑">
              <span>⛶ 弹窗大窗口编辑</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // --- 弹窗大窗口编辑 Mark Scheme 题解与评分标准 ---
  openMarkSchemeModal(partIdx = null) {
    const isPart = partIdx !== null && partIdx !== undefined;
    let targetRows = [];
    let title = '';

    if (isPart) {
      const part = this.form.parts[partIdx];
      if (!part) return;
      targetRows = part.solutionRows && part.solutionRows.length > 0 ? part.solutionRows : [
        { question: part.label || '(a)', answer: '', marks: 'B1', guidance: '' }
      ];
      title = `小问 ${this.escapeHtml(part.label || '(a)')} 官方 Mark Scheme 评分细则与解题步骤`;
    } else {
      targetRows = this.form.markSchemeRows && this.form.markSchemeRows.length > 0 ? this.form.markSchemeRows : [
        { question: '(a)', answer: '', marks: 'B1', guidance: '' }
      ];
      title = '官方 Mark Scheme 评分细则与解题步骤 (全题)';
    }

    this.markSchemeModal = {
      partIdx,
      title,
      rows: JSON.parse(JSON.stringify(targetRows))
    };

    this.renderMarkSchemeModal();
  }

  renderMarkSchemeModal() {
    if (!this.markSchemeModal) return;
    const modalData = this.markSchemeModal;

    let container = document.getElementById('mark-scheme-modal-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'mark-scheme-modal-container';
      document.body.appendChild(container);
    }

    const rowsHtml = modalData.rows.map((r, rIdx) => {
      const aVal = this.escapeHtml(r.answer || '');
      const mVal = this.escapeHtml(r.marks || '');
      const gVal = this.escapeHtml(r.guidance || '');

      return `
        <div class="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <div class="mark-scheme-row-header flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800/80">
            <span class="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2.5 py-1 rounded-lg">
              步骤 #${rIdx + 1}
            </span>
            <div class="mark-scheme-row-controls flex flex-wrap items-center gap-2">
              <span class="text-xs text-slate-400">评分代号：</span>
              <input type="text" list="cambridge-marks-list" value="${mVal}" oninput="app.updateModalMarkSchemeRow(${rIdx}, 'marks', this.value)" placeholder="如 B1, M1, A1" class="w-32 px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-center bg-slate-50 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 focus:ring-2 focus:ring-indigo-500" />
              <button type="button" onclick="app.removeModalMarkSchemeRow(${rIdx})" class="px-2.5 py-1 text-xs text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition" title="删除此步">
                🗑️ 删除
              </button>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                解题步骤与答案 (Answer / Scheme) *
              </label>
              <textarea rows="4" oninput="app.updateModalMarkSchemeRow(${rIdx}, 'answer', this.value)" placeholder="在此输入核心解题过程与答案，支持 LaTeX $...$ 数学公式、分式、根号与截图粘贴..." class="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono bg-slate-50/50 dark:bg-slate-950/60 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 resize-y leading-relaxed">${aVal}</textarea>
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                评分细则与容错指引 (Guidance)
              </label>
              <textarea rows="4" oninput="app.updateModalMarkSchemeRow(${rIdx}, 'guidance', this.value)" placeholder="在此输入官方评分说明、判分标准、允许的等价形式或容错提示 (支持 Markdown / LaTeX)..." class="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono bg-slate-50/50 dark:bg-slate-950/60 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 resize-y leading-relaxed">${gVal}</textarea>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="mark-scheme-modal fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="bg-slate-100 dark:bg-slate-950 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
          <!-- 弹窗顶栏 -->
          <div class="p-5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
            <div>
              <h3 class="text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>📋</span>
                <span>${modalData.title}</span>
              </h3>
              <p class="text-xs text-slate-400 mt-1">在大窗口中轻松编辑多行推导步骤、分式公式与官方评分标准</p>
            </div>
            <button onclick="app.closeMarkSchemeModal()" class="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 font-bold transition">
              &times;
            </button>
          </div>

          <!-- 步骤列表滚动区 -->
          <div class="p-6 overflow-y-auto grow space-y-4">
            ${rowsHtml}

            <!-- 快捷添加步骤与代号按钮 -->
            <div class="p-4 bg-white/70 dark:bg-slate-900/70 rounded-2xl border border-dashed border-indigo-200 dark:border-indigo-900/80 flex flex-wrap items-center justify-between gap-3">
              <div class="flex flex-wrap items-center gap-2">
                <button type="button" onclick="app.addModalMarkSchemeRow()" class="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs flex items-center gap-1.5 transition">
                  <span>➕ 添加一行解题步骤 (Add Row)</span>
                </button>
                <button type="button" onclick="app.addModalQuickMarkSchemeStep('B1')" class="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 transition">
                  + B1 (事实分)
                </button>
                <button type="button" onclick="app.addModalQuickMarkSchemeStep('M1')" class="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 transition">
                  + M1 (方法分)
                </button>
                <button type="button" onclick="app.addModalQuickMarkSchemeStep('A1')" class="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 transition">
                  + A1 (准确答案)
                </button>
                <button type="button" onclick="app.addModalQuickMarkSchemeStep('B1 FT')" class="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 transition">
                  + B1 FT
                </button>
                <button type="button" onclick="app.addModalQuickMarkSchemeStep('Total: 5')" class="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 transition">
                  + 总分行
                </button>
              </div>
            </div>
          </div>

          <!-- 弹窗底栏操作 -->
          <div class="p-5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
            <span class="text-xs text-slate-400">
              当前共 ${modalData.rows.length} 个步骤 · 保存后将自动重新生成官方 Mark Scheme 规范表格
            </span>
            <div class="flex items-center gap-3">
              <button type="button" onclick="app.closeMarkSchemeModal()" class="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                取消
              </button>
              <button type="button" onclick="app.saveMarkSchemeModal()" class="px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20 transition">
                💾 保存并同步到表单
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  updateModalMarkSchemeRow(rIdx, field, val) {
    if (!this.markSchemeModal || !this.markSchemeModal.rows[rIdx]) return;
    this.markSchemeModal.rows[rIdx][field] = val;
  }

  addModalMarkSchemeRow() {
    if (!this.markSchemeModal) return;
    const isPart = this.markSchemeModal.partIdx !== null;
    const defaultQ = isPart ? (this.form.parts[this.markSchemeModal.partIdx]?.label || '(a)') : '(a)';
    this.markSchemeModal.rows.push({
      question: defaultQ,
      answer: '',
      marks: 'M1',
      guidance: ''
    });
    this.renderMarkSchemeModal();
  }

  removeModalMarkSchemeRow(rIdx) {
    if (!this.markSchemeModal) return;
    if (this.markSchemeModal.rows.length <= 1) {
      this.showToast('至少保留一行评分步骤！', 'info');
      return;
    }
    this.markSchemeModal.rows.splice(rIdx, 1);
    this.renderMarkSchemeModal();
  }

  addModalQuickMarkSchemeStep(marksText) {
    if (!this.markSchemeModal) return;
    const isPart = this.markSchemeModal.partIdx !== null;
    const defaultQ = isPart ? (this.form.parts[this.markSchemeModal.partIdx]?.label || '(a)') : '(a)';
    this.markSchemeModal.rows.push({
      question: defaultQ,
      answer: '',
      marks: marksText,
      guidance: marksText.startsWith('Total:') ? '*Total Marks for this part*' : ''
    });
    this.renderMarkSchemeModal();
  }

  closeMarkSchemeModal() {
    this.markSchemeModal = null;
    const container = document.getElementById('mark-scheme-modal-container');
    if (container) container.remove();
  }

  saveMarkSchemeModal() {
    if (!this.markSchemeModal) return;
    const { partIdx, rows } = this.markSchemeModal;
    if (partIdx !== null && this.form.parts[partIdx]) {
      this.form.parts[partIdx].solutionRows = rows;
    } else {
      this.form.markSchemeRows = rows;
    }
    this.closeMarkSchemeModal();
    this.compileQuestionContent();
    this.render();
    this.showToast('已更新官方 Mark Scheme 题解与步骤！', 'success');
  }

  parseMarkdownTableToRows(text) {
    if (!text) return [];
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.startsWith('|') && l.endsWith('|'));
    const rows = [];
    for (const line of lines) {
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      if (cells.length < 3) continue;
      // 过滤表头和分割线
      if (cells[0].toLowerCase().includes('question') || cells[0].includes('---') || cells[1].includes('---')) {
        continue;
      }
      rows.push({
        question: cells[0] || '',
        answer: (cells[1] || '').replace(/<br\s*\/?>/gi, '\n'),
        marks: (cells[2] || '').replace(/\*\*/g, ''),
        guidance: (cells[3] || '').replace(/<br\s*\/?>/gi, '\n')
      });
    }
    return rows.length > 0 ? rows : [{ question: '(a)', answer: '', marks: 'B1', guidance: '' }];
  }

  addPart() {
    if (!this.form.parts) this.form.parts = [];
    const len = this.form.parts.length;
    let nextLabel = `(${String.fromCharCode(97 + len)})`; // (a), (b), (c)...
    if (len > 0) {
      const lastLabel = this.form.parts[len - 1].label;
      if (lastLabel && lastLabel.startsWith('(') && lastLabel.endsWith(')')) {
        const inner = lastLabel.slice(1, -1);
        if (inner.match(/^[a-z]$/)) {
          nextLabel = `(${String.fromCharCode(inner.charCodeAt(0) + 1)})`;
        } else if (inner.match(/^[0-9]+$/)) {
          nextLabel = `(${parseInt(inner, 10) + 1})`;
        } else if (inner === 'i') nextLabel = '(ii)';
        else if (inner === 'ii') nextLabel = '(iii)';
        else if (inner === 'iii') nextLabel = '(iv)';
      }
    }
    this.form.parts.push({
      id: 'part_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      label: nextLabel,
      marks: '3',
      isWrong: true,
      text: '',
      afterText: '',
      solutionMode: 'mark_scheme_table',
      solutionRows: [
        { question: nextLabel, answer: '', marks: 'B1', guidance: '' }
      ],
      solution: ''
    });
    this.compileQuestionContent();
    this.render();
  }

  removePart(idx) {
    if (!this.form.parts) return;
    if (this.form.parts.length <= 1 && !(this.form.stem && this.form.stem.trim())) {
      this.showToast('大题干为空时，至少保留一个小问！', 'info');
      return;
    }
    this.form.parts.splice(idx, 1);
    this.compileQuestionContent();
    this.render();
  }

  togglePartWrong(idx) {
    if (!this.form.parts || !this.form.parts[idx]) return;
    this.form.parts[idx].isWrong = !this.form.parts[idx].isWrong;
    this.compileQuestionContent();
    this.render();
  }

  updatePartField(idx, field, value) {
    if (!this.form.parts || !this.form.parts[idx]) return;
    this.form.parts[idx][field] = value;
    this.compileQuestionContent();
  }

  togglePartAfterText(idx, show = true) {
    if (!this.form.parts || !this.form.parts[idx]) return;
    if (show) {
      this.form.parts[idx]._showAfterText = true;
      this.render();
      requestAnimationFrame(() => {
        const el = document.getElementById(`part-after-${idx}`);
        if (el) el.focus();
      });
    } else {
      this.form.parts[idx].afterText = '';
      this.form.parts[idx]._showAfterText = false;
      this.compileQuestionContent();
      this.render();
    }
  }

  async saveCurrentQuestion() {
    this.compileQuestionContent();

    const subjectEl = document.getElementById('editor-subject');
    const unitEl = document.getElementById('editor-unit');
    const examEl = document.getElementById('editor-exam');
    const titleEl = document.getElementById('editor-title');
    const masteryEl = document.getElementById('editor-mastery');

    const content = this.form.content;
    const solution = (this.form.questionType === 'multiple_choice')
      ? (this.form.compiledSolution || this.form.solution)
      : this.form.solution;

    if (!content.trim()) {
      this.showToast('请至少输入题目内容！', 'warning');
      return;
    }

    const subjectId = (subjectEl && subjectEl.value) 
      ? subjectEl.value 
      : (this.form.subjectId || (this.subjects[0] ? this.subjects[0].id : ''));

    const unitId = (unitEl && unitEl.value) 
      ? unitEl.value 
      : (this.form.unitId || '');

    const examId = (examEl && examEl.value !== undefined) 
      ? examEl.value 
      : (this.form.examId || '');

    const paperCodeEl = document.getElementById('editor-paper-code');
    const paperCode = paperCodeEl ? paperCodeEl.value.trim().toUpperCase() : (this.form.paperCode || '');

    const title = titleEl ? titleEl.value.trim() : (this.form.title || '');
    const mastery = masteryEl ? parseInt(masteryEl.value, 10) : (parseInt(this.form.mastery, 10) || 0);

    const question = {
      id: this.editingQuestionId || ('q_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)),
      subjectId: subjectId,
      unitId: unitId,
      examId: examId,
      paperCode: paperCode,
      title: title,
      questionType: this.form.questionType || 'structured',
      structuredMode: this.form.structuredMode || 'multi_part',
      stem: this.form.stem || '',
      stemMarks: this.form.stemMarks || '',
      parts: (this.form.questionType !== 'multiple_choice' && this.form.structuredMode === 'multi_part')
        ? JSON.parse(JSON.stringify(this.form.parts))
        : null,
      mcqType: this.form.questionType === 'multiple_choice' ? (this.form.mcqType || 'single') : null,
      mcqOptionsList: this.form.questionType === 'multiple_choice' ? JSON.parse(JSON.stringify(this.form.optionsList || [])) : null,
      options: this.form.questionType === 'multiple_choice' ? { ...this.form.options } : null,
      correctOption: this.form.questionType === 'multiple_choice' ? this.form.correctOption : null,
      correctOptions: this.form.questionType === 'multiple_choice' ? [...(this.form.correctOptions || [])] : null,
      myOption: this.form.questionType === 'multiple_choice' ? this.form.myOption : null,
      myOptions: this.form.questionType === 'multiple_choice' ? [...(this.form.myOptions || [])] : null,
      solutionMode: this.form.solutionMode || 'mark_scheme_table',
      markSchemeRows: (this.form.solutionMode === 'mark_scheme_table' && this.form.markSchemeRows)
        ? JSON.parse(JSON.stringify(this.form.markSchemeRows))
        : null,
      content: content,
      solution: solution,
      solutionNote: (this.form.solutionNote || '').trim(),
      reasons: this.form.reasons || [],
      mastery: mastery,
      difficulty: parseInt(this.form.difficulty, 10) || 3,
      reviewCount: this.editingQuestionId ? (this.form.reviewCount || 1) : 1,
      createdAt: this.form.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      await window.db.saveQuestion(question);
      await this.refreshData();
      this.showToast(this.editingQuestionId ? '错题更新成功！' : '新错题录入成功！', 'success');
      this.resetEditorForm();
      this.switchTab('questions');
    } catch (e) {
      console.error(e);
      this.showToast('保存错题失败：' + e.message, 'error');
    }
  }

  editQuestion(id) {
    const q = this.questions.find(item => item.id === id);
    if (!q) return;

    this.editingQuestionId = q.id;

    // 解析选择题选项与单选/多选状态
    const mcqType = q.mcqType || ((q.correctOptions && q.correctOptions.length > 1) ? 'multiple' : 'single');
    let optionsList = q.mcqOptionsList;
    if (!optionsList && q.options) {
      optionsList = Object.keys(q.options).map(k => ({ key: k, text: q.options[k] || '' }));
    }
    if (!optionsList || optionsList.length === 0) {
      optionsList = [
        { key: 'A', text: '' },
        { key: 'B', text: '' },
        { key: 'C', text: '' },
        { key: 'D', text: '' }
      ];
    }
    const correctOptions = q.correctOptions || (q.correctOption ? q.correctOption.split(',').map(s => s.trim()) : ['A']);
    const myOptions = q.myOptions || (q.myOption ? q.myOption.split(',').map(s => s.trim()) : []);

    // 解析 Mark Scheme 结构化行级表格
    let markSchemeRows = q.markSchemeRows;
    let solutionMode = q.solutionMode || 'mark_scheme_table';
    if (!markSchemeRows && q.solution && q.solution.includes('| Question')) {
      markSchemeRows = this.parseMarkdownTableToRows(q.solution);
      solutionMode = 'mark_scheme_table';
    } else if (!markSchemeRows) {
      if (q.solution && q.solution.trim()) {
        solutionMode = 'markdown';
      } else {
        solutionMode = 'mark_scheme_table';
        markSchemeRows = [
          { question: q.paperCode || '(a)', answer: '', marks: 'B1', guidance: '' }
        ];
      }
    }

    this.form = {
      subjectId: q.subjectId,
      unitId: q.unitId || '',
      examId: q.examId || '',
      paperCode: q.paperCode || '',
      title: q.title || '',
      questionType: q.questionType || (q.options ? 'multiple_choice' : 'structured'),
      structuredMode: q.structuredMode || (q.parts && q.parts.length > 0 ? 'multi_part' : 'single'),
      stem: q.stem || '',
      stemMarks: q.stemMarks || '',
      parts: (q.parts && q.parts.length > 0) ? q.parts.map(p => {
        let solutionRows = p.solutionRows;
        let solutionMode = p.solutionMode || 'mark_scheme_table';
        if (!solutionRows && p.solution && p.solution.includes('| Question')) {
          solutionRows = this.parseMarkdownTableToRows(p.solution);
        } else if (!solutionRows) {
          if (p.solutionMode === 'none') {
            solutionMode = 'none';
            solutionRows = [{ question: p.label || '(a)', answer: '', marks: 'B1', guidance: '' }];
          } else if (p.solution && p.solution.trim()) {
            solutionMode = 'markdown';
            solutionRows = [{ question: p.label || '(a)', answer: p.solution, marks: 'B1', guidance: '' }];
          } else {
            solutionRows = [{ question: p.label || '(a)', answer: '', marks: 'B1', guidance: '' }];
          }
        }
        return {
          ...p,
          solutionMode,
          solutionRows: JSON.parse(JSON.stringify(solutionRows))
        };
      }) : (Array.isArray(q.parts) && q.structuredMode === 'multi_part' ? [] : [
        {
          id: 'part_1',
          label: '(a)',
          marks: '2',
          isWrong: true,
          text: '',
          solutionMode: 'mark_scheme_table',
          solutionRows: [{ question: '(a)', answer: '', marks: 'B1', guidance: '' }],
          solution: ''
        }
      ]),
      mcqType: mcqType,
      optionsList: optionsList,
      options: q.options ? { ...q.options } : { A: '', B: '', C: '', D: '' },
      correctOption: q.correctOption || correctOptions.join(', '),
      correctOptions: correctOptions,
      myOption: q.myOption || myOptions.join(', '),
      myOptions: myOptions,
      solutionMode: solutionMode,
      markSchemeRows: markSchemeRows ? JSON.parse(JSON.stringify(markSchemeRows)) : [
        { question: '(a)', answer: '', marks: 'B1', guidance: '' }
      ],
      content: q.content || '',
      solution: q.solution || '',
      solutionNote: q.solutionNote || '',
      compiledSolution: '',
      reasons: [...(q.reasons || [])],
      mastery: q.mastery,
      difficulty: q.difficulty || 3,
      reviewCount: q.reviewCount,
      createdAt: q.createdAt
    };

    this.switchTab('add');
  }

  async deleteQuestion(id) {
    if (!confirm('确定要删除这道错题吗？删除后将无法恢复。')) return;
    try {
      await window.db.deleteQuestion(id);
      window.practicePaperEngine.selectedQuestionIds.delete(id);
      await this.refreshData();
      this.showToast('已删除该错题', 'info');
      this.render();
    } catch (e) {
      this.showToast('删除失败：' + e.message, 'error');
    }
  }

  async toggleQuestionMastery(id) {
    const q = this.questions.find(item => item.id === id);
    if (!q) return;
    const nextMastery = (q.mastery + 1) % 3;
    await window.db.updateQuestionMastery(id, nextMastery);
    await this.refreshData();
    this.render();
  }

  async reassignQuestionSubject(questionId, targetSubjectId) {
    if (!targetSubjectId) return;
    const q = this.questions.find(item => item.id === questionId);
    if (!q) return;
    q.subjectId = targetSubjectId;
    const targetSub = this.subjects.find(s => s.id === targetSubjectId);
    if (targetSub && targetSub.units && targetSub.units.length > 0) {
      q.unitId = targetSub.units[0].id;
    }
    await window.db.saveQuestion(q);
    await this.refreshData();
    this.showToast(`已成功将错题归入【${targetSub.name}】！`, 'success');
    this.render();
  }

  toggleSolutionExpand(id) {
    if (this.expandedSolutionIds.has(id)) {
      this.expandedSolutionIds.delete(id);
    } else {
      this.expandedSolutionIds.add(id);
    }
    this.render();
  }

  resetEditorForm() {
    this.editingQuestionId = null;
    const firstSub = this.subjects.find(s => !s.isParent) || this.subjects[0];
    this.form = {
      subjectId: firstSub ? firstSub.id : '',
      unitId: (firstSub && firstSub.units && firstSub.units[0]) ? firstSub.units[0].id : '',
      examId: '',
      paperCode: '',
      title: '',
      questionType: 'structured',
      structuredMode: 'multi_part',
      stem: '',
      stemMarks: '',
      parts: [
        {
          id: 'part_1',
          label: '(a)',
          marks: '2',
          isWrong: true,
          text: '',
          solutionMode: 'mark_scheme_table',
          solutionRows: [{ question: '(a)', answer: '', marks: 'B1', guidance: '' }],
          solution: ''
        }
      ],
      mcqType: 'single',
      optionsList: [
        { key: 'A', text: '' },
        { key: 'B', text: '' },
        { key: 'C', text: '' },
        { key: 'D', text: '' }
      ],
      options: { A: '', B: '', C: '', D: '' },
      correctOption: 'A',
      correctOptions: ['A'],
      myOption: '',
      myOptions: [],
      solutionMode: 'mark_scheme_table',
      markSchemeRows: [
        { question: '(a)', answer: '', marks: 'B1', guidance: '' }
      ],
      content: '',
      solution: '',
      solutionNote: '',
      compiledSolution: '',
      reasons: [],
      mastery: 0,
      difficulty: 3
    };
    this.aiState = {
      questionImages: [],
      markSchemeImages: [],
      isRecognizing: false,
      isLookingUpCode: false,
      paperCodeLookup: null,
      autoGenerateSolution: this.aiState ? this.aiState.autoGenerateSolution : true,
      lastError: '',
      pasteTarget: 'question',
      cropModal: null
    };
  }

  // --- 成绩与图表页面折叠区域管理 ---
  toggleExamSection(sectionKey) {
    if (this.collapsedExamSections.has(sectionKey)) {
      this.collapsedExamSections.delete(sectionKey);
    } else {
      this.collapsedExamSections.add(sectionKey);
    }
    localStorage.setItem('bnds_exams_collapsed_sections_v2', JSON.stringify([...this.collapsedExamSections]));
    this.render();
  }

  renderCollapsibleCard({ key, title, icon, subtitle, badge, contentHtml, extraActionHtml }) {
    const isCollapsed = this.collapsedExamSections.has(key);
    return `
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden transition-all duration-200">
        <div class="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-800/40 border-b ${isCollapsed ? 'border-transparent' : 'border-slate-200/70 dark:border-slate-800'} cursor-pointer select-none hover:bg-slate-100/70 dark:hover:bg-slate-800/70 transition" onclick="app.toggleExamSection('${key}')">
          <div class="flex items-center gap-3 min-w-0">
            <span class="text-xl shrink-0">${icon || '📁'}</span>
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <h3 class="text-base font-bold text-slate-900 dark:text-slate-100">${this.escapeHtml(title)}</h3>
                ${badge ? `<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800">${badge}</span>` : ''}
              </div>
              ${subtitle ? `<p class="text-xs text-slate-500 mt-0.5">${this.escapeHtml(subtitle)}</p>` : ''}
            </div>
          </div>
          <div class="w-full sm:w-auto flex flex-wrap items-center justify-between sm:justify-end gap-2 min-w-0">
            ${extraActionHtml ? `<div class="min-w-0 max-w-full" onclick="event.stopPropagation()">${extraActionHtml}</div>` : ''}
            <button type="button" class="shrink-0 px-2.5 py-1 rounded-lg text-xs font-bold text-slate-500 hover:text-indigo-600 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition">
              <span>${isCollapsed ? '展开' : '收起'}</span>
              <span class="chevron-rotate ${isCollapsed ? 'collapsed' : 'expanded'} text-[10px]">▼</span>
            </button>
          </div>
        </div>
        <div class="${isCollapsed ? 'hidden' : 'p-4 sm:p-6'}">
          ${contentHtml}
        </div>
      </div>
    `;
  }

  toggleFormReason(reason) {
    if (this.form.reasons.includes(reason)) {
      this.form.reasons = this.form.reasons.filter(r => r !== reason);
    } else {
      this.form.reasons.push(reason);
    }
    this.renderEditorReasons();
  }

  addCustomReason() {
    const input = document.getElementById('custom-reason-input');
    if (!input || !input.value.trim()) return;
    const tag = input.value.trim();
    if (!this.form.reasons.includes(tag)) {
      this.form.reasons.push(tag);
    }
    input.value = '';
    this.renderEditorReasons();
  }

  // --- 在编辑器中点击「+ 新建单元」弹出专有轻量模态框 ---
  openQuickAddUnitModal() {
    const subjectEl = document.getElementById('editor-subject');
    const selectedSubId = subjectEl ? subjectEl.value : this.form.subjectId;
    let currentSub = this.subjects.find(s => s.id === selectedSubId);
    if (!currentSub && this.subjects.length > 0) {
      currentSub = this.subjects[0];
    }
    if (!currentSub) {
      this.showToast('请先在左侧选择一个学科！', 'warning');
      return;
    }

    const modalHtml = `
      <div id="quick-unit-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
        <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-sm w-full p-5 space-y-4">
          <div class="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
            <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <span>📖</span>
              <span>为【${this.escapeHtml(currentSub.name)}】添加新单元</span>
            </h3>
            <button onclick="app.closeModal('quick-unit-modal')" class="text-slate-400 hover:text-slate-600 text-lg font-bold">&times;</button>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1">单元 / Topic 名称 *</label>
            <input type="text" id="quick-unit-name-input" placeholder="如：[S1] Normal Distribution、[P1] Integration" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div class="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button onclick="app.closeModal('quick-unit-modal')" class="px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:bg-slate-100">取消</button>
            <button onclick="app.saveQuickAddUnit(${this.inlineArg(currentSub.id)})" class="px-4 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs">确定添加</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    setTimeout(() => {
      const inp = document.getElementById('quick-unit-name-input');
      if (inp) {
        inp.focus();
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.saveQuickAddUnit(currentSub.id);
          }
        });
      }
    }, 50);
  }

  async saveQuickAddUnit(subjectId) {
    const inp = document.getElementById('quick-unit-name-input');
    if (!inp || !inp.value.trim()) {
      this.showToast('请输入单元名称！', 'warning');
      return;
    }
    const unitName = inp.value.trim();
    const sub = this.subjects.find(s => s.id === subjectId);
    if (!sub) return;

    if (!sub.units) sub.units = [];
    const newId = 'u_' + Date.now();
    sub.units.push({ id: newId, name: unitName });

    await window.db.saveSubject(sub);
    await this.refreshData();
    this.closeModal('quick-unit-modal');
    this.form.subjectId = sub.id;
    this.form.unitId = newId;

    this.updateEditorUnitSelect();
    const unitEl = document.getElementById('editor-unit');
    if (unitEl) unitEl.value = newId;

    this.showToast(`已成功添加并选中单元：${unitName}`, 'success');
  }

  // --- 完整单元管理模态框 (学科与单元页面) ---
  openUnitManagerModal(subjectId) {
    const sub = this.subjects.find(s => s.id === subjectId);
    if (!sub) return;

    const units = sub.units || [];

    const unitsListHtml = units.length === 0 
      ? `<div class="text-xs text-slate-400 py-4 text-center">暂未创建任何单元，请在下方添加</div>`
      : units.map((u, idx) => `
        <div class="flex items-center justify-between py-2 px-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
          <div class="flex items-center gap-2">
            <span class="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center font-mono text-[10px]">${idx + 1}</span>
            <span class="font-medium text-slate-800 dark:text-slate-200">${this.escapeHtml(u.name)}</span>
          </div>
          <button onclick="app.deleteUnit(${this.inlineArg(sub.id)}, ${this.inlineArg(u.id)})" class="text-rose-500 hover:text-rose-700 font-bold px-2 py-0.5">删除</button>
        </div>
      `).join('');

    const modalHtml = `
      <div id="unit-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
        <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 space-y-4">
          <div class="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 class="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span class="w-3 h-3 rounded-full" style="background-color: ${this.safeColor(sub.color)}"></span>
                <span>管理【${this.escapeHtml(sub.name)}】的课程单元</span>
              </h3>
              <p class="text-xs text-slate-400 mt-0.5">按单元/Topic划分模块，方便录入错题和单元专项组卷</p>
            </div>
            <button onclick="app.closeModal('unit-modal')" class="text-slate-400 hover:text-slate-600 text-xl font-bold">&times;</button>
          </div>

          <div class="space-y-2 max-h-60 overflow-y-auto pr-1">
            ${unitsListHtml}
          </div>

          <div class="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <input type="text" id="new-unit-input" placeholder="输入新单元名称 (如: [P1] Differentiation)" class="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" onkeydown="if(event.key==='Enter'){event.preventDefault();app.addUnit(${this.inlineArg(sub.id)});}" />
            <button onclick="app.addUnit(${this.inlineArg(sub.id)})" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold whitespace-nowrap">
              + 添加单元
            </button>
          </div>

          <div class="flex justify-end pt-2">
            <button onclick="app.closeModal('unit-modal')" class="px-4 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200">完成</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  async addUnit(subjectId) {
    const input = document.getElementById('new-unit-input');
    if (!input || !input.value.trim()) return;

    const unitName = input.value.trim();
    const sub = this.subjects.find(s => s.id === subjectId);
    if (!sub) return;

    if (!sub.units) sub.units = [];
    const newUnitId = 'u_' + Date.now();
    sub.units.push({ id: newUnitId, name: unitName });

    await window.db.saveSubject(sub);
    await this.refreshData();
    this.render();
    this.closeModal('unit-modal');
    this.openUnitManagerModal(subjectId);
    setTimeout(() => {
      const inp = document.getElementById('new-unit-input');
      if (inp) inp.focus();
    }, 50);
    this.showToast(`成功添加单元：${unitName}`, 'success');
  }

  async deleteUnit(subjectId, unitId) {
    const sub = this.subjects.find(s => s.id === subjectId);
    if (!sub || !sub.units) return;

    if (!confirm('确定要删除此单元吗？关联此单元的错题仍会保留，但单元标记将重置。')) return;

    sub.units = sub.units.filter(u => u.id !== unitId);
    await window.db.saveSubject(sub);
    await this.refreshData();
    this.render();
    this.closeModal('unit-modal');
    this.openUnitManagerModal(subjectId);
    this.showToast('已删除单元', 'info');
  }

  // --- 核心重构：单科小考测验录入（支持多单元关联与实时 Grade 换算） ---
  renderExamModalUnitsHtml(sub, selectedUnitIds = []) {
    if (!sub || !sub.units || sub.units.length === 0) {
      return `<div class="text-xs text-slate-400 py-2 text-center">该学科暂无预置单元，可稍后在「学科与单元」中添加</div>`;
    }
    const selSet = new Set(selectedUnitIds);
    return sub.units.map(u => {
      const isChecked = selSet.has(u.id);
      return `
        <label class="flex items-center gap-2 p-1.5 rounded-lg transition cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800">
          <input type="checkbox" name="modal-exam-unit-item" value="${this.escapeHtml(u.id)}" ${isChecked ? 'checked' : ''} onchange="app.updateExamModalUnitTip()" class="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4" />
          <span class="text-xs font-medium text-slate-700 dark:text-slate-300">${this.escapeHtml(u.name)}</span>
        </label>
      `;
    }).join('');
  }

  selectAllExamModalUnits(selectAll = true) {
    const checkboxes = document.querySelectorAll('#modal-exam-units-box input[type="checkbox"]');
    checkboxes.forEach(cb => {
      cb.checked = selectAll;
    });
    this.updateExamModalUnitTip();
  }

  updateExamModalUnitTip() {
    const checkboxes = document.querySelectorAll('#modal-exam-units-box input[type="checkbox"]');
    const checked = Array.from(checkboxes).filter(cb => cb.checked);
    const tipEl = document.getElementById('modal-exam-units-tip');
    if (tipEl) {
      tipEl.textContent = `已选 ${checked.length} 个考察单元（一次考试可包含多个单元）`;
    }
  }

  openCategoryExamModal(subId, categoryId) {
    this.openExamModal(null, subId, categoryId);
  }

  openExamModal(examId = null, defaultSubId = null, defaultCategory = null) {
    const isEdit = !!examId;
    const exam = isEdit ? this.exams.find(e => e.id === examId) : {
      subjectId: defaultSubId || (this.subjects[0] ? this.subjects[0].id : ''),
      category: defaultCategory || '',
      categoryName: '',
      unitId: '',
      unitIds: [],
      title: '',
      date: new Date().toISOString().split('T')[0],
      score: '',
      maxScore: '',
      curvedScore: '',
      isFinal: false,
      note: ''
    };

    const initialSub = this.subjects.find(s => s.id === exam.subjectId) || this.subjects[0];
    const initialCurriculum = initialSub ? (initialSub.curriculum || 'A Level') : 'A Level';
    const selectedUnitIds = Array.isArray(exam.unitIds) ? exam.unitIds : (exam.unitId ? [exam.unitId] : []);
    const subCategories = this.getSubjectCategories(initialSub ? initialSub.id : '');
    const selectedCategory = exam.category || defaultCategory || (subCategories[0] ? subCategories[0].id : 'attainment');

    // 计算初次打开时的百分比与 Grade（若有 Curve 后成绩则优先以 Curve 后成绩为准）
    const initialScore = (exam.score !== undefined && exam.score !== '') ? parseFloat(exam.score) : null;
    const initialMax = (exam.maxScore !== undefined && exam.maxScore !== '') ? parseFloat(exam.maxScore) : null;
    const initialCurved = (exam.curvedScore !== undefined && exam.curvedScore !== null && exam.curvedScore !== '') ? parseFloat(exam.curvedScore) : null;
    const initialRawPct = (initialScore !== null && initialMax && initialMax > 0)
      ? Math.round((initialScore / initialMax) * 1000) / 10
      : null;
    const initialEffectivePct = (initialCurved !== null && !isNaN(initialCurved))
      ? Math.round(initialCurved * 10) / 10
      : initialRawPct;

    let initialPercentText = '-- %';
    let initialRawTipText = '';
    let initialGradeText = '--';
    let initialGradeBadgeClass = 'bg-slate-200 dark:bg-slate-700 text-slate-500';

    if (initialEffectivePct !== null) {
      initialPercentText = initialEffectivePct + '%';
      const g = this.calculateGrade(initialEffectivePct, initialCurriculum);
      initialGradeText = 'Grade ' + g;
      initialGradeBadgeClass = this.getGradeBadgeStyle(g);
      if (initialCurved !== null && !isNaN(initialCurved) && initialRawPct !== null) {
        initialRawTipText = `原始 ${initialRawPct}% → Curve`;
      }
    }

    const modalHtml = `
      <div id="exam-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
        <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full max-h-[92vh] flex flex-col overflow-hidden">
          <div class="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h3 class="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>📝</span>
                <span>${isEdit ? '编辑平时成绩 / 测验打分' : '录入平时成绩 / 测验打分 (Daily Assessment)'}</span>
              </h3>
              <p class="text-xs text-slate-400 mt-0.5">记录 Course Skills、Attainment、Learning Behavior 及期末考日常得分</p>
            </div>
            <button onclick="app.closeModal('exam-modal')" class="text-slate-400 hover:text-slate-600 text-xl font-bold">&times;</button>
          </div>

          <div class="p-6 overflow-y-auto space-y-4">
            <!-- 所属学科与考核维度 (Task Category) -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1">所属学科 *</label>
                <select id="modal-exam-subject" onchange="app.handleExamModalSubjectChange(this.value)" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                  ${this.subjects.map(s => `<option value="${this.escapeHtml(s.id)}" ${initialSub && initialSub.id === s.id ? 'selected' : ''}>${this.escapeHtml(s.name)} (${s.curriculum || 'A Level'})</option>`).join('')}
                </select>
              </div>

              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1">所属考核维度 / 项目 *</label>
                <select id="modal-exam-category" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                  ${this.renderExamModalCategoriesHtml(initialSub ? initialSub.id : '', selectedCategory)}
                </select>
              </div>
            </div>

            <!-- 🎯 所属考察单元 (多选支持，可不选) -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <label class="block text-xs font-semibold text-slate-500">
                  考察单元 / Topics (测验选填，日常行为/大项目可不勾选)
                </label>
                <div class="flex items-center gap-2 text-[11px]">
                  <button type="button" onclick="app.selectAllExamModalUnits(true)" class="text-indigo-600 dark:text-indigo-400 font-bold hover:underline">全选</button>
                  <span class="text-slate-300 dark:text-slate-700">|</span>
                  <button type="button" onclick="app.selectAllExamModalUnits(false)" class="text-slate-500 hover:underline">清空</button>
                </div>
              </div>
              <div id="modal-exam-units-box" class="max-h-32 overflow-y-auto p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 space-y-1">
                ${this.renderExamModalUnitsHtml(initialSub, selectedUnitIds)}
              </div>
              <div id="modal-exam-units-tip" class="text-[11px] text-slate-400 font-medium">
                已选 ${selectedUnitIds.length} 个考察单元
              </div>
            </div>

            <!-- 项目/测验名称 -->
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1">项目 / 测验名称 *</label>
              <input type="text" id="modal-exam-title" value="${this.escapeHtml(exam.title || '')}" placeholder="如：Learning Behaviour W8&9、MCQ Test - Units 1-4、Research/Excel Project" class="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
            </div>

            <!-- 考核日期 -->
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1">打分 / 考核日期</label>
              <input type="date" id="modal-exam-date" value="${this.escapeHtml(exam.date)}" class="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
            </div>

            <!-- 🎯 卷面得分与自动换算区 (即时响应！) -->
            <div class="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">打分与等级自动换算</span>
                <span id="modal-exam-scale-tip" class="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                  使用【${initialCurriculum}】打分标准
                </span>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <!-- 原始分输入 -->
                <div class="flex items-end gap-2">
                  <div class="flex-1 min-w-0">
                    <label class="block text-[11px] text-slate-500 mb-1 whitespace-nowrap">原始分 (Raw) *</label>
                    <input type="number" id="modal-exam-score" value="${this.escapeHtml(exam.score !== undefined ? exam.score : '')}" placeholder="如 90" step="0.5" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl text-sm font-bold bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" oninput="app.recalcModalExamScore()" />
                  </div>
                  <span class="text-slate-400 text-lg pb-1.5 font-bold shrink-0">/</span>
                  <div class="flex-1 min-w-0">
                    <label class="block text-[11px] text-slate-500 mb-1 whitespace-nowrap">满分 (Max) *</label>
                    <input type="number" id="modal-exam-max" value="${this.escapeHtml(exam.maxScore !== undefined ? exam.maxScore : 100)}" placeholder="如 100" step="0.5" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl text-sm font-bold bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" oninput="app.recalcModalExamScore()" />
                  </div>
                </div>

                <!-- 自动计算折算结果显示卡 -->
                <div class="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-around shadow-xs">
                  <div class="text-center">
                    <span class="text-[10px] text-slate-400 block">最终有效成绩</span>
                    <strong id="modal-exam-percent-display" class="text-lg font-black text-indigo-600 dark:text-indigo-400 font-mono">${initialPercentText}</strong>
                    <span id="modal-exam-raw-tip" class="block text-[10px] font-medium text-violet-600 dark:text-violet-400">${initialRawTipText}</span>
                  </div>
                  <div class="h-8 w-px bg-slate-200 dark:bg-slate-700"></div>
                  <div class="text-center">
                    <span class="text-[10px] text-slate-400 block">Task Grade</span>
                    <span id="modal-exam-grade-display" class="inline-block px-3 py-0.5 rounded-full text-xs font-black shadow-xs ${initialGradeBadgeClass}">
                      ${initialGradeText}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Curve 后成绩输入（选填） -->
              <div class="pt-2 border-t border-slate-200/80 dark:border-slate-700/80">
                <div class="flex items-center justify-between mb-1">
                  <label class="block text-[11px] font-semibold text-violet-700 dark:text-violet-300">
                    📈 Curve 后成绩 (百分制 %，选填)
                  </label>
                  <span class="text-[10px] text-slate-400">填写后将以此成绩为准计算均分与 Grade</span>
                </div>
                <input type="number" id="modal-exam-curved" value="${this.escapeHtml(exam.curvedScore !== undefined && exam.curvedScore !== null ? exam.curvedScore : '')}" placeholder="留空则按 Raw Score 直接折算，例如 92.5" step="0.1" min="0" max="150" class="w-full px-3 py-2 border border-violet-200 dark:border-violet-800/70 rounded-xl text-sm font-bold bg-white dark:bg-slate-900 text-violet-700 dark:text-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-500" oninput="app.recalcModalExamScore()" />
              </div>
            </div>

            <!-- 复盘与评价 -->
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1">教师评语 / 复盘与错因反思</label>
              <textarea id="modal-exam-note" rows="2" placeholder="记录本次打分教师评语、课堂表现细节或错因反思..." class="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none">${this.escapeHtml(exam.note || '')}</textarea>
            </div>
          </div>

          <div class="px-6 py-3.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3">
            <button onclick="app.closeModal('exam-modal')" class="px-4 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200">取消</button>
            <button onclick="app.saveExam(${this.inlineArg(examId || '')})" class="px-5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm">保存成绩记录</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  // 模态框中切换学科时联动更新考核维度与单元
  handleExamModalSubjectChange(subId) {
    const sub = this.subjects.find(s => s.id === subId);
    if (!sub) return;

    const catEl = document.getElementById('modal-exam-category');
    if (catEl) {
      catEl.innerHTML = this.renderExamModalCategoriesHtml(subId, null);
    }

    const boxEl = document.getElementById('modal-exam-units-box');
    if (boxEl) {
      boxEl.innerHTML = this.renderExamModalUnitsHtml(sub, []);
      this.updateExamModalUnitTip();
    }

    const tipEl = document.getElementById('modal-exam-scale-tip');
    if (tipEl) {
      tipEl.textContent = `使用【${sub.curriculum || 'A Level'}】打分标准`;
    }

    this.recalcModalExamScore();
  }

  // 实时重新计算百分比与 Grade（优先使用 Curve 后成绩）
  recalcModalExamScore() {
    const scoreVal = document.getElementById('modal-exam-score').value;
    const maxVal = document.getElementById('modal-exam-max').value;
    const curvedEl = document.getElementById('modal-exam-curved');
    const curvedVal = curvedEl ? curvedEl.value.trim() : '';
    const percentEl = document.getElementById('modal-exam-percent-display');
    const rawTipEl = document.getElementById('modal-exam-raw-tip');
    const gradeEl = document.getElementById('modal-exam-grade-display');

    const hasRaw = scoreVal !== '' && maxVal !== '' && parseFloat(maxVal) > 0;
    const rawPct = hasRaw ? Math.round((parseFloat(scoreVal) / parseFloat(maxVal)) * 1000) / 10 : null;
    const hasCurved = curvedVal !== '' && !isNaN(parseFloat(curvedVal));
    const effectivePct = hasCurved ? Math.round(parseFloat(curvedVal) * 10) / 10 : rawPct;

    if (effectivePct === null) {
      if (percentEl) percentEl.textContent = '-- %';
      if (rawTipEl) rawTipEl.textContent = '';
      if (gradeEl) {
        gradeEl.textContent = '--';
        gradeEl.className = 'inline-block px-3 py-0.5 rounded-full text-xs font-black shadow-xs bg-slate-200 dark:bg-slate-700 text-slate-500';
      }
      return;
    }

    const subId = document.getElementById('modal-exam-subject').value;
    const sub = this.subjects.find(s => s.id === subId);
    const curriculum = sub ? this.escapeHtml(sub.curriculum || 'A Level') : 'A Level';

    const grade = this.calculateGrade(effectivePct, curriculum);

    if (percentEl) percentEl.textContent = effectivePct + '%';
    if (rawTipEl) {
      rawTipEl.textContent = (hasCurved && rawPct !== null) ? `原始 ${rawPct}% → Curve` : (hasCurved ? '已启用 Curve 成绩' : '');
    }
    if (gradeEl) {
      gradeEl.textContent = 'Grade ' + grade;
      gradeEl.className = `inline-block px-3 py-0.5 rounded-full text-xs font-black shadow-xs ${this.getGradeBadgeStyle(grade)}`;
    }
  }

  async saveExam(examId) {
    const subjectId = document.getElementById('modal-exam-subject').value;
    const category = document.getElementById('modal-exam-category')?.value || 'attainment';
    const catSelect = document.getElementById('modal-exam-category');
    const categoryName = (catSelect && catSelect.selectedIndex >= 0)
      ? catSelect.options[catSelect.selectedIndex].text.split('(')[0].trim()
      : category;

    const unitCheckboxes = document.querySelectorAll('#modal-exam-units-box input[type="checkbox"]:checked');
    const unitIds = Array.from(unitCheckboxes).map(cb => cb.value);
    const unitId = unitIds[0] || '';
    const title = document.getElementById('modal-exam-title').value.trim();
    const date = document.getElementById('modal-exam-date').value;
    const scoreVal = document.getElementById('modal-exam-score').value;
    const maxVal = document.getElementById('modal-exam-max').value;
    const curvedEl = document.getElementById('modal-exam-curved');
    const curvedVal = curvedEl ? curvedEl.value.trim() : '';
    const note = document.getElementById('modal-exam-note').value.trim();
    const isFinal = category.toLowerCase().includes('final');

    if (!title) {
      this.showToast('请输入项目/测验名称！', 'warning');
      return;
    }
    const hasCurved = curvedVal !== '' && !isNaN(parseFloat(curvedVal));
    if (!hasCurved && (scoreVal === '' || maxVal === '' || parseFloat(maxVal) <= 0)) {
      this.showToast('请输入有效的原始分数与总分（或填写 Curve 后成绩）！', 'warning');
      return;
    }

    const maxScore = (maxVal !== '' && parseFloat(maxVal) > 0) ? parseFloat(maxVal) : 100;
    const curvedScore = hasCurved ? Math.round(parseFloat(curvedVal) * 10) / 10 : null;
    const score = scoreVal !== '' ? parseFloat(scoreVal) : (curvedScore !== null ? curvedScore : 0);
    const rawPercentage = maxScore > 0 ? Math.round((score / maxScore) * 1000) / 10 : 0;
    const percentage = curvedScore !== null ? curvedScore : rawPercentage;
    const isCurved = curvedScore !== null;

    const sub = this.subjects.find(s => s.id === subjectId);
    const curriculum = sub ? this.escapeHtml(sub.curriculum || 'A Level') : 'A Level';
    const grade = this.calculateGrade(percentage, curriculum);

    const exam = {
      id: examId || ('exam_' + Date.now()),
      subjectId,
      category,
      categoryName,
      type: categoryName,
      unitId,
      unitIds,
      title,
      date,
      score,
      maxScore,
      rawPercentage,
      curvedScore,
      isCurved,
      percentage,
      grade,
      isFinal,
      note
    };

    try {
      await window.db.saveExam(exam);
      await this.refreshData();
      this.closeModal('exam-modal');
      this.showToast(`成绩记录已保存！所属维度【${categoryName}】，得分率 ${percentage}% (${grade})`, 'success');
      this.render();
    } catch (e) {
      this.showToast('保存成绩失败：' + e.message, 'error');
    }
  }

  async deleteExam(id) {
    if (!confirm('确定要删除这场小考记录吗？关联该考试的错题仍会保留，但考试关联将会解除。')) return;
    try {
      await window.db.deleteExam(id);
      await this.refreshData();
      this.showToast('已删除小考记录', 'info');
      this.render();
    } catch (e) {
      this.showToast('删除失败：' + e.message, 'error');
    }
  }

  // --- 学科管理模态框 ---
  openSubjectModal(subId = null) {
    const isEdit = !!subId;
    const sub = isEdit ? this.subjects.find(s => s.id === subId) : {
      name: '',
      color: '#6366f1',
      curriculum: 'A Level',
      defaultMaxScore: 30
    };

    const colorPalette = ['#6366f1', '#0284c7', '#8b5cf6', '#059669', '#10b981', '#0d9488', '#f59e0b', '#ec4899', '#64748b'];
    const colorsHtml = colorPalette.map(c => `
      <label class="cursor-pointer">
        <input type="radio" name="sub-color" value="${c}" ${sub.color === c ? 'checked' : ''} class="sr-only peer" />
        <span class="w-6 h-6 rounded-full inline-block border-2 border-transparent peer-checked:border-slate-900 dark:peer-checked:border-white transition-all shadow-sm transform peer-checked:scale-110" style="background-color: ${c}"></span>
      </label>
    `).join('');

    const modalHtml = `
      <div id="subject-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
        <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-sm w-full p-6">
          <div class="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-4">
            <h3 class="text-base font-bold text-slate-900 dark:text-slate-100">${isEdit ? '编辑学科属性' : '新建学科'}</h3>
            <button onclick="app.closeModal('subject-modal')" class="text-slate-400 hover:text-slate-600 text-xl font-bold">&times;</button>
          </div>
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-1">学科名称 *</label>
              <input type="text" id="modal-sub-name" value="${this.escapeHtml(sub.name)}" placeholder="如：Maths S1、Physics" class="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1">课程类别 (打分标尺)</label>
                <select id="modal-sub-curr" class="w-full px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                  <option value="A Level" ${sub.curriculum === 'A Level' ? 'selected' : ''}>A Level (A*~U)</option>
                  <option value="CNCC" ${sub.curriculum === 'CNCC' ? 'selected' : ''}>CNCC (A+~F)</option>
                  <option value="Other" ${sub.curriculum === 'Other' ? 'selected' : ''}>其他选修</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1">测验常规参考满分</label>
                <input type="number" id="modal-sub-max" value="${this.escapeHtml(sub.defaultMaxScore || 30)}" class="w-full px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
              </div>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-500 mb-2">标签主题色</label>
              <div class="flex flex-wrap gap-2 items-center">
                ${colorsHtml}
              </div>
            </div>
          </div>
          <div class="flex justify-end gap-3 mt-6 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button onclick="app.closeModal('subject-modal')" class="px-3 py-1.5 rounded-lg text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100">取消</button>
            <button onclick="app.saveSubject(${this.inlineArg(subId || '')})" class="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm">保存学科</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  async saveSubject(subId) {
    const name = document.getElementById('modal-sub-name').value.trim();
    if (!name) {
      this.showToast('请输入学科名称！', 'warning');
      return;
    }
    const colorEl = document.querySelector('input[name="sub-color"]:checked');
    const color = colorEl ? colorEl.value : '#6366f1';
    const curriculum = document.getElementById('modal-sub-curr').value;
    const defaultMaxScore = parseFloat(document.getElementById('modal-sub-max').value) || 30;

    const existing = subId ? this.subjects.find(s => s.id === subId) : null;

    const sub = {
      id: subId || ('sub_' + Date.now()),
      name,
      color,
      curriculum,
      defaultMaxScore,
      units: existing ? (existing.units || []) : [],
      order: existing ? existing.order : (this.subjects.length + 1)
    };

    try {
      await window.db.saveSubject(sub);
      await this.refreshData();
      this.closeModal('subject-modal');
      this.showToast('学科保存成功！', 'success');
      this.render();
    } catch (e) {
      this.showToast('保存学科失败：' + e.message, 'error');
    }
  }

  async deleteSubject(id) {
    if (!confirm('确定删除该学科吗？该学科下的错题和小考仍会保留，但学科关联将解除。')) return;
    try {
      await window.db.deleteSubject(id);
      await this.refreshData();
      this.showToast('已删除学科', 'info');
      this.render();
    } catch (e) {
      this.showToast('删除失败：' + e.message, 'error');
    }
  }

  // --- 全局通用弹窗关闭 ---
  closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.remove();
    if (modalId === 'unit-modal' || modalId === 'subject-modal' || modalId === 'quick-unit-modal') {
      this.render();
    }
  }

  // --- 数据备份与恢复 ---
  async exportBackup() {
    try {
      const data = await window.db.exportAllData();
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `BNDS_错题本备份_${dateStr}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast('备份文件已成功导出！', 'success');
    } catch (e) {
      this.showToast('导出备份失败：' + e.message, 'error');
    }
  }

  async importBackup(fileInput) {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const payload = JSON.parse(e.target.result);
        if (!payload || !payload.data) {
          throw new Error('备份格式不正确');
        }
        if (!confirm('导入备份将清空并覆盖当前设备上的所有现有错题、小考与学科数据，确定继续？')) {
          fileInput.value = '';
          return;
        }
        const res = await window.db.importData(payload, 'overwrite');
        await this.refreshData();
        if (window.cloudSync && window.cloudSync.isLoggedIn()) {
          await window.cloudSync.pushAllLocalToCloud(true);
        }
        this.showToast(`成功覆盖恢复：${res.importedQuestions}道错题、${res.importedExams}场小考！`, 'success');
        this.render();
      } catch (err) {
        console.error(err);
        this.showToast('导入失败：请确认所选文件是规范的错题本 JSON 备份文件', 'error');
      }
      fileInput.value = '';
    };
    reader.readAsText(file);
  }

  async resetToSampleData() {
    if (!confirm('重新载入十一学校国际部 A Level + CNCC 官方题库体系？这将保留现有数据并补充样例，是否继续？')) return;
    for (const sub of window.DEFAULT_SUBJECTS) {
      await window.db.saveSubject(sub);
    }
    for (const exam of window.DEFAULT_EXAMS) {
      await window.db.saveExam(exam);
    }
    for (const q of window.DEFAULT_QUESTIONS) {
      await window.db.saveQuestion(q);
    }
    await this.refreshData();
    this.showToast('十一学校国际部专属题库与单元体系载入成功！', 'success');
    this.render();
  }

  async clearSampleData() {
    if (!confirm('确定要清除所有示例错题与示例小考记录吗？\n（学科结构与单元配置会完整保留，方便你直接录入自己的真实错题与成绩）')) return;
    await window.db.clearQuestionsAndExams();
    await this.refreshData();
    this.showToast('示例错题与小考记录已清空！学科与单元结构已保留', 'success');
    this.render();
  }

  async clearAllData() {
    if (!confirm('⚠️ 警告：这将会清空全部错题、全部小考测验与学科！请确认您已经导出了备份！确定继续清空吗？')) return;
    if (!confirm('再次确认：数据一旦清空将彻底无法挽回，是否执行？')) return;
    await window.db.clearAllData();
    await this.refreshData();
    this.showToast('全部本地数据已清空', 'info');
    this.render();
  }

  // --- Toast 消息弹窗 ---
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const bgMap = {
      success: 'bg-emerald-600 text-white',
      error: 'bg-rose-600 text-white',
      warning: 'bg-amber-500 text-white',
      info: 'bg-slate-800 text-white'
    };

    toast.className = `flex items-center gap-2.5 px-4 py-2.5 rounded-xl shadow-lg text-xs font-semibold transition-all duration-300 transform translate-y-4 opacity-0 ${bgMap[type] || bgMap.info}`;
    toast.textContent = String(message);
    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-4', 'opacity-0');
    });

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  // --- 错题筛选与搜索计算 ---
  getFilteredQuestions() {
    return this.questions.filter(q => {
      if (this.filter.subjectId !== 'all' && q.subjectId !== this.filter.subjectId) return false;
      if (this.filter.unitId !== 'all' && q.unitId !== this.filter.unitId) return false;
      if (this.filter.examId !== 'all' && q.examId !== this.filter.examId) return false;
      if (this.filter.mastery !== 'all' && q.mastery !== parseInt(this.filter.mastery, 10)) return false;
      if (this.filter.reason !== 'all' && (!q.reasons || !q.reasons.includes(this.filter.reason))) return false;
      if (this.filter.search.trim()) {
        const query = this.filter.search.toLowerCase().trim();
        const stripBase64 = (str) => (str || '').replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/gi, '');
        const inTitle = (q.title || '').toLowerCase().includes(query);
        const inPaperCode = (q.paperCode || '').toLowerCase().includes(query);
        const inContent = stripBase64(q.content).toLowerCase().includes(query);
        const inSolution = stripBase64(q.solution).toLowerCase().includes(query);
        const inReasons = (q.reasons || []).some(r => r.toLowerCase().includes(query));
        if (!inTitle && !inPaperCode && !inContent && !inSolution && !inReasons) return false;
      }
      return true;
    }).sort((a, b) => {
      if (this.filter.sortBy === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
      if (this.filter.sortBy === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
      if (this.filter.sortBy === 'mastery') return a.mastery - b.mastery;
      if (this.filter.sortBy === 'difficulty') return (b.difficulty || 0) - (a.difficulty || 0);
      return 0;
    });
  }

  // --- 核心渲染驱动 ---
  render() {
    this.renderHeader();
    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    switch (this.currentTab) {
      case 'questions':
        mainContent.innerHTML = this.renderQuestionsTab();
        this.bindQuestionsTabEvents();
        break;
      case 'add':
        mainContent.innerHTML = this.renderAddTab();
        this.bindAddTabEvents();
        break;
      case 'exams':
        mainContent.innerHTML = this.renderExamsTab();
        this.renderExamsCharts();
        break;
      case 'practice':
        mainContent.innerHTML = this.renderPracticeTab();
        this.bindPracticeTabEvents();
        break;
      case 'subjects':
        mainContent.innerHTML = this.renderSubjectsTab();
        break;
      case 'settings':
        mainContent.innerHTML = this.renderSettingsTab();
        break;
      default:
        break;
    }
  }

  renderHeader() {
    const navItems = [
      { id: 'questions', label: '错题库', icon: '📚', count: this.questions.length },
      { id: 'add', label: this.editingQuestionId ? '编辑错题' : '录入错题', icon: '✍️' },
      { id: 'exams', label: '成绩与图表', icon: '📈', count: this.exams.length },
      { id: 'practice', label: '单元组卷', icon: '📑', count: window.practicePaperEngine.getSelectedCount() },
      { id: 'subjects', label: '学科单元', icon: '🏷️' },
      { id: 'settings', label: '备份设置', icon: '⚙️' }
    ];

    const navHtml = navItems.map(item => `
      <button onclick="app.switchTab('${item.id}')" class="whitespace-nowrap shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
        this.currentTab === item.id 
          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20' 
          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
      }">
        <span>${item.icon}</span>
        <span class="whitespace-nowrap">${item.label}</span>
        ${item.count !== undefined && item.count > 0 ? `<span class="px-1.5 py-0.2 rounded-full text-[10px] whitespace-nowrap ${this.currentTab === item.id ? 'bg-white/25 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}">${item.count}</span>` : ''}
      </button>
    `).join('');

    const topNav = document.getElementById('top-nav-items');
    if (topNav) topNav.innerHTML = navHtml;

    const mobileNavItems = [
      { id: 'questions', label: '错题', icon: '📚', count: this.questions.length },
      { id: 'exams', label: '成绩', icon: '📊', count: this.exams.length },
      { id: 'practice', label: '组卷', icon: '📑', count: window.practicePaperEngine.getSelectedCount() },
      { id: 'subjects', label: '学科', icon: '🏷️' },
      { id: 'settings', label: '备份', icon: '⚙️' }
    ];
    const mobileNavHtml = mobileNavItems.map(item => `
      <button onclick="app.switchTab('${item.id}')" class="whitespace-nowrap shrink-0 flex items-center justify-center gap-1 px-2.5 py-1.5 min-h-[38px] rounded-xl text-xs font-semibold transition-all ${
        this.currentTab === item.id
          ? 'bg-indigo-600 text-white shadow-xs'
          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
      }">
        <span>${item.icon}</span>
        <span>${item.label}</span>
        ${item.count !== undefined && item.count > 0 ? `<span class="px-1.5 py-0.2 rounded-full text-[10px] ${this.currentTab === item.id ? 'bg-white/25 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}">${item.count}</span>` : ''}
      </button>
    `).join('');
    const mobileNav = document.getElementById('mobile-nav-items');
    if (mobileNav) mobileNav.innerHTML = mobileNavHtml;

    const fontCtrlEl = document.getElementById('header-font-size-control');
    if (fontCtrlEl) {
      const curSize = this.questionFontSize || 'medium';
      const sizes = [
        { id: 'normal', label: '标准', title: '标准字号 (15px)' },
        { id: 'medium', label: '适中', title: '适中大字 (17px)' },
        { id: 'large', label: '特大', title: '清晰特大 (19px)' }
      ];
      fontCtrlEl.innerHTML = `
        <div class="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200/80 dark:border-slate-700 text-xs" title="调节题目字号">
          <span class="hidden md:inline text-[11px] text-slate-400 font-medium px-1.5">字号</span>
          ${sizes.map(sz => `
            <button type="button" onclick="app.setQuestionFontSize('${sz.id}')" title="${sz.title}" class="px-1.5 sm:px-2 py-1 rounded-lg text-[11px] sm:text-xs transition cursor-pointer ${curSize === sz.id ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 font-bold shadow-2xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}">${sz.label}</button>
          `).join('')}
        </div>
      `;
    }

    const syncPillEl = document.getElementById('cloud-sync-pill');
    if (syncPillEl && window.cloudSync) {
      const s = window.cloudSync.getStatusSummary();
      if (!s.loggedIn) {
        syncPillEl.innerHTML = `<button type="button" onclick="app.switchTab('settings')" class="px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-xl text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-700 transition" title="登录账号以开启多设备云同步">☁️ 未登录</button>`;
      } else if (s.syncStatus === 'syncing') {
        syncPillEl.innerHTML = `<button type="button" disabled class="px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-xl text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 animate-pulse">☁️ 同步中...</button>`;
      } else if (s.syncStatus === 'error') {
        syncPillEl.innerHTML = `<button type="button" onclick="app.cloudSyncNow()" class="px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-xl text-[11px] font-semibold bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-300 hover:bg-rose-100 transition" title="${this.escapeHtml(s.lastError || '同步出错，点击重试')}">☁️ 同步失败</button>`;
      } else {
        syncPillEl.innerHTML = `<button type="button" onclick="app.cloudSyncNow()" class="px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-xl text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition" title="点击立即双向同步 (${this.escapeHtml(s.email)})">☁️ 已同步</button>`;
      }
    }
  }

  // --- 模块 1：错题库视图 ---
  renderQuestionsTab() {
    const filtered = this.getFilteredQuestions();
    const subMap = new Map(this.subjects.map(s => [s.id, s]));
    const examMap = new Map(this.exams.map(e => [e.id, e]));

    const unitNameMap = new Map();
    this.subjects.forEach(s => {
      (s.units || []).forEach(u => unitNameMap.set(u.id, u.name));
    });

    const totalCount = this.questions.length;
    const needWorkCount = this.questions.filter(q => q.mastery === 0).length;
    const learningCount = this.questions.filter(q => q.mastery === 1).length;
    const masteredCount = this.questions.filter(q => q.mastery === 2).length;

    const subFilterHtml = `
      <button onclick="app.setFilter('subjectId', 'all'); app.setFilter('unitId', 'all');" class="px-3 py-1.5 rounded-lg text-xs font-semibold transition ${this.filter.subjectId === 'all' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}">
        全部学科 (${totalCount})
      </button>
      ${this.subjects.map(s => {
        const count = this.questions.filter(q => q.subjectId === s.id).length;
        const isActive = this.filter.subjectId === s.id;
        return `
          <button onclick="app.setFilter('subjectId', ${this.inlineArg(s.id)}); app.setFilter('unitId', 'all');" class="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${isActive ? 'text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}" style="${isActive ? `background-color: ${this.safeColor(s.color)}` : ''}">
            <span class="w-2 h-2 rounded-full" style="background-color: ${this.safeColor(s.color)}"></span>
            ${this.escapeHtml(s.name)} (${count})
          </button>
        `;
      }).join('')}
    `;

    return `
      <div class="space-y-6">
        <!-- 统计看板 -->
        <div class="grid grid-cols-2 gap-4">
          <div class="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 flex items-center justify-center text-xl">📚</div>
            <div>
              <div class="text-xs text-slate-500 font-medium">总错题量</div>
              <div class="text-2xl font-black text-slate-900 dark:text-slate-100">${totalCount}</div>
            </div>
          </div>
          <div class="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center text-xl">📑</div>
            <div>
              <div class="text-xs text-slate-500 font-medium">已选重练</div>
              <div class="text-2xl font-black text-emerald-600">${window.practicePaperEngine.getSelectedCount()}</div>
            </div>
          </div>
        </div>

        <!-- 筛选栏 -->
        <div class="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div class="flex flex-wrap items-center gap-2">
            ${subFilterHtml}
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
            <div class="flex flex-wrap items-center gap-2.5">
              ${this.renderFilterUnitDropdownHtml(unitNameMap)}
              ${this.renderFilterExamDropdownHtml(examMap, subMap)}

              <select onchange="app.setFilter('sortBy', this.value)" class="px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none">
                <option value="newest" ${this.filter.sortBy === 'newest' ? 'selected' : ''}>最新录入</option>
                <option value="oldest" ${this.filter.sortBy === 'oldest' ? 'selected' : ''}>最早录入</option>
              </select>
            </div>

            <div class="relative w-full sm:w-64">
              <input type="text" id="question-search-input" value="${this.escapeHtml(this.filter.search || '')}" placeholder="搜索题目、考点、真题号 (如 W24-52-3)..." class="w-full pl-8 pr-7 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
              <span class="absolute left-2.5 top-2 text-slate-400">🔍</span>
              <button id="question-search-clear-btn" onclick="app.clearQuestionSearch()" title="清空搜索" class="${this.filter.search ? '' : 'hidden'} absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm px-1">×</button>
            </div>
          </div>
        </div>

        <!-- 错题卡片流 (支持多档字号动态缩放) -->
        <div id="questions-list-container" class="space-y-4 q-font-${this.questionFontSize || 'medium'}">
          ${this.getQuestionsCardsHtml()}
        </div>
      </div>
    `;
  }

  // 渲染首页「单元筛选」紧凑可搜索下拉菜单 (避免原生 select 过长遮挡屏幕)
  renderFilterUnitDropdownHtml(unitNameMap) {
    const selectedUnitLabel = this.filter.unitId === 'all'
      ? '所有单元 / Topics'
      : (unitNameMap.get(this.filter.unitId) || '未知单元');

    const targetSubjects = this.filter.subjectId === 'all'
      ? this.subjects
      : this.subjects.filter(s => s.id === this.filter.subjectId);

    const seenUnitIds = new Set();
    let unitItemsHtml = '';

    targetSubjects.forEach(s => {
      const units = (s.units || []).filter(u => {
        if (seenUnitIds.has(u.id)) return false;
        seenUnitIds.add(u.id);
        return true;
      });
      if (units.length === 0) return;

      if (this.filter.subjectId === 'all') {
        unitItemsHtml += `
          <div class="dropdown-group-header px-2.5 pt-2 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full" style="background-color: ${this.safeColor(s.color)}"></span>
            <span>${this.escapeHtml(s.name)}</span>
          </div>
        `;
      }

      units.forEach(u => {
        const uCount = this.questions.filter(q => q.subjectId === s.id && q.unitId === u.id).length;
        const isSelected = this.filter.unitId === u.id;
        const searchStr = `${this.escapeHtml(s.name)} ${this.escapeHtml(u.name)}`.toLowerCase().replace(/"/g, '&quot;');
        unitItemsHtml += `
          <button type="button" data-search-text="${searchStr}" onclick="app.selectFilterDropdown('unitId', ${this.inlineArg(u.id)})" class="dropdown-item w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between gap-2 transition ${isSelected ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold' : (uCount === 0 ? 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800')}">
            <span class="truncate">${this.escapeHtml(u.name)}</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${isSelected ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300' : (uCount > 0 ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold' : 'text-slate-400')}">${uCount}</span>
          </button>
        `;
      });
    });

    return `
      <div class="relative custom-dropdown-container">
        <button type="button" onclick="app.toggleDropdown('filter-unit')" class="flex items-center justify-between gap-2 px-2.5 py-1.5 border ${this.filter.unitId !== 'all' ? 'border-indigo-400 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300'} rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/70 transition max-w-[230px]">
          <span class="truncate">${this.escapeHtml(selectedUnitLabel)}</span>
          <span class="text-[10px] text-slate-400 shrink-0">▾</span>
        </button>
        <div data-dropdown-menu="filter-unit" class="custom-dropdown-menu hidden absolute left-0 mt-1.5 w-[min(20rem,calc(100vw-2rem))] sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-40 overflow-hidden">
          <div class="p-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50">
            <input type="text" oninput="app.filterDropdownList('filter-unit', this.value)" placeholder="🔍 搜索单元名称..." class="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div class="max-h-64 overflow-y-auto p-1.5 space-y-0.5">
            <button type="button" onclick="app.selectFilterDropdown('unitId', 'all')" class="w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition ${this.filter.unitId === 'all' ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}">
              <span>所有单元 / Topics</span>
              ${this.filter.unitId === 'all' ? '<span>✓</span>' : ''}
            </button>
            ${unitItemsHtml}
          </div>
        </div>
      </div>
    `;
  }

  // 渲染首页「小考/测验筛选」紧凑可搜索下拉菜单
  renderFilterExamDropdownHtml(examMap, subMap) {
    const selectedExam = this.filter.examId !== 'all' ? examMap.get(this.filter.examId) : null;
    const selectedExamLabel = selectedExam ? `${selectedExam.title} ${selectedExam.grade ? `(${selectedExam.grade})` : ''}` : '所有小考/测验';

    const targetExams = this.exams
      .filter(e => this.filter.subjectId === 'all' || e.subjectId === this.filter.subjectId)
      .slice()
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    const examItemsHtml = targetExams.map(e => {
      const sub = subMap.get(e.subjectId);
      const isSelected = this.filter.examId === e.id;
      const searchStr = this.escapeHtml(`${sub ? sub.name : ''} ${e.title || ''} ${e.date || ''}`.toLowerCase());
      return `
        <button type="button" data-search-text="${searchStr}" onclick="app.selectFilterDropdown('examId', ${this.inlineArg(e.id)})" class="dropdown-item w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between gap-2 transition ${isSelected ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'}">
          <div class="flex items-center gap-1.5 min-w-0">
            ${sub ? `<span class="w-1.5 h-1.5 rounded-full shrink-0" style="background-color: ${this.safeColor(sub.color)}"></span>` : ''}
            <span class="truncate">${this.escapeHtml(e.title)}</span>
          </div>
          <div class="flex items-center gap-1.5 shrink-0 text-[10px]">
            ${e.date ? `<span class="text-slate-400">${this.escapeHtml(e.date.slice(5))}</span>` : ''}
            ${e.grade ? `<span class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-bold text-slate-600 dark:text-slate-300">${this.escapeHtml(e.grade)}</span>` : ''}
          </div>
        </button>
      `;
    }).join('');

    return `
      <div class="relative custom-dropdown-container">
        <button type="button" onclick="app.toggleDropdown('filter-exam')" class="flex items-center justify-between gap-2 px-2.5 py-1.5 border ${this.filter.examId !== 'all' ? 'border-indigo-400 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300'} rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/70 transition max-w-[220px]">
          <span class="truncate">${this.escapeHtml(selectedExamLabel)}</span>
          <span class="text-[10px] text-slate-400 shrink-0">▾</span>
        </button>
        <div data-dropdown-menu="filter-exam" class="custom-dropdown-menu hidden absolute left-0 mt-1.5 w-[min(20rem,calc(100vw-2rem))] sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-40 overflow-hidden">
          <div class="p-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50">
            <input type="text" oninput="app.filterDropdownList('filter-exam', this.value)" placeholder="🔍 搜索测验名称或日期..." class="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div class="max-h-64 overflow-y-auto p-1.5 space-y-0.5">
            <button type="button" onclick="app.selectFilterDropdown('examId', 'all')" class="w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition ${this.filter.examId === 'all' ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}">
              <span>所有小考/测验</span>
              ${this.filter.examId === 'all' ? '<span>✓</span>' : ''}
            </button>
            ${examItemsHtml || '<div class="text-center py-4 text-xs text-slate-400">暂无小考/测验记录</div>'}
          </div>
        </div>
      </div>
    `;
  }

  selectFilterDropdown(key, value) {
    this.openDropdown = null;
    this.setFilter(key, value);
  }

  filterDropdownList(menuName, query) {
    const menu = document.querySelector(`[data-dropdown-menu="${menuName}"]`);
    if (!menu) return;
    const q = (query || '').trim().toLowerCase();
    menu.querySelectorAll('.dropdown-item').forEach(item => {
      const text = item.getAttribute('data-search-text') || '';
      item.style.display = (!q || text.includes(q)) ? '' : 'none';
    });
    menu.querySelectorAll('.dropdown-group-header').forEach(header => {
      header.style.display = q ? 'none' : '';
    });
  }

  getQuestionsCardsHtml() {
    const filtered = this.getFilteredQuestions();
    const subMap = new Map(this.subjects.map(s => [s.id, s]));
    const examMap = new Map(this.exams.map(e => [e.id, e]));

    const unitNameMap = new Map();
    this.subjects.forEach(s => {
      (s.units || []).forEach(u => unitNameMap.set(u.id, u.name));
    });

    if (filtered.length === 0) {
      return `
        <div class="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8">
          <div class="text-5xl mb-3">🔍</div>
          <h4 class="text-base font-bold text-slate-800 dark:text-slate-200">没有找到匹配的错题</h4>
          <p class="text-xs text-slate-500 mt-1">尝试调整上方学科、单元或搜索关键词，或者点击右上角“录入错题”开始记录！</p>
        </div>
      `;
    }
    return filtered.map((q) => {
        const sub = subMap.get(q.subjectId);
        const exam = examMap.get(q.examId);
        const unitName = unitNameMap.get(q.unitId);
        const isSelectedForPractice = window.practicePaperEngine.selectedQuestionIds.has(q.id);
        const isSolutionExpanded = this.expandedSolutionIds.has(q.id);

        const masteryLabels = [
          { label: '🔴 待攻克', bg: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-800' },
          { label: '🟡 巩固中', bg: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800' },
          { label: '🟢 已攻克', bg: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' }
        ];
        const currentMastery = masteryLabels[q.mastery] || masteryLabels[0];

        const isMcq = q.questionType === 'multiple_choice';
        const hasParts = q.parts && q.parts.length > 0;
        const wrongParts = hasParts ? q.parts.filter(p => p.isWrong) : [];

        // 渲染正文内容
        let questionBodyHtml = '';
        if (isMcq && q.options) {
          const isMulti = q.mcqType === 'multiple';
          const correctList = q.correctOptions || (q.correctOption ? q.correctOption.split(',').map(s => s.trim()) : ['A']);
          const myList = q.myOptions || (q.myOption ? q.myOption.split(',').map(s => s.trim()) : []);
          const optKeys = (q.mcqOptionsList && q.mcqOptionsList.length > 0)
            ? q.mcqOptionsList.map(o => o.key)
            : Object.keys(q.options);

          const stemHtml = q.stem ? `<div class="mb-3 font-medium text-slate-800 dark:text-slate-200 markdown-body question-stem-text">${window.markdownRenderer.render(q.stem)}</div>` : '';
          const optionsHtml = optKeys.map(l => {
            const isCorrect = isSolutionExpanded && correctList.includes(l);
            const isMy = isSolutionExpanded && myList.includes(l);
            let cardStyle = 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-slate-800 dark:text-slate-200';
            if (isCorrect) {
              cardStyle = 'border-emerald-400 dark:border-emerald-700 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200 font-bold';
            } else if (isMy) {
              cardStyle = 'border-rose-300 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200';
            }
            return `
              <div class="p-3 rounded-xl border ${cardStyle} flex items-center gap-2.5">
                <span class="w-6 h-6 rounded-md font-mono font-bold text-xs flex items-center justify-center shrink-0 ${isCorrect ? 'bg-emerald-600 text-white' : (isMy ? 'bg-rose-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200')}">${this.escapeHtml(l)}</span>
                <div class="flex-1 min-w-0 markdown-body question-option-text leading-snug">
                  ${window.markdownRenderer.render(q.options[l] || '')}
                </div>
                ${isCorrect ? '<span class="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0">✓ 正确答案</span>' : ''}
                ${isMy ? '<span class="text-[10px] font-bold text-rose-500 shrink-0">✕ 当时错选</span>' : ''}
              </div>
            `;
          }).join('');

          questionBodyHtml = `
            <div class="flex items-center gap-2 mb-2">
              <span class="px-2 py-0.5 rounded text-[10px] font-bold ${isMulti ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300' : 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'}">
                ${isMulti ? '☑️ 多项 / 不定项选择题' : '🔘 单项选择题'}
              </span>
              <span class="text-[11px] text-slate-400 font-mono">共 ${optKeys.length} 个选项</span>
            </div>
            ${stemHtml}
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
              ${optionsHtml}
            </div>
          `;
        } else if (hasParts) {
          const stemHtml = q.stem ? `<div class="mb-3 text-slate-800 dark:text-slate-200 font-medium question-stem-text">${window.markdownRenderer.render(q.stem)}</div>` : '';
          const partsHtml = q.parts.map(p => `
            <div class="p-3.5 rounded-xl border ${p.isWrong ? 'border-rose-300 dark:border-rose-900/60 bg-rose-50/30 dark:bg-rose-950/20' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'} space-y-1.5 my-2">
              <div class="flex items-center justify-between text-xs">
                <div class="flex items-center gap-2">
                  <strong class="font-mono text-base ${p.isWrong ? 'text-rose-600 dark:text-rose-400 font-black' : 'text-slate-800 dark:text-slate-200'}">${this.escapeHtml(p.label || '(a)')}</strong>
                  ${p.marks ? `<span class="text-slate-400 font-mono text-xs">[${this.escapeHtml(p.marks)}]</span>` : ''}
                </div>
                ${p.isWrong ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500 text-white">⚠️ 本问失分 (需重点突破)</span>' : '<span class="text-[10px] text-slate-400">✅ 本问答对 / 略过</span>'}
              </div>
              <div class="markdown-body question-part-text text-slate-800 dark:text-slate-200 pl-1 leading-relaxed">
                ${window.markdownRenderer.render(p.text || '*无独立小问题干*')}
              </div>
            </div>
            ${(p.afterText && p.afterText.trim()) ? `
              <div class="my-2 px-4 py-2.5 rounded-xl bg-slate-50/90 dark:bg-slate-800/50 border-l-4 border-indigo-400 dark:border-indigo-500 text-slate-800 dark:text-slate-200 leading-relaxed markdown-body question-part-text">
                ${window.markdownRenderer.render(p.afterText)}
              </div>
            ` : ''}
          `).join('');

          questionBodyHtml = `${stemHtml}${partsHtml}`;
        } else {
          questionBodyHtml = `<div class="markdown-body question-content-text text-slate-800 dark:text-slate-200 leading-relaxed">${window.markdownRenderer.render(q.content)}</div>`;
        }

        const renderedSolution = window.markdownRenderer.render(q.solution || '*暂未录入题解*');

        return `
          <div class="card-hover bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden p-4 sm:p-6 transition">
            <!-- 头部元信息 -->
            <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div class="flex flex-wrap items-center gap-2">
                <label class="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-500 hover:text-indigo-600 mr-1.5">
                  <input type="checkbox" ${isSelectedForPractice ? 'checked' : ''} onchange="app.togglePracticeQuestion(${this.inlineArg(q.id)})" class="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
                  <span>加入重练</span>
                </label>

                ${sub ? `
                  <span class="px-2.5 py-0.5 rounded-md text-xs font-bold text-white shadow-xs" style="background-color: ${this.safeColor(sub.color)}">
                    ${this.escapeHtml(sub.name)}
                  </span>
                ` : `
                  <select onchange="app.reassignQuestionSubject(${this.inlineArg(q.id)}, this.value)" class="text-xs border border-amber-300 bg-amber-50 dark:bg-amber-950/50 rounded-lg px-2 py-0.5 text-amber-800 dark:text-amber-200 font-bold focus:outline-none">
                    <option value="">⚠️ 点击指定学科...</option>
                    ${this.subjects.map(s => `<option value="${this.escapeHtml(s.id)}">${this.escapeHtml(s.name)}</option>`).join('')}
                  </select>
                `}

                ${unitName ? `<span class="px-2.5 py-0.5 rounded-md text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">📖 ${this.escapeHtml(unitName)}</span>` : ''}

                ${q.paperCode ? `
                  <span class="px-2 py-0.5 rounded-md text-xs font-mono font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-300/60 dark:border-amber-700/60 flex items-center gap-1 shadow-2xs" title="CIE 官方真题考卷与题号">
                    <span>🏷️</span>
                    <span>${this.escapeHtml(q.paperCode)}</span>
                  </span>
                ` : ''}

                <!-- 题型徽章与小问状态 -->
                ${isMcq ? `
                  <span class="px-2 py-0.5 rounded-md text-xs font-bold bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border border-purple-200/50">🔘 单选题</span>
                  ${isSolutionExpanded && q.myOption ? `<span class="px-2 py-0.5 rounded-md text-xs font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-600 border border-rose-200/50">错选: ${this.escapeHtml(q.myOption)}</span>` : ''}
                  ${isSolutionExpanded && q.correctOption ? `<span class="px-2 py-0.5 rounded-md text-xs font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 border border-emerald-200/50">正解: ${this.escapeHtml(q.correctOption)}</span>` : ''}
                ` : (hasParts ? `
                  <span class="px-2 py-0.5 rounded-md text-xs font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 border border-indigo-200/50">📋 复合大题 (${q.parts.length}问)</span>
                  ${wrongParts.length > 0 ? `<span class="px-2 py-0.5 rounded-md text-xs font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-600 border border-rose-200/50">错在: ${this.escapeHtml(wrongParts.map(p => p.label).join('、'))}</span>` : ''}
                ` : '')}

                ${exam ? `
                  <span class="text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <span>来源：${this.escapeHtml(exam.title)}</span>
                    ${exam.grade ? `<span class="font-bold text-indigo-600">(${this.escapeHtml(exam.grade)})</span>` : ''}
                  </span>
                ` : ''}
              </div>

              <div class="flex items-center gap-2 text-xs shrink-0 whitespace-nowrap">
                <span class="text-slate-400 font-mono text-[11px]">${new Date(q.createdAt).toLocaleDateString('zh-CN')}</span>
                <button onclick="app.editQuestion(${this.inlineArg(q.id)})" class="whitespace-nowrap px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-700 transition font-medium">编辑</button>
                <button onclick="app.deleteQuestion(${this.inlineArg(q.id)})" class="whitespace-nowrap px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 transition">删除</button>
              </div>
            </div>

            <!-- 错题标题与错因 -->
            <div class="my-3">
              ${q.title ? `<h3 class="text-base font-bold text-slate-900 dark:text-slate-100 mb-2">${this.escapeHtml(q.title)}</h3>` : ''}
              ${q.reasons && q.reasons.length > 0 ? `
                <div class="flex flex-wrap gap-1.5 mb-2">
                  ${q.reasons.map(r => `<span class="px-2 py-0.5 text-[11px] font-medium rounded bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 border border-rose-200/60 dark:border-rose-900/60">⚠️ ${this.escapeHtml(r)}</span>`).join('')}
                </div>
              ` : ''}
            </div>

            <!-- 题目正文 (富文本/选择题卡片/分小问卡片) -->
            <div class="text-slate-800 dark:text-slate-200 text-sm leading-relaxed my-3 bg-slate-50/60 dark:bg-slate-950/40 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80">
              ${questionBodyHtml}
            </div>

            <!-- 题解折叠展示 -->
            <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <button onclick="app.toggleSolutionExpand(${this.inlineArg(q.id)})" class="flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
                  <span>${isSolutionExpanded ? '▼ 收起参考题解 (Mark Scheme)' : '▶ 查看参考题解与考点解析 (Mark Scheme)'}</span>
                </button>
                <div class="text-[11px] text-slate-400">重做复习: ${q.reviewCount || 1}次</div>
              </div>

              ${isSolutionExpanded ? `
                <div class="mt-2 p-4 rounded-xl bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50 text-slate-800 dark:text-slate-200 text-sm leading-relaxed animate-fade-in">
                  <div class="text-xs font-bold uppercase tracking-wider text-indigo-500 mb-2">【标准解析与 Mark Scheme】</div>
                  <div class="markdown-body question-solution-text">${renderedSolution}</div>
                  ${q.solutionNote && q.solutionNote.trim() ? `
                    <div class="mt-3 p-3.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60">
                      <div class="text-xs font-bold text-amber-800 dark:text-amber-300 mb-1 flex items-center gap-1.5">
                        <span>💡</span><span>思路点拨与解题备注（为什么要这样写）</span>
                      </div>
                      <div class="markdown-body question-solution-text text-slate-800 dark:text-slate-200 text-xs sm:text-sm leading-relaxed">${window.markdownRenderer.render(q.solutionNote)}</div>
                    </div>
                  ` : ''}
                </div>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');
  }

  bindQuestionsTabEvents() {
    const searchInput = document.getElementById('question-search-input');
    if (searchInput) {
      let isComposing = false;
      searchInput.addEventListener('compositionstart', () => {
        isComposing = true;
      });
      searchInput.addEventListener('compositionend', (e) => {
        isComposing = false;
        this.filter.search = e.target.value;
        clearTimeout(this._searchTimer);
        this.updateQuestionsListOnly();
      });
      searchInput.addEventListener('input', (e) => {
        this.filter.search = e.target.value;
        const clearBtn = document.getElementById('question-search-clear-btn');
        if (clearBtn) clearBtn.classList.toggle('hidden', !this.filter.search);
        if (isComposing) return;
        clearTimeout(this._searchTimer);
        this._searchTimer = setTimeout(() => this.updateQuestionsListOnly(), 150);
      });
    }
  }

  updateQuestionsListOnly() {
    const container = document.getElementById('questions-list-container');
    if (container) {
      container.innerHTML = this.getQuestionsCardsHtml();
    }
    const clearBtn = document.getElementById('question-search-clear-btn');
    if (clearBtn) {
      clearBtn.classList.toggle('hidden', !this.filter.search);
    }
  }

  clearQuestionSearch() {
    this.filter.search = '';
    const input = document.getElementById('question-search-input');
    if (input) {
      input.value = '';
      input.focus();
    }
    this.updateQuestionsListOnly();
  }

  setFilter(key, value) {
    this.filter[key] = value;
    this.render();
  }

  setQuestionFontSize(size) {
    this.questionFontSize = size;
    localStorage.setItem('question_font_size', size);
    this.renderHeader();
    this.render();
  }

  togglePracticeQuestion(id) {
    window.practicePaperEngine.toggleSelect(id);
    this.renderHeader();
  }

  // --- 模块 2：错题录入 / 编辑视图 ---
  renderAddTab() {
    const isEdit = !!this.editingQuestionId;
    
    if (!this.form.subjectId && this.subjects.length > 0) {
      const defaultSub = this.subjects.find(s => !s.isParent) || this.subjects[0];
      this.form.subjectId = defaultSub.id;
    }

    // 学科选择：按 A Level 与 CNCC 课程分类
    const alSubjects = this.subjects.filter(s => s.curriculum === 'A Level');
    const cnccSubjects = this.subjects.filter(s => s.curriculum === 'CNCC');
    const otherSubjects = this.subjects.filter(s => s.curriculum !== 'A Level' && s.curriculum !== 'CNCC');

    let subOptions = '';
    if (alSubjects.length > 0) {
      subOptions += `<optgroup label="📐 A Level 学科">`;
      alSubjects.forEach(s => {
        subOptions += `<option value="${this.escapeHtml(s.id)}" ${this.form.subjectId === s.id ? 'selected' : ''}>${this.escapeHtml(s.name)} ${s.chineseName ? `(${this.escapeHtml(s.chineseName)})` : ''}</option>`;
      });
      subOptions += `</optgroup>`;
    }
    if (cnccSubjects.length > 0) {
      subOptions += `<optgroup label="🔬 CNCC 国家课程学科">`;
      cnccSubjects.forEach(s => {
        subOptions += `<option value="${this.escapeHtml(s.id)}" ${this.form.subjectId === s.id ? 'selected' : ''}>${this.escapeHtml(s.name)}</option>`;
      });
      subOptions += `</optgroup>`;
    }
    if (otherSubjects.length > 0) {
      subOptions += `<optgroup label="🌐 其他学科">`;
      otherSubjects.forEach(s => {
        subOptions += `<option value="${this.escapeHtml(s.id)}" ${this.form.subjectId === s.id ? 'selected' : ''}>${this.escapeHtml(s.name)}</option>`;
      });
      subOptions += `</optgroup>`;
    }

    const currentSub = this.subjects.find(s => s.id === this.form.subjectId) || this.subjects[0];
    const unitOptions = (currentSub && currentSub.units && currentSub.units.length > 0) 
      ? currentSub.units.map(u => `<option value="${this.escapeHtml(u.id)}" ${this.form.unitId === u.id ? 'selected' : ''}>${this.escapeHtml(u.name)}</option>`).join('')
      : '<option value="">暂无预置单元 (请点击右侧新建单元)</option>';

    // 联动过滤：只列出属于该学科的历次小考
    const filteredExams = this.exams.filter(e => !currentSub || e.subjectId === currentSub.id);
    const examOptions = `
      <option value="">不关联特定小考（日常练习/Past Paper/作业）</option>
      ${filteredExams.map(e => `
        <option value="${this.escapeHtml(e.id)}" ${this.form.examId === e.id ? 'selected' : ''}>${this.escapeHtml(e.title)} (${this.escapeHtml(e.date)}) [${this.escapeHtml(e.score)}/${this.escapeHtml(e.maxScore)}分 ${this.escapeHtml(e.grade || '')}]</option>
      `).join('')}
    `;

    const isMcq = this.form.questionType === 'multiple_choice';
    const isMultiPart = !isMcq && (this.form.structuredMode === 'multi_part');
    const isMultiMcq = isMcq && this.form.mcqType === 'multiple';

    // 选择题选项区 HTML (支持动态选项列表与单选/多选)
    const mcqOptionsList = this.form.optionsList || [
      { key: 'A', text: '' }, { key: 'B', text: '' }, { key: 'C', text: '' }, { key: 'D', text: '' }
    ];
    const correctKeys = this.form.correctOptions || (this.form.correctOption ? this.form.correctOption.split(',').map(s => s.trim()) : ['A']);
    const myKeys = this.form.myOptions || (this.form.myOption ? this.form.myOption.split(',').map(s => s.trim()) : []);

    const mcqOptionsHtml = mcqOptionsList.map((item, idx) => {
      const letter = item.key;
      const isCorrect = correctKeys.includes(letter);
      const isMy = myKeys.includes(letter);
      const canDelete = mcqOptionsList.length > 2;

      return `
        <div class="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border ${isCorrect ? 'border-emerald-400 dark:border-emerald-700 bg-emerald-50/40' : (isMy ? 'border-rose-300 dark:border-rose-800 bg-rose-50/40' : 'border-slate-200 dark:border-slate-700')} space-y-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <span class="w-6 h-6 rounded-full ${isCorrect ? 'bg-emerald-600 text-white' : (isMy ? 'bg-rose-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200')} font-bold font-mono text-xs flex items-center justify-center">${this.escapeHtml(letter)}</span>
              <span class="text-xs font-bold text-slate-700 dark:text-slate-300">选项 ${this.escapeHtml(letter)}</span>
            </div>
            <div class="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
              <label class="cursor-pointer flex items-center gap-1 font-semibold ${isCorrect ? 'text-emerald-600 font-bold' : 'text-slate-500 hover:text-slate-700'}">
                <input type="${isMultiMcq ? 'checkbox' : 'radio'}" name="mcq-correct" value="${this.escapeHtml(letter)}" ${isCorrect ? 'checked' : ''} onchange="app.toggleMcqCorrectOption(${this.inlineArg(letter)})" class="rounded text-emerald-600 focus:ring-emerald-500" />
                <span>设为正确答案</span>
              </label>
              <label class="cursor-pointer flex items-center gap-1 font-semibold ${isMy ? 'text-rose-600 font-bold' : 'text-slate-400 hover:text-slate-600'}">
                <input type="${isMultiMcq ? 'checkbox' : 'radio'}" name="mcq-my" value="${this.escapeHtml(letter)}" ${isMy ? 'checked' : ''} onchange="app.toggleMcqMyOption(${this.inlineArg(letter)})" class="rounded text-rose-500 focus:ring-rose-500" />
                <span>我当时错选</span>
              </label>
              ${canDelete ? `
                <button type="button" onclick="app.removeMcqOption(${idx})" class="text-slate-400 hover:text-rose-500 p-0.5 text-xs font-bold transition ml-1" title="删除该选项">&times; 删除</button>
              ` : ''}
            </div>
          </div>
          <input type="text" value="${this.escapeHtml(item.text || (this.form.options && this.form.options[letter]) || '')}" oninput="app.updateMcqOptionText(${this.inlineArg(letter)}, this.value)" placeholder="选项 ${this.escapeHtml(letter)} 内容 (如: $x = 4$ 或文本描述)..." class="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
        </div>
      `;
    }).join('');

    const solutionModeSelectorHtml = `
      <div class="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800 text-xs">
        <span class="text-xs font-bold text-slate-600 dark:text-slate-400">参考题解录入模式：</span>
        <div class="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg">
          <button type="button" onclick="app.setSolutionMode('mark_scheme_table')" class="px-2.5 py-1 rounded-md transition ${this.form.solutionMode === 'mark_scheme_table' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 font-bold shadow-2xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}">
            📋 官方 Mark Scheme 4 列表格录入 (图形化)
          </button>
          <button type="button" onclick="app.setSolutionMode('markdown')" class="px-2.5 py-1 rounded-md transition ${this.form.solutionMode === 'markdown' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 font-bold shadow-2xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}">
            ✍️ 自由 Markdown 模式
          </button>
        </div>
      </div>
    `;

    // 分小问列表 HTML (每一小问均支持剑桥标准 Mark Scheme 四列表格图形化输入与不录入选项)
    const parts = this.form.parts || [];
    const partsHtml = parts.map((part, idx) => {
      const mode = part.solutionMode || 'mark_scheme_table';
      if (!part.solutionRows || part.solutionRows.length === 0) {
        part.solutionRows = [{ question: part.label || '(a)', answer: '', marks: 'B1', guidance: '' }];
      }

      return `
        <div class="p-4 bg-slate-50/90 dark:bg-slate-800/50 rounded-xl border ${part.isWrong ? 'border-rose-300 dark:border-rose-900/60 ring-1 ring-rose-400/30' : 'border-slate-200 dark:border-slate-700'} space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200/60 dark:border-slate-700/60">
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-slate-500">小题号:</span>
              <input type="text" value="${this.escapeHtml(part.label || '(a)')}" onchange="app.updatePartField(${idx}, 'label', this.value)" class="w-16 px-2 py-0.5 border border-slate-300 dark:border-slate-600 rounded text-xs font-bold font-mono bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-center" placeholder="(a)" />
              <span class="text-xs font-bold text-slate-500 ml-2">分值:</span>
              <input type="text" value="${this.escapeHtml(part.marks || '')}" onchange="app.updatePartField(${idx}, 'marks', this.value)" class="w-14 px-2 py-0.5 border border-slate-300 dark:border-slate-600 rounded text-xs font-mono bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-center" placeholder="3分" />
            </div>

            <div class="flex items-center gap-2">
              <button type="button" onclick="app.togglePartWrong(${idx})" class="px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${part.isWrong ? 'bg-rose-500 text-white shadow-xs' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}">
                <span>${part.isWrong ? '❌ 错在此问 (重点复盘)' : '✅ 此问答对 / 略过'}</span>
              </button>
              <button type="button" onclick="app.removePart(${idx})" class="text-slate-400 hover:text-rose-500 px-1.5 py-0.5 text-xs font-bold cursor-pointer" title="删除此小问">&times; 删除</button>
            </div>
          </div>

          <div class="space-y-3">
            <div>
              <label class="block text-[11px] font-bold text-slate-500 mb-1">小问题目内容 (Markdown/LaTeX/截图粘贴) *</label>
              <textarea id="part-text-${idx}" oninput="app.updatePartField(${idx}, 'text', this.value)" rows="3" class="w-full p-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500 resize-y" placeholder="如：Find the equation of the tangent at (2, 5)...">${this.escapeHtml(part.text || '')}</textarea>
            </div>
            
            <div class="space-y-1.5 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
              <div class="flex items-center justify-between pb-1 flex-wrap gap-2">
                <label class="block text-[11px] font-bold text-slate-600 dark:text-slate-400">
                  小问 ${this.escapeHtml(part.label || '(a)')} 参考题解与 Mark Scheme 评分细则
                </label>
                <div class="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs">
                  <button type="button" onclick="app.setPartSolutionMode(${idx}, 'mark_scheme_table')" class="px-2 py-0.5 rounded transition cursor-pointer ${mode === 'mark_scheme_table' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 font-bold shadow-2xs' : 'text-slate-500 hover:text-slate-700'}">
                    📋 剑桥 4 列表格
                  </button>
                  <button type="button" onclick="app.setPartSolutionMode(${idx}, 'markdown')" class="px-2 py-0.5 rounded transition cursor-pointer ${mode === 'markdown' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 font-bold shadow-2xs' : 'text-slate-500 hover:text-slate-700'}">
                    ✍️ 自由 Markdown
                  </button>
                  <button type="button" onclick="app.setPartSolutionMode(${idx}, 'none')" class="px-2 py-0.5 rounded transition cursor-pointer ${mode === 'none' ? 'bg-slate-300 dark:bg-slate-600 text-slate-800 dark:text-slate-100 font-bold shadow-2xs' : 'text-slate-400 hover:text-slate-600'}" title="如本小问做对或无需复盘步骤，可选择略过不录入题解">
                    ⚪ 不录入题解
                  </button>
                </div>
              </div>

              ${mode === 'mark_scheme_table' ? `
                ${this.renderMarkSchemeTableUI(part.solutionRows, idx)}
              ` : (mode === 'markdown' ? `
                <textarea id="part-sol-${idx}" oninput="app.updatePartField(${idx}, 'solution', this.value)" rows="3" class="w-full p-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500 resize-y" placeholder="输入该小问的参考步骤与解析...">${this.escapeHtml(part.solution || '')}</textarea>
              ` : `
                <div class="p-3 bg-slate-100/70 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
                  <span class="flex items-center gap-1.5">
                    <span>⚪</span>
                    <span>已设为<strong>不录入此小问题解</strong>（答对或无需复盘此问步骤）</span>
                  </span>
                  <button type="button" onclick="app.setPartSolutionMode(${idx}, 'mark_scheme_table')" class="text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer">
                    + 恢复录入题解
                  </button>
                </div>
              `)}
            </div>
          </div>
        </div>
        ${(part._showAfterText || (part.afterText && part.afterText.trim())) ? `
          <div class="ml-3 pl-3 border-l-2 border-indigo-300 dark:border-indigo-700 py-1.5 space-y-1.5">
            <div class="flex items-center justify-between">
              <label class="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                <span>📝</span>
                <span>${this.escapeHtml(part.label || '(a)')} 之后的问间过渡文字 / 补充条件</span>
              </label>
              <button type="button" onclick="app.togglePartAfterText(${idx}, false)" class="text-[11px] text-slate-400 hover:text-rose-500 font-medium cursor-pointer">
                ✕ 移除此过渡文字
              </button>
            </div>
            <textarea id="part-after-${idx}" oninput="app.updatePartField(${idx}, 'afterText', this.value)" rows="2" class="w-full p-2.5 border border-indigo-200 dark:border-indigo-800/70 rounded-lg text-xs font-mono bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500 resize-y" placeholder="如：The median and interquartile range for the Panthers are 103 minutes and 14 minutes respectively.">${this.escapeHtml(part.afterText || '')}</textarea>
          </div>
        ` : `
          <div class="flex justify-center">
            <button type="button" onclick="app.togglePartAfterText(${idx}, true)" class="px-3 py-1 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-700 transition cursor-pointer">
              + 在 ${this.escapeHtml(part.label || '(a)')} 后添加问间过渡文字 / 补充条件
            </button>
          </div>
        `}
      `;
    }).join('');

    return `
      <div class="w-full max-w-[1520px] mx-auto space-y-6">
        <!-- 剑桥评分代号自动完成列表 -->
        <datalist id="cambridge-marks-list">
          <option value="B1">B1 (独立得分点 / 独立事实)</option>
          <option value="M1">M1 (方法分 / 运算步骤 Method)</option>
          <option value="A1">A1 (精准答案分 Accuracy)</option>
          <option value="B1 FT">B1 FT (连带赋分 Follow Through)</option>
          <option value="A1 FT">A1 FT (答案连带分)</option>
          <option value="M1 FT">M1 FT (方法连带分)</option>
          <option value="SC B1">SC B1 (特殊情况 Special Case)</option>
          <option value="SC M1">SC M1 (特殊情况方法分)</option>
          <option value="1">1 分</option>
          <option value="2">2 分</option>
          <option value="3">3 分</option>
          <option value="4">4 分</option>
          <option value="5">5 分</option>
          <option value="Total: 1">Total: 1</option>
          <option value="Total: 2">Total: 2</option>
          <option value="Total: 3">Total: 3</option>
          <option value="Total: 4">Total: 4</option>
          <option value="Total: 5">Total: 5</option>
          <option value="Total: 6">Total: 6</option>
        </datalist>

        <!-- 头部标题与返回 -->
        <div class="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 class="text-2xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>✍️</span>
              <span>${isEdit ? '编辑错题记录' : '录入新错题'}</span>
            </h2>
            <p class="text-xs text-slate-500 mt-1">支持 AI 拍照/截图识图自动填表、选择题、分小问结构化大题与自由 Markdown</p>
          </div>
          <div class="flex items-center gap-3">
            <button onclick="app.resetEditorForm(); app.switchTab('questions')" class="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
              取消并返回
            </button>
            <button onclick="app.saveCurrentQuestion()" class="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20 transition">
              <span>💾</span>
              <span>${isEdit ? '更新错题' : '保存入库 (Cmd+S)'}</span>
            </button>
          </div>
        </div>

        <!-- Gemini AI 拍照 / 截图自动识图填表面板 -->
        ${this.renderAiImportPanelHtml()}

        <!-- 基础元属性选择区 (学科 + 单元联动 + 关联小考联动) -->
        <div class="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <!-- 题型模式切换 -->
          <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div class="flex items-center gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold">
              <button type="button" onclick="app.setQuestionType('structured')" class="px-3.5 py-1.5 rounded-lg transition ${!isMcq ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:text-indigo-600'}">
                📝 简答/计算/解答题 (Structured)
              </button>
              <button type="button" onclick="app.setQuestionType('multiple_choice')" class="px-3.5 py-1.5 rounded-lg transition ${isMcq ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:text-indigo-600'}">
                🔘 单项选择题 (Multiple Choice)
              </button>
            </div>

            ${!isMcq ? `
              <div class="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-medium">
                <button type="button" onclick="app.setStructuredMode('multi_part')" class="px-3 py-1 rounded-md transition ${isMultiPart ? 'bg-white dark:bg-slate-900 text-indigo-600 font-bold shadow-2xs' : 'text-slate-600 dark:text-slate-300'}">
                  📋 分小问结构化录入 ((a)/(b)/(i)...)
                </button>
                <button type="button" onclick="app.setStructuredMode('single')" class="px-3 py-1 rounded-md transition ${!isMultiPart ? 'bg-white dark:bg-slate-900 text-indigo-600 font-bold shadow-2xs' : 'text-slate-600 dark:text-slate-300'}">
                  ✍️ 自由 Markdown 录入
                </button>
              </div>
            ` : `
              <span class="text-xs text-indigo-600 dark:text-indigo-400 font-semibold bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-1 rounded-lg">
                可分别标记【正确答案】与【当时错选】，便于考后复盘
              </span>
            `}
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- 所属学科 -->
            <div>
              <label class="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">所属学科 *</label>
              <select id="editor-subject" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                ${subOptions}
              </select>
            </div>

            <!-- 所属单元 (联动) -->
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label class="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">所属单元 / TOPIC *</label>
                <button type="button" onclick="app.openQuickAddUnitModal()" class="text-[11px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer flex items-center gap-1">
                  <span>+ 新建单元</span>
                </button>
              </div>
              <select id="editor-unit" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                ${unitOptions}
              </select>
            </div>
          </div>

          <!-- 第二行：CIE 真题题号 + 题目标题考点 + 关联具体小考 -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <!-- CIE 真题题号 -->
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label class="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">真题题号 / CIE CODE (可选)</label>
                <span class="text-[10px] text-indigo-500 dark:text-indigo-400 font-mono font-semibold">例: W24-52-3</span>
              </div>
              <input type="text" id="editor-paper-code" value="${this.escapeHtml(this.form.paperCode || '')}" oninput="this.value = this.value.toUpperCase()" placeholder="如：W24-52-3 (24冬考52卷第3题)" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono font-bold uppercase bg-slate-50 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none placeholder:font-normal placeholder:normal-case" />
              <p class="text-[10px] text-slate-400 mt-1">格式：考季(W冬/S夏/M春) + 年份(24) - 试卷号(52) - 题号(3)</p>
            </div>

            <!-- 错题简题 / 考点提炼 -->
            <div>
              <label class="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">错题简题 / 考点提炼 (可选)</label>
              <input type="text" id="editor-title" value="${this.escapeHtml(this.form.title)}" placeholder="如：条件概率取球问题、电路分压计算" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
            </div>

            <!-- 关联具体小考 -->
            <div>
              <label class="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">关联具体小考 / 测验 (自动筛选当科)</label>
              <select id="editor-exam" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                ${examOptions}
              </select>
            </div>
          </div>

          <!-- 错因归纳标签 -->
          <div>
            <label class="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">错因分析归纳 (点击标签即可选中/取消)</label>
            <div id="editor-reasons-container" class="flex flex-wrap items-center gap-2">
              <!-- 由 renderEditorReasons() 动态填充 -->
            </div>
          </div>
        </div>

        <!-- 编辑区工具栏与布局切换 -->
        <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-xs">
            <div class="flex items-center gap-2">
              <span class="font-bold text-slate-700 dark:text-slate-300">
                ${isMcq ? '🔘 选择题编辑模式' : (isMultiPart ? '📋 分小问结构化编辑模式' : '✍️ 自由 Markdown 模式')}
              </span>
            </div>

            <!-- LaTeX 公式快捷辅助工具条 -->
            <div class="flex flex-wrap items-center gap-1.5">
              <button type="button" onclick="app.insertTemplate('inline-math')" title="行内数学公式 $...$" class="px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 font-semibold cursor-pointer shadow-2xs">$x$ 行内公式</button>
              <button type="button" onclick="app.insertTemplate('block-math')" title="独立块级公式 $$...$$" class="px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 font-semibold cursor-pointer shadow-2xs">$$ 块级公式</button>
              <button type="button" onclick="app.insertTemplate('fraction')" title="分式 \\frac{a}{b}" class="px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-slate-700 dark:text-slate-300 hover:bg-slate-100 cursor-pointer">$\\frac{a}{b}$</button>
              <button type="button" onclick="app.insertTemplate('sqrt')" title="根号 \\sqrt{x}" class="px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-slate-700 dark:text-slate-300 hover:bg-slate-100 cursor-pointer">$\\sqrt{x}$</button>
              <button type="button" onclick="app.insertTemplate('bold')" class="px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 cursor-pointer">B 加粗</button>
              <button type="button" onclick="app.insertTemplate('table')" class="px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 cursor-pointer">表格</button>
            </div>

            <div class="flex items-center gap-1 text-slate-500">
              <button type="button" onclick="app.setEditorLayout('split')" class="px-2 py-1 rounded ${this.editorLayout === 'split' ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-600 font-bold' : 'hover:bg-slate-100'}" title="左右分栏实时预览">双栏对比</button>
              <button type="button" onclick="app.setEditorLayout('edit')" class="px-2 py-1 rounded ${this.editorLayout === 'edit' ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-600 font-bold' : 'hover:bg-slate-100'}" title="纯编辑">仅编辑</button>
              <button type="button" onclick="app.setEditorLayout('preview')" class="px-2 py-1 rounded ${this.editorLayout === 'preview' ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-600 font-bold' : 'hover:bg-slate-100'}" title="纯预览">仅预览</button>
            </div>
          </div>

          <div class="grid ${this.editorLayout === 'split' ? 'grid-cols-1 lg:grid-cols-2 items-stretch' : 'grid-cols-1'} min-h-[420px] lg:min-h-[520px]">
            <!-- 左侧编辑面板 -->
            <div class="${this.editorLayout === 'preview' ? 'hidden' : 'block'} border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 p-3 sm:p-4 bg-white dark:bg-slate-900 space-y-4">
              <div class="flex items-center justify-between text-xs text-slate-400">
                <span>💡 提示：在任意文本框内均可直接 Cmd+V 粘贴截图！</span>
              </div>

              ${isMcq ? `
                <!-- 选择题录入面板 (支持单选/多选 + 动态增减选项) -->
                <div class="space-y-4">
                  <div>
                    <label class="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">选择题题干内容 *</label>
                    <textarea id="editor-mcq-stem" rows="4" class="w-full p-3 font-mono text-xs leading-relaxed bg-slate-50/50 dark:bg-slate-950/40 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y" placeholder="在此输入选择题题干，支持 $...$ 数学公式与截图粘贴...">${this.escapeHtml(this.form.stem || '')}</textarea>
                  </div>

                  <div class="space-y-2">
                    <div class="flex items-center justify-between pb-1">
                      <label class="block text-xs font-bold text-slate-600 dark:text-slate-400">选项列表与正确/错选标记 (共 ${mcqOptionsList.length} 项) *</label>
                      <div class="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs">
                        <button type="button" onclick="app.setMcqType('single')" class="px-2.5 py-1 rounded-md transition ${!isMultiMcq ? 'bg-white dark:bg-slate-900 text-indigo-600 font-bold shadow-2xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}">
                          🔘 单项选择
                        </button>
                        <button type="button" onclick="app.setMcqType('multiple')" class="px-2.5 py-1 rounded-md transition ${isMultiMcq ? 'bg-white dark:bg-slate-900 text-indigo-600 font-bold shadow-2xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}">
                          ☑️ 多项 / 不定项选择
                        </button>
                      </div>
                    </div>

                    <div class="space-y-2.5">
                      ${mcqOptionsHtml}
                    </div>

                    <button type="button" onclick="app.addMcqOption()" class="w-full py-2 rounded-xl border border-dashed border-indigo-300 dark:border-indigo-800 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30 transition flex items-center justify-center gap-1.5 mt-2">
                      <span>➕ 添加选项 (${String.fromCharCode(65 + mcqOptionsList.length)})</span>
                    </button>
                  </div>

                  <div class="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    ${solutionModeSelectorHtml}

                    ${this.form.solutionMode === 'mark_scheme_table' ? `
                      ${this.renderMarkSchemeTableUI(this.form.markSchemeRows, null)}
                    ` : `
                      <textarea id="editor-mcq-solution" rows="4" class="w-full p-3 font-mono text-xs leading-relaxed bg-slate-50/50 dark:bg-slate-950/40 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y" placeholder="输入本题解析、选项推导依据、以及当时错选的思维陷阱...">${this.escapeHtml(this.form.solution || '')}</textarea>
                    `}
                  </div>
                </div>
              ` : (isMultiPart ? `
                <!-- 分小问结构化录入面板 -->
                <div class="space-y-4">
                  <div>
                    <div class="flex flex-wrap items-center justify-between gap-2 mb-1">
                      <label class="block text-xs font-bold text-slate-600 dark:text-slate-400">大题公共题干 / 背景条件 (如函数方程、图表描述等)</label>
                      <div class="flex items-center gap-2">
                        <div class="flex items-center gap-1 text-xs">
                          <span class="text-slate-400">分值:</span>
                          <input id="editor-stem-marks" type="text" value="${this.escapeHtml(this.form.stemMarks || '')}" placeholder="无小问填" class="w-16 px-1.5 py-0.5 text-center border border-slate-200 dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-mono focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
                        </div>
                        <span class="text-[11px] text-slate-400">若没有公共题干可留空</span>
                      </div>
                    </div>
                    <textarea id="editor-stem" rows="3" class="w-full p-3 font-mono text-xs leading-relaxed bg-slate-50/50 dark:bg-slate-950/40 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y" placeholder="输入大题公共题干，例如：The diagram shows the curve with equation $y = 3x^2 - 4x + 1$...">${this.escapeHtml(this.form.stem || '')}</textarea>
                  </div>

                  <div class="space-y-3">
                    <div class="flex items-center justify-between">
                      <label class="block text-xs font-bold text-slate-600 dark:text-slate-400">
                        各小问列表 (${parts.length} 问)
                      </label>
                      <button type="button" onclick="app.addPart()" class="px-3 py-1 rounded-lg text-xs font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 transition flex items-center gap-1">
                        <span>➕ 添加下一小问</span>
                      </button>
                    </div>

                    <div class="space-y-3">
                      ${partsHtml}
                    </div>

                    <button type="button" onclick="app.addPart()" class="w-full py-2.5 rounded-xl border border-dashed border-indigo-300 dark:border-indigo-800 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 transition flex items-center justify-center gap-1.5">
                      <span>➕ 继续添加一小问 (如 (c) 或 (i))</span>
                    </button>
                  </div>

                  ${parts.length === 0 ? `
                    <div class="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                      ${solutionModeSelectorHtml}
                      ${this.form.solutionMode === 'mark_scheme_table' ? `
                        ${this.renderMarkSchemeTableUI(this.form.markSchemeRows, null)}
                      ` : (this.form.solutionMode === 'markdown' ? `
                        <textarea id="editor-stem-solution" rows="4" class="w-full p-3 font-mono text-xs leading-relaxed bg-slate-50/50 dark:bg-slate-950/40 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y" placeholder="输入本题参考题解与 Mark Scheme 评分要点...">${this.escapeHtml(this.form.solution || '')}</textarea>
                      ` : `
                        <div class="text-[11px] text-slate-400 italic py-1">当前未录入题解，可点击上方「📋 官方 Mark Scheme 4 列表格录入」或「✍️ 自由 Markdown 模式」开始编辑</div>
                      `)}
                    </div>
                  ` : ''}
                </div>
              ` : `
                <!-- 自由 Markdown / 解答题录入面板 -->
                <div class="space-y-4">
                  <div class="flex items-center gap-1 bg-slate-200 dark:bg-slate-700 p-0.5 rounded-lg w-fit">
                    <button id="editor-tab-btn-content" onclick="app.switchEditorTab('content')" class="px-3 py-1.5 rounded-md font-bold transition ${this.activeEditorTab === 'content' ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:text-indigo-600'}">
                      ① 题目内容 *
                    </button>
                    <button id="editor-tab-btn-solution" onclick="app.switchEditorTab('solution')" class="px-3 py-1.5 rounded-md transition ${this.activeEditorTab === 'solution' ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-xs font-bold' : 'text-slate-600 dark:text-slate-300 font-medium hover:text-indigo-600'}">
                      ② 参考题解与 Mark Scheme
                    </button>
                  </div>

                  <div class="${this.activeEditorTab === 'content' ? 'block' : 'hidden'} space-y-2">
                    <textarea 
                      id="editor-content" 
                      class="w-full min-h-[360px] font-mono text-xs leading-relaxed p-3 bg-slate-50/50 dark:bg-slate-950/40 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y" 
                      placeholder="在此输入题目正文...&#10;&#10;公式示例：$y = \\frac{16}{x^2} - 4$&#10;块级公式：&#10;$$\\int_{a}^{b} f(x)dx$$&#10;截图后直接按 Cmd+V 粘贴图片！"
                    >${this.escapeHtml(this.form.content)}</textarea>
                  </div>

                  <div class="${this.activeEditorTab === 'solution' ? 'block' : 'hidden'} space-y-3">
                    ${solutionModeSelectorHtml}

                    ${this.form.solutionMode === 'mark_scheme_table' ? `
                      ${this.renderMarkSchemeTableUI(this.form.markSchemeRows, null)}
                    ` : `
                      <textarea 
                        id="editor-solution" 
                        class="w-full min-h-[360px] font-mono text-xs leading-relaxed p-3 bg-slate-50/50 dark:bg-slate-950/40 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y" 
                        placeholder="在此输入参考题解与 Mark Scheme 评分点...&#10;&#10;解题要点：&#10;1. 第一步：分析事件互斥与独立条件 P(A ∩ B)&#10;2. 第二步：根据全概率公式展开计算..."
                      >${this.escapeHtml(this.form.solution)}</textarea>
                    `}
                  </div>
                </div>
              `)}

              <!-- 补充解题备注（适用于所有题型：记录 Mark Scheme 未写明的思路与“为什么这样写”） -->
              <div class="${(!isMcq && !isMultiPart && this.activeEditorTab === 'content') ? 'hidden' : 'block'} pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <label for="editor-solution-note" class="block text-xs font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                    <span>💡</span>
                    <span>思路点拨与解题备注 (可选 · 补充“为什么这样写”)</span>
                  </label>
                  <span class="text-[11px] text-slate-400">支持 Markdown / $LaTeX$ 公式</span>
                </div>
                <textarea
                  id="editor-solution-note"
                  rows="3"
                  oninput="app.updateSolutionNote(this.value)"
                  class="w-full p-3 font-mono text-xs leading-relaxed bg-amber-50/40 dark:bg-amber-950/20 rounded-xl border border-amber-200/80 dark:border-amber-800/60 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-y"
                  placeholder="官方 Mark Scheme 往往省略了推导动机，可在此补充：&#10;• 为什么第一步要设这个变量 / 用这个公式？&#10;• 哪些隐含条件或易错边界需要注意？"
                >${this.escapeHtml(this.form.solutionNote || '')}</textarea>
              </div>
            </div>

            <!-- 右侧实时 KaTeX 预览面板 (高度与左侧输入区完全同步等高) -->
            <div class="${this.editorLayout === 'edit' ? 'hidden' : 'flex flex-col'} p-5 bg-slate-50/40 dark:bg-slate-950/60 h-full min-h-full">
              <div class="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
                <div class="flex items-center gap-1.5 bg-slate-200/80 dark:bg-slate-800 p-0.5 rounded-lg text-xs font-semibold">
                  <button type="button" onclick="app.setEditorPreviewScope('all')" class="px-2.5 py-1 rounded-md transition cursor-pointer ${(!this.editorPreviewScope || this.editorPreviewScope === 'all') ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-2xs font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}">
                    📖 完整卷面 (题目+题解)
                  </button>
                  <button type="button" onclick="app.setEditorPreviewScope('content')" class="px-2.5 py-1 rounded-md transition cursor-pointer ${this.editorPreviewScope === 'content' ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-2xs font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}">
                    📝 仅题目
                  </button>
                  <button type="button" onclick="app.setEditorPreviewScope('solution')" class="px-2.5 py-1 rounded-md transition cursor-pointer ${this.editorPreviewScope === 'solution' ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-2xs font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}">
                    📋 仅题解 (Mark Scheme)
                  </button>
                </div>
                <span class="text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded font-mono font-medium">KaTeX & 语法高亮就绪</span>
              </div>
              <div id="editor-preview" class="markdown-body text-slate-800 dark:text-slate-200 text-sm leading-relaxed grow"></div>
            </div>
          </div>
        </div>
      </div>

      ${this.renderAiCropModalHtml()}
    `;
  }

  updateEditorUnitSelect() {
    const unitEl = document.getElementById('editor-unit');
    if (!unitEl) return;
    const subjectEl = document.getElementById('editor-subject');
    const selectedSubId = subjectEl ? subjectEl.value : this.form.subjectId;
    const currentSub = this.subjects.find(s => s.id === selectedSubId);

    if (!currentSub || !currentSub.units || currentSub.units.length === 0) {
      unitEl.innerHTML = '<option value="">暂无预置单元 (请点击右侧新建单元)</option>';
      this.form.unitId = '';
    } else {
      unitEl.innerHTML = currentSub.units.map(u => `<option value="${this.escapeHtml(u.id)}" ${this.form.unitId === u.id ? 'selected' : ''}>${this.escapeHtml(u.name)}</option>`).join('');
      if (!this.form.unitId || !currentSub.units.some(u => u.id === this.form.unitId)) {
        this.form.unitId = currentSub.units[0].id;
        unitEl.value = currentSub.units[0].id;
      }
    }
  }

  updateEditorExamSelect() {
    const examEl = document.getElementById('editor-exam');
    if (!examEl) return;
    const subjectEl = document.getElementById('editor-subject');
    const selectedSubId = subjectEl ? subjectEl.value : this.form.subjectId;

    const filteredExams = this.exams.filter(e => !selectedSubId || e.subjectId === selectedSubId);
    let html = '<option value="">不关联特定小考（日常练习/Past Paper/作业）</option>';
    filteredExams.forEach(e => {
      html += `<option value="${this.escapeHtml(e.id)}" ${this.form.examId === e.id ? 'selected' : ''}>${this.escapeHtml(e.title)} (${this.escapeHtml(e.date)}) [${this.escapeHtml(e.score)}/${this.escapeHtml(e.maxScore)}分 ${this.escapeHtml(e.grade || '')}]</option>`;
    });
    examEl.innerHTML = html;
  }

  renderEditorReasons() {
    const container = document.getElementById('editor-reasons-container');
    if (!container) return;

    const allUniqueTags = Array.from(new Set([...this.presetReasons, ...this.form.reasons]));

    const tagsHtml = allUniqueTags.map(tag => {
      const isSelected = this.form.reasons.includes(tag);
      return `
        <button type="button" onclick="app.toggleFormReason('${tag}')" class="px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
          isSelected 
            ? 'bg-rose-500 text-white shadow-xs' 
            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
        }">
          ${isSelected ? '✓ ' : '+ '}${tag}
        </button>
      `;
    }).join('');

    container.innerHTML = `
      ${tagsHtml}
      <div class="flex items-center gap-1.5 ml-2">
        <input type="text" id="custom-reason-input" placeholder="自定义错因" class="w-24 px-2 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none" onkeydown="if(event.key==='Enter'){event.preventDefault();app.addCustomReason();}" />
        <button type="button" onclick="app.addCustomReason()" class="px-2 py-1 bg-slate-200 dark:bg-slate-700 rounded-lg text-xs hover:bg-slate-300 cursor-pointer">添加</button>
      </div>
    `;
  }

  bindAddTabEvents() {
    this.renderEditorReasons();

    const subjectEl = document.getElementById('editor-subject');
    if (subjectEl) {
      if (subjectEl.value) {
        this.form.subjectId = subjectEl.value;
      }
      subjectEl.addEventListener('change', (e) => {
        this.form.subjectId = e.target.value;
        const currentSub = this.subjects.find(s => s.id === this.form.subjectId);
        this.form.unitId = (currentSub && currentSub.units && currentSub.units[0]) ? currentSub.units[0].id : '';
        this.updateEditorUnitSelect();
        this.updateEditorExamSelect();
      });
    }

    const unitEl = document.getElementById('editor-unit');
    if (unitEl) {
      if (unitEl.value) {
        this.form.unitId = unitEl.value;
      }
      unitEl.addEventListener('change', (e) => {
        this.form.unitId = e.target.value;
      });
    }

    const examEl = document.getElementById('editor-exam');
    if (examEl) examEl.addEventListener('change', (e) => this.form.examId = e.target.value);

    const masteryEl = document.getElementById('editor-mastery');
    if (masteryEl) masteryEl.addEventListener('change', (e) => this.form.mastery = parseInt(e.target.value, 10));

    const titleEl = document.getElementById('editor-title');
    if (titleEl) titleEl.addEventListener('input', (e) => this.form.title = e.target.value);

    const stemEl = document.getElementById('editor-stem');
    if (stemEl) {
      stemEl.addEventListener('input', (e) => {
        this.form.stem = e.target.value;
        this.compileQuestionContent();
      });
    }

    const stemMarksEl = document.getElementById('editor-stem-marks');
    if (stemMarksEl) {
      stemMarksEl.addEventListener('input', (e) => {
        this.form.stemMarks = e.target.value;
        this.compileQuestionContent();
      });
    }

    const stemSolEl = document.getElementById('editor-stem-solution');
    if (stemSolEl) {
      stemSolEl.addEventListener('input', (e) => {
        this.form.solution = e.target.value;
        this.compileQuestionContent();
      });
    }

    const mcqStemEl = document.getElementById('editor-mcq-stem');
    if (mcqStemEl) {
      mcqStemEl.addEventListener('input', (e) => {
        this.form.stem = e.target.value;
        this.compileQuestionContent();
      });
    }

    const mcqSolEl = document.getElementById('editor-mcq-solution');
    if (mcqSolEl) {
      mcqSolEl.addEventListener('input', (e) => {
        this.form.solution = e.target.value;
        this.compileQuestionContent();
      });
    }

    const contentTextarea = document.getElementById('editor-content');
    if (contentTextarea) {
      contentTextarea.addEventListener('input', (e) => {
        this.form.content = e.target.value;
        this.compileQuestionContent();
      });
    }

    const solutionTextarea = document.getElementById('editor-solution');
    if (solutionTextarea) {
      solutionTextarea.addEventListener('input', (e) => {
        this.form.solution = e.target.value;
        this.compileQuestionContent();
      });
    }

    this.compileQuestionContent();
    if (this.aiState && this.aiState.cropModal) {
      this.bindAiCropCanvasEvents();
    }
  }

  switchEditorTab(tab) {
    this.activeEditorTab = tab;
    const contentTextarea = document.getElementById('editor-content');
    const solutionTextarea = document.getElementById('editor-solution');
    const btnContent = document.getElementById('editor-tab-btn-content');
    const btnSolution = document.getElementById('editor-tab-btn-solution');
    const previewTitle = document.getElementById('editor-preview-title');
    const inputLabel = document.getElementById('editor-input-label');

    const activeBtnClass = 'px-3 py-1.5 rounded-md font-bold transition bg-white dark:bg-slate-900 text-indigo-600 shadow-xs';
    const inactiveBtnClass = 'px-3 py-1.5 rounded-md font-medium transition text-slate-600 dark:text-slate-300 hover:text-indigo-600';

    if (tab === 'content') {
      if (contentTextarea) contentTextarea.classList.remove('hidden');
      if (solutionTextarea) solutionTextarea.classList.add('hidden');
      if (btnContent) btnContent.className = activeBtnClass;
      if (btnSolution) btnSolution.className = inactiveBtnClass;
      if (previewTitle) previewTitle.textContent = '实时效果预览 (题目内容)';
      if (inputLabel) inputLabel.textContent = 'Markdown & LaTeX 题目输入';
      if (contentTextarea) contentTextarea.focus();
    } else {
      if (contentTextarea) contentTextarea.classList.add('hidden');
      if (solutionTextarea) solutionTextarea.classList.remove('hidden');
      if (btnContent) btnContent.className = inactiveBtnClass;
      if (btnSolution) btnSolution.className = activeBtnClass;
      if (previewTitle) previewTitle.textContent = '实时效果预览 (Mark Scheme 参考题解)';
      if (inputLabel) inputLabel.textContent = 'Mark Scheme 参考题解输入';
      if (solutionTextarea) solutionTextarea.focus();
    }

    const previewEl = document.getElementById('editor-preview');
    if (previewEl) {
      const text = tab === 'content' ? (contentTextarea ? contentTextarea.value : '') : (solutionTextarea ? solutionTextarea.value : '');
      previewEl.innerHTML = window.markdownRenderer.render(text || '*暂无内容*');
    }
  }

  setEditorLayout(layout) {
    this.editorLayout = layout;
    this.render();
  }

  insertTemplate(type) {
    let activeTextarea = document.activeElement;
    if (!activeTextarea || activeTextarea.tagName !== 'TEXTAREA') {
      if (this.form.questionType === 'multiple_choice') {
        activeTextarea = document.getElementById('editor-mcq-stem') || document.getElementById('editor-mcq-solution');
      } else if (this.form.structuredMode === 'multi_part') {
        activeTextarea = document.getElementById('editor-stem') || document.querySelector('[id^="part-text-"]');
      } else {
        activeTextarea = this.activeEditorTab === 'content' 
          ? document.getElementById('editor-content') 
          : document.getElementById('editor-solution');
      }
    }

    if (!activeTextarea) return;

    if (window.MarkdownRenderer && typeof window.MarkdownRenderer.insertTemplate === 'function') {
      window.MarkdownRenderer.insertTemplate(activeTextarea, type);
    } else if (typeof MarkdownRenderer !== 'undefined' && typeof MarkdownRenderer.insertTemplate === 'function') {
      MarkdownRenderer.insertTemplate(activeTextarea, type);
    } else if (window.markdownRenderer && typeof window.markdownRenderer.constructor.insertTemplate === 'function') {
      window.markdownRenderer.constructor.insertTemplate(activeTextarea, type);
    }

    activeTextarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // --- 各科考核维度与平时打分加权折算引擎 (Task Category Averages) ---
  getCategoryPillStyle(catId) {
    switch (catId) {
      case 'skills':
        return 'border border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200';
      case 'behavior':
        return 'border border-emerald-400 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200';
      case 'att_p1':
      case 'attainment':
        return 'border border-purple-300 dark:border-purple-600 bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-200';
      case 'att_s1':
        return 'border border-pink-300 dark:border-pink-600 bg-pink-50 dark:bg-pink-950/40 text-pink-800 dark:text-pink-200';
      case 'final_s1':
        return 'border border-sky-300 dark:border-sky-600 bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-200';
      case 'final_p1':
      case 'final':
      default:
        return 'border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200';
    }
  }

  getSubjectCategories(subId) {
    const sub = this.subjects.find(s => s.id === subId);
    if (!sub) return [];

    let config = this.assessmentConfigs[subId];
    if (config && Array.isArray(config) && config.length > 0) {
      return config;
    }

    if (subId === 'sub-al-math' || sub.isParent) {
      return JSON.parse(JSON.stringify(window.DEFAULT_MATH_ASSESSMENT_CONFIG || []));
    }
    if (subId === 'sub-al-math-p1' || (sub.moduleCode === 'P1')) {
      return [
        { id: 'att_p1', name: 'Attainment P1', weight: 30 },
        { id: 'skills', name: 'Course Skills', weight: 20 },
        { id: 'behavior', name: 'Learning Behavior', weight: 10 },
        { id: 'final_p1', name: 'Final P1', weight: 12 }
      ];
    }
    if (subId === 'sub-al-math-s1' || (sub.moduleCode === 'S1')) {
      return [
        { id: 'att_s1', name: 'Attainment S1', weight: 20 },
        { id: 'skills', name: 'Course Skills', weight: 20 },
        { id: 'behavior', name: 'Learning Behavior', weight: 10 },
        { id: 'final_s1', name: 'Final S1', weight: 8 }
      ];
    }
    if (sub.curriculum === 'CNCC') {
      return JSON.parse(JSON.stringify(window.DEFAULT_CNCC_ASSESSMENT_CONFIG || []));
    }
    return JSON.parse(JSON.stringify(window.DEFAULT_STANDARD_AL_ASSESSMENT_CONFIG || []));
  }

  renderExamModalCategoriesHtml(subId, selectedCatId = null) {
    const categories = this.getSubjectCategories(subId);
    if (!categories || categories.length === 0) {
      return `<option value="attainment">Attainment (平时测验 / 作业)</option>`;
    }
    return categories.map(cat => {
      const isSelected = selectedCatId ? (selectedCatId === cat.id) : false;
      return `<option value="${this.escapeHtml(cat.id)}" ${isSelected ? 'selected' : ''}>${this.escapeHtml(cat.name)} (${this.escapeHtml(cat.weight)}%)</option>`;
    }).join('');
  }

  getSubjectAssessment(subId) {
    const sub = this.subjects.find(s => s.id === subId);
    if (!sub) return null;

    const config = this.getSubjectCategories(subId);
    const userCatScores = this.categoryScores[subId] || {};

    const p1Sub = this.subjects.find(s => s.id === 'sub-al-math-p1' || s.name.includes('Maths P1') || s.name.includes('P1'));
    const s1Sub = this.subjects.find(s => s.id === 'sub-al-math-s1' || s.name.includes('Maths S1') || s.name.includes('S1'));
    const p1Id = p1Sub ? p1Sub.id : 'sub-al-math-p1';
    const s1Id = s1Sub ? s1Sub.id : 'sub-al-math-s1';

    let totalWeight = 0;
    let weightedSum = 0;
    let validWeightSum = 0;

    const evaluatedCategories = config.map(cat => {
      const weight = parseFloat(cat.weight) || 0;
      totalWeight += weight;

      // 匹配该考核维度下的所有日常打分记录
      const matchExams = this.exams.filter(e => {
        if (subId === 'sub-al-math' || sub.isParent) {
          const mathSubIds = ['sub-al-math', p1Id, s1Id];
          if (!mathSubIds.includes(e.subjectId)) return false;

          if (cat.id === 'att_p1') {
            return e.category === 'att_p1' || (e.subjectId === p1Id && (e.category === 'attainment' || (!e.category && !e.isFinal && e.type !== 'Final')));
          }
          if (cat.id === 'att_s1') {
            return e.category === 'att_s1' || (e.subjectId === s1Id && (e.category === 'attainment' || (!e.category && !e.isFinal && e.type !== 'Final')));
          }
          if (cat.id === 'final_p1') {
            return e.category === 'final_p1' || (e.subjectId === p1Id && (e.isFinal || e.type === 'Final'));
          }
          if (cat.id === 'final_s1') {
            return e.category === 'final_s1' || (e.subjectId === s1Id && (e.isFinal || e.type === 'Final'));
          }
          if (cat.id === 'skills') return e.category === 'skills';
          if (cat.id === 'behavior') return e.category === 'behavior';
          return e.category === cat.id;
        } else {
          // 单个学科
          if (e.subjectId !== subId) return false;
          if (cat.id === 'attainment' || cat.id === 'exams' || cat.id === 'att_p1' || cat.id === 'att_s1') {
            return e.category === cat.id || (!e.category && !e.isFinal && e.type !== 'Final');
          }
          if (cat.id === 'final' || cat.id === 'final_p1' || cat.id === 'final_s1') {
            return e.category === cat.id || e.isFinal || e.type === 'Final';
          }
          if (cat.id === 'skills') return e.category === 'skills';
          if (cat.id === 'behavior') return e.category === 'behavior';
          return e.category === cat.id;
        }
      });

      const count = matchExams.length;
      let score = null;

      // 日常打分求算术平均值 (百分制)
      if (count > 0) {
        const sum = matchExams.reduce((acc, e) => acc + (parseFloat(e.percentage) || 0), 0);
        score = Math.round((sum / count) * 10) / 10;
      }

      // 用户自定义覆盖值 (如果有临时微调)
      if (userCatScores[cat.id] !== undefined && userCatScores[cat.id] !== '' && userCatScores[cat.id] !== null) {
        score = parseFloat(userCatScores[cat.id]);
      } else if (score === null && cat.defaultScore !== undefined && cat.defaultScore !== null) {
        score = parseFloat(cat.defaultScore);
      }

      if (score !== null && !isNaN(score)) {
        weightedSum += score * (weight / 100);
        validWeightSum += weight;
      }

      return {
        id: cat.id,
        name: cat.name,
        weight: weight,
        count: count,
        score: score !== null && !isNaN(score) ? Math.round(score * 10) / 10 : null
      };
    });

    let overallScore = null;
    let grade = '--';

    if (validWeightSum > 0) {
      overallScore = Math.round((weightedSum / (validWeightSum / 100)) * 10) / 10;
      grade = this.calculateGrade(overallScore, sub.curriculum);
    }

    return {
      subject: sub,
      config,
      categories: evaluatedCategories,
      totalWeight,
      validWeightSum,
      overallScore,
      grade
    };
  }

  async updateCategoryScore(subId, catId, value) {
    if (!this.categoryScores[subId]) {
      this.categoryScores[subId] = {};
    }
    const val = parseFloat(value);
    if (isNaN(val) || value === '') {
      delete this.categoryScores[subId][catId];
    } else {
      this.categoryScores[subId][catId] = Math.min(100, Math.max(0, Math.round(val * 10) / 10));
    }
    await window.db.saveCategoryScores(this.categoryScores);
    this.render();
  }

  // --- 权重配置模态框 ---
  openWeightConfigModal(subjectId) {
    const sub = this.subjects.find(s => s.id === subjectId);
    if (!sub) return;

    let config = this.assessmentConfigs[subjectId];
    if (!config || !Array.isArray(config) || config.length === 0) {
      config = this.getSubjectCategories(subjectId);
    }

    this.editingWeightSubId = subjectId;
    this.editingWeightConfig = JSON.parse(JSON.stringify(config));

    const modalHtml = `
      <div id="weight-config-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
        <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden">
          <div class="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h3 class="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>⚙️</span>
                <span>自定义【${this.escapeHtml(sub.name)}】考核项目与权重配置</span>
              </h3>
              <p class="text-xs text-slate-400 mt-0.5">可自由增减考核维度（如实验操作、课堂展示等）并调整各占百分比权重</p>
            </div>
            <button onclick="app.closeModal('weight-config-modal')" class="text-slate-400 hover:text-slate-600 text-xl font-bold">&times;</button>
          </div>

          <div class="p-6 overflow-y-auto space-y-4">
            <div class="flex items-center justify-between text-xs pb-1">
              <span class="font-bold text-slate-700 dark:text-slate-300">考核项目列表</span>
              <button type="button" onclick="app.addWeightModalItem()" class="px-3 py-1 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-lg font-bold hover:bg-indigo-100 transition">
                + 添加新考核项目
              </button>
            </div>

            <div id="weight-modal-items-container" class="space-y-2.5">
              ${this.renderWeightModalRowsHtml(sub)}
            </div>

            <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
              <span class="text-slate-500 font-medium">当前各项权重占比总计：</span>
              <div id="weight-modal-total-display" class="font-mono font-black text-sm">
                <!-- 由 updateWeightModalTotal 填充 -->
              </div>
            </div>
          </div>

          <div class="px-6 py-3.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <button onclick="app.resetWeightConfig('${subjectId}')" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition">
              恢复官方默认结构
            </button>
            <div class="flex items-center gap-2.5">
              <button onclick="app.closeModal('weight-config-modal')" class="px-4 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200">
                取消
              </button>
              <button onclick="app.saveWeightConfig('${subjectId}')" class="px-5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm">
                保存权重配置
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    this.updateWeightModalTotal();
  }

  renderWeightModalRowsHtml(sub) {
    return this.editingWeightConfig.map((item, idx) => `
      <div class="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center gap-3 text-xs shadow-xs">
        <div class="flex-1 min-w-[140px]">
          <label class="block text-[10px] text-slate-400 mb-0.5">考核维度项目名称</label>
          <input type="text" value="${this.escapeHtml(item.name)}" oninput="app.updateWeightModalItem(${idx}, 'name', this.value)" class="w-full px-2.5 py-1.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-semibold" placeholder="如 Course Skills" />
        </div>

        <div class="w-28">
          <label class="block text-[10px] text-slate-400 mb-0.5">权重占比 (%)</label>
          <div class="flex items-center gap-1">
            <input type="number" min="0" max="100" step="1" value="${this.escapeHtml(item.weight)}" oninput="app.updateWeightModalItem(${idx}, 'weight', this.value)" class="w-full px-2 py-1.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono font-bold text-center" />
            <span class="text-slate-400 font-bold">%</span>
          </div>
        </div>

        <button type="button" onclick="app.removeWeightModalItem(${idx})" class="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg transition" title="删除该项">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      </div>
    `).join('');
  }

  updateWeightModalItem(idx, field, value) {
    if (!this.editingWeightConfig || !this.editingWeightConfig[idx]) return;
    if (field === 'weight') {
      this.editingWeightConfig[idx].weight = parseFloat(value) || 0;
      this.updateWeightModalTotal();
    } else {
      this.editingWeightConfig[idx][field] = value;
    }
  }

  addWeightModalItem() {
    if (!this.editingWeightConfig) return;
    this.editingWeightConfig.push({
      id: 'cat_' + Date.now(),
      name: '新考核项目',
      weight: 10
    });
    const sub = this.subjects.find(s => s.id === this.editingWeightSubId);
    const box = document.getElementById('weight-modal-items-container');
    if (box && sub) {
      box.innerHTML = this.renderWeightModalRowsHtml(sub);
      this.updateWeightModalTotal();
    }
  }

  removeWeightModalItem(idx) {
    if (!this.editingWeightConfig) return;
    if (this.editingWeightConfig.length <= 1) {
      this.showToast('至少保留一项考核结构！', 'warning');
      return;
    }
    this.editingWeightConfig.splice(idx, 1);
    const sub = this.subjects.find(s => s.id === this.editingWeightSubId);
    const box = document.getElementById('weight-modal-items-container');
    if (box && sub) {
      box.innerHTML = this.renderWeightModalRowsHtml(sub);
      this.updateWeightModalTotal();
    }
  }

  updateWeightModalTotal() {
    const totalEl = document.getElementById('weight-modal-total-display');
    if (!totalEl || !this.editingWeightConfig) return;
    const sum = this.editingWeightConfig.reduce((acc, c) => acc + (parseFloat(c.weight) || 0), 0);
    const isExact = Math.abs(sum - 100) < 0.001;
    totalEl.innerHTML = `
      <span class="${isExact ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500'}">
        ${sum}% ${isExact ? '✓ 权重完整且平衡' : '⚠️ 建议调整至 100%'}
      </span>
    `;
  }

  async saveWeightConfig(subjectId) {
    if (!this.editingWeightConfig || this.editingWeightConfig.length === 0) return;
    const sum = this.editingWeightConfig.reduce((acc, c) => acc + (parseFloat(c.weight) || 0), 0);
    if (Math.abs(sum - 100) > 0.001) {
      if (!confirm(`当前权重总计为 ${sum}% (建议总计 100%)，确定要按此配置保存吗？`)) {
        return;
      }
    }
    this.assessmentConfigs[subjectId] = this.editingWeightConfig;
    await window.db.saveAssessmentConfigs(this.assessmentConfigs);
    this.closeModal('weight-config-modal');
    this.showToast('考核结构与权重设置已保存！', 'success');
    this.render();
  }

  async resetWeightConfig(subjectId) {
    if (!confirm('确定要恢复该学科的官方默认考核结构与权重吗？')) return;
    delete this.assessmentConfigs[subjectId];
    await window.db.saveAssessmentConfigs(this.assessmentConfigs);
    this.closeModal('weight-config-modal');
    this.showToast('已恢复默认权重配置', 'info');
    this.render();
  }

  // --- 模块 3：各科成绩整理、多维图表分析与 Task Grade 学业看板 ---
  renderExamsTab() {
    const subMap = new Map(this.subjects.map(s => [s.id, s]));

    // 单元名称映射
    const unitNameMap = new Map();
    this.subjects.forEach(s => {
      (s.units || []).forEach(u => unitNameMap.set(u.id, u.name));
    });

    // 默认图表选中科目
    if (!this.examFilter.unitSubjectId && this.subjects.length > 0) {
      this.examFilter.unitSubjectId = this.subjects[0].id;
    }

    // 按当前所选学科与考核维度（支持多选）过滤小考列表
    const selectedCats = Array.isArray(this.examFilter.categories) && this.examFilter.categories.length > 0
      ? this.examFilter.categories
      : ['attainment', 'skills', 'behavior', 'final'];
    const isAllCats = selectedCats.length >= 4;

    const filteredExams = this.exams.filter(e => {
      if (this.examFilter.subjectId !== 'all' && e.subjectId !== this.examFilter.subjectId) return false;
      if (!isAllCats) {
        return selectedCats.some(cat => this._examMatchesCategory(e, cat));
      }
      return true;
    }).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    // 计算全局指标
    const totalCount = this.exams.length;
    let avgPercentage = 0;
    let excellentCount = 0; // A* / A / A+
    let latestExam = null;

    if (totalCount > 0) {
      const sumPercent = this.exams.reduce((sum, e) => sum + (parseFloat(e.percentage) || 0), 0);
      avgPercentage = (sumPercent / totalCount).toFixed(1);
      excellentCount = this.exams.filter(e => ['A*', 'A', 'A+'].includes(e.grade)).length;
      const sortedAll = this.exams.slice().sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      latestExam = sortedAll[0];
    }
    const excellentRate = totalCount > 0 ? ((excellentCount / totalCount) * 100).toFixed(0) : 0;

    // 🎓 评估顶层学科综合与 Task Category 评价 (数学 P1+S1 联动综合，物理/经济/CNCC)
    const gpaSubjects = this.subjects.filter(s => !s.parentId);
    const allAssessments = gpaSubjects.map(s => this.getSubjectAssessment(s.id)).filter(Boolean);
    const validAssessments = allAssessments.filter(a => a.overallScore !== null);

    let gpaPercentAvg = '--';
    if (validAssessments.length > 0) {
      const scoreSum = validAssessments.reduce((sum, a) => sum + a.overallScore, 0);
      gpaPercentAvg = (scoreSum / validAssessments.length).toFixed(1);
    }
    const excellentSubCount = allAssessments.filter(a => ['A*', 'A', 'A+'].includes(a.grade)).length;

    // --- 智能学情分析与诊断（均以各科加权总评为准）---
    let bestSub = null;
    let bestSubAvg = -1;
    let lowestSub = null;
    let lowestSubAvg = 101;
    validAssessments.forEach(a => {
      if (a.overallScore > bestSubAvg) {
        bestSubAvg = a.overallScore;
        bestSub = a.subject;
      }
      if (a.overallScore < lowestSubAvg) {
        lowestSubAvg = a.overallScore;
        lowestSub = a.subject;
      }
    });

    // 统计各单元得分率与错题数，定位重点复习薄弱单元
    let weakestUnit = null;
    let weakestUnitSub = null;
    let lowestUnitAvg = 101;

    this.subjects.forEach(s => {
      const sExams = this.exams.filter(e => e.subjectId === s.id);
      if (sExams.length > 0) {
        (s.units || []).forEach(u => {
          const uExams = sExams.filter(e => {
            if (Array.isArray(e.unitIds) && e.unitIds.includes(u.id)) return true;
            return e.unitId === u.id;
          });
          const uQuestions = this.questions.filter(q => q.subjectId === s.id && q.unitId === u.id);
          if (uExams.length > 0) {
            const uAvg = uExams.reduce((sum, e) => sum + (parseFloat(e.percentage) || 0), 0) / uExams.length;
            if (uAvg < lowestUnitAvg) {
              lowestUnitAvg = uAvg;
              weakestUnit = u;
              weakestUnitSub = s;
            }
          } else if (uQuestions.length >= 2 && !weakestUnit) {
            weakestUnit = u;
            weakestUnitSub = s;
          }
        });
      }
    });

    // 🎓 学期学业评价与各科平时成绩看板 (统一浅色/深色主题，无GPA)
    const gpaDashboardHtml = `
      <div class="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
        <div class="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div class="flex items-center gap-2">
              <span class="text-xl">📋</span>
              <h3 class="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 tracking-tight">十一学校国际部学期综合学业评价与各科平时成绩看板</h3>
            </div>
            <p class="text-xs text-slate-500 mt-1">
              遵循十一打分方案：平时考核 (Attainment)、实践表现 (Course Skills)、学习习惯 (Learning Behavior) 与 Final 期末考加权综合折算
            </p>
          </div>

          <div class="flex items-center gap-4 bg-slate-50 dark:bg-slate-800/60 px-5 py-3 rounded-2xl border border-slate-200 dark:border-slate-700">
            <div>
              <span class="text-[10px] text-slate-400 uppercase tracking-widest block font-bold">全科综合加权均分</span>
              <div class="text-2xl font-black font-mono text-indigo-600 dark:text-indigo-400">
                ${gpaPercentAvg !== '--' ? gpaPercentAvg + '%' : '--'}
              </div>
            </div>
            <div class="h-8 w-px bg-slate-200 dark:bg-slate-700"></div>
            <div>
              <span class="text-[10px] text-slate-400 uppercase tracking-widest block font-bold">A / A* 达标学科</span>
              <div class="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                ${excellentSubCount} <span class="text-xs font-normal text-slate-400">/ ${allAssessments.length} 门</span>
              </div>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          ${allAssessments.map(assess => {
            const sub = assess.subject;
            const gradeBadgeStyle = this.getGradeBadgeStyle(assess.grade);
            const isMath = sub.id === 'sub-al-math' || sub.isParent;

            return `
              <div class="bg-slate-50/70 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700/80 p-4 flex flex-col justify-between space-y-4 shadow-xs hover:border-indigo-400/50 transition">
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="w-3 h-3 rounded-full shrink-0" style="background-color: ${this.safeColor(sub.color)}"></span>
                      <h4 class="font-bold text-sm text-slate-900 dark:text-slate-100">${this.escapeHtml(sub.name)}</h4>
                    </div>
                    <span class="text-[11px] text-slate-400 font-mono mt-0.5 block">
                      ${isMath ? '数学综合 (P1 + S1 联动)' : this.escapeHtml(sub.curriculum || 'A Level')} · 权重占比 ${assess.totalWeight}%
                    </span>
                  </div>

                  <div class="text-right">
                    <span class="px-2.5 py-0.5 rounded-lg text-xs font-black shadow-xs ${gradeBadgeStyle}">
                      Grade ${assess.grade}
                    </span>
                  </div>
                </div>

                <div class="space-y-1">
                  <div class="flex justify-between text-xs">
                    <span class="text-slate-500">学期加权总评得分</span>
                    <strong class="font-mono text-indigo-600 dark:text-indigo-400 font-bold text-sm">${assess.overallScore !== null ? assess.overallScore + '%' : '待评定'}</strong>
                  </div>
                  <div class="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div class="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-500" style="width: ${Math.min(100, Math.max(0, assess.overallScore || 0))}%"></div>
                  </div>
                </div>

                <div class="space-y-1.5 pt-1">
                  <div class="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <span>Task Category Averages:</span>
                    <span class="text-[10px] text-slate-400 font-normal">日常打分均值</span>
                  </div>
                  <div class="space-y-1.5 text-xs">
                    ${assess.categories.map(cat => {
                      const pillStyle = this.getCategoryPillStyle(cat.id);
                      return `
                        <div class="flex items-center justify-between py-1 px-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 shadow-2xs">
                          <div class="flex items-center gap-1.5 min-w-0">
                            <span class="px-2 py-0.5 rounded-md text-[11px] font-bold truncate ${pillStyle}">
                              ${this.escapeHtml(cat.name)} (${this.escapeHtml(cat.weight)}%)
                            </span>
                          </div>
                          <div class="flex items-center gap-2 shrink-0">
                            ${cat.count > 0 ? `<span class="text-[10px] text-slate-400 font-mono">${cat.count}次打分</span>` : ''}
                            <span class="font-mono text-xs font-bold ${cat.score !== null ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400'}">
                              ${cat.score !== null ? cat.score + '%' : '暂无'}
                            </span>
                            <button onclick="app.openCategoryExamModal(${this.inlineArg(sub.id)}, ${this.inlineArg(cat.id)})" title="录入此项目平时打分" class="p-0.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition text-xs font-bold">
                              ➕
                            </button>
                          </div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>

                <div class="pt-2 border-t border-slate-200 dark:border-slate-700/80 flex items-center justify-between text-[11px]">
                  <button onclick="app.openExamModal(null, ${this.inlineArg(sub.id)})" class="px-2.5 py-1 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 transition flex items-center gap-1 font-semibold">
                    <span>➕</span>
                    <span>录入此科平时成绩</span>
                  </button>
                  <button onclick="app.openWeightConfigModal(${this.inlineArg(sub.id)})" class="px-2.5 py-1 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition flex items-center gap-1 font-semibold">
                    <span>⚙️</span>
                    <span>自定义权重</span>
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    // 💡 学情诊断 HTML (总览 vs 单科精准深度诊断)
    const isSubjectFocused = this.examFilter.subjectId !== 'all';
    let diagnosticHtml = '';

    if (!isSubjectFocused) {
      diagnosticHtml = `
        <div class="bg-gradient-to-r from-indigo-50/70 via-purple-50/50 to-pink-50/60 dark:from-indigo-950/30 dark:via-purple-950/20 dark:to-pink-950/20 p-5 rounded-2xl border border-indigo-200/60 dark:border-indigo-900/40 shadow-xs space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2 text-xs font-black text-indigo-950 dark:text-indigo-200 uppercase tracking-wider">
              <span>🧭</span>
              <span>十一学校国际部全科学情宏观诊断与复习规划</span>
            </div>
            <span class="text-[11px] text-slate-500">点击下方各学科卡片即可切换查看单个学科的深度诊断</span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div class="bg-white/80 dark:bg-slate-900/80 p-3.5 rounded-xl border border-indigo-100 dark:border-indigo-900/50 space-y-1">
              <span class="font-bold text-emerald-600 flex items-center gap-1">
                <span>🌟</span><span>全科领跑学科与发挥高光</span>
              </span>
              <p class="text-slate-600 dark:text-slate-300 mt-1">
                ${bestSub ? `<strong>${this.escapeHtml(bestSub.name)}</strong> 保持卓越表现，加权总评得分达到 <strong>${bestSubAvg.toFixed(1)}%</strong>，已具备稳妥的 A / A* 竞争力！继续保持刷题手感。` : '暂无充足测验数据'}
              </p>
            </div>

            <div class="bg-white/80 dark:bg-slate-900/80 p-3.5 rounded-xl border border-indigo-100 dark:border-indigo-900/50 flex flex-col justify-between space-y-2">
              <div>
                <span class="font-bold text-amber-600 flex items-center gap-1">
                  <span>⚠️</span><span>全局最需突破的薄弱考点</span>
                </span>
                <p class="text-slate-600 dark:text-slate-300 mt-1">
                  ${weakestUnit ? `检测到 <strong>${this.escapeHtml(weakestUnitSub ? weakestUnitSub.name : '')}</strong> 的 <strong>${this.escapeHtml(weakestUnit.name)}</strong> 考点失分偏多或错题积累密集，建议进行专题重练。` : '目前各单元掌握均衡，暂无明显警报。'}
                </p>
              </div>
              ${(weakestUnit && weakestUnitSub) ? `
                <button onclick="app.jumpToPracticeUnit(${this.inlineArg(weakestUnitSub.id)}, ${this.inlineArg(weakestUnit.id)})" class="self-start px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-[11px] shadow-xs transition flex items-center gap-1">
                  <span>🎯</span>
                  <span>一键为此薄弱单元组卷重做 ➔</span>
                </button>
              ` : ''}
            </div>

            <div class="bg-white/80 dark:bg-slate-900/80 p-3.5 rounded-xl border border-indigo-100 dark:border-indigo-900/50 space-y-1">
              <span class="font-bold text-indigo-600 flex items-center gap-1">
                <span>📊</span><span>均衡度与提分发展规划</span>
              </span>
              <p class="text-slate-600 dark:text-slate-300 mt-1">
                全科综合加权均分 <strong>${gpaPercentAvg !== '--' ? gpaPercentAvg : avgPercentage}%</strong>，优良率 <strong>${excellentRate}%</strong>。参考下方全科学业均衡度雷达图进行补弱，平时测验与期末考协同发力！
              </p>
            </div>
          </div>
        </div>
      `;
    } else {
      const focusedSub = subMap.get(this.examFilter.subjectId);
      const fExams = this.exams.filter(e => e.subjectId === focusedSub?.id);
      const fQuestions = this.questions.filter(q => q.subjectId === focusedSub?.id);
      const fCount = fExams.length;

      let fAvg = 0;
      let fGrade = '--';
      let fBestUnit = null;
      let fWeakUnit = null;
      let fWeakUnitMistakes = 0;
      let nextGrade = '';
      let targetThreshold = 0;
      let gap = 0;

      if ((fCount > 0 || focusedSub) && focusedSub) {
        const fAssess = this.getSubjectAssessment(focusedSub.id);
        if (fAssess && fAssess.overallScore !== null) {
          fAvg = fAssess.overallScore;
          fGrade = fAssess.grade;
        } else if (fCount > 0) {
          const sum = fExams.reduce((acc, e) => acc + (parseFloat(e.percentage) || 0), 0);
          fAvg = Math.round((sum / fCount) * 10) / 10;
          fGrade = this.calculateGrade(fAvg, focusedSub.curriculum);
        }

        let highestUnitAvg = -1;
        let lowestUnitAvg = 101;
        (focusedSub.units || []).forEach(u => {
          const uExams = fExams.filter(e => (Array.isArray(e.unitIds) && e.unitIds.includes(u.id)) || e.unitId === u.id);
          const uQs = fQuestions.filter(q => q.unitId === u.id);
          if (uExams.length > 0) {
            const uAvg = uExams.reduce((acc, e) => acc + (parseFloat(e.percentage) || 0), 0) / uExams.length;
            if (uAvg > highestUnitAvg) {
              highestUnitAvg = uAvg;
              fBestUnit = u;
            }
            if (uAvg < lowestUnitAvg) {
              lowestUnitAvg = uAvg;
              fWeakUnit = u;
              fWeakUnitMistakes = uQs.length;
            }
          } else if (uQs.length > 0 && !fWeakUnit) {
            fWeakUnit = u;
            fWeakUnitMistakes = uQs.length;
          }
        });

        if (focusedSub.curriculum === 'CNCC') {
          const ladder = [
            { g: 'D', t: 59.5 },
            { g: 'C', t: 69.5 },
            { g: 'B', t: 79.5 },
            { g: 'A-', t: 84.5 },
            { g: 'A', t: 89.5 },
            { g: 'A+', t: 94.5 }
          ];
          const nextTarget = ladder.find(item => fAvg < item.t);
          if (nextTarget) {
            nextGrade = nextTarget.g;
            targetThreshold = nextTarget.t;
            gap = Math.round((targetThreshold - fAvg) * 10) / 10;
          }
        } else {
          const ladder = [
            { g: 'E', t: 40.0 },
            { g: 'D', t: 49.5 },
            { g: 'C', t: 59.5 },
            { g: 'B', t: 69.5 },
            { g: 'A', t: 79.5 },
            { g: 'A*', t: 89.5 }
          ];
          const nextTarget = ladder.find(item => fAvg < item.t);
          if (nextTarget) {
            nextGrade = nextTarget.g;
            targetThreshold = nextTarget.t;
            gap = Math.round((targetThreshold - fAvg) * 10) / 10;
          }
        }
      }

      diagnosticHtml = `
        <div class="bg-gradient-to-r from-indigo-50/80 via-blue-50/60 to-purple-50/70 dark:from-indigo-950/40 dark:via-blue-950/30 dark:to-purple-950/30 p-5 rounded-2xl border border-indigo-300/70 dark:border-indigo-800/60 shadow-xs space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2 text-xs font-black text-indigo-950 dark:text-indigo-200 uppercase tracking-wider">
              <span>🎯</span>
              <span>【${this.escapeHtml(focusedSub ? focusedSub.name : '')}】单科学情精准诊断与提分建议</span>
            </div>
            <button onclick="app.clearSubjectFocus()" class="px-2.5 py-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
              ✕ 返回全科宏观诊断 ➔
            </button>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div class="bg-white/80 dark:bg-slate-900/80 p-3.5 rounded-xl border border-indigo-100 dark:border-indigo-900/50 space-y-1">
              <span class="font-bold text-emerald-600 flex items-center gap-1">
                <span>🌟</span><span>高分优势章节</span>
              </span>
              <p class="text-slate-600 dark:text-slate-300 mt-1">
                ${fBestUnit ? `<strong>${this.escapeHtml(fBestUnit.name)}</strong> 考点掌握扎实，继续保持高正确率！` : '暂未定位到特定优势单元，继续多做尝试！'}
              </p>
            </div>

            <div class="bg-white/80 dark:bg-slate-900/80 p-3.5 rounded-xl border border-indigo-100 dark:border-indigo-900/50 flex flex-col justify-between space-y-2">
              <div>
                <span class="font-bold text-amber-600 flex items-center gap-1">
                  <span>🚨</span><span>核心薄弱突破口</span>
                </span>
                <p class="text-slate-600 dark:text-slate-300 mt-1">
                  ${fWeakUnit ? `<strong>${this.escapeHtml(fWeakUnit.name)}</strong> 存在失分点 (错题积累 ${fWeakUnitMistakes} 道)，是该学科提分最立竿见影的突破点！` : '目前该学科各章节表现稳定。'}
                </p>
              </div>
              ${fWeakUnit ? `
                <button onclick="app.jumpToPracticeUnit(${this.inlineArg(focusedSub.id)}, ${this.inlineArg(fWeakUnit.id)})" class="self-start px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-[11px] shadow-xs transition flex items-center gap-1">
                  <span>🎯</span>
                  <span>一键为此薄弱单元组卷重做 ➔</span>
                </button>
              ` : ''}
            </div>

            <div class="bg-white/80 dark:bg-slate-900/80 p-3.5 rounded-xl border border-indigo-100 dark:border-indigo-900/50 space-y-1">
              <span class="font-bold text-indigo-600 flex items-center gap-1">
                <span>🎯</span><span>Task Grade 提分目标</span>
              </span>
              <p class="text-slate-600 dark:text-slate-300 mt-1">
                ${nextGrade ? `
                  当前均分 <strong>${fAvg}%</strong> (Grade ${fGrade})，仅差 <strong>${gap}%</strong> 即可跨入 <strong class="text-indigo-600 dark:text-indigo-400">Grade ${nextGrade} (${targetThreshold}%)</strong>！攻关薄弱单元即可稳妥达成！
                ` : `
                  当前均分 <strong>${fAvg}%</strong>，已达到最高等级 <strong class="text-emerald-600 font-bold">Grade ${fGrade}</strong>！建议强化速度并挑战高难度大题！
                `}
              </p>
            </div>
          </div>
        </div>
      `;
    }

    const isAllSelected = this.examFilter.subjectId === 'all';

    // 小考测验卡片列表 HTML
    const examCardsHtml = filteredExams.length === 0 ? `
      <div class="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8">
        <div class="text-4xl mb-2">📝</div>
        <h4 class="text-base font-bold text-slate-800 dark:text-slate-200">当前筛选下没有找到小考测验记录</h4>
        <p class="text-xs text-slate-500 mt-1">支持随时登记一次单科随堂测或单元大测，一次可勾选多个考查单元！</p>
        <button onclick="app.openExamModal()" class="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 shadow-sm">
          + 录入新小考成绩
        </button>
      </div>
    ` : filteredExams.map(exam => {
      const sub = subMap.get(exam.subjectId);
      const relatedQuestions = this.questions.filter(q => q.examId === exam.id);

      // 🎯 多单元徽章渲染
      const uids = (exam.unitIds && exam.unitIds.length > 0)
        ? exam.unitIds
        : (exam.unitId ? [exam.unitId] : []);

      const unitBadges = uids.length > 0
        ? uids.map(uid => `<span class="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">📖 ${this.escapeHtml(unitNameMap.get(uid) || uid)}</span>`).join(' ')
        : '<span class="px-2 py-0.5 rounded text-[11px] text-slate-400 bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700">全卷综合</span>';

      const score = exam.score !== undefined ? exam.score : '--';
      const maxScore = exam.maxScore !== undefined ? exam.maxScore : '--';
      const isCurved = !!(exam.isCurved || (exam.curvedScore !== undefined && exam.curvedScore !== null && exam.curvedScore !== ''));
      const rawPct = (exam.rawPercentage !== undefined && exam.rawPercentage !== null)
        ? exam.rawPercentage
        : (typeof exam.score === 'number' && typeof exam.maxScore === 'number' && exam.maxScore > 0 ? Math.round((exam.score / exam.maxScore) * 1000) / 10 : null);
      const percentage = exam.percentage !== undefined ? exam.percentage : 0;
      const grade = exam.grade || '--';
      const gradeBadgeStyle = this.getGradeBadgeStyle(grade);
      const catPillStyle = this.getCategoryPillStyle(exam.category);
      const categoryDisplayName = exam.categoryName || (
        exam.category === 'behavior' ? 'Learning Behavior' :
        exam.category === 'skills' ? 'Course Skills' :
        exam.category === 'att_p1' ? 'Attainment P1' :
        exam.category === 'att_s1' ? 'Attainment S1' :
        exam.category === 'final_p1' ? 'Final P1' :
        exam.category === 'final_s1' ? 'Final S1' :
        exam.category === 'final' ? 'Final' :
        'Attainment'
      );

      return `
        <div class="card-hover bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div class="space-y-1.5 w-full sm:flex-1 min-w-0">
              <div class="flex flex-wrap items-center gap-1.5">
                ${sub ? `<span class="px-2.5 py-0.5 rounded-md text-xs font-bold text-white shadow-xs" style="background-color: ${this.safeColor(sub.color)}">${this.escapeHtml(sub.name)}</span>` : ''}
                <span class="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">Summative</span>
                <span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${catPillStyle}">${this.escapeHtml(categoryDisplayName)}</span>
                ${exam.isFinal ? '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700">🎓 期末 Final</span>' : ''}
                ${isCurved ? '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 border border-violet-300 dark:border-violet-700">📈 已 Curve</span>' : ''}
                <span class="text-xs text-slate-400 font-mono">${this.escapeHtml(exam.date || '未设置日期')}</span>
              </div>
              <h3 class="text-base font-bold text-slate-900 dark:text-slate-100 pt-0.5">${this.escapeHtml(exam.title)}</h3>
              <!-- 🎯 多单元标签并列展示 -->
              <div class="flex flex-wrap items-center gap-1.5 pt-1">
                ${unitBadges}
              </div>
            </div>

            <!-- 右侧操作栏 -->
            <div class="flex items-center gap-2 shrink-0 whitespace-nowrap">
              <button onclick="app.filterByExam(${this.inlineArg(exam.id)})" class="whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition">
                本测验错题 (${relatedQuestions.length})
              </button>
              <button onclick="app.openExamModal(${this.inlineArg(exam.id)})" class="whitespace-nowrap px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition">编辑</button>
              <button onclick="app.deleteExam(${this.inlineArg(exam.id)})" class="whitespace-nowrap px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-rose-500 hover:bg-rose-50 transition">删除</button>
            </div>
          </div>

          <!-- 核心成绩与折算展示卡 (大号 Grade 徽章 + 卷面分 + 百分比) -->
          <div class="bg-gradient-to-r from-slate-50 to-indigo-50/30 dark:from-slate-800/50 dark:to-indigo-950/20 p-4 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5 sm:gap-5">
            <div class="flex items-start justify-between gap-3 sm:contents">
              <!-- 卷面得分 -->
              <div class="min-w-0 sm:order-1">
                <span class="text-[11px] text-slate-400 uppercase tracking-wider block">原始分 / 满分 (Raw Score)</span>
                <div class="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono leading-tight mt-0.5">
                  ${this.escapeHtml(score)} <span class="text-sm font-normal text-slate-400">/ ${this.escapeHtml(maxScore)} pts</span>
                </div>
                ${isCurved && rawPct !== null ? `<span class="text-[11px] text-slate-400 font-mono">原始折算：${this.escapeHtml(rawPct)}%</span>` : ''}
              </div>

              <!-- 等级 Mark 大徽章 -->
              <div class="flex flex-col items-end shrink-0 sm:order-3">
                <span class="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Task Grade</span>
                <span class="inline-flex items-center px-3.5 py-1 rounded-xl text-sm font-black shadow-sm ${gradeBadgeStyle}">
                  Grade ${this.escapeHtml(grade)}
                </span>
              </div>
            </div>

            <!-- 百分制得分率与进度条 -->
            <div class="w-full sm:flex-1 sm:max-w-xs sm:order-2 space-y-1.5 pt-2.5 sm:pt-0 border-t border-slate-200/70 dark:border-slate-700/60 sm:border-t-0">
              <div class="flex items-center justify-between text-xs gap-2">
                <span class="${isCurved ? 'text-violet-600 dark:text-violet-400 font-semibold' : 'text-slate-500'}">${isCurved ? 'Curve 后有效成绩' : '折算百分制'}</span>
                <span class="font-bold text-slate-800 dark:text-slate-200 font-mono">${this.escapeHtml(percentage)}%</span>
              </div>
              <div class="w-full h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div class="h-full rounded-full transition-all duration-500 ${percentage >= 89.5 ? 'bg-emerald-500' : (percentage >= 79.5 ? 'bg-blue-500' : 'bg-indigo-500')}" style="width: ${Math.min(100, Math.max(0, percentage))}%"></div>
              </div>
            </div>
          </div>

          <!-- 复盘笔记 -->
          ${exam.note ? `
            <div class="text-xs text-slate-600 dark:text-slate-400 bg-amber-50/60 dark:bg-amber-950/20 p-3 rounded-xl border border-amber-200/50 dark:border-amber-900/40">
              <span class="font-bold text-amber-700 dark:text-amber-400">💡 测验反思与失分点：</span>${this.escapeHtml(exam.note)}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    const currentScopeName = isSubjectFocused ? (subMap.get(this.examFilter.subjectId)?.name || '当前学科') : '全部学科';

    // 顶部学科切换胶囊导航 (置顶，点击直接切换全科总览 vs 单门学科)
    const topSubjectSwitcherHtml = `
      <div class="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-xs font-bold text-slate-500 flex items-center gap-1.5 ml-1 mr-1">
            <span>🎯</span>
            <span>切换学科视图：</span>
          </span>
          <button onclick="app.focusSubjectGrades('all')" class="px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${isAllSelected ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}">
            <span>🌟</span>
            <span>全部学科 (全科总览)</span>
            <span class="px-1.5 py-0.2 rounded-full text-[10px] ${isAllSelected ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'} font-mono">${totalCount}</span>
          </button>
          ${this.subjects.map(s => {
            const isCurrent = this.examFilter.subjectId === s.id;
            const sCount = this.exams.filter(e => e.subjectId === s.id).length;
            return `
              <button onclick="app.focusSubjectGrades(${this.inlineArg(s.id)})" class="px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${isCurrent ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-500/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}">
                <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${this.safeColor(s.color)}"></span>
                <span>${this.escapeHtml(s.name)}</span>
                <span class="px-1.5 py-0.2 rounded-full text-[10px] ${isCurrent ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'} font-mono">${sCount}</span>
              </button>
            `;
          }).join('')}
        </div>

        ${isSubjectFocused ? `
          <button onclick="app.clearSubjectFocus()" class="px-3 py-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-xl transition flex items-center gap-1">
            <span>✕</span>
            <span>返回全科总览</span>
          </button>
        ` : ''}
      </div>
    `;

    // 🎓 1. 学期综合平时成绩看板 (遵循用户要求：仅在查看全科数据时出现，且支持收起折叠)
    const gpaDashboardCardHtml = isAllSelected ? this.renderCollapsibleCard({
      key: 'gpa_dashboard',
      title: '学期综合学业评价',
      icon: '📋',
      badge: '全科综合',
      contentHtml: gpaDashboardHtml
    }) : '';

    // 🧭 2. 学情诊断与建议卡片 (支持收起折叠)
    const diagnosticCardHtml = this.renderCollapsibleCard({
      key: 'diagnostics',
      title: isSubjectFocused ? `【${currentScopeName}】学情诊断与建议` : '全科学情诊断与复习规划',
      icon: '🧭',
      badge: isSubjectFocused ? '单科' : '全科',
      contentHtml: diagnosticHtml
    });

    // 📊 3. 多维图表可视化工作台 (支持收起折叠；单科模式下自动隐藏雷达图，环形图与条形图联动单科过滤)
    const chartsSectionCardHtml = this.renderCollapsibleCard({
      key: 'charts_section',
      title: '成绩走势与图表分析',
      icon: '📊',
      badge: currentScopeName,
      contentHtml: `
        <div id="academic-charts-section" class="space-y-6">
          <!-- 图表 1：历次小考成绩走势图 (折线图，带 A*/A 标尺) -->
          <div class="bg-slate-50/70 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-2xs space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <span>📈</span>
                  <span>历次考核成绩走向与基准线 (Score Trend)</span>
                </h3>
                <p class="text-xs text-slate-400 mt-0.5">按时间记录每次平时考核与测验得分率，自动标注 Task Grade 目标基准线</p>
              </div>

              <!-- 学科切换胶囊按钮 -->
              <div class="flex flex-wrap items-center gap-1.5 text-xs">
                <button onclick="app.setExamChartSubject('all')" data-sub="all" class="trend-sub-pill px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${this.examFilter.chartSubjectId === 'all' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}">
                  全部学科走势
                </button>
                ${this.subjects.map(s => {
                  const isActive = this.examFilter.chartSubjectId === s.id;
                  return `
                    <button onclick="app.setExamChartSubject(${this.inlineArg(s.id)})" data-sub="${this.escapeHtml(s.id)}" class="trend-sub-pill px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${isActive ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}">
                      ${this.escapeHtml(s.name)}
                    </button>
                  `;
                }).join('')}
              </div>
            </div>

            <!-- 考核项目/维度专属筛选胶囊 (支持多选，Learning Behaviour 自动排除) -->
            <div class="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-700/60 text-xs">
              <span class="text-slate-400 font-medium">筛选考核项目 (可多选)：</span>
              ${(() => {
                const chartCats = Array.isArray(this.examFilter.chartCategories) && this.examFilter.chartCategories.length > 0
                  ? this.examFilter.chartCategories
                  : ['attainment', 'skills', 'final'];
                const isChartAll = chartCats.length >= 3;
                const activeCls = 'bg-indigo-600 text-white shadow-xs';
                const inactiveCls = 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700';
                return `
                  <button onclick="app.toggleExamChartCategory('all')" data-cat="all" class="trend-cat-pill px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${isChartAll ? activeCls : inactiveCls}">
                    全部学术项目
                  </button>
                  <button onclick="app.toggleExamChartCategory('attainment')" data-cat="attainment" class="trend-cat-pill px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${(!isChartAll && chartCats.includes('attainment')) ? activeCls : inactiveCls}">
                    🎯 Attainment (平时考核)
                  </button>
                  <button onclick="app.toggleExamChartCategory('skills')" data-cat="skills" class="trend-cat-pill px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${(!isChartAll && chartCats.includes('skills')) ? activeCls : inactiveCls}">
                    🔬 Course Skills
                  </button>
                  <button onclick="app.toggleExamChartCategory('final')" data-cat="final" class="trend-cat-pill px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${(!isChartAll && chartCats.includes('final')) ? activeCls : inactiveCls}">
                    🏁 Final (期末考查)
                  </button>
                `;
              })()}
            </div>

            <!-- 图表 Canvas 容器 -->
            <div class="h-64 sm:h-72 w-full relative">
              <canvas id="chart-score-trend"></canvas>
            </div>
          </div>

          <!-- 图表 2 & 3：能力雷达与单元失分条形图 (单科模式下自动隐藏雷达图，单元条形图全宽展示) -->
          <div class="grid grid-cols-1 ${isSubjectFocused ? 'grid-cols-1' : 'lg:grid-cols-2'} gap-6">
            ${!isSubjectFocused ? `
              <!-- 图表 2：全科能力均衡度雷达图 (仅全科模式显示) -->
              <div class="bg-slate-50/70 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-2xs space-y-3">
                <div class="flex items-center justify-between">
                  <div>
                    <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <span>🕸️</span>
                      <span>各学科综合能力与均衡度雷达</span>
                    </h3>
                    <p class="text-[11px] text-slate-400">直观展现各科均衡度与强弱科分布 (仅全科视图)</p>
                  </div>
                </div>
                <div class="h-64 w-full relative">
                  <canvas id="chart-subject-radar"></canvas>
                </div>
              </div>
            ` : ''}

            <!-- 图表 3：各单元知识点表现与失分排查横向条形图 -->
            <div class="bg-slate-50/70 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-2xs space-y-3 ${isSubjectFocused ? 'w-full' : ''}">
              <div class="flex items-center justify-between gap-2">
                <div>
                  <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <span>🎯</span>
                    <span>单元表现与知识点失分排查</span>
                  </h3>
                  <p class="text-[11px] text-slate-400">各单元平均得分率与错题数分布</p>
                </div>
                <select onchange="app.setExamUnitSubject(this.value)" class="px-2.5 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold focus:outline-none">
                  ${this.subjects.map(s => `<option value="${this.escapeHtml(s.id)}" ${(this.examFilter.unitSubjectId || this.subjects[0]?.id) === s.id ? 'selected' : ''}>${this.escapeHtml(s.name)}</option>`).join('')}
                </select>
              </div>
              <div class="h-64 w-full relative">
                <canvas id="chart-unit-performance"></canvas>
              </div>
            </div>
          </div>

          <!-- 图表 4 & 5：等级分布与考核项目表现对比 (均随学科切换动态过滤) -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- 图表 4：Task Grade 等级分布环形图 -->
            <div class="bg-slate-50/70 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-2xs space-y-3">
              <div>
                <div class="flex items-center justify-between">
                  <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <span>🍩</span>
                    <span>Task Grade 等级分布统计</span>
                  </h3>
                  <span class="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-md">
                    ${this.escapeHtml(currentScopeName)}
                  </span>
                </div>
                <p class="text-[11px] text-slate-400">A*、A、B、C 等各个成绩等级的占比 (${this.escapeHtml(currentScopeName)})</p>
              </div>
              <div class="h-56 w-full relative">
                <canvas id="chart-grade-doughnut"></canvas>
              </div>
            </div>

            <!-- 图表 5：考核项目维度表现对比 -->
            <div class="bg-slate-50/70 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-2xs space-y-3">
              <div>
                <div class="flex items-center justify-between">
                  <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <span>📊</span>
                    <span>各考核项目 (Task Category) 平均得分对比</span>
                  </h3>
                  <span class="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-md">
                    ${this.escapeHtml(currentScopeName)}
                  </span>
                </div>
                <p class="text-[11px] text-slate-400">Attainment 平时考核 vs Course Skills vs Learning Behaviour 各项目表现 (${this.escapeHtml(currentScopeName)})</p>
              </div>
              <div class="h-56 w-full relative">
                <canvas id="chart-type-bar"></canvas>
              </div>
            </div>
          </div>
        </div>
      `
    });

    // 📋 4. 小考测验明细记录列表 (支持收起折叠)
    const examRecordsCardHtml = this.renderCollapsibleCard({
      key: 'exam_records',
      title: `历次小考记录明细 (${filteredExams.length})`,
      icon: '📋',
      extraActionHtml: `
        <div class="flex flex-wrap items-center gap-1.5 text-xs max-w-full">
          <select onchange="app.setExamFilter('subjectId', this.value)" class="px-2.5 py-1 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold focus:outline-none">
            <option value="all">全部学科</option>
            ${this.subjects.map(s => `<option value="${this.escapeHtml(s.id)}" ${this.examFilter.subjectId === s.id ? 'selected' : ''}>${this.escapeHtml(s.name)}</option>`).join('')}
          </select>
          <div class="flex flex-wrap items-center gap-1 max-w-full bg-slate-100/80 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200/70 dark:border-slate-700/70">
            <button type="button" onclick="app.toggleExamListCategory('all')" class="px-2 py-0.5 rounded-lg text-[11px] font-semibold transition cursor-pointer ${isAllCats ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700'}">全维度</button>
            ${[
              { id: 'attainment', label: 'Attainment' },
              { id: 'skills', label: 'Course Skills' },
              { id: 'behavior', label: 'Learning Behavior' },
              { id: 'final', label: 'Final' }
            ].map(c => {
              const active = !isAllCats && selectedCats.includes(c.id);
              return `<button type="button" onclick="app.toggleExamListCategory(${this.inlineArg(c.id)})" class="px-2 py-0.5 rounded-lg text-[11px] font-semibold transition cursor-pointer ${active ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700'}">${this.escapeHtml(c.label)}</button>`;
            }).join('')}
          </div>
        </div>
      `,
      contentHtml: `
        <div class="space-y-4">
          ${examCardsHtml}
        </div>
      `
    });

    return `
      <div class="space-y-5">
        <!-- 顶部标题与标准按钮 -->
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-2xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>📈</span>
              <span>各科成绩管理与图表分析看板</span>
            </h2>
            <p class="text-xs text-slate-500 mt-1">
              适配十一国际部 Task Grade 评价体系 · 多维走势图表 · 全科学业均衡度雷达 · 单元知识点失分排查
            </p>
          </div>
          <div class="flex items-center gap-2.5">
            <button onclick="app.toggleGradeScaleGuide()" class="px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 transition shadow-xs flex items-center gap-1.5">
              <span>📖</span>
              <span>Task Grade 换算标准</span>
            </button>
            <button onclick="app.openExamModal()" class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20 transition">
              <span>➕</span>
              <span>录入新测验成绩</span>
            </button>
          </div>
        </div>

        <!-- 页面最顶端：学科快速切换栏 (全部学科总览 vs 各单科) -->
        ${topSubjectSwitcherHtml}

        <!-- 打分标准对照表面板 (可折叠) -->
        <div id="grade-scale-guide-panel" class="hidden bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <div class="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <h4 class="font-bold text-sm text-slate-900 dark:text-slate-100">十一学校国际部 Task Grade Scale 换算对照规则</h4>
            <button onclick="app.toggleGradeScaleGuide()" class="text-slate-400 hover:text-slate-600 text-sm font-bold">&times; 关闭</button>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- A Level 标尺 -->
            <div class="bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
              <span class="font-bold text-slate-900 dark:text-slate-100 block">🇬🇧 A Level 科目打分标准 (Task Grade Scale)</span>
              <div class="grid grid-cols-2 gap-1.5 text-slate-600 dark:text-slate-300 font-mono text-[11px]">
                <div>89.5% ~ 100% ➔ <strong class="text-emerald-600 font-bold">A*</strong></div>
                <div>79.5% ~ 89.4% ➔ <strong class="text-blue-600 font-bold">A</strong></div>
                <div>69.5% ~ 79.4% ➔ <strong class="text-indigo-600 font-bold">B</strong></div>
                <div>59.5% ~ 69.4% ➔ <strong class="text-amber-600 font-bold">C</strong></div>
                <div>49.5% ~ 59.4% ➔ <strong class="text-orange-600 font-bold">D</strong></div>
                <div>40.0% ~ 49.4% ➔ <strong class="text-rose-500 font-bold">E</strong></div>
                <div class="col-span-2">0.0% ~ 39.9% ➔ <strong class="text-rose-700 font-bold">U (Ungraded)</strong></div>
              </div>
            </div>

            <!-- CNCC 标尺 -->
            <div class="bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
              <span class="font-bold text-slate-900 dark:text-slate-100 block">🇨🇳 CNCC 国家课程打分标准 (Task Grade Scale)</span>
              <div class="grid grid-cols-2 gap-1.5 text-slate-600 dark:text-slate-300 font-mono text-[11px]">
                <div>94.5% ~ 100% ➔ <strong class="text-emerald-600 font-bold">A+</strong></div>
                <div>89.5% ~ 94.4% ➔ <strong class="text-teal-600 font-bold">A</strong></div>
                <div>84.5% ~ 89.4% ➔ <strong class="text-cyan-600 font-bold">A-</strong></div>
                <div>79.5% ~ 84.4% ➔ <strong class="text-blue-600 font-bold">B</strong></div>
                <div>69.5% ~ 79.4% ➔ <strong class="text-amber-600 font-bold">C</strong></div>
                <div>59.5% ~ 69.4% ➔ <strong class="text-orange-600 font-bold">D</strong></div>
                <div class="col-span-2">0.0% ~ 59.4% ➔ <strong class="text-rose-700 font-bold">F (Fail)</strong></div>
              </div>
            </div>
          </div>
        </div>

        <!-- 1. 🎓 十一学校国际部学期综合 GPA 与 Task Category 评价看板 (仅在全科模式下出现) -->
        ${gpaDashboardCardHtml}

        <!-- 2. 🧭 学情诊断与智能提分复习建议 (全科宏观诊断 vs 单科精准深度诊断) -->
        ${diagnosticCardHtml}

        <!-- 3. 📊 多维交互式图表可视化工作台 -->
        ${chartsSectionCardHtml}

        <!-- 5. 📋 小考测验明细记录列表 -->
        ${examRecordsCardHtml}
      </div>
    `;
  }

  // 触发图表绘制引擎 (Chart.js 实例更新)
  renderExamsCharts() {
    if (typeof window.academicCharts === 'undefined') return;

    requestAnimationFrame(() => {
      const activeSubId = this.examFilter.subjectId;
      const isSingleSubject = activeSubId !== 'all';
      const targetExamsForCharts = isSingleSubject
        ? this.exams.filter(e => e.subjectId === activeSubId)
        : this.exams;

      // 1. 历次小考成绩趋势走向
      window.academicCharts.renderScoreTrendChart(
        'chart-score-trend',
        this.exams,
        this.examFilter.chartSubjectId || 'all',
        this.subjects,
        this.examFilter.chartCategories || ['attainment', 'skills', 'final']
      );

      // 2. 全科学业均衡度雷达图：仅在全科模式下绘制（使用各科加权总评得分）！
      if (!isSingleSubject) {
        const topSubjects = this.subjects.filter(s => !s.parentId);
        const weightedScores = {};
        topSubjects.forEach(s => {
          const assess = this.getSubjectAssessment(s.id);
          if (assess && assess.overallScore !== null) {
            weightedScores[s.id] = assess.overallScore;
          }
        });
        window.academicCharts.renderSubjectRadarChart(
          'chart-subject-radar',
          topSubjects,
          this.exams,
          weightedScores
        );
      }

      // 3. 单元得分表现条形图
      const targetSub = this.subjects.find(s => s.id === (this.examFilter.unitSubjectId || this.subjects[0]?.id)) || this.subjects[0];
      if (targetSub) {
        window.academicCharts.renderUnitPerformanceChart(
          'chart-unit-performance',
          targetSub,
          this.exams,
          this.questions
        );
      }

      // 4. Task Grade 等级分布环形图 (随所选学科动态过滤)
      window.academicCharts.renderGradeDoughnutChart(
        'chart-grade-doughnut',
        targetExamsForCharts
      );

      // 5. 考核项目表现对比柱状图 (严格遵循 Task Categories，随所选学科动态过滤)
      window.academicCharts.renderTypeBarChart(
        'chart-type-bar',
        targetExamsForCharts
      );
    });
  }

  setExamChartSubject(subId) {
    this.examFilter.chartSubjectId = subId;
    if (window.academicCharts) {
      window.academicCharts.renderScoreTrendChart(
        'chart-score-trend',
        this.exams,
        subId,
        this.subjects,
        this.examFilter.chartCategories || ['attainment', 'skills', 'final']
      );
    }
    const pills = document.querySelectorAll('.trend-sub-pill');
    pills.forEach(p => {
      const pSub = p.getAttribute('data-sub');
      if (pSub === subId) {
        p.className = 'trend-sub-pill px-2.5 py-1 rounded-lg font-semibold transition bg-indigo-600 text-white shadow-xs';
      } else {
        p.className = 'trend-sub-pill px-2.5 py-1 rounded-lg font-semibold transition bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700';
      }
    });
  }

  _nextMultiFilterSelection(currentList, allItems, clickedId) {
    const current = (Array.isArray(currentList) && currentList.length > 0) ? currentList : [...allItems];
    if (clickedId === 'all') return [...allItems];
    if (current.length >= allItems.length) {
      return [clickedId];
    }
    if (current.includes(clickedId)) {
      return current.length === 1 ? [...allItems] : current.filter(c => c !== clickedId);
    }
    return [...current, clickedId];
  }

  toggleExamChartCategory(catId) {
    const allAcademicCats = ['attainment', 'skills', 'final'];
    this.examFilter.chartCategories = this._nextMultiFilterSelection(
      this.examFilter.chartCategories,
      allAcademicCats,
      catId
    );

    if (window.academicCharts) {
      window.academicCharts.renderScoreTrendChart(
        'chart-score-trend',
        this.exams,
        this.examFilter.chartSubjectId || 'all',
        this.subjects,
        this.examFilter.chartCategories
      );
    }

    const isAll = this.examFilter.chartCategories.length >= allAcademicCats.length;
    const pills = document.querySelectorAll('.trend-cat-pill');
    pills.forEach(p => {
      const pCat = p.getAttribute('data-cat');
      const isSelected = pCat === 'all' ? isAll : (!isAll && this.examFilter.chartCategories.includes(pCat));
      if (isSelected) {
        p.className = 'trend-cat-pill px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer bg-indigo-600 text-white shadow-xs';
      } else {
        p.className = 'trend-cat-pill px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700';
      }
    });
  }

  setExamUnitSubject(subId) {
    this.examFilter.unitSubjectId = subId;
    const sub = this.subjects.find(s => s.id === subId) || this.subjects[0];
    if (sub && window.academicCharts) {
      window.academicCharts.renderUnitPerformanceChart(
        'chart-unit-performance',
        sub,
        this.exams,
        this.questions
      );
    }
  }

  focusSubjectGrades(subId) {
    if (subId === 'all' || this.examFilter.subjectId === subId) {
      this.clearSubjectFocus();
      return;
    }
    this.examFilter.subjectId = subId;
    this.examFilter.chartSubjectId = subId;
    this.examFilter.unitSubjectId = subId;
    this.render();
  }

  clearSubjectFocus() {
    this.examFilter.subjectId = 'all';
    this.examFilter.chartSubjectId = 'all';
    this.render();
    this.showToast('已切换至查看全科学业总览', 'info');
  }

  jumpToPracticeUnit(subId, unitId) {
    this.practiceFilter.subjectId = subId;
    this.practiceFilter.unitIds = unitId ? [unitId] : [];
    this.switchTab('practice');
    this.generateUnitPracticePaper(0); // 优先组卷待攻克错题
  }

  _examMatchesCategory(e, cat) {
    if (cat === 'attainment') {
      if (e.category === 'attainment' || e.category === 'att_p1' || e.category === 'att_s1' || e.category === 'exams') return true;
      return !e.category && !e.isFinal && e.type !== 'Final';
    }
    if (cat === 'final') {
      return e.category === 'final' || e.category === 'final_p1' || e.category === 'final_s1' || !!e.isFinal || e.type === 'Final';
    }
    if (cat === 'skills') return e.category === 'skills';
    if (cat === 'behavior') return e.category === 'behavior';
    return e.category === cat;
  }

  toggleExamListCategory(catId) {
    const allCats = ['attainment', 'skills', 'behavior', 'final'];
    this.examFilter.categories = this._nextMultiFilterSelection(
      this.examFilter.categories,
      allCats,
      catId
    );
    this.render();
  }

  setExamFilter(key, value) {
    this.examFilter[key] = value;
    if (key === 'subjectId') {
      this.examFilter.chartSubjectId = value;
      this.examFilter.unitSubjectId = value === 'all' ? (this.subjects[0]?.id || '') : value;
    }
    this.render();
  }

  toggleGradeScaleGuide() {
    const el = document.getElementById('grade-scale-guide-panel');
    if (el) el.classList.toggle('hidden');
  }

  filterByExam(examId) {
    this.filter.examId = examId;
    this.filter.subjectId = 'all';
    this.filter.unitId = 'all';
    this.switchTab('questions');
  }

  // --- 模块 4：试卷重练与单元专项组卷模式 ---
  renderPracticeTab() {
    const selectedCount = window.practicePaperEngine.getSelectedCount();
    const paperHtml = window.practicePaperEngine.generatePaperHtml(this.questions, this.subjects, this.exams);

    const selectedUnitIds = this.practiceFilter.unitIds || [];
    const targetSubjects = this.practiceFilter.subjectId === 'all'
      ? this.subjects
      : this.subjects.filter(s => s.id === this.practiceFilter.subjectId);

    const seenUnitIds = new Set();
    const unitMap = new Map();
    let unitItemsHtml = '';

    targetSubjects.forEach(s => {
      const subUnits = (s.units || []).filter(u => {
        if (seenUnitIds.has(u.id)) return false;
        seenUnitIds.add(u.id);
        return true;
      });
      if (subUnits.length === 0) return;

      if (this.practiceFilter.subjectId === 'all') {
        unitItemsHtml += `<div class="dropdown-group-header px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/80 dark:bg-slate-800/60 sticky top-0">${this.escapeHtml(s.name)}</div>`;
      }
      unitItemsHtml += subUnits.map(u => {
        const count = this.questions.filter(q => q.subjectId === s.id && q.unitId === u.id).length;
        const checked = selectedUnitIds.includes(u.id);
        unitMap.set(u.id, { id: u.id, name: u.name, count });
        const searchText = this.escapeHtml(`${s.name} ${u.name}`.toLowerCase());
        return `
          <label class="dropdown-item flex items-center justify-between gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition ${checked ? 'bg-indigo-50/70 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 font-semibold' : 'text-slate-700 dark:text-slate-300'}" data-search-text="${searchText}">
            <span class="flex items-center gap-2 min-w-0">
              <input type="checkbox" ${checked ? 'checked' : ''} onchange="app.togglePracticeUnit(${this.inlineArg(u.id)})" class="rounded text-indigo-600 focus:ring-indigo-500 shrink-0" />
              <span class="truncate">${this.escapeHtml(u.name)}</span>
            </span>
            <span class="text-[11px] text-slate-400 shrink-0">(${count}题)</span>
          </label>
        `;
      }).join('');
    });

    let unitTriggerLabel = '所有单元 (全部)';
    if (selectedUnitIds.length === 1) {
      unitTriggerLabel = unitMap.get(selectedUnitIds[0])?.name || '已选 1 个单元';
    } else if (selectedUnitIds.length > 1) {
      unitTriggerLabel = `已选 ${selectedUnitIds.length} 个单元`;
    }

    const isPracticeUnitOpen = this.openDropdown === 'practice-unit';
    const selectedChipsHtml = selectedUnitIds.length > 0 ? `
      <div class="flex flex-wrap items-center gap-1.5 pt-1">
        <span class="text-[11px] text-indigo-700/80 dark:text-indigo-300/80 font-semibold">已选单元：</span>
        ${selectedUnitIds.map(uid => {
          const info = unitMap.get(uid);
          const name = info ? info.name : uid;
          return `
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shadow-2xs">
              <span class="max-w-[200px] truncate">${this.escapeHtml(name)}</span>
              <button onclick="app.togglePracticeUnit(${this.inlineArg(uid)})" class="text-indigo-400 hover:text-rose-500 font-bold leading-none ml-0.5" title="移除">×</button>
            </span>
          `;
        }).join('')}
        <button onclick="app.selectAllPracticeUnits(false)" class="text-[11px] text-slate-500 hover:text-rose-600 underline ml-1">清空</button>
      </div>
    ` : '';

    return `
      <div class="space-y-6">
        <div class="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 class="text-xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>📑</span>
              <span>错题重做与按单元专项组卷</span>
            </h2>
            <p class="text-xs text-slate-500 mt-1">当前已选择 <strong class="text-indigo-600 text-sm font-bold">${selectedCount}</strong> 道题目 · 自动生成 A4 标准排版重做强化卷</p>
          </div>

          <div class="flex items-center gap-2">
            <button onclick="app.quickSelectPractice('none')" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
              清空重置
            </button>
            <button onclick="app.printPracticePaper()" class="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20 transition">
              <span>🖨️</span>
              <span>立即打印 / 导出为 PDF</span>
            </button>
          </div>
        </div>

        <div class="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/40 dark:to-purple-950/40 p-5 rounded-2xl border border-indigo-200/80 dark:border-indigo-900/60 shadow-xs space-y-3">
          <div class="flex items-center gap-2 text-xs font-black text-indigo-900 dark:text-indigo-200">
            <span>🎯</span>
            <span>按学科 & 单元一键精准组卷 (Topic-based Practice · 支持多选单元)</span>
          </div>

          <div class="flex flex-wrap items-center gap-3 text-xs">
            <select onchange="app.setPracticeFilter('subjectId', this.value)" class="px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-semibold focus:outline-none">
              <option value="all">选择学科 (全部)</option>
              ${this.subjects.map(s => `<option value="${this.escapeHtml(s.id)}" ${this.practiceFilter.subjectId === s.id ? 'selected' : ''}>${this.escapeHtml(s.name)}</option>`).join('')}
            </select>

            <div class="relative custom-dropdown-container">
              <button type="button" onclick="app.toggleDropdown('practice-unit')" class="px-3 py-2 border ${selectedUnitIds.length > 0 ? 'border-indigo-400 dark:border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-200' : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100'} rounded-xl font-semibold flex items-center justify-between gap-2 min-w-0 w-full sm:w-auto sm:min-w-[220px] sm:max-w-[300px] focus:outline-none">
                <span class="truncate">${this.escapeHtml(unitTriggerLabel)}</span>
                <span class="text-slate-400 text-[10px] shrink-0">▼</span>
              </button>

              <div data-dropdown-menu="practice-unit" class="custom-dropdown-menu ${isPracticeUnitOpen ? '' : 'hidden'} absolute left-0 mt-1.5 w-[min(20rem,calc(100vw-2rem))] sm:w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-40 overflow-hidden">
                <div class="p-2 border-b border-slate-100 dark:border-slate-800 space-y-2">
                  <input type="text" placeholder="搜索单元名称..." oninput="app.filterDropdownList('practice-unit', this.value)" class="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  <div class="flex items-center justify-between text-[11px] px-1">
                    <button type="button" onclick="app.selectAllPracticeUnits(true)" class="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">全选当前单元</button>
                    <button type="button" onclick="app.selectAllPracticeUnits(false)" class="text-slate-500 hover:text-rose-600 hover:underline">清空 (默认全部)</button>
                  </div>
                </div>
                <div class="max-h-72 overflow-y-auto divide-y divide-slate-50 dark:divide-slate-800/60">
                  ${unitItemsHtml || '<div class="px-3 py-4 text-center text-slate-400 text-xs">暂无可选单元</div>'}
                </div>
              </div>
            </div>

            <button onclick="app.generateUnitPracticePaper(null)" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-xs transition">
              📚 组卷：所选单元错题
            </button>
          </div>

          ${selectedChipsHtml}
        </div>

        <div class="bg-white dark:bg-slate-900 px-4 sm:px-5 py-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-5 text-xs text-slate-600 dark:text-slate-300">
          <!-- 字号调节 -->
          <div class="flex flex-col sm:flex-row sm:items-center gap-2">
            <span class="font-bold text-slate-700 dark:text-slate-200 shrink-0">排版字号：</span>
            <div class="flex flex-wrap items-center gap-2">
              <label class="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 whitespace-nowrap"><input type="radio" name="paper-fontsize" value="small" ${window.practicePaperEngine.options.fontSize === 'small' ? 'checked' : ''} onchange="app.setPracticeOption('fontSize', 'small')" /> 紧凑小号 (9.5pt)</label>
              <label class="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 whitespace-nowrap"><input type="radio" name="paper-fontsize" value="medium" ${(window.practicePaperEngine.options.fontSize || 'medium') === 'medium' ? 'checked' : ''} onchange="app.setPracticeOption('fontSize', 'medium')" /> 标准中号 (10.5pt)</label>
              <label class="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 whitespace-nowrap"><input type="radio" name="paper-fontsize" value="large" ${window.practicePaperEngine.options.fontSize === 'large' ? 'checked' : ''} onchange="app.setPracticeOption('fontSize', 'large')" /> 清晰大号 (12pt)</label>
            </div>
          </div>

          <!-- 作答留白 -->
          <div class="flex flex-col sm:flex-row sm:items-center gap-2">
            <span class="font-bold text-slate-700 dark:text-slate-200 shrink-0">作答留白区域：</span>
            <div class="flex flex-wrap items-center gap-2">
              <label class="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 whitespace-nowrap"><input type="radio" name="paper-spacing" value="auto" ${(window.practicePaperEngine.options.spacing || 'auto') === 'auto' ? 'checked' : ''} onchange="app.setPracticeOption('spacing', 'auto')" /> 智能按小问 (推荐)</label>
              <label class="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 whitespace-nowrap"><input type="radio" name="paper-spacing" value="none" ${window.practicePaperEngine.options.spacing === 'none' ? 'checked' : ''} onchange="app.setPracticeOption('spacing', 'none')" /> 无需留白</label>
              <label class="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 whitespace-nowrap"><input type="radio" name="paper-spacing" value="compact" ${window.practicePaperEngine.options.spacing === 'compact' ? 'checked' : ''} onchange="app.setPracticeOption('spacing', 'compact')" /> 紧凑 (80px)</label>
              <label class="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 whitespace-nowrap"><input type="radio" name="paper-spacing" value="medium" ${window.practicePaperEngine.options.spacing === 'medium' ? 'checked' : ''} onchange="app.setPracticeOption('spacing', 'medium')" /> 标准 (160px)</label>
              <label class="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 whitespace-nowrap"><input type="radio" name="paper-spacing" value="large" ${window.practicePaperEngine.options.spacing === 'large' ? 'checked' : ''} onchange="app.setPracticeOption('spacing', 'large')" /> 大题演算 (300px)</label>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-4 pt-1 sm:pt-0 border-t border-slate-100 dark:border-slate-800 sm:border-t-0">
            <label class="cursor-pointer inline-flex items-center gap-1.5 font-bold">
              <input type="checkbox" ${window.practicePaperEngine.options.includeSolutions ? 'checked' : ''} onchange="app.setPracticeOption('includeSolutions', this.checked)" class="rounded text-indigo-600" />
              <span>卷末另起一页附带 Mark Scheme 详细解析</span>
            </label>

            <label class="cursor-pointer inline-flex items-center gap-1.5">
              <input type="checkbox" ${window.practicePaperEngine.options.showUnitBadge ? 'checked' : ''} onchange="app.setPracticeOption('showUnitBadge', this.checked)" class="rounded text-indigo-600" />
              <span>题目显示单元标签</span>
            </label>
          </div>
        </div>

        <div id="practice-paper-container">
          ${paperHtml}
        </div>
      </div>
    `;
  }

  bindPracticeTabEvents() {}

  setPracticeFilter(key, value) {
    this.practiceFilter[key] = value;
    if (key === 'subjectId') {
      this.practiceFilter.unitIds = [];
    }
    this.closeAllDropdowns();
    this.render();
  }

  togglePracticeUnit(unitId) {
    const ids = [...(this.practiceFilter.unitIds || [])];
    const idx = ids.indexOf(unitId);
    if (idx >= 0) {
      ids.splice(idx, 1);
    } else {
      ids.push(unitId);
    }
    this.practiceFilter.unitIds = ids;
    this.render();
  }

  selectAllPracticeUnits(selectAll) {
    if (!selectAll) {
      this.practiceFilter.unitIds = [];
    } else {
      const targetSubjects = this.practiceFilter.subjectId === 'all'
        ? this.subjects
        : this.subjects.filter(s => s.id === this.practiceFilter.subjectId);
      const seen = new Set();
      const allIds = [];
      targetSubjects.forEach(s => {
        (s.units || []).forEach(u => {
          if (!seen.has(u.id)) {
            seen.add(u.id);
            allIds.push(u.id);
          }
        });
      });
      this.practiceFilter.unitIds = allIds;
    }
    this.render();
  }

  generateUnitPracticePaper(masteryLevel = null) {
    const subId = this.practiceFilter.subjectId;
    const unitIds = this.practiceFilter.unitIds || [];

    window.practicePaperEngine.selectByUnit(this.questions, subId, unitIds, masteryLevel);

    const sub = this.subjects.find(s => s.id === subId);
    const searchSubs = sub ? [sub] : this.subjects;
    const unitNameMap = new Map();
    searchSubs.forEach(s => {
      (s.units || []).forEach(item => {
        if (!unitNameMap.has(item.id)) unitNameMap.set(item.id, item.name);
      });
    });

    if (unitIds.length === 1) {
      const uName = unitNameMap.get(unitIds[0]) || unitIds[0];
      window.practicePaperEngine.options.title = `${sub ? sub.name + ' · ' : ''}${uName} 专项突破重练卷`;
    } else if (unitIds.length > 1) {
      window.practicePaperEngine.options.title = `${sub ? sub.name + ' · ' : ''}多单元 (${unitIds.length}个单元) 专项突破重练卷`;
    } else if (sub) {
      window.practicePaperEngine.options.title = `${sub.name} 错题强化重做卷`;
    } else {
      window.practicePaperEngine.options.title = 'A Level / CNCC 错题复盘与重做强化试卷';
    }

    this.closeAllDropdowns();
    const count = window.practicePaperEngine.getSelectedCount();
    if (count === 0) {
      this.showToast('所选单元下未找到符合条件的题目！', 'warning');
    } else {
      this.showToast(`已成功为所选单元挑选出 ${count} 道重练错题！`, 'success');
    }
    this.render();
  }

  quickSelectPractice(mode) {
    if (mode === 'none') {
      window.practicePaperEngine.deselectAll();
    }
    this.render();
  }

  setPracticeOption(key, val) {
    window.practicePaperEngine.options[key] = val;
    if (key === 'spacing') {
      window.practicePaperEngine.clearCustomSpacing();
    }
    this.render();
  }

  previewPracticeQuestionSpacing(questionId, val) {
    const px = Math.max(0, Math.min(800, Math.round(Number(val) || 0)));
    const box = document.querySelector(`[data-write-area-qid="${questionId}"]`);
    if (box) box.style.minHeight = `${px}px`;
    const label = document.querySelector(`[data-write-val-qid="${questionId}"]`);
    if (label) label.textContent = `${px}px`;
  }

  setPracticeQuestionSpacing(questionId, val) {
    window.practicePaperEngine.setQuestionSpacing(questionId, val);
    this.render();
  }

  adjustPracticeQuestionSpacing(questionId, delta) {
    const q = this.questions.find(item => item.id === questionId);
    if (!q) return;
    const current = window.practicePaperEngine.getQuestionSpacing(q);
    window.practicePaperEngine.setQuestionSpacing(questionId, current + delta);
    this.render();
  }

  resetPracticeQuestionSpacing(questionId) {
    window.practicePaperEngine.resetQuestionSpacing(questionId);
    this.render();
  }

  printPracticePaper() {
    const selectedCount = window.practicePaperEngine.getSelectedCount();
    if (selectedCount === 0) {
      this.showToast('请先至少选择一道错题再打印！', 'warning');
      return;
    }
    const printContainer = document.getElementById('print-container');
    if (printContainer) {
      printContainer.innerHTML = window.practicePaperEngine.generatePaperHtml(this.questions, this.subjects, this.exams);
    }
    const fontClass = `paper-font-${window.practicePaperEngine.options.fontSize || 'medium'}`;
    const prevClass = document.body.className;
    document.body.classList.add(fontClass);
    window.print();
    setTimeout(() => {
      document.body.className = prevClass;
    }, 500);
  }

  // --- 模块 5：学科与单元管理视图 ---
  renderSubjectsTab() {
    const subCardsHtml = this.subjects.map(sub => {
      const qCount = this.questions.filter(q => q.subjectId === sub.id).length;
      const exCount = this.exams.filter(e => e.subjectId === sub.id).length;
      const units = sub.units || [];

      return `
        <div class="card-hover bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div class="flex items-center gap-3 min-w-0">
              <span class="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-xs shrink-0" style="background-color: ${this.safeColor(sub.color)}">
                ${this.escapeHtml(sub.name.slice(0, 1))}
              </span>
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <h4 class="font-bold text-base text-slate-900 dark:text-slate-100 truncate">${this.escapeHtml(sub.name)}</h4>
                  ${sub.curriculum ? `<span class="shrink-0 px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800/50">${this.escapeHtml(sub.curriculum)}</span>` : ''}
                </div>
                <div class="text-xs text-slate-500 mt-0.5 truncate">${qCount}道错题 · ${exCount}次测验 · 满分${this.escapeHtml(sub.defaultMaxScore || 30)}分</div>
              </div>
            </div>

            <div class="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
              <button onclick="app.openUnitManagerModal(${this.inlineArg(sub.id)})" class="whitespace-nowrap shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 transition">
                管理单元 (${units.length})
              </button>
              <button onclick="app.openSubjectModal(${this.inlineArg(sub.id)})" class="whitespace-nowrap shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition">编辑</button>
              <button onclick="app.deleteSubject(${this.inlineArg(sub.id)})" class="whitespace-nowrap shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-rose-500 hover:bg-rose-50 transition">删除</button>
            </div>
          </div>

          <div class="space-y-1.5">
            <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">已规划单元 / Topics (${units.length})：</span>
            <div class="flex flex-wrap gap-1.5">
              ${units.length === 0 
                ? '<span class="text-xs text-slate-400 italic">暂无单元，点击“管理单元”进行添加</span>' 
                : units.map(u => {
                    const countInUnit = this.questions.filter(q => q.subjectId === sub.id && q.unitId === u.id).length;
                    return `<span class="px-2 py-0.5 rounded text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">${this.escapeHtml(u.name)} <strong class="text-indigo-500">(${countInUnit})</strong></span>`;
                  }).join('')
              }
            </div>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="max-w-4xl mx-auto space-y-6">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-2xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>🏷️</span>
              <span>十一学校国际部学科与单元体系</span>
            </h2>
            <p class="text-xs text-slate-500 mt-1">支持 A Level (数学/物理/经济) 与 CNCC (地理/生物/化学) 独立维护知识单元</p>
          </div>
          <button onclick="app.openSubjectModal()" class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20 transition">
            <span>➕</span>
            <span>新建科目</span>
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${subCardsHtml}
        </div>
      </div>
    `;
  }

  // --- 模块 5.5：Gemini AI 拍照/截图识图自动录入与原图框选裁剪 ---
  renderAiImportPanelHtml() {
    const ai = window.geminiAI;
    const cfg = ai ? ai.getConfig() : { apiKey: '', model: 'gemini-2.5-flash', baseUrl: '' };
    const hasKey = !!(ai && ai.hasApiKey());
    const qImgs = this.aiState.questionImages || [];
    const msImgs = this.aiState.markSchemeImages || [];
    const isBusy = this.aiState.isRecognizing || this.aiState.isLookingUpCode;
    const hasRecognizedQuestion = !!(
      (this.form.stem && this.form.stem.trim()) ||
      (this.form.content && this.form.content.trim()) ||
      (Array.isArray(this.form.parts) && this.form.parts.some(p => (p.text || '').trim()))
    );
    const lookup = this.aiState.paperCodeLookup;
    const searchQueryText = (this.form.stem || (this.form.parts && this.form.parts[0] && this.form.parts[0].text) || this.form.content || '').replace(/\s+/g, ' ').trim().slice(0, 110);
    const googleSearchUrl = searchQueryText
      ? `https://www.google.com/search?q=${encodeURIComponent(`"${searchQueryText}" Cambridge mark scheme`)}`
      : '';

    const providerLabel = cfg.provider === 'deepseek' ? 'DeepSeek / OpenAI' : 'Gemini';

    return `
      <div class="bg-gradient-to-br from-indigo-50/90 via-violet-50/70 to-sky-50/80 dark:from-indigo-950/50 dark:via-slate-900 dark:to-violet-950/30 rounded-2xl border border-indigo-200/90 dark:border-indigo-800/70 shadow-xs overflow-hidden">
        <div class="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none" onclick="app.toggleAiPanel()">
          <div class="flex items-center gap-2.5">
            <span class="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white flex items-center justify-center text-base shadow-xs">✨</span>
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-sm font-black text-slate-900 dark:text-slate-100">AI 拍照 / 截图识图自动录入</span>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-100 dark:bg-indigo-900/70 text-indigo-700 dark:text-indigo-300">${providerLabel} · ${this.escapeHtml(cfg.model)}</span>
                ${hasKey
                  ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300">● Key 已配置</span>'
                  : '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300">未配置 Key</span>'
                }
              </div>
              <p class="text-[11px] text-slate-500 dark:text-slate-400">上传题目照片或直接按 Cmd+V 粘贴截图，AI 自动提取题干、LaTeX 公式、小问、CIE 题号及 Mark Scheme 四列表格</p>
            </div>
          </div>
          <div class="flex items-center gap-2" onclick="event.stopPropagation()">
            <div class="inline-flex rounded-lg bg-white/80 dark:bg-slate-800 p-0.5 border border-indigo-200/70 dark:border-slate-700 text-[11px] font-bold">
              <button type="button" onclick="app.setAiProvider('deepseek')" class="px-2 py-0.5 rounded-md transition ${cfg.provider === 'deepseek' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}">DeepSeek</button>
              <button type="button" onclick="app.setAiProvider('gemini')" class="px-2 py-0.5 rounded-md transition ${cfg.provider === 'gemini' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}">Gemini</button>
            </div>
            <button type="button" onclick="app.toggleAiPanel()" class="px-3 py-1 rounded-lg text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-white/70 dark:hover:bg-slate-800 transition">
              ${this.aiPanelOpen ? '▲ 收起' : '▼ 展开识图'}
            </button>
          </div>
        </div>

        ${this.aiPanelOpen ? `
          <div class="px-5 pb-5 pt-2 border-t border-indigo-200/60 dark:border-indigo-900/50 space-y-4">
            ${!hasKey ? `
              <div class="p-3.5 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 flex flex-wrap items-center justify-between gap-3">
                <div class="text-xs text-amber-800 dark:text-amber-200">
                  <strong>首次使用请先保存你的 ${cfg.provider === 'deepseek' ? 'DeepSeek' : 'Gemini'} API Key</strong>（仅保存在当前浏览器本地，也可在「⚙️ 备份设置」切换或修改）：
                </div>
                <div class="flex items-center gap-2 flex-1 min-w-0 w-full sm:min-w-[260px] max-w-md">
                  <input type="password" id="ai-quick-key-input" placeholder="${cfg.provider === 'deepseek' ? '粘贴 DeepSeek API Key (sk-...)' : '粘贴 Gemini API Key (AQ.Ab8... 或 AIza...)'}" class="flex-1 px-3 py-1.5 text-xs font-mono border border-amber-300 dark:border-amber-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  <button type="button" onclick="app.saveQuickGeminiKey()" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shrink-0">保存 Key</button>
                </div>
              </div>
            ` : ''}

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- 左侧：题目图片 -->
              <div id="ai-question-dropzone" tabindex="0" onclick="app.setAiPasteTarget('question')" ondragover="event.preventDefault()" ondrop="app.handleAiDrop(event, 'question')" class="p-4 rounded-xl bg-white/85 dark:bg-slate-900/80 border-2 border-dashed ${this.aiState.pasteTarget === 'question' ? 'border-indigo-400 dark:border-indigo-600 ring-2 ring-indigo-500/10' : 'border-slate-300 dark:border-slate-700'} transition space-y-3 focus:outline-none">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-black text-slate-800 dark:text-slate-100">📸 题目图片 (支持多张)</span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 font-bold">必选</span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <label class="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer transition shadow-2xs" onclick="event.stopPropagation()">
                      📷 直接拍照
                      <input type="file" accept="image/*" capture="environment" onchange="app.handleAiImageUpload('question', this)" class="hidden" />
                    </label>
                    <label class="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 cursor-pointer transition" onclick="event.stopPropagation()">
                      🖼️ 相册选图
                      <input type="file" accept="image/*,.heic,.heif" multiple onchange="app.handleAiImageUpload('question', this)" class="hidden" />
                    </label>
                  </div>
                </div>

                ${qImgs.length === 0 ? `
                  <div class="py-5 text-center text-xs text-slate-400">
                    <div>点击此处后按 <kbd class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[10px]">Cmd+V</kbd> 粘贴截图，或拖拽/点击右上角传图</div>
                  </div>
                ` : `
                  <div class="flex flex-wrap gap-2.5">
                    ${qImgs.map((img, idx) => `
                      <div class="relative group w-28 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 overflow-hidden shadow-2xs">
                        ${img.isHeicRaw ? `
                          <div class="w-full h-24 flex flex-col items-center justify-center p-2 text-center bg-indigo-50/60 dark:bg-indigo-950/30" title="${this.escapeHtml(img.name)}（可直接用于 AI 识图）">
                            <span class="text-2xl leading-none mb-1">📱</span>
                            <span class="text-[10px] font-bold text-indigo-700 dark:text-indigo-300 leading-tight">HEIC 原图</span>
                            <span class="text-[9px] text-slate-400 truncate max-w-full mt-0.5">${this.escapeHtml(img.name)}</span>
                          </div>
                        ` : `
                          <img src="${img.dataUrl}" onclick="event.stopPropagation(); window.previewImage && window.previewImage('${img.dataUrl}')" class="w-full h-24 object-cover cursor-pointer" title="点击查看大图" />
                        `}
                        <div class="p-1 flex items-center justify-between gap-1 bg-white/95 dark:bg-slate-900/95 border-t border-slate-100 dark:border-slate-700">
                          ${img.isHeicRaw ? `
                            <span class="flex-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 truncate px-0.5" title="可点击右下角开始 AI 识图">✓ 可识图</span>
                          ` : `
                            <button type="button" onclick="event.stopPropagation(); app.openAiCropModal(${idx})" class="flex-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline truncate" title="从原图框选几何/树形图插入题目">✂️ 框选插图</button>
                          `}
                          <button type="button" onclick="event.stopPropagation(); app.removeAiImage('question', ${idx})" class="text-[11px] text-slate-400 hover:text-rose-500 font-bold px-1" title="移除">×</button>
                        </div>
                      </div>
                    `).join('')}
                  </div>
                `}
              </div>

              <!-- 右侧：Mark Scheme 答案图 (可选) -->
              <div id="ai-ms-dropzone" tabindex="0" onclick="app.setAiPasteTarget('ms')" ondragover="event.preventDefault()" ondrop="app.handleAiDrop(event, 'ms')" class="p-4 rounded-xl bg-white/85 dark:bg-slate-900/80 border-2 border-dashed ${this.aiState.pasteTarget === 'ms' ? 'border-violet-400 dark:border-violet-600 ring-2 ring-violet-500/10' : 'border-slate-300 dark:border-slate-700'} transition space-y-3 focus:outline-none">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-black text-slate-800 dark:text-slate-100">📋 Mark Scheme / 答案图</span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-semibold">可选</span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <label class="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-violet-600 text-white hover:bg-violet-700 cursor-pointer transition shadow-2xs" onclick="event.stopPropagation()">
                      📷 拍答案
                      <input type="file" accept="image/*" capture="environment" onchange="app.handleAiImageUpload('ms', this)" class="hidden" />
                    </label>
                    <label class="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 hover:bg-violet-100 cursor-pointer transition" onclick="event.stopPropagation()">
                      🖼️ 相册选图
                      <input type="file" accept="image/*,.heic,.heif" multiple onchange="app.handleAiImageUpload('ms', this)" class="hidden" />
                    </label>
                  </div>
                </div>

                ${msImgs.length === 0 ? `
                  <div class="py-5 text-center text-xs text-slate-400">
                    <div>点击此处后按 <kbd class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[10px]">Cmd+V</kbd> 粘贴评分标准截图，自动填入 4 列表格</div>
                  </div>
                ` : `
                  <div class="flex flex-wrap gap-2.5">
                    ${msImgs.map((img, idx) => `
                      <div class="relative w-28 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 overflow-hidden shadow-2xs">
                        ${img.isHeicRaw ? `
                          <div class="w-full h-24 flex flex-col items-center justify-center p-2 text-center bg-violet-50/60 dark:bg-violet-950/30" title="${this.escapeHtml(img.name)}（可直接用于 AI 识图）">
                            <span class="text-2xl leading-none mb-1">📱</span>
                            <span class="text-[10px] font-bold text-violet-700 dark:text-violet-300 leading-tight">HEIC 答案图</span>
                            <span class="text-[9px] text-slate-400 truncate max-w-full mt-0.5">${this.escapeHtml(img.name)}</span>
                          </div>
                        ` : `
                          <img src="${img.dataUrl}" onclick="event.stopPropagation(); window.previewImage && window.previewImage('${img.dataUrl}')" class="w-full h-24 object-cover cursor-pointer" title="点击查看大图" />
                        `}
                        <div class="p-1 flex items-center justify-between gap-1 bg-white/95 dark:bg-slate-900/95 border-t border-slate-100 dark:border-slate-700">
                          <span class="text-[10px] text-slate-500 truncate px-1">答案图 #${idx + 1}</span>
                          <button type="button" onclick="event.stopPropagation(); app.removeAiImage('ms', ${idx})" class="text-[11px] text-slate-400 hover:text-rose-500 font-bold px-1" title="移除">×</button>
                        </div>
                      </div>
                    `).join('')}
                  </div>
                `}
              </div>
            </div>

            ${lookup ? `
              <div class="p-3 rounded-xl bg-sky-50/90 dark:bg-sky-950/35 border border-sky-200 dark:border-sky-800/70 text-xs text-slate-700 dark:text-slate-200 space-y-1.5">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="font-bold text-sky-700 dark:text-sky-300">🔍 CIE 真题题号检索结果：</span>
                    ${lookup.paperCode ? `<span class="px-2 py-0.5 rounded bg-sky-600 text-white font-mono font-bold">${this.escapeHtml(lookup.paperCode)}</span>` : '<span class="text-slate-500">暂未确定紧凑题号</span>'}
                    ${lookup.fullRef ? `<span class="font-mono text-slate-600 dark:text-slate-300">${this.escapeHtml(lookup.fullRef)}</span>` : ''}
                    <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold ${lookup.usedWebSearch ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'}">
                      ${lookup.usedWebSearch ? '🌐 已实时联网搜索' : '🧠 模型推理 (DeepSeek API 不自带实时联网)'}
                    </span>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    ${lookup.paperCode ? `
                      <button type="button" onclick="app.applyPaperCodeLookup()" class="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px]">填入题号</button>
                    ` : ''}
                    ${googleSearchUrl ? `
                      <a href="${googleSearchUrl}" target="_blank" rel="noopener noreferrer" class="px-2 py-0.5 rounded bg-white dark:bg-slate-800 border border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 font-bold text-[11px] hover:bg-sky-50">🌐 Google 核实</a>
                    ` : ''}
                    <button type="button" onclick="app.aiState.paperCodeLookup = null; app.render();" class="text-slate-400 hover:text-slate-600 font-bold px-1">×</button>
                  </div>
                </div>
                ${lookup.notes ? `<div class="text-[11px] text-slate-600 dark:text-slate-300">${this.escapeHtml(lookup.notes)}</div>` : ''}
                ${Array.isArray(lookup.sources) && lookup.sources.length > 0 ? `
                  <div class="flex flex-wrap items-center gap-2 text-[11px] text-sky-700 dark:text-sky-300">
                    <span class="text-slate-400">参考来源:</span>
                    ${lookup.sources.map(s => `<a href="${this.safeLink(s.uri)}" target="_blank" rel="noopener noreferrer" class="underline hover:text-sky-900 truncate max-w-[220px]">${this.escapeHtml(s.title || s.uri)}</a>`).join(' · ')}
                  </div>
                ` : ''}
              </div>
            ` : ''}

            ${this.aiState.lastError ? `
              <div class="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex flex-wrap items-center justify-between gap-2">
                <span class="flex-1 min-w-[200px]">❌ ${this.escapeHtml(this.aiState.lastError)}</span>
                <div class="flex items-center gap-2 shrink-0">
                  ${(qImgs.length > 0 && this.aiState.lastError.includes('RECITATION')) ? `
                    <button type="button" onclick="app.insertAiImagesDirectlyToForm()" class="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] shadow-2xs">📎 直接将原图插入题目正文</button>
                  ` : ''}
                  <button type="button" onclick="app.aiState.lastError = ''; app.render();" class="text-rose-400 hover:text-rose-600 font-bold px-1">×</button>
                </div>
              </div>
            ` : ''}

            <div class="flex flex-wrap items-center justify-between gap-3 pt-1">
              <label class="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                <input type="checkbox" ${this.aiState.autoGenerateSolution ? 'checked' : ''} onchange="app.aiState.autoGenerateSolution = this.checked;" class="rounded text-indigo-600 focus:ring-indigo-500" />
                <span>未上传 Mark Scheme 时，由 AI 自动生成参考解答步骤</span>
              </label>

              <div class="flex flex-wrap items-center gap-2">
                ${(qImgs.length > 0 || msImgs.length > 0) ? `
                  <button type="button" onclick="app.clearAiImages()" ${isBusy ? 'disabled' : ''} class="px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-800 transition disabled:opacity-50">
                    清空图片
                  </button>
                ` : ''}
                ${(msImgs.length === 0 && (qImgs.length > 0 || hasRecognizedQuestion)) ? `
                  <button type="button" onclick="app.lookupCiePaperCode()" ${isBusy ? 'disabled' : ''} class="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 hover:bg-sky-100 transition disabled:opacity-60">
                    ${this.aiState.isLookingUpCode ? `
                      <span class="inline-block w-3 h-3 border-2 border-sky-400 border-t-sky-700 rounded-full animate-spin"></span>
                      <span>正在查询 CIE 题号...</span>
                    ` : `
                      <span>🔍 查询 CIE 题号</span>
                    `}
                  </button>
                ` : ''}
                ${(msImgs.length > 0 && hasRecognizedQuestion) ? `
                  <button type="button" onclick="app.runAiMarkSchemeOnly()" ${isBusy ? 'disabled' : ''} class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/20 transition disabled:opacity-60 disabled:cursor-wait">
                    ${this.aiState.isRecognizing ? `
                      <span class="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
                      <span>${cfg.provider === 'deepseek' ? 'DeepSeek' : 'Gemini'} 解析中...</span>
                    ` : `
                      <span>📋 仅识别 Mark Scheme (省 Token)</span>
                    `}
                  </button>
                ` : ''}
                <button type="button" onclick="app.runAiQuestionRecognition()" ${isBusy ? 'disabled' : ''} class="flex items-center gap-2 px-5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-md shadow-indigo-500/20 transition disabled:opacity-60 disabled:cursor-wait">
                  ${this.aiState.isRecognizing ? `
                    <span class="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
                    <span>${cfg.provider === 'deepseek' ? 'DeepSeek' : 'Gemini'} 正在识图解析中...</span>
                  ` : `
                    <span>✨</span>
                    <span>${(msImgs.length > 0 && hasRecognizedQuestion) ? '重新全量识图' : '开始 AI 识图并自动填表'}</span>
                  `}
                </button>
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  toggleAiPanel() {
    this.aiPanelOpen = !this.aiPanelOpen;
    this.render();
  }

  setAiPasteTarget(target) {
    this.aiState.pasteTarget = target;
    const qZone = document.getElementById('ai-question-dropzone');
    const msZone = document.getElementById('ai-ms-dropzone');
    if (qZone && msZone) {
      qZone.classList.toggle('border-indigo-400', target === 'question');
      qZone.classList.toggle('border-slate-300', target !== 'question');
      msZone.classList.toggle('border-violet-400', target === 'ms');
      msZone.classList.toggle('border-slate-300', target !== 'ms');
    }
  }

  async handleAiImageUpload(target, inputEl) {
    const files = Array.from((inputEl && inputEl.files) || []);
    for (const file of files) {
      await this.addAiImageFile(target, file);
    }
    if (inputEl) inputEl.value = '';
  }

  async handleAiDrop(e, target) {
    e.preventDefault();
    const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []).filter(f =>
      (f.type && f.type.startsWith('image/')) || /\.hei[cf]$/i.test(f.name || '')
    );
    for (const file of files) {
      await this.addAiImageFile(target, file);
    }
  }

  async addAiImageFile(target, file) {
    try {
      const isHeic = /\.hei[cf]$/i.test(file.name || '') || /hei[cf]/i.test(file.type || '');
      if (isHeic) {
        this.showToast('正在转换 iPhone HEIC 图片，请稍候...', 'info');
      }
      const compressed = await window.geminiAI.compressImage(file, 1600, 0.86);
      const item = {
        id: 'ai_img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        dataUrl: compressed.dataUrl,
        mimeType: compressed.mimeType,
        base64: compressed.base64,
        isHeicRaw: !!compressed.isHeicRaw,
        name: file.name || 'screenshot.jpg'
      };
      if (target === 'ms') {
        this.aiState.markSchemeImages.push(item);
      } else {
        this.aiState.questionImages.push(item);
      }
      this.aiState.lastError = '';
      this.render();
    } catch (err) {
      this.showToast('处理图片失败：' + err.message, 'error');
    }
  }

  removeAiImage(target, index) {
    if (target === 'ms') {
      this.aiState.markSchemeImages.splice(index, 1);
    } else {
      this.aiState.questionImages.splice(index, 1);
    }
    this.render();
  }

  clearAiImages() {
    this.aiState.questionImages = [];
    this.aiState.markSchemeImages = [];
    this.aiState.lastError = '';
    this.aiState.paperCodeLookup = null;
    this.render();
  }

  insertAiImagesDirectlyToForm() {
    const imgs = this.aiState.questionImages || [];
    if (imgs.length === 0) return;
    const md = imgs.map(img => `![](${img.dataUrl})`).join('\n\n');
    if (this.form.questionType === 'multiple_choice' || (this.form.questionType === 'structured' && this.form.structuredMode === 'multi_part')) {
      this.form.stem = (this.form.stem ? this.form.stem + '\n\n' : '') + md;
    } else {
      this.form.content = (this.form.content ? this.form.content + '\n\n' : '') + md;
    }
    this.aiState.lastError = '';
    this.render();
    this.compileQuestionContent();
    this.showToast('✅ 已将原图直接插入题目正文，可直接核对保存！', 'success');
  }

  saveQuickGeminiKey() {
    const input = document.getElementById('ai-quick-key-input');
    const key = input ? input.value.trim() : '';
    if (!key) {
      this.showToast('请先粘贴有效的 Gemini API Key', 'warning');
      return;
    }
    window.geminiAI.saveConfig({ apiKey: key });
    const syncedMsg = '已保存至本地浏览器；密钥不会同步到云端。';
    this.showToast(`API Key ${syncedMsg}`, 'success');
    this.render();
  }

  applyPaperCodeLookup() {
    const code = this.aiState.paperCodeLookup?.paperCode;
    if (!code) return;
    this.form.paperCode = String(code).trim().toUpperCase();
    this.render();
    this.showToast(`✅ 已填入 CIE 题号：${this.form.paperCode}`, 'success');
  }

  async lookupCiePaperCode() {
    if (!window.geminiAI.hasApiKey()) {
      this.showToast('请先填写并保存 AI API Key！', 'warning');
      return;
    }
    const stemPart = (this.form.stem || '').trim();
    const partsText = Array.isArray(this.form.parts)
      ? this.form.parts.map(p => `${p.label || ''} ${p.text || ''}`).join('\n').trim()
      : '';
    const contentText = (this.form.content || '').trim();
    const questionText = [stemPart, partsText].filter(Boolean).join('\n\n') || contentText;

    if (!questionText && (!this.aiState.questionImages || this.aiState.questionImages.length === 0)) {
      this.showToast('请先上传题目图片或识别题干后再查询 CIE 题号！', 'warning');
      return;
    }

    this.aiState.isLookingUpCode = true;
    this.aiState.lastError = '';
    this.render();

    try {
      const res = await window.geminiAI.lookupCiePaperCode({
        questionText,
        questionImages: this.aiState.questionImages
      });
      this.aiState.paperCodeLookup = res;
      if (res.paperCode && !this.form.paperCode) {
        this.form.paperCode = String(res.paperCode).trim().toUpperCase();
      }
      this.showToast(res.paperCode ? `🔍 检索到疑似 CIE 题号：${res.paperCode}` : '已完成检索，请点击 Google 核实链接确认', 'info');
    } catch (err) {
      console.error('CIE 题号查询失败:', err);
      this.aiState.lastError = err.message || '查询 CIE 题号失败';
      this.showToast(this.aiState.lastError, 'error');
    } finally {
      this.aiState.isLookingUpCode = false;
      this.render();
    }
  }

  async runAiMarkSchemeOnly() {
    if (!window.geminiAI.hasApiKey()) {
      this.showToast('请先填写并保存 AI API Key！', 'warning');
      return;
    }
    if (!this.aiState.markSchemeImages || this.aiState.markSchemeImages.length === 0) {
      this.showToast('请先上传或粘贴至少一张 Mark Scheme 答案图！', 'warning');
      return;
    }

    this.aiState.isRecognizing = true;
    this.aiState.lastError = '';
    this.render();

    try {
      const msResult = await window.geminiAI.recognizeMarkSchemeOnly({
        markSchemeImages: this.aiState.markSchemeImages,
        questionType: this.form.questionType,
        parts: this.form.parts,
        stem: this.form.stem || this.form.content || ''
      });
      this.applyMarkSchemeOnlyToForm(msResult);
      this.showToast('📋 Mark Scheme 识别完成（未重识题目，已节省题目 Token）！', 'success');
    } catch (err) {
      console.error('Mark Scheme 识别出错:', err);
      this.aiState.lastError = err.message || 'Mark Scheme 识别失败';
      this.showToast(this.aiState.lastError, 'error');
    } finally {
      this.aiState.isRecognizing = false;
      this.render();
    }
  }

  applyMarkSchemeOnlyToForm(msResult) {
    if (!msResult || typeof msResult !== 'object') return;
    const normLabel = (s) => String(s || '').toLowerCase().replace(/[\s()（）.]/g, '');

    if (this.form.questionType === 'multiple_choice') {
      if (Array.isArray(msResult.correctOptions) && msResult.correctOptions.length > 0) {
        const validKeys = new Set((this.form.optionsList || []).map(o => o.key));
        const filtered = msResult.correctOptions.map(k => String(k).trim().toUpperCase()).filter(k => validKeys.has(k));
        if (filtered.length > 0) {
          this.form.correctOptions = filtered;
          this.form.correctOption = filtered[0];
        }
      }
      const rows = Array.isArray(msResult.mcqSolutionRows) ? msResult.mcqSolutionRows : [];
      if (rows.length > 0) {
        this.form.solutionMode = 'mark_scheme_table';
        this.form.markSchemeRows = rows.map((r, rIdx) => ({
          question: rIdx === 0 ? (r.question || '本题') : (r.question || ''),
          answer: r.answer || '',
          marks: r.marks || '',
          guidance: r.guidance || ''
        }));
      }
    } else if (this.form.structuredMode === 'multi_part' && Array.isArray(this.form.parts) && this.form.parts.length > 0) {
      const incomingParts = Array.isArray(msResult.parts) ? msResult.parts : [];
      this.form.parts.forEach((part, idx) => {
        const targetNorm = normLabel(part.label);
        const matched = incomingParts.find(ip => normLabel(ip.label) === targetNorm) || incomingParts[idx];
        const rows = matched && Array.isArray(matched.solutionRows) ? matched.solutionRows : [];
        if (rows.length > 0) {
          part.solutionMode = 'mark_scheme_table';
          part.solutionRows = rows.map((r, rIdx) => ({
            question: rIdx === 0 ? (r.question || part.label || '') : (r.question || ''),
            answer: r.answer || '',
            marks: r.marks || '',
            guidance: r.guidance || ''
          }));
        }
      });
    } else {
      const rows = Array.isArray(msResult.mcqSolutionRows) && msResult.mcqSolutionRows.length > 0
        ? msResult.mcqSolutionRows
        : (Array.isArray(msResult.parts) && msResult.parts[0]?.solutionRows ? msResult.parts[0].solutionRows : []);
      if (rows.length > 0) {
        this.form.solutionMode = 'mark_scheme_table';
        this.form.markSchemeRows = rows.map((r, rIdx) => ({
          question: rIdx === 0 ? (r.question || '本题') : (r.question || ''),
          answer: r.answer || '',
          marks: r.marks || '',
          guidance: r.guidance || ''
        }));
      }
    }

    this.compileQuestionContent(true);
  }

  async runAiQuestionRecognition() {
    if (!window.geminiAI.hasApiKey()) {
      this.showToast('请先填写并保存 Gemini API Key！', 'warning');
      return;
    }
    if (!this.aiState.questionImages || this.aiState.questionImages.length === 0) {
      this.showToast('请先上传或粘贴至少一张题目图片！', 'warning');
      return;
    }

    this.aiState.isRecognizing = true;
    this.aiState.lastError = '';
    this.render();

    try {
      const result = await window.geminiAI.recognizeQuestion({
        questionImages: this.aiState.questionImages,
        markSchemeImages: this.aiState.markSchemeImages,
        subjects: this.subjects,
        currentSubjectId: this.form.subjectId,
        autoGenerateSolution: this.aiState.autoGenerateSolution
      });

      this.applyAiResultToForm(result);
      this.showToast('✨ AI 识图完成！已自动填充表单，请核对公式并勾选“错在此问”', 'success');
    } catch (err) {
      console.error('Gemini 识别出错:', err);
      this.aiState.lastError = err.message || '识图失败，请检查网络连接或 API Key';
      this.showToast(this.aiState.lastError, 'error');
    } finally {
      this.aiState.isRecognizing = false;
      this.render();
    }
  }

  applyAiResultToForm(result) {
    if (!result || typeof result !== 'object') return;

    // 1. 匹配学科与单元
    let matchedSub = this.subjects.find(s => s.id === result.subjectId)
      || this.subjects.find(s => s.id === this.form.subjectId)
      || this.subjects[0];

    let matchedUnitId = '';
    if (result.unitId) {
      // 先看是否属于 matchedSub
      if (matchedSub && (matchedSub.units || []).some(u => u.id === result.unitId)) {
        matchedUnitId = result.unitId;
      } else {
        // 全局查找该 unitId 属于哪个学科
        const ownerSub = this.subjects.find(s => (s.units || []).some(u => u.id === result.unitId));
        if (ownerSub) {
          matchedSub = ownerSub;
          matchedUnitId = result.unitId;
        }
      }
    }
    if (!matchedUnitId && matchedSub && matchedSub.units && matchedSub.units.length > 0) {
      matchedUnitId = matchedSub.units[0].id;
    }

    if (matchedSub) this.form.subjectId = matchedSub.id;
    this.form.unitId = matchedUnitId;

    // 2. 基础元信息
    if (result.paperCode !== undefined) {
      this.form.paperCode = String(result.paperCode || '').trim().toUpperCase();
    }
    if (result.title) {
      this.form.title = String(result.title).trim();
    }

    // 3. 题型与正文填充
    const isMcq = result.questionType === 'multiple_choice';
    const hasUploadedImgs = (this.aiState.questionImages || []).length > 0;

    if (isMcq) {
      this.form.questionType = 'multiple_choice';
      this.form.mcqType = result.mcqType === 'multiple' ? 'multiple' : 'single';
      this.form.stem = result.stem || '';

      const opts = Array.isArray(result.optionsList) && result.optionsList.length >= 2
        ? result.optionsList.map((o, idx) => ({
            key: String(o.key || String.fromCharCode(65 + idx)).trim().toUpperCase(),
            text: o.text || ''
          }))
        : [
            { key: 'A', text: '' },
            { key: 'B', text: '' },
            { key: 'C', text: '' },
            { key: 'D', text: '' }
          ];
      this.form.optionsList = opts;
      this.form.options = {};
      opts.forEach(o => { this.form.options[o.key] = o.text; });

      const validKeys = new Set(opts.map(o => o.key));
      const cOpts = (Array.isArray(result.correctOptions) ? result.correctOptions : [])
        .map(k => String(k).trim().toUpperCase())
        .filter(k => validKeys.has(k));
      this.form.correctOptions = cOpts.length > 0 ? cOpts : [opts[0].key];
      this.form.correctOption = this.form.correctOptions[0];
      this.form.myOptions = [];
      this.form.myOption = '';

      if (Array.isArray(result.mcqSolutionRows) && result.mcqSolutionRows.length > 0) {
        this.form.solutionMode = 'mark_scheme_table';
        this.form.markSchemeRows = result.mcqSolutionRows.map((r, rIdx) => ({
          question: rIdx === 0 ? (r.question || '本题') : (r.question || ''),
          answer: r.answer || '',
          marks: r.marks || '',
          guidance: r.guidance || ''
        }));
      } else {
        this.form.solutionMode = 'markdown';
        this.form.solution = '';
      }
    } else {
      this.form.questionType = 'structured';
      const rawParts = Array.isArray(result.parts) ? result.parts : [];

      if (rawParts.length > 0) {
        this.form.structuredMode = 'multi_part';
        this.form.stem = result.stem || '';
        this.form.stemMarks = '';
        const baseTs = Date.now();
        this.form.parts = rawParts.map((p, idx) => {
          const label = p.label || `(${String.fromCharCode(97 + idx)})`;
          let text = p.text || '';
          if (p.hasFigure && hasUploadedImgs) {
            text = `${text}${text ? '\n\n' : ''}> *[💡 检测到此处含图表/几何图，可点击上方原图缩略图的「✂️ 框选插图」截取插入]*`;
          }
          const rows = Array.isArray(p.solutionRows) ? p.solutionRows : [];
          return {
            id: `part_${baseTs}_${idx}`,
            label,
            marks: p.marks !== undefined ? String(p.marks) : '',
            isWrong: rawParts.length === 1, // 若只有一个小问默认标错；多小问由用户点选错在哪问
            text,
            afterText: p.afterText || '',
            _showAfterText: !!(p.afterText && p.afterText.trim()),
            solutionMode: rows.length > 0 ? 'mark_scheme_table' : 'none',
            solutionRows: rows.length > 0
              ? rows.map((r, rIdx) => ({
                  question: rIdx === 0 ? (r.question || label) : (r.question || ''),
                  answer: r.answer || '',
                  marks: r.marks || '',
                  guidance: r.guidance || ''
                }))
              : [{ question: label, answer: '', marks: 'B1', guidance: '' }],
            solution: ''
          };
        });
      } else {
        this.form.structuredMode = 'multi_part';
        this.form.stem = result.stem || '';
        this.form.stemMarks = result.stemMarks !== undefined ? String(result.stemMarks || '').trim() : '';
        this.form.parts = [];
        const rows = Array.isArray(result.mcqSolutionRows) ? result.mcqSolutionRows : [];
        if (rows.length > 0) {
          this.form.solutionMode = 'mark_scheme_table';
          this.form.markSchemeRows = rows.map((r, rIdx) => ({
            question: rIdx === 0 ? (r.question || '本题') : (r.question || ''),
            answer: r.answer || '',
            marks: r.marks || '',
            guidance: r.guidance || ''
          }));
        } else {
          this.form.solutionMode = 'none';
          this.form.markSchemeRows = [];
        }
      }
    }

    this.compileQuestionContent(true);
  }

  // --- 原图框选裁剪插入配图弹窗 ---
  openAiCropModal(imgIndex) {
    const img = (this.aiState.questionImages || [])[imgIndex];
    if (!img) return;
    let defaultTarget = 'stem';
    if (this.form.questionType === 'structured' && this.form.structuredMode === 'multi_part' && this.form.parts.length > 0) {
      defaultTarget = 'part:0';
    } else if (this.form.questionType === 'structured' && this.form.structuredMode === 'single') {
      defaultTarget = 'content';
    }
    this.aiState.cropModal = {
      imgIndex,
      dataUrl: img.dataUrl,
      targetSlot: defaultTarget,
      rect: null
    };
    this.render();
  }

  closeAiCropModal() {
    this.aiState.cropModal = null;
    this.render();
  }

  renderAiCropModalHtml() {
    const modal = this.aiState && this.aiState.cropModal;
    if (!modal) return '';

    const targets = [];
    if (this.form.questionType === 'multiple_choice') {
      targets.push({ value: 'stem', label: '选择题题干' });
    } else if (this.form.structuredMode === 'multi_part') {
      targets.push({ value: 'stem', label: '大题公共题干 (Stem)' });
      (this.form.parts || []).forEach((p, idx) => {
        targets.push({ value: `part:${idx}`, label: `小问 ${p.label || `(${idx + 1})`}` });
      });
    } else {
      targets.push({ value: 'content', label: '题目正文' });
    }

    return `
      <div class="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4" onclick="if(event.target===this) app.closeAiCropModal()">
        <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col max-h-[92vh]">
          <div class="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 class="text-sm font-black text-slate-900 dark:text-slate-100">✂️ 从原图框选裁剪配图</h3>
              <p class="text-[11px] text-slate-500">在下方图片上按住鼠标左键拖拽框选图表区域，选择要插入的位置后点击确认</p>
            </div>
            <button type="button" onclick="app.closeAiCropModal()" class="text-slate-400 hover:text-slate-600 text-lg font-bold px-2">×</button>
          </div>

          <div class="p-4 bg-slate-100 dark:bg-slate-950 flex-1 overflow-auto flex items-center justify-center">
            <canvas id="ai-crop-canvas" class="max-w-full rounded-lg shadow-md cursor-crosshair bg-white"></canvas>
          </div>

          <div class="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div class="flex items-center gap-2">
              <span class="font-bold text-slate-600 dark:text-slate-300">插入到：</span>
              <select id="ai-crop-target" onchange="if(app.aiState.cropModal) app.aiState.cropModal.targetSlot = this.value" class="px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold">
                ${targets.map(t => `<option value="${t.value}" ${modal.targetSlot === t.value ? 'selected' : ''}>${this.escapeHtml(t.label)}</option>`).join('')}
              </select>
            </div>
            <div class="flex items-center gap-2">
              <button type="button" onclick="app.closeAiCropModal()" class="px-3.5 py-1.5 rounded-xl font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">取消</button>
              <button type="button" onclick="app.confirmAiCropInsert()" class="px-4 py-1.5 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm">✅ 裁剪并插入正文</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  bindAiCropCanvasEvents() {
    const modal = this.aiState && this.aiState.cropModal;
    const canvas = document.getElementById('ai-crop-canvas');
    if (!modal || !canvas) return;

    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      const maxW = Math.min(820, window.innerWidth - 80);
      const maxH = Math.round(window.innerHeight * 0.58);
      const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
      const drawW = Math.max(100, Math.round(img.naturalWidth * ratio));
      const drawH = Math.max(100, Math.round(img.naturalHeight * ratio));

      canvas.width = drawW;
      canvas.height = drawH;
      modal._img = img;
      modal._scaleX = img.naturalWidth / drawW;
      modal._scaleY = img.naturalHeight / drawH;

      const redraw = () => {
        ctx.clearRect(0, 0, drawW, drawH);
        ctx.drawImage(img, 0, 0, drawW, drawH);
        if (modal.rect && modal.rect.w > 4 && modal.rect.h > 4) {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
          ctx.fillRect(0, 0, drawW, drawH);
          ctx.drawImage(
            img,
            modal.rect.x * modal._scaleX, modal.rect.y * modal._scaleY,
            modal.rect.w * modal._scaleX, modal.rect.h * modal._scaleY,
            modal.rect.x, modal.rect.y, modal.rect.w, modal.rect.h
          );
          ctx.strokeStyle = '#6366f1';
          ctx.lineWidth = 2;
          ctx.strokeRect(modal.rect.x, modal.rect.y, modal.rect.w, modal.rect.h);
        }
      };

      redraw();

      canvas.style.touchAction = 'none';
      let dragging = false;
      let startX = 0;
      let startY = 0;
      const getPos = (evt) => {
        const bounds = canvas.getBoundingClientRect();
        const touch = (evt.touches && evt.touches[0]) || (evt.changedTouches && evt.changedTouches[0]);
        const clientX = touch ? touch.clientX : evt.clientX;
        const clientY = touch ? touch.clientY : evt.clientY;
        const scaleX = bounds.width > 0 ? (drawW / bounds.width) : 1;
        const scaleY = bounds.height > 0 ? (drawH / bounds.height) : 1;
        return {
          x: Math.max(0, Math.min(drawW, (clientX - bounds.left) * scaleX)),
          y: Math.max(0, Math.min(drawH, (clientY - bounds.top) * scaleY))
        };
      };

      const onStart = (evt) => {
        evt.preventDefault();
        dragging = true;
        const p = getPos(evt);
        startX = p.x;
        startY = p.y;
        modal.rect = { x: startX, y: startY, w: 0, h: 0 };
        redraw();
      };
      const onMove = (evt) => {
        if (!dragging) return;
        evt.preventDefault();
        const p = getPos(evt);
        modal.rect = {
          x: Math.min(startX, p.x),
          y: Math.min(startY, p.y),
          w: Math.abs(p.x - startX),
          h: Math.abs(p.y - startY)
        };
        redraw();
      };
      const onEnd = () => { dragging = false; };

      canvas.onmousedown = onStart;
      canvas.onmousemove = onMove;
      window.addEventListener('mouseup', onEnd, { once: false });
      canvas.addEventListener('touchstart', onStart, { passive: false });
      canvas.addEventListener('touchmove', onMove, { passive: false });
      canvas.addEventListener('touchend', onEnd);
      canvas.addEventListener('touchcancel', onEnd);
    };
    img.src = modal.dataUrl;
  }

  confirmAiCropInsert() {
    const modal = this.aiState && this.aiState.cropModal;
    if (!modal || !modal._img || !modal.rect || modal.rect.w < 10 || modal.rect.h < 10) {
      this.showToast('请先在图片上拖拽框选需要截取的区域', 'warning');
      return;
    }

    const sx = Math.round(modal.rect.x * modal._scaleX);
    const sy = Math.round(modal.rect.y * modal._scaleY);
    const sw = Math.max(10, Math.round(modal.rect.w * modal._scaleX));
    const sh = Math.max(10, Math.round(modal.rect.h * modal._scaleY));

    const maxOutW = 1200;
    const outRatio = sw > maxOutW ? (maxOutW / sw) : 1;
    const outW = Math.round(sw * outRatio);
    const outH = Math.round(sh * outRatio);

    const outCanvas = document.createElement('canvas');
    outCanvas.width = outW;
    outCanvas.height = outH;
    const octx = outCanvas.getContext('2d');
    octx.fillStyle = '#ffffff';
    octx.fillRect(0, 0, outW, outH);
    octx.drawImage(modal._img, sx, sy, sw, sh, 0, 0, outW, outH);

    const croppedUrl = outCanvas.toDataURL('image/jpeg', 0.9);
    const imgMd = `\n![](${croppedUrl})\n`;

    const targetSelect = document.getElementById('ai-crop-target');
    const slot = targetSelect ? targetSelect.value : modal.targetSlot;

    if (slot === 'stem') {
      this.form.stem = (this.form.stem || '') + imgMd;
    } else if (slot === 'content') {
      this.form.content = (this.form.content || '') + imgMd;
    } else if (slot && slot.startsWith('part:')) {
      const idx = parseInt(slot.split(':')[1], 10);
      if (this.form.parts && this.form.parts[idx]) {
        const cleaned = (this.form.parts[idx].text || '').replace(/\n*> \*\[💡 检测到此处含图表\/几何图[^\]]*\]\*/g, '').trimEnd();
        this.form.parts[idx].text = cleaned + imgMd;
      }
    }

    this.aiState.cropModal = null;
    this.render();
    this.compileQuestionContent();
    this.showToast('✅ 配图已裁剪并插入到题目正文！', 'success');
  }

  // --- AI 服务商切换、配置保存与连通性测试 ---
  setAiProvider(provider) {
    if (window.geminiAI) {
      window.geminiAI.setProvider(provider);
    }
    this.aiState.lastError = '';
    this.render();
  }

  toggleGeminiKeyVisibility() {
    const input = document.getElementById('settings-gemini-key');
    const btn = document.getElementById('settings-gemini-key-toggle');
    if (!input) return;
    if (input.type === 'password') {
      input.type = 'text';
      if (btn) btn.textContent = '🙈 隐藏';
    } else {
      input.type = 'password';
      if (btn) btn.textContent = '👁️ 显示';
    }
  }

  saveGeminiSettings() {
    const providerEl = document.getElementById('settings-ai-provider');
    const keyEl = document.getElementById('settings-gemini-key');
    const modelEl = document.getElementById('settings-gemini-model');
    const baseEl = document.getElementById('settings-gemini-base-url');
    const provider = providerEl ? providerEl.value : window.geminiAI.getProvider();
    window.geminiAI.saveConfig({
      provider,
      apiKey: keyEl ? keyEl.value : '',
      model: modelEl ? modelEl.value : (provider === 'deepseek' ? 'deepseek-flash' : 'gemini-3.8-flash'),
      baseUrl: baseEl ? baseEl.value : (provider === 'deepseek' ? 'https://api.deepseek.com' : 'https://generativelanguage.googleapis.com')
    });
    const badgeEl = document.getElementById('settings-gemini-badge');
    if (badgeEl) {
      const hasKey = window.geminiAI.hasApiKey();
      badgeEl.className = `text-[11px] px-2 py-0.5 rounded-full font-semibold ${hasKey ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`;
      badgeEl.textContent = hasKey ? '已配置密钥' : '未配置密钥';
    }
    const label = provider === 'deepseek' ? 'DeepSeek / OpenAI' : 'Gemini';
    const isCloudLoggedIn = !!(window.cloudSync && window.cloudSync.isLoggedIn());
    this.showToast(`${label} AI 配置已保存；密钥与接口地址仅存于本设备。`, 'success');
    const statusEl = document.getElementById('settings-gemini-status');
    if (statusEl) {
      statusEl.className = 'text-xs text-emerald-600 dark:text-emerald-400 font-semibold';
      statusEl.textContent = isCloudLoggedIn
        ? '✅ 配置已保存到本地并自动同步至云端账号'
        : '✅ 配置已保存到本地浏览器 (localStorage)';
    }
  }

  async testGeminiConnection() {
    this.saveGeminiSettings();
    const cfg = window.geminiAI.getConfig();
    const label = cfg.provider === 'deepseek' ? 'DeepSeek / OpenAI' : 'Gemini';
    const statusEl = document.getElementById('settings-gemini-status');
    if (statusEl) {
      statusEl.className = 'text-xs text-indigo-600 dark:text-indigo-400 font-semibold';
      statusEl.textContent = `⏳ 正在向 ${label} API 发送测试请求...`;
    }
    try {
      const res = await window.geminiAI.testConnection();
      if (statusEl) {
        statusEl.className = 'text-xs text-emerald-600 dark:text-emerald-400 font-semibold';
        statusEl.textContent = `✅ 连接成功！模型 ${res.model} 响应正常 (${res.reply})`;
      }
      this.showToast(`${label} API 连接测试成功！`, 'success');
    } catch (err) {
      if (statusEl) {
        statusEl.className = 'text-xs text-rose-600 dark:text-rose-400 font-semibold';
        statusEl.textContent = `❌ 连接失败：${err.message}`;
      }
      this.showToast('连接测试失败：' + err.message, 'error');
    }
  }

  async cloudSignIn() {
    const emailEl = document.getElementById('cloud-email-input');
    const pwdEl = document.getElementById('cloud-password-input');
    const email = emailEl ? emailEl.value.trim() : '';
    const password = pwdEl ? pwdEl.value : '';
    if (!email || !password) {
      this.showToast('请输入邮箱和密码！', 'warning');
      return;
    }
    try {
      await window.cloudSync.signIn(email, password);
      this.showToast('登录成功，正在同步云端数据...', 'info');
      const res = await window.cloudSync.syncNow();
      await this.refreshData();
      this.render();
      this.showToast(`✅ 云同步完成（拉取 ${res.pulled || 0} 条，上传 ${res.pushed || 0} 条）`, 'success');
    } catch (err) {
      this.showToast(`登录失败：${err.message}`, 'error');
    }
  }

  async cloudSignUp() {
    const emailEl = document.getElementById('cloud-email-input');
    const pwdEl = document.getElementById('cloud-password-input');
    const email = emailEl ? emailEl.value.trim() : '';
    const password = pwdEl ? pwdEl.value : '';
    if (!email || password.length < 6) {
      this.showToast('请输入有效邮箱和至少 6 位密码！', 'warning');
      return;
    }
    try {
      const data = await window.cloudSync.signUp(email, password);
      if (data && data.session) {
        this.showToast('注册并登录成功，正在初始化云端数据...', 'info');
        await window.cloudSync.syncNow();
        await this.refreshData();
        this.render();
        this.showToast('✅ 账号已创建并完成首次同步！', 'success');
      } else {
        this.showToast('📧 注册成功！请先去邮箱点击验证链接，然后再点「登录并同步」', 'info');
      }
    } catch (err) {
      this.showToast(`注册失败：${err.message}`, 'error');
    }
  }

  async cloudSignOut() {
    await window.cloudSync.signOut();
    this.showToast('已退出云同步账号（本地离线数据仍保留）', 'info');
    this.render();
  }

  async cloudSyncNow() {
    if (!window.cloudSync || !window.cloudSync.isLoggedIn()) {
      this.switchTab('settings');
      return;
    }
    try {
      const res = await window.cloudSync.syncNow();
      await this.refreshData();
      this.render();
      this.showToast(`✅ 云端同步完成（拉取 ${res.pulled || 0} 条，上传 ${res.pushed || 0} 条）`, 'success');
    } catch (err) {
      this.showToast(`同步失败：${err.message}`, 'error');
    }
  }

  async cloudPushOverwrite() {
    if (!confirm('确定要用当前设备的本地数据完全覆盖云端数据吗？（其他设备下次同步时会自动清空旧数据并拉取本机版本）')) return;
    try {
      const res = await window.cloudSync.pushAllLocalToCloud(true);
      this.render();
      this.showToast(`✅ 已将本机 ${res.uploaded} 条数据覆盖上传至云端！`, 'success');
    } catch (err) {
      this.showToast(`上传失败：${err.message}`, 'error');
    }
  }

  async cloudPullOverwrite() {
    if (!confirm('确定要用云端数据完全覆盖本机数据吗？本机尚未同步的修改将会被清空。')) return;
    try {
      const res = await window.cloudSync.pullOverwriteLocal();
      await this.refreshData();
      this.render();
      this.showToast(`✅ 已用云端 ${res.pulled} 条数据覆盖本机！`, 'success');
    } catch (err) {
      this.showToast(`拉取失败：${err.message}`, 'error');
    }
  }

  // --- 模块 6：数据备份与系统设置 ---
  renderSettingsTab() {
    const aiCfg = window.geminiAI ? window.geminiAI.getConfig() : { provider: 'deepseek', apiKey: '', model: 'deepseek-flash', baseUrl: 'https://api.deepseek.com' };
    const isDeepSeek = aiCfg.provider === 'deepseek';
    const syncState = window.cloudSync ? window.cloudSync.getStatusSummary() : { loggedIn: false, email: '', syncStatus: 'idle', lastSyncedAt: '', lastError: '' };
    return `
      <div class="max-w-3xl mx-auto space-y-6">
        <div>
          <h2 class="text-2xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <span>⚙️</span>
            <span>数据备份与系统设置</span>
          </h2>
          <p class="text-xs text-slate-500 mt-1">多设备云同步 + 本地离线存储，随时备份与还原</p>
        </div>

        <!-- 外观主题设置 -->
        <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">🎨 外观主题</h3>
            <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">支持自动跟随 Mac / iPad / iPhone 系统深浅色切换</p>
          </div>
          <div class="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-semibold">
            <button type="button" onclick="app.applyTheme('system'); app.render();" class="px-3 py-1.5 rounded-lg transition ${this.theme === 'system' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 font-bold shadow-2xs' : 'text-slate-600 dark:text-slate-300'}">🌗 跟随系统</button>
            <button type="button" onclick="app.applyTheme('light'); app.render();" class="px-3 py-1.5 rounded-lg transition ${this.theme === 'light' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 font-bold shadow-2xs' : 'text-slate-600 dark:text-slate-300'}">☀️ 浅色</button>
            <button type="button" onclick="app.applyTheme('dark'); app.render();" class="px-3 py-1.5 rounded-lg transition ${this.theme === 'dark' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 font-bold shadow-2xs' : 'text-slate-600 dark:text-slate-300'}">🌙 深色</button>
          </div>
        </div>

        <!-- 多设备云同步 (Supabase) -->
        <div class="bg-gradient-to-br from-emerald-50/80 via-sky-50/60 to-indigo-50/70 dark:from-emerald-950/30 dark:via-slate-900 dark:to-indigo-950/30 rounded-2xl border border-emerald-200/90 dark:border-emerald-800/60 p-6 shadow-xs space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2.5">
              <span class="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center text-base shadow-xs">☁️</span>
              <div>
                <h3 class="text-base font-bold text-slate-900 dark:text-slate-100">多设备云端同步 (Supabase)</h3>
                <p class="text-[11px] text-slate-500 dark:text-slate-400">Mac / iPad / iPhone 登录同一账号即可自动同步错题、小考与学科</p>
              </div>
            </div>
            <span class="px-2.5 py-1 rounded-full text-[11px] font-bold ${syncState.loggedIn ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}">
              ${syncState.loggedIn ? `🟢 已登录: ${this.escapeHtml(syncState.email)}` : '⚪ 未登录 (仅本地模式)'}
            </span>
          </div>

          ${syncState.loggedIn ? `
            <div class="space-y-3">
              <div class="text-xs text-slate-600 dark:text-slate-300 flex flex-wrap items-center gap-3">
                <span>最近同步时间：<strong>${syncState.lastSyncedAt ? new Date(syncState.lastSyncedAt).toLocaleString() : '刚刚'}</strong></span>
                ${syncState.lastError ? `<span class="text-rose-600 dark:text-rose-400">错误：${this.escapeHtml(syncState.lastError)}</span>` : ''}
              </div>
              <div class="flex flex-wrap items-center gap-2.5">
                <button type="button" onclick="app.cloudSyncNow()" class="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition">
                  🔄 立即双向同步
                </button>
                <button type="button" onclick="app.cloudPushOverwrite()" class="px-4 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition">
                  ⬆️ 用本机数据覆盖云端
                </button>
                <button type="button" onclick="app.cloudPullOverwrite()" class="px-4 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition">
                  ⬇️ 用云端数据覆盖本机
                </button>
                <button type="button" onclick="app.cloudSignOut()" class="px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition">
                  退出登录
                </button>
              </div>
            </div>
          ` : `
            <div class="space-y-3">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label class="block font-bold text-slate-600 dark:text-slate-400 mb-1">邮箱地址</label>
                  <input type="email" id="cloud-email-input" placeholder="your@email.com" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label class="block font-bold text-slate-600 dark:text-slate-400 mb-1">密码（至少 6 位）</label>
                  <input type="password" id="cloud-password-input" placeholder="••••••" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>
              <div class="flex flex-wrap items-center gap-2.5">
                <button type="button" onclick="app.cloudSignIn()" class="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition">
                  🔑 登录并同步
                </button>
                <button type="button" onclick="app.cloudSignUp()" class="px-4 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-slate-700 transition">
                  ✨ 注册新账号
                </button>
              </div>
              <p class="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                提示：首次使用请先注册一个账号（若 Supabase 开启了邮件确认，请查收邮箱点确认后再点「登录并同步」）。建议先在<strong>存有你真实错题的设备</strong>上登录一次，系统会自动把本机错题上传到云端；之后在 iPad/iPhone 登录同一账号即可自动拉取同步。
              </p>
            </div>
          `}
        </div>

        <div class="bg-white dark:bg-slate-900 rounded-2xl border border-indigo-200/80 dark:border-indigo-900/60 p-6 shadow-xs space-y-4">
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>✨</span>
              <span>AI 拍照识图配置（支持 DeepSeek / Gemini）</span>
            </h3>
            <span id="settings-gemini-badge" class="text-[11px] px-2 py-0.5 rounded-full font-semibold ${aiCfg.apiKey ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}">${aiCfg.apiKey ? '已配置密钥' : '未配置密钥'}</span>
          </div>
          <p class="text-xs text-slate-500 leading-relaxed">
            两套服务商的 API Key 分别独立保存在当前浏览器的 <code class="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800">localStorage</code> 中，不会同步到云端或包含在 JSON 备份中；每台设备需要单独设置。
          </p>

          <div class="space-y-3 text-xs">
            <div>
              <label class="block font-bold text-slate-600 dark:text-slate-400 mb-1">AI 服务商 / 接口协议</label>
              <select id="settings-ai-provider" onchange="app.setAiProvider(this.value)" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="deepseek" ${isDeepSeek ? 'selected' : ''}>🚀 DeepSeek / OpenAI 兼容模式（国内直连 · 推荐 deepseek-flash）</option>
                <option value="gemini" ${!isDeepSeek ? 'selected' : ''}>✨ Google Gemini 原生模式（需外网代理）</option>
              </select>
            </div>

            <div>
              <label class="block font-bold text-slate-600 dark:text-slate-400 mb-1">${isDeepSeek ? 'DeepSeek / OpenAI API Key' : 'Gemini API Key'}</label>
              <div class="flex items-center gap-2">
                <input type="password" id="settings-gemini-key" value="${this.escapeHtml(aiCfg.apiKey)}" placeholder="${isDeepSeek ? '粘贴你的 DeepSeek Key（如 sk-...）' : '粘贴你的 Key（如 AQ.Ab8... 或 AIza...）'}" class="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl font-mono bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <button type="button" id="settings-gemini-key-toggle" onclick="app.toggleGeminiKeyVisibility()" class="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 font-semibold shrink-0">👁️ 显示</button>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block font-bold text-slate-600 dark:text-slate-400 mb-1">识别模型（可下拉选择或直接输入）</label>
                <input type="text" id="settings-gemini-model" list="gemini-model-presets" value="${this.escapeHtml(aiCfg.model)}" placeholder="${isDeepSeek ? 'deepseek-flash' : 'gemini-3.8-flash'}" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl font-mono bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <datalist id="gemini-model-presets">
                  ${isDeepSeek ? `
                    <option value="deepseek-flash">DeepSeek 视觉模型（推荐 · 支持识图）</option>
                    <option value="qwen-vl-max">阿里云百炼通义千问视觉（需改 Base URL）</option>
                    <option value="gpt-4o-mini">OpenAI GPT-4o-mini（需改 Base URL）</option>
                  ` : `
                    <option value="gemini-3.8-flash">推荐 · 速度快免费额度高</option>
                    <option value="gemini-3.8-pro">复杂长题深度解析</option>
                    <option value="gemini-2.5-flash">旧版兼容模型</option>
                  `}
                </datalist>
              </div>
              <div>
                <label class="block font-bold text-slate-600 dark:text-slate-400 mb-1">API Base URL</label>
                <input type="text" id="settings-gemini-base-url" value="${this.escapeHtml(aiCfg.baseUrl)}" placeholder="${isDeepSeek ? 'https://api.deepseek.com' : 'https://generativelanguage.googleapis.com'}" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl font-mono bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-3 pt-1">
            <button type="button" onclick="app.saveGeminiSettings()" class="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition">
              💾 保存 AI 配置
            </button>
            <button type="button" onclick="app.testGeminiConnection()" class="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-700 transition">
              🔌 测试连接
            </button>
            <span id="settings-gemini-status" class="text-xs text-slate-400"></span>
          </div>
        </div>

        <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-5">
          <h3 class="text-base font-bold text-slate-900 dark:text-slate-100">📦 数据安全与迁移</h3>
          <p class="text-xs text-slate-500 leading-relaxed">
            所有 A Level / CNCC 学科、单元、单科小考测验成绩、错题内容以及粘贴的插图均保存在您本地浏览器的 IndexedDB 数据库中，完全私密不上传任何外部服务器。复习备考时定期导出备份文件保存到 iCloud 或网盘中。
          </p>

          <div class="flex flex-wrap items-center gap-3 pt-2">
            <button onclick="app.exportBackup()" class="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition">
              <span>⬇️</span>
              <span>导出全量 JSON 备份</span>
            </button>

            <label class="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer">
              <span>⬆️</span>
              <span>导入恢复备份</span>
              <input type="file" accept=".json" onchange="app.importBackup(this)" class="hidden" />
            </label>
          </div>
        </div>

        <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-3">
          <h3 class="text-base font-bold text-slate-900 dark:text-slate-100">🧪 十一国际部 A Level & CNCC 题库预置</h3>
          <p class="text-xs text-slate-500 leading-relaxed">
            若想重新载入十一学校国际部 A Level (Maths S1/P1、Physics、Economics) 与 CNCC (地理、生物、化学) 的全部单元结构、单科小考测验与经典错题，可随时点击一键补充。
          </p>
          <button onclick="app.resetToSampleData()" class="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-700 transition">
            载入预置官方学科、单元与 Past Paper 错题
          </button>
        </div>

        <div class="bg-amber-50/50 dark:bg-amber-950/20 rounded-2xl border border-amber-200 dark:border-amber-900/60 p-6 shadow-xs space-y-3">
          <h3 class="text-base font-bold text-amber-700 dark:text-amber-400">🧹 清理示例错题与成绩数据</h3>
          <p class="text-xs text-amber-700/80 dark:text-amber-300/80 leading-relaxed">
            若想清空系统内置的示例错题与小考记录，点击下方按钮即可一键清除（<strong>保留全部 A Level 与 CNCC 学科和单元知识点</strong>，方便直接从零录入你自己的真实错题与成绩）。
          </p>
          <button onclick="app.clearSampleData()" class="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-sm transition">
            一键清空示例错题与小考 (保留学科与单元)
          </button>
        </div>

        <div class="bg-rose-50/50 dark:bg-rose-950/20 rounded-2xl border border-rose-200 dark:border-rose-900/60 p-6 shadow-xs space-y-3">
          <h3 class="text-base font-bold text-rose-600">⚠️ 危险操作区域</h3>
          <p class="text-xs text-rose-500/80 leading-relaxed">
            清空本地数据库将会删除所有的错题、学科和小考成绩，且无法直接撤销。请确保已完成导出备份。
          </p>
          <button onclick="app.clearAllData()" class="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition">
            清空所有本地错题数据
          </button>
        </div>
      </div>
    `;
  }
}

// 导出全局单例并挂载
window.app = new App();
document.addEventListener('DOMContentLoaded', () => {
  window.app.init();
});
