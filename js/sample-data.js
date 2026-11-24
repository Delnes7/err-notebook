/**
 * sample-data.js - 十一学校国际部 A Level 项目与 CNCC 专属学科、单元与错题配置
 * 适配科目：
 * - A Level: 数学(纯数P1/统计S1)、物理、经济
 * - CNCC: 地理、生物、化学
 * 考试模式：单学科小考/测验 (Quiz, Unit Test, Assessment)，每次总分不同，自动折算百分制与 Grade
 */

// A Level 打分标准 (图1)
const A_LEVEL_GRADE_SCALE = [
  { min: 89.5, mark: 'A*' },
  { min: 79.5, mark: 'A' },
  { min: 69.5, mark: 'B' },
  { min: 59.5, mark: 'C' },
  { min: 49.5, mark: 'D' },
  { min: 40.0, mark: 'E' },
  { min: 0.0,  mark: 'U' }
];

// CNCC 打分标准 (图2)
const CNCC_GRADE_SCALE = [
  { min: 94.5, mark: 'A+' },
  { min: 89.5, mark: 'A' },
  { min: 84.5, mark: 'A-' },
  { min: 79.5, mark: 'B' },
  { min: 69.5, mark: 'C' },
  { min: 59.5, mark: 'D' },
  { min: 0.0,  mark: 'F' }
];

/**
 * 自动计算等级 Grade
 * @param {number} percentage 百分比 (0~100)
 * @param {string} curriculum 'A Level' 或 'CNCC'
 */
function calculateGrade(percentage, curriculum = 'A Level') {
  const p = Math.round(percentage * 10) / 10;
  const scale = (curriculum === 'CNCC') ? CNCC_GRADE_SCALE : A_LEVEL_GRADE_SCALE;
  for (const item of scale) {
    if (p >= item.min) {
      return item.mark;
    }
  }
  return (curriculum === 'CNCC') ? 'F' : 'U';
}

/**
 * 根据等级计算 GPA 绩点 (4.0 满分制)
 * @param {string} grade 等级 (A*, A, A+, A-, B, C, D, E, F, U)
 */
function calculateGpaPoint(grade) {
  switch (grade) {
    case 'A*':
    case 'A+':
    case 'A':
      return 4.0;
    case 'A-':
      return 3.7;
    case 'B':
      return 3.0;
    case 'C':
      return 2.0;
    case 'D':
      return 1.0;
    case 'E':
      return 0.5;
    default:
      return 0.0;
  }
}

// 默认各科考核项目与权重配置 (Task Category Averages)
// 图3：A Level 数学学科考核结构 (包含 P1 与 S1 两个子科目)
const DEFAULT_MATH_ASSESSMENT_CONFIG = [
  { id: 'att_p1', name: 'Attainment P1', weight: 30 },
  { id: 'skills', name: 'Course Skills', weight: 20 },
  { id: 'behavior', name: 'Learning Behavior', weight: 10 },
  { id: 'final_p1', name: 'Final P1', weight: 12 },
  { id: 'att_s1', name: 'Attainment S1', weight: 20 },
  { id: 'final_s1', name: 'Final S1', weight: 8 }
];

// 图2：A Level 标准学科考核结构 (物理、经济等)
const DEFAULT_STANDARD_AL_ASSESSMENT_CONFIG = [
  { id: 'attainment', name: 'Attainment', weight: 50 },
  { id: 'skills', name: 'Course Skills', weight: 20 },
  { id: 'behavior', name: 'Learning Behavior', weight: 10 },
  { id: 'final', name: 'Final', weight: 20 }
];

// CNCC 国家课程考核结构 (仅计算考试成绩)
const DEFAULT_CNCC_ASSESSMENT_CONFIG = [
  { id: 'exams', name: 'Attainment (测验考核)', weight: 100 }
];

const DEFAULT_SUBJECTS = [
  {
    id: 'sub-al-math',
    name: 'Mathematics',
    chineseName: '数学 (纯数P1/统计S1)',
    code: '9709',
    curriculum: 'A Level',
    color: '#4f46e5',
    bgClass: 'bg-indigo-600',
    lightBg: 'bg-indigo-50 dark:bg-indigo-950/40',
    defaultMaxScore: 100,
    order: 0,
    units: [
      { id: 'u-p1-quad', name: '[P1] Quadratics 二次函数与判别式' },
      { id: 'u-p1-func', name: '[P1] Functions 复合函数与反函数' },
      { id: 'u-p1-geom', name: '[P1] Coordinate Geometry 解析几何与圆' },
      { id: 'u-p1-circ', name: '[P1] Circular Measure 弧度制与扇形' },
      { id: 'u-p1-trig', name: '[P1] Trigonometry 三角函数与恒等式' },
      { id: 'u-p1-series', name: '[P1] Series 二项式与数列(AP/GP)' },
      { id: 'u-p1-diff', name: '[P1] Differentiation 微分与极值' },
      { id: 'u-p1-integ', name: '[P1] Integration 定积分与面积' },
      { id: 'u-s1-data', name: '[S1] Representation of Data 数据统计与箱线图' },
      { id: 'u-s1-perm', name: '[S1] Permutations & Combinations 排列组合' },
      { id: 'u-s1-prob', name: '[S1] Probability 互斥、独立与条件概率' },
      { id: 'u-s1-drv', name: '[S1] Discrete Random Variables 离散变量与期望' },
      { id: 'u-s1-norm', name: '[S1] Normal Distribution 正态分布与标化计算' }
    ]
  },
  {
    id: 'sub-al-physics',
    name: 'Physics',
    code: '9702',
    curriculum: 'A Level',
    color: '#0284c7',
    bgClass: 'bg-sky-600',
    lightBg: 'bg-sky-50 dark:bg-sky-950/40',
    defaultMaxScore: 35,
    order: 1,
    units: [
      { id: 'u-phy-units', name: 'Physical Quantities & Units 物理量与SI单位' },
      { id: 'u-phy-kin', name: 'Kinematics 运动学 (匀变速直线与抛体运动)' },
      { id: 'u-phy-dyn', name: 'Dynamics 动力学 (牛顿三定律与动量守恒)' },
      { id: 'u-phy-forces', name: 'Forces, Density & Pressure 受力分析与平衡' },
      { id: 'u-phy-work', name: 'Work, Energy & Power 功、动能定理与功率' },
      { id: 'u-phy-solids', name: 'Deformation of Solids 固体形变与杨氏模量' },
      { id: 'u-phy-waves', name: 'Waves 机械波性质与多普勒效应' },
      { id: 'u-phy-super', name: 'Superposition 双缝干涉与衍射光栅' },
      { id: 'u-phy-elec', name: 'Electricity 直流电路、内阻与分压器电路' },
      { id: 'u-phy-particle', name: 'Particle Physics 放射衰变与夸克标准模型' }
    ]
  },
  {
    id: 'sub-al-econ',
    name: 'Economics',
    code: '9708',
    curriculum: 'A Level',
    color: '#8b5cf6',
    bgClass: 'bg-purple-600',
    lightBg: 'bg-purple-50 dark:bg-purple-950/40',
    defaultMaxScore: 25,
    order: 4,
    units: [
      { id: 'u-econ-ideas', name: 'Basic Economic Ideas 稀缺性、机会成本与PPC' },
      { id: 'u-econ-price', name: 'The Price System 供求曲线与价格弹性(PED/PES)' },
      { id: 'u-econ-interv', name: 'Government Micro Intervention 税收/补贴与最高限价' },
      { id: 'u-econ-fail', name: 'Market Failure 外部性、公共品与信息不对称' },
      { id: 'u-econ-macro-aggr', name: 'Macro Economy 宏观经济指标与总供求(AD/AS)' },
      { id: 'u-econ-macro-pol', name: 'Macro Policies 财政政策、货币政策与供给侧政策' },
      { id: 'u-econ-trade', name: 'International Trade 国际贸易理论与比较优势' },
      { id: 'u-econ-bop', name: 'Exchange Rates & BOP 汇率制度与国际收支平衡' }
    ]
  },
  {
    id: 'sub-cncc-geo',
    name: 'CNCC 地理',
    code: 'CNCC',
    curriculum: 'CNCC',
    color: '#059669',
    bgClass: 'bg-emerald-600',
    lightBg: 'bg-emerald-50 dark:bg-emerald-950/40',
    defaultMaxScore: 50,
    order: 5,
    units: [
      { id: 'u-geo-earth', name: '宇宙中的地球与地球自转公转运动' },
      { id: 'u-geo-atmos', name: '大气的受热过程、气压带风带与天气系统' },
      { id: 'u-geo-water', name: '水循环、陆地水体相互补给与洋流' },
      { id: 'u-geo-land', name: '常见地貌类型与内外力地表形态塑造' },
      { id: 'u-geo-pop', name: '人口分布、人口迁移与城镇化' },
      { id: 'u-geo-ind', name: '工农业区位选择与人地协调可持续发展' }
    ]
  },
  {
    id: 'sub-cncc-bio',
    name: 'CNCC 生物',
    code: 'CNCC',
    curriculum: 'CNCC',
    color: '#10b981',
    bgClass: 'bg-teal-600',
    lightBg: 'bg-teal-50 dark:bg-teal-950/40',
    defaultMaxScore: 50,
    order: 6,
    units: [
      { id: 'u-bio-cell', name: '细胞的分子组成与基本结构' },
      { id: 'u-bio-transport', name: '细胞的物质输入和输出 (跨膜运输)' },
      { id: 'u-bio-energy', name: '细胞的能量供应与利用 (光合作用与呼吸作用)' },
      { id: 'u-bio-cycle', name: '细胞的生命历程 (有丝分裂、分化与衰老凋亡)' },
      { id: 'u-bio-genetics', name: '孟德尔遗传定律与伴性遗传分析' },
      { id: 'u-bio-gene', name: '基因的本质、基因表达与生物变异' }
    ]
  },
  {
    id: 'sub-cncc-chem',
    name: 'CNCC 化学',
    code: 'CNCC',
    curriculum: 'CNCC',
    color: '#0d9488',
    bgClass: 'bg-teal-500',
    lightBg: 'bg-teal-50 dark:bg-teal-950/40',
    defaultMaxScore: 50,
    order: 7,
    units: [
      { id: 'u-chem-ion', name: '物质的分类与离子反应方程式' },
      { id: 'u-chem-redox', name: '氧化还原反应规律与电子转移配平' },
      { id: 'u-chem-metals', name: '常见金属及其化合物 (Na, Fe, Al, Cu)' },
      { id: 'u-chem-nonmetals', name: '常见非金属及其化合物 (Cl, S, N, Si)' },
      { id: 'u-chem-mole', name: '物质的量与阿伏加德罗常数综合计算' },
      { id: 'u-chem-energy', name: '化学反应能量变化与电化学 (原电池与电解池)' }
    ]
  }
];

// 单科小考/测验样例（支持一次考试考察多个单元，独立折算百分制和 Grade）
const DEFAULT_EXAMS = [
  // Mathematics 统计S1 测验 (Attainment S1)
  {
    id: 'exam-s1-quiz-prob',
    subjectId: 'sub-al-math',
    category: 'att_s1',
    categoryName: 'Attainment S1',
    unitId: 'u-s1-prob',
    unitIds: ['u-s1-prob', 'u-s1-perm'], // 包含两单元：排列组合 & 概率
    title: 'S1 Probability & Permutations 随堂小测',
    date: '2026-10-28',
    score: 28,
    maxScore: 32,
    percentage: 87.5,
    grade: 'A', // 87.5% >= 79.5% -> A
    note: '第4题红球蓝球条件概率由于未分类讨论导致失分。'
  },
  {
    id: 'exam-s1-data-drv',
    subjectId: 'sub-al-math',
    category: 'att_s1',
    categoryName: 'Attainment S1',
    unitId: 'u-s1-drv',
    unitIds: ['u-s1-data', 'u-s1-drv'], // 包含数据统计与离散变量
    title: 'S1 Representation of Data & DRV 单元阶段测试',
    date: '2026-11-05',
    score: 28.5,
    maxScore: 30,
    percentage: 95.0,
    grade: 'A*', // 95% >= 89.5% -> A*
    note: '方差计算 Var(aX+b) 公式运用准确，书写格式规范。'
  },
  // Mathematics 纯数P1 测验 (Attainment P1)
  {
    id: 'exam-p1-diff-test',
    subjectId: 'sub-al-math',
    category: 'att_p1',
    categoryName: 'Attainment P1',
    unitId: 'u-p1-integ',
    unitIds: ['u-p1-diff', 'u-p1-integ'], // 包含微分与定积分两大单元
    title: 'P1 Differentiation & Integration 微积分综合测验',
    date: '2026-10-24',
    score: 41,
    maxScore: 45,
    percentage: 91.1,
    grade: 'A*', // 91.1% >= 89.5% -> A*
    note: '积分大题曲线位于x轴下方需取绝对值，注意符号细节。'
  },
  {
    id: 'exam-p1-trig-circ',
    subjectId: 'sub-al-math',
    category: 'att_p1',
    categoryName: 'Attainment P1',
    unitId: 'u-p1-trig',
    unitIds: ['u-p1-circ', 'u-p1-trig'], // 包含弧度制与三角函数恒等式
    title: 'P1 Circular Measure & Trigonometry 小测',
    date: '2026-10-12',
    score: 36,
    maxScore: 40,
    percentage: 90.0,
    grade: 'A*', // 90% >= 89.5% -> A*
    note: '扇形面积公式与三角双解范围判别表现优异。'
  },
  // 数学日常学习行为与项目 (Course Skills & Learning Behavior)
  {
    id: 'exam-math-lb-w89',
    subjectId: 'sub-al-math',
    category: 'behavior',
    categoryName: 'Learning Behavior',
    title: 'Learning Behaviour W8&9',
    date: '2026-10-30',
    score: 90,
    maxScore: 100,
    percentage: 90.0,
    grade: 'A*',
    note: '课堂研讨积极，作业按时高质量提交。'
  },
  {
    id: 'exam-math-lb-w67',
    subjectId: 'sub-al-math',
    category: 'behavior',
    categoryName: 'Learning Behavior',
    title: 'Learning Behaviour W6&7',
    date: '2026-10-16',
    score: 100,
    maxScore: 100,
    percentage: 100.0,
    grade: 'A*',
    note: '全勤且独立完成微积分错题纠错。'
  },
  {
    id: 'exam-math-project',
    subjectId: 'sub-al-math',
    category: 'skills',
    categoryName: 'Course Skills',
    title: 'Research/Excel Project',
    date: '2026-10-07',
    score: 90,
    maxScore: 100,
    percentage: 90.0,
    grade: 'A*',
    note: 'Excel 二项分布与正态逼近建模展示优秀。'
  },
  // Physics 测验、技能与行为
  {
    id: 'exam-phy-circuits',
    subjectId: 'sub-al-physics',
    category: 'attainment',
    categoryName: 'Attainment',
    unitId: 'u-phy-elec',
    unitIds: ['u-phy-elec'],
    title: 'Physics Electricity & Internal Resistance 小测',
    date: '2026-10-20',
    score: 29,
    maxScore: 35,
    percentage: 82.9,
    grade: 'A', // 82.9% >= 79.5% -> A
    note: '分压器电路内阻公式联立失误，需要加强 lost volts 理解。'
  },
  {
    id: 'exam-phy-dynamics',
    subjectId: 'sub-al-physics',
    category: 'attainment',
    categoryName: 'Attainment',
    unitId: 'u-phy-dyn',
    unitIds: ['u-phy-kin', 'u-phy-dyn'], // 运动学与动力学
    title: 'Physics Kinematics & Momentum 阶段测试',
    date: '2026-11-03',
    score: 31,
    maxScore: 35,
    percentage: 88.6,
    grade: 'A', // 88.6% >= 79.5% -> A
    note: '动量守恒方向正负号设立有轻微笔误，受力分析图完整。'
  },
  {
    id: 'exam-phy-lab-skills',
    subjectId: 'sub-al-physics',
    category: 'skills',
    categoryName: 'Course Skills',
    title: 'Physics Practical Lab Experiment',
    date: '2026-10-18',
    score: 92,
    maxScore: 100,
    percentage: 92.0,
    grade: 'A*',
    note: '光电门测量重力加速度 g 实验操作严谨，不确定度分析规范。'
  },
  {
    id: 'exam-phy-behavior',
    subjectId: 'sub-al-physics',
    category: 'behavior',
    categoryName: 'Learning Behavior',
    title: 'Physics Learning Behaviour W6-W9',
    date: '2026-10-31',
    score: 95,
    maxScore: 100,
    percentage: 95.0,
    grade: 'A*',
    note: '实验规范与课后作业完成度满分。'
  },
  // Economics 测验、项目与行为
  {
    id: 'exam-econ-macro',
    subjectId: 'sub-al-econ',
    category: 'attainment',
    categoryName: 'Attainment',
    unitId: 'u-econ-macro-aggr',
    unitIds: ['u-econ-macro-aggr', 'u-econ-macro-pol'], // 宏观总供求与宏观政策
    title: 'Economics Macro AD/AS & Fiscal Policy Assessment',
    date: '2026-10-29',
    score: 22,
    maxScore: 25,
    percentage: 88.0,
    grade: 'A', // 88.0% >= 79.5% -> A
    note: '论述题对挤出效应 (Crowding Out) 评价较为深刻。'
  },
  {
    id: 'exam-econ-project',
    subjectId: 'sub-al-econ',
    category: 'skills',
    categoryName: 'Course Skills',
    title: 'Economic Policy Case Study Presentation',
    date: '2026-10-15',
    score: 91,
    maxScore: 100,
    percentage: 91.0,
    grade: 'A*',
    note: '通货膨胀对中低收入群体影响的宏观分析论据详实。'
  },
  {
    id: 'exam-econ-behavior',
    subjectId: 'sub-al-econ',
    category: 'behavior',
    categoryName: 'Learning Behavior',
    title: 'Economics Learning Behaviour W4-W8',
    date: '2026-10-25',
    score: 96,
    maxScore: 100,
    percentage: 96.0,
    grade: 'A*',
    note: '新闻评论写作认真。'
  },
  // CNCC 国家课程
  {
    id: 'exam-cncc-bio-energy',
    subjectId: 'sub-cncc-bio',
    category: 'exams',
    categoryName: 'Attainment (测验考核)',
    unitId: 'u-bio-energy',
    unitIds: ['u-bio-cell', 'u-bio-energy'], // 细胞结构与能量代谢
    title: 'CNCC 生物：光合作用与细胞呼吸阶段小考',
    date: '2026-10-15',
    score: 45,
    maxScore: 50,
    percentage: 90.0,
    grade: 'A', // CNCC: 90.0% >= 89.5% -> A
    note: '真正光合作用量与净光合作用量的综合计算。'
  },
  {
    id: 'exam-cncc-chem-redox',
    subjectId: 'sub-cncc-chem',
    category: 'exams',
    categoryName: 'Attainment (测验考核)',
    unitId: 'u-chem-redox',
    unitIds: ['u-chem-ion', 'u-chem-redox'], // 离子反应与氧化还原
    title: 'CNCC 化学：离子反应与氧化还原反应配平小测',
    date: '2026-10-22',
    score: 46,
    maxScore: 50,
    percentage: 92.0,
    grade: 'A', // CNCC: 92.0% >= 89.5% -> A
    note: '电子得失守恒配平快速，拆写离子方程式书写细致。'
  },
  {
    id: 'exam-cncc-geo-earth',
    subjectId: 'sub-cncc-geo',
    category: 'exams',
    categoryName: 'Attainment (测验考核)',
    unitId: 'u-geo-earth',
    unitIds: ['u-geo-earth', 'u-geo-atmos'], // 地球运动与大气受热
    title: 'CNCC 地理：地球公转与气压带风带小测',
    date: '2026-10-18',
    score: 42,
    maxScore: 50,
    percentage: 84.0,
    grade: 'B', // CNCC: 84.0% -> B
    note: '正午太阳高度角在南半球的计算公式需要再做两道巩固题。'
  }
];

const DEFAULT_QUESTIONS = [
  {
    id: 'q-s1-balls-prob',
    subjectId: 'sub-al-math',
    unitId: 'u-s1-prob',
    examId: 'exam-s1-quiz-prob',
    paperCode: 'W23-52-7',
    title: 'CAIE S1: 条件概率与取球问题 (Probability with Boxes)',
    content: `Box $A$ contains $6$ red balls and $4$ blue balls. Box $B$ contains $x$ red balls and $9$ blue balls. A ball is chosen at random from box $A$ and placed in box $B$. A ball is then chosen at random from box $B$.

(a) Show that the probability that both balls chosen are blue is $\\frac{4}{x + 10}$. [2]

It is given that the probability that both balls chosen are blue is $\\frac{1}{6}$.

(b) Find the value of $x$. [2]

(c) Find the probability, correct to $3$ significant figures, that the ball chosen from box $A$ is red given that the ball chosen from box $B$ is red. [5]`,
    solution: `| Question | Answer | Marks | Guidance |
| :---: | :--- | :---: | :--- |
| **7(c)** | $\\frac{4}{x+10} = \\frac{1}{6}$<br>$x+10 = 24, \\quad x = 14$ | **B1** | Find value of $x$. Can be implied by correct probabilities in calculation. |
| | $\\text{P}(\\text{ARed} \\mid \\text{BRed}) = \\text{P}(\\text{ARed} \\cap \\text{BRed}) \\div \\text{P}(\\text{BRed})$<br><br>$\\frac{\\frac{6}{10} \\times their \\frac{x+1}{x+10}}{\\frac{6}{10} \\times their \\frac{x+1}{x+10} + \\frac{4}{10} \\times their \\frac{x}{x+10}} = \\frac{\\frac{6}{10} \\times \\frac{15}{24}}{\\frac{6}{10} \\times \\frac{15}{24} + \\frac{4}{10} \\times \\frac{14}{24}} = \\frac{\\frac{3}{8}}{\\frac{73}{120}}$ | **B1 FT**<br><br>**M1**<br><br>**A1 FT** | $\\frac{6}{10} \\times their \\frac{x+1}{x+10}$ as numerator or denominator of fraction.<br><br>$\\frac{6}{10} \\times their \\frac{x+1}{x+10} + \\frac{4}{10} \\times their \\frac{x}{x+10}$ seen anywhere.<br><br>Seen as denominator of fraction. |
| | $\\frac{45}{73}, \\quad 0.616[4...]$ | **A1** | **If B0 M0:**<br>**SC B1** for $\\frac{\\frac{3}{8}}{\\frac{73}{120}}$ or $\\frac{0.375}{0.6083}$ **SC B1** $\\frac{45}{73}$ or $0.616$. |
| | | **5** | |`,
    reasons: ['条件概率全概率公式分母漏算', '有效数字未保留3位'],
    difficulty: 4,
    reviewCount: 1,
    createdAt: '2026-10-28T16:00:00.000Z',
    updatedAt: '2026-10-28T16:00:00.000Z'
  },
  {
    id: 'q-p1-integ-area',
    subjectId: 'sub-al-math',
    unitId: 'u-p1-integ',
    examId: 'exam-p1-diff-test',
    paperCode: 'S23-12-8',
    title: 'CAIE P1: 定积分求曲线封闭面积 (Integration & Area Below Axis)',
    content: `The diagram shows part of the curve with equation:
$$y = \\frac{16}{x^2} - 4$$

The curve intersects the $x$-axis at the point $A(2, 0)$. The line $x = 4$ intersects the curve at point $B$.

1. Find $\\int \\left( \\frac{16}{x^2} - 4 \\right) dx$.
2. Hence find the exact area of the shaded region bounded by the curve, the $x$-axis, and the vertical line $x = 4$.`,
    solution: `### 【Mark Scheme & Solution】

#### (1) Indefinite Integration
$$\\int \\left( 16x^{-2} - 4 \\right) dx = -\\frac{16}{x} - 4x + c$$

#### (2) Shaded Area Calculation
> ⚠️ Notice $y < 0$ between $x=2$ and $x=4$:
$$\\text{Area} = - \\int_{2}^{4} \\left( \\frac{16}{x^2} - 4 \\right) dx = - \\left[ -\\frac{16}{x} - 4x \\right]_{2}^{4} = -(-20 - (-16)) = 4$$`,
    reasons: ['曲线在x轴下方未加绝对值符号', '负指数积分求导混淆'],
    difficulty: 3,
    reviewCount: 2,
    createdAt: '2026-10-24T15:00:00.000Z',
    updatedAt: '2026-10-24T15:00:00.000Z'
  }
];

// 初始化数据装载与数据升级函数：保证 Mathematics 整合纯数P1与统计S1
async function ensureSampleData(db) {
  const existingSubjects = await db.getAllSubjects();
  if (!existingSubjects || existingSubjects.length === 0) {
    for (const sub of DEFAULT_SUBJECTS) {
      await db.saveSubject(sub);
    }
    return true;
  }

  // 检查是否包含独立的 P1 或 S1，如果有则整合入统一的 Mathematics (sub-al-math)
  const mathSub = existingSubjects.find(s => s.id === 'sub-al-math' || s.name === 'Mathematics');
  const p1Sub = existingSubjects.find(s => s.id === 'sub-al-math-p1' || s.name === 'Maths P1');
  const s1Sub = existingSubjects.find(s => s.id === 'sub-al-math-s1' || s.name === 'Maths S1');

  if (p1Sub || s1Sub || !mathSub) {
    const unitsMap = new Map();
    // 注入默认的整合单元
    DEFAULT_SUBJECTS[0].units.forEach(u => unitsMap.set(u.id, u));

    if (mathSub && Array.isArray(mathSub.units)) {
      mathSub.units.forEach(u => unitsMap.set(u.id, u));
    }
    if (p1Sub && Array.isArray(p1Sub.units)) {
      p1Sub.units.forEach(u => unitsMap.set(u.id, u));
    }
    if (s1Sub && Array.isArray(s1Sub.units)) {
      s1Sub.units.forEach(u => unitsMap.set(u.id, u));
    }

    const consolidatedMath = {
      ...(mathSub || DEFAULT_SUBJECTS[0]),
      id: 'sub-al-math',
      name: 'Mathematics',
      chineseName: '数学 (纯数P1/统计S1)',
      code: '9709',
      curriculum: 'A Level',
      color: '#4f46e5',
      bgClass: 'bg-indigo-600',
      lightBg: 'bg-indigo-50 dark:bg-indigo-950/40',
      defaultMaxScore: 100,
      order: 0,
      units: Array.from(unitsMap.values())
    };
    delete consolidatedMath.isParent;
    delete consolidatedMath.childSubjectIds;
    await db.saveSubject(consolidatedMath);

    // 删除原有的独立分科
    if (p1Sub) {
      try { await db.deleteSubject(p1Sub.id); } catch(e){}
    }
    if (s1Sub) {
      try { await db.deleteSubject(s1Sub.id); } catch(e){}
    }

    // 迁移所有错题归属学科到 sub-al-math
    try {
      const allQuestions = await db.getAllQuestions();
      for (const q of allQuestions) {
        if (q.subjectId === 'sub-al-math-p1' || q.subjectId === 'sub-al-math-s1' || q.subjectId === 'p1' || q.subjectId === 's1') {
          q.subjectId = 'sub-al-math';
          await db.saveQuestion(q);
        }
      }
    } catch(e) { console.error('Error migrating questions:', e); }

    // 迁移所有小考/测验归属学科到 sub-al-math
    try {
      const allExams = await db.getAllExams();
      for (const exam of allExams) {
        if (exam.subjectId === 'sub-al-math-p1' || exam.subjectId === 'sub-al-math-s1') {
          exam.subjectId = 'sub-al-math';
          await db.saveExam(exam);
        }
      }
    } catch(e) { console.error('Error migrating exams:', e); }
  }

  return false;
}

window.A_LEVEL_GRADE_SCALE = A_LEVEL_GRADE_SCALE;
window.CNCC_GRADE_SCALE = CNCC_GRADE_SCALE;
window.calculateGrade = calculateGrade;
window.calculateGpaPoint = calculateGpaPoint;
window.DEFAULT_MATH_ASSESSMENT_CONFIG = DEFAULT_MATH_ASSESSMENT_CONFIG;
window.DEFAULT_STANDARD_AL_ASSESSMENT_CONFIG = DEFAULT_STANDARD_AL_ASSESSMENT_CONFIG;
window.DEFAULT_CNCC_ASSESSMENT_CONFIG = DEFAULT_CNCC_ASSESSMENT_CONFIG;
window.DEFAULT_SUBJECTS = DEFAULT_SUBJECTS;
window.DEFAULT_EXAMS = DEFAULT_EXAMS;
window.DEFAULT_QUESTIONS = DEFAULT_QUESTIONS;
window.ensureSampleData = ensureSampleData;
