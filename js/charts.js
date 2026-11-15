/**
 * charts.js - 各科成绩数据可视化与图表分析引擎
 * 基于 Chart.js 构建，支持深浅色模式自动适配、多科对比、历次小考趋势、能力雷达与薄弱单元排查
 */

(function () {
  const academicCharts = {
    instances: {},

    destroy(id) {
      if (this.instances[id]) {
        try {
          this.instances[id].destroy();
        } catch (e) {
          console.warn('Chart destroy error:', e);
        }
        delete this.instances[id];
      }
    },

    destroyAll() {
      Object.keys(this.instances).forEach(id => this.destroy(id));
    },

    isDark() {
      return document.documentElement.classList.contains('dark');
    },

    getColors() {
      const dark = this.isDark();
      return {
        textColor: dark ? '#cbd5e1' : '#475569',
        mutedText: dark ? '#94a3b8' : '#94a3b8',
        gridColor: dark ? 'rgba(51, 65, 85, 0.6)' : 'rgba(226, 232, 240, 0.8)',
        tooltipBg: dark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(30, 41, 59, 0.95)',
        tooltipBorder: dark ? 'rgba(71, 85, 105, 0.5)' : 'rgba(203, 213, 225, 0.8)',
        cardBg: dark ? '#0f172a' : '#ffffff'
      };
    },

    /**
     * 图表 1：历次小考成绩趋势走势图 (Line Chart)
     * 支持学科筛选、目标基准线 (A* 89.5% / A 79.5%)、Tooltip 卷面实得分提示
     */
    renderScoreTrendChart(canvasId, exams, filterSubjectId, subjects, filterCategories = ['attainment', 'skills', 'final']) {
      this.destroy(canvasId);
      const canvas = document.getElementById(canvasId);
      if (!canvas || typeof Chart === 'undefined') return;

      const colors = this.getColors();
      const subMap = new Map(subjects.map(s => [s.id, s]));

      // 规范化多选分类数组 (支持多选及向下兼容字符串)
      let activeCats = Array.isArray(filterCategories) ? filterCategories : [filterCategories];
      if (activeCats.includes('all')) {
        activeCats = ['attainment', 'skills', 'final'];
      }

      // 过滤并按考试日期正序排序（形成时间轴）
      // ⚠️ 核心要求 1：Learning Behaviour 属于日常态度，不计入学术小考折线走势图，一律排除！
      // ⚠️ 核心要求 2：支持考核项目多选筛选 (Attainment / Course Skills / Final)
      const sortedExams = exams
        .filter(e => {
          if (filterSubjectId !== 'all' && e.subjectId !== filterSubjectId) return false;

          // 排除 Learning Behaviour
          const isBehavior = e.category === 'behavior' || e.category?.includes('behavior');
          if (isBehavior) return false;

          // 判定项目归属
          const isAtt = e.category === 'attainment' || e.category === 'att_p1' || e.category === 'att_s1' || e.category === 'exams' ||
                        (!e.category && !e.isFinal && e.type !== 'Final' && !e.category?.includes('skill'));
          const isSkill = e.category === 'skills' || e.category?.includes('skill');
          const isFinal = e.category === 'final' || e.category === 'final_p1' || e.category === 'final_s1' || e.isFinal || e.type === 'Final';

          const matchAtt = activeCats.includes('attainment') && isAtt;
          const matchSkill = activeCats.includes('skills') && isSkill;
          const matchFinal = activeCats.includes('final') && isFinal;

          return matchAtt || matchSkill || matchFinal;
        })
        .slice()
        .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

      if (sortedExams.length === 0) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = colors.mutedText;
        ctx.font = '13px sans-serif';
        ctx.fillText('该学科/筛选条件下暂无成绩记录', canvas.width / 2, canvas.height / 2);
        ctx.restore();
        return;
      }

      const isMobile = (typeof window !== 'undefined' && window.innerWidth < 640);
      const isSingleSubject = filterSubjectId !== 'all';
      const labels = sortedExams.map(e => {
        if (isMobile) {
          // 手机端参考股票折线图：X 轴仅显示简洁日期 (MM-DD)，完整标题在点击/悬浮 tooltip 中查看
          return e.date ? e.date.slice(5) : (e.title ? e.title.slice(0, 6) : '测验');
        }
        if (isSingleSubject) {
          // 单科模式：下方显示考试的名字（标题）
          return e.title || (e.date ? e.date.slice(5) : '测验');
        } else {
          // 全科总览模式：显示 日期 + 学科名称
          const sub = subMap.get(e.subjectId);
          const subName = sub ? sub.name : '';
          const shortDate = e.date ? e.date.slice(5) : '';
          return shortDate ? `${shortDate} ${subName}` : (e.title || '小考');
        }
      });

      const dataPoints = sortedExams.map(e => e.percentage);

      // 单科时使用该学科的专属主题色
      const activeSub = subMap.get(filterSubjectId);
      const mainColor = activeSub ? activeSub.color : '#6366f1';

      // 目标基准线数值 (根据当前科目或国际部通用标准)
      const isCNCC = activeSub && activeSub.curriculum === 'CNCC';
      const aStarLineVal = isCNCC ? 94.5 : 89.5;
      const aLineVal = isCNCC ? 89.5 : 79.5;
      const aStarLabel = isCNCC ? 'A+ 基准线 (94.5%)' : 'A* 卓越线 (89.5%)';
      const aLabel = isCNCC ? 'A 优良线 (89.5%)' : 'A 优秀线 (79.5%)';

      const aStarDataset = {
        label: aStarLabel,
        data: sortedExams.map(() => aStarLineVal),
        borderColor: '#10b981',
        borderWidth: isMobile ? 1.2 : 1.5,
        borderDash: [5, 4],
        pointRadius: 0,
        fill: false,
        tension: 0
      };

      const aDataset = {
        label: aLabel,
        data: sortedExams.map(() => aLineVal),
        borderColor: '#3b82f6',
        borderWidth: isMobile ? 1.2 : 1.5,
        borderDash: [4, 4],
        pointRadius: 0,
        fill: false,
        tension: 0
      };

      const ctx = canvas.getContext('2d');
      const areaGradient = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight || 260);
      areaGradient.addColorStop(0, `${mainColor}38`);
      areaGradient.addColorStop(1, `${mainColor}00`);

      const scoreDataset = {
        label: activeSub ? `${activeSub.name} 成绩得分率` : '历次小考得分率',
        data: dataPoints,
        borderColor: mainColor,
        backgroundColor: areaGradient,
        borderWidth: isMobile ? 2.5 : 3,
        pointBackgroundColor: sortedExams.map(e => {
          if (e.percentage >= aStarLineVal) return '#10b981';
          if (e.percentage >= aLineVal) return '#3b82f6';
          return mainColor;
        }),
        pointBorderColor: '#ffffff',
        pointBorderWidth: isMobile ? 1.5 : 2,
        pointRadius: isMobile ? (sortedExams.length > 10 ? 2.5 : 3.5) : 5,
        pointHitRadius: 16,
        pointHoverRadius: 7,
        fill: true,
        tension: 0.35
      };

      this.instances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [scoreDataset, aStarDataset, aDataset]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: 'index',
            intersect: false
          },
          plugins: {
            legend: {
              position: 'top',
              labels: {
                color: colors.textColor,
                font: { size: isMobile ? 10 : 11, weight: '600' },
                boxWidth: isMobile ? 8 : 14,
                boxHeight: isMobile ? 8 : 14,
                padding: isMobile ? 8 : 12,
                usePointStyle: true
              }
            },
            tooltip: {
              backgroundColor: colors.tooltipBg,
              titleColor: '#ffffff',
              bodyColor: '#e2e8f0',
              borderColor: colors.tooltipBorder,
              borderWidth: 1,
              padding: 10,
              displayColors: true,
              callbacks: {
                title: (items) => {
                  const idx = items[0].dataIndex;
                  const e = sortedExams[idx];
                  return `${e.title || '小考'} (${e.date || '未记录日期'})`;
                },
                afterLabel: (item) => {
                  if (item.datasetIndex === 0) {
                    const idx = item.dataIndex;
                    const e = sortedExams[idx];
                    const catName = e.categoryName || (e.category === 'skills' ? 'Course Skills' : (e.category === 'behavior' ? 'Learning Behaviour' : (e.category === 'final' ? 'Final' : 'Attainment')));
                    const isCurved = !!(e.isCurved || (e.curvedScore !== undefined && e.curvedScore !== null && e.curvedScore !== ''));
                    const scoreLine = isCurved
                      ? `Curve 后成绩：${e.percentage}% (原始：${e.score} / ${e.maxScore} 分)`
                      : `卷面实得分：${e.score} / ${e.maxScore} 分`;
                    return `${scoreLine}\nTask Grade：${e.grade || '--'}\n考核维度：${catName}`;
                  }
                  return null;
                }
              }
            }
          },
          scales: {
            x: {
              grid: {
                display: !isMobile,
                color: colors.gridColor
              },
              ticks: {
                color: colors.mutedText,
                font: { size: 10 },
                maxRotation: isMobile ? 0 : 35,
                minRotation: 0,
                autoSkip: true,
                maxTicksLimit: isMobile ? 5 : 12,
                callback: function(val) {
                  const label = this.getLabelForValue(val);
                  if (typeof label === 'string' && label.length > 14) {
                    return label.slice(0, 13) + '…';
                  }
                  return label;
                }
              }
            },
            y: {
              min: Math.max(0, Math.floor((Math.min(...dataPoints, 40) - 10) / 10) * 10),
              max: 100,
              grid: { color: colors.gridColor },
              ticks: {
                color: colors.mutedText,
                font: { size: 10 },
                callback: (val) => `${val}%`
              }
            }
          }
        }
      });
    },

    /**
     * 图表 2：全科学业均衡度与能力雷达图 (Radar Chart)
     */
    renderSubjectRadarChart(canvasId, subjects, exams, weightedScores = null) {
      this.destroy(canvasId);
      const canvas = document.getElementById(canvasId);
      if (!canvas || typeof Chart === 'undefined') return;

      const colors = this.getColors();

      // 使用各科加权总评得分
      const labels = [];
      const averages = [];

      subjects.forEach(sub => {
        labels.push(sub.name);
        if (weightedScores && weightedScores[sub.id] !== undefined && weightedScores[sub.id] !== null) {
          averages.push(Math.round(weightedScores[sub.id] * 10) / 10);
        } else {
          const subExams = exams.filter(e => e.subjectId === sub.id);
          if (subExams.length > 0) {
            const avg = subExams.reduce((sum, e) => sum + (parseFloat(e.percentage) || 0), 0) / subExams.length;
            averages.push(Math.round(avg * 10) / 10);
          } else {
            averages.push(0);
          }
        }
      });

      const ctx = canvas.getContext('2d');
      this.instances[canvasId] = new Chart(ctx, {
        type: 'radar',
        data: {
          labels: labels,
          datasets: [
            {
              label: '各科加权总评得分 (%)',
              data: averages,
              backgroundColor: 'rgba(99, 102, 241, 0.25)',
              borderColor: '#6366f1',
              borderWidth: 2.5,
              pointBackgroundColor: '#6366f1',
              pointBorderColor: '#ffffff',
              pointRadius: 4,
              pointHoverRadius: 6
            },
            {
              label: 'A* 目标基准线 (89.5%)',
              data: labels.map(() => 89.5),
              borderColor: 'rgba(16, 185, 129, 0.7)',
              borderWidth: 1.5,
              borderDash: [4, 4],
              pointRadius: 0,
              fill: false
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
              labels: {
                color: colors.textColor,
                font: { size: 11, weight: '600' },
                boxWidth: 12
              }
            },
            tooltip: {
              backgroundColor: colors.tooltipBg,
              titleColor: '#ffffff',
              bodyColor: '#e2e8f0',
              callbacks: {
                label: (item) => `${item.dataset.label}: ${item.formattedValue}%`
              }
            }
          },
          scales: {
            r: {
              angleLines: { color: colors.gridColor },
              grid: { color: colors.gridColor },
              pointLabels: {
                color: colors.textColor,
                font: { size: 11, weight: '600' }
              },
              min: 0,
              max: 100,
              ticks: {
                display: false,
                stepSize: 20
              }
            }
          }
        }
      });
    },

    /**
     * 图表 3：各单元知识点表现与失分排查横向条形图 (Horizontal Bar Chart)
     */
    renderUnitPerformanceChart(canvasId, subject, exams, questions) {
      this.destroy(canvasId);
      const canvas = document.getElementById(canvasId);
      if (!canvas || typeof Chart === 'undefined') return;

      const colors = this.getColors();
      if (!subject || !subject.units || subject.units.length === 0) return;

      const labels = [];
      const scoreData = [];
      const errorCounts = [];

      subject.units.forEach(u => {
        // 匹配该单元的考试 (支持 unitIds 数组或 unitId)
        const unitExams = exams.filter(e => {
          if (e.subjectId !== subject.id) return false;
          if (Array.isArray(e.unitIds) && e.unitIds.includes(u.id)) return true;
          return e.unitId === u.id;
        });

        // 匹配该单元的错题数
        const unitQuestions = questions.filter(q => q.subjectId === subject.id && q.unitId === u.id);

        // 截取较短的单元名称
        const shortName = u.name.length > 20 ? u.name.slice(0, 18) + '...' : u.name;
        labels.push(shortName);

        if (unitExams.length > 0) {
          const avg = unitExams.reduce((sum, e) => sum + (parseFloat(e.percentage) || 0), 0) / unitExams.length;
          scoreData.push(Math.round(avg * 10) / 10);
        } else {
          scoreData.push(null); // 该单元尚未考试
        }

        errorCounts.push(unitQuestions.length);
      });

      const ctx = canvas.getContext('2d');
      this.instances[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            {
              label: '单元平均得分率 (%)',
              data: scoreData,
              backgroundColor: scoreData.map(val => {
                if (val === null) return 'rgba(148, 163, 184, 0.3)';
                if (val >= 89.5) return 'rgba(16, 185, 129, 0.85)';
                if (val >= 79.5) return 'rgba(59, 130, 246, 0.85)';
                if (val >= 69.5) return 'rgba(99, 102, 241, 0.85)';
                return 'rgba(239, 68, 68, 0.85)';
              }),
              borderRadius: 6,
              borderSkipped: false
            }
          ]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              backgroundColor: colors.tooltipBg,
              titleColor: '#ffffff',
              bodyColor: '#e2e8f0',
              callbacks: {
                title: (items) => {
                  const idx = items[0].dataIndex;
                  return subject.units[idx].name;
                },
                label: (item) => {
                  const val = item.raw;
                  const idx = item.dataIndex;
                  const errors = errorCounts[idx];
                  const scoreStr = val !== null ? `${val}%` : '暂无小考记录';
                  return `平均得分率：${scoreStr} | 累计错题：${errors} 道`;
                }
              }
            }
          },
          scales: {
            x: {
              min: 0,
              max: 100,
              grid: { color: colors.gridColor },
              ticks: {
                color: colors.mutedText,
                font: { size: 10 },
                callback: (v) => `${v}%`
              }
            },
            y: {
              grid: { display: false },
              ticks: { color: colors.textColor, font: { size: 10 } }
            }
          }
        }
      });
    },

    /**
     * 图表 4：Task Grade 等级分布环形图 (Doughnut Chart)
     */
    renderGradeDoughnutChart(canvasId, exams) {
      this.destroy(canvasId);
      const canvas = document.getElementById(canvasId);
      if (!canvas || typeof Chart === 'undefined') return;

      const colors = this.getColors();

      // 统计等级分布
      const gradeCounts = {
        'A* / A+': 0,
        'A': 0,
        'A- / B': 0,
        'C': 0,
        'D': 0,
        'E / U / F': 0
      };

      exams.forEach(e => {
        const g = e.grade || '';
        if (g === 'A*' || g === 'A+') gradeCounts['A* / A+']++;
        else if (g === 'A') gradeCounts['A']++;
        else if (g === 'A-' || g === 'B') gradeCounts['A- / B']++;
        else if (g === 'C') gradeCounts['C']++;
        else if (g === 'D') gradeCounts['D']++;
        else if (['E', 'U', 'F'].includes(g)) gradeCounts['E / U / F']++;
      });

      const labels = Object.keys(gradeCounts).filter(k => gradeCounts[k] > 0);
      const data = labels.map(k => gradeCounts[k]);
      const palette = {
        'A* / A+': '#10b981',
        'A': '#3b82f6',
        'A- / B': '#6366f1',
        'C': '#f59e0b',
        'D': '#f97316',
        'E / U / F': '#ef4444'
      };

      if (labels.length === 0) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = colors.mutedText;
        ctx.font = '13px sans-serif';
        ctx.fillText('暂无测验 Task Grade 等级数据', canvas.width / 2, canvas.height / 2);
        ctx.restore();
        return;
      }

      const ctx = canvas.getContext('2d');
      this.instances[canvasId] = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [
            {
              data: data,
              backgroundColor: labels.map(l => palette[l] || '#94a3b8'),
              borderWidth: 2,
              borderColor: colors.cardBg,
              hoverOffset: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right',
              labels: {
                color: colors.textColor,
                font: { size: 11, weight: '600' },
                boxWidth: 12,
                padding: 10
              }
            },
            tooltip: {
              backgroundColor: colors.tooltipBg,
              titleColor: '#ffffff',
              bodyColor: '#e2e8f0',
              callbacks: {
                label: (item) => {
                  const total = exams.length || 1;
                  const pct = Math.round((item.raw / total) * 100);
                  return ` ${item.label}: ${item.raw} 次 (${pct}%)`;
                }
              }
            }
          },
          cutout: '65%'
        }
      });
    },

    /**
     * 图表 5：考核项目表现对比 (Bar Chart) - 严格遵循十一国际部 Task Categories (移除旧随堂小测/单元大测分组)
     */
    renderTypeBarChart(canvasId, exams) {
      this.destroy(canvasId);
      const canvas = document.getElementById(canvasId);
      if (!canvas || typeof Chart === 'undefined') return;

      const colors = this.getColors();

      // 十一学校国际部 Task Categories 维度
      const categories = [
        {
          key: 'attainment',
          label: 'Attainment (平时考核)',
          color: 'rgba(79, 70, 229, 0.85)',
          match: (e) => e.category === 'attainment' || e.category === 'att_p1' || e.category === 'att_s1' || e.category === 'exams' ||
                        (!e.category && !e.isFinal && e.type !== 'Final' && !e.category?.includes('skill') && !e.category?.includes('behavior'))
        },
        {
          key: 'skills',
          label: 'Course Skills (项目与实践)',
          color: 'rgba(16, 185, 129, 0.85)',
          match: (e) => e.category === 'skills' || e.category?.includes('skill') || e.title?.toLowerCase().includes('project') || e.title?.toLowerCase().includes('lab')
        },
        {
          key: 'behavior',
          label: 'Learning Behaviour (学习行为)',
          color: 'rgba(245, 158, 11, 0.85)',
          match: (e) => e.category === 'behavior' || e.category?.includes('behavior') || e.title?.toLowerCase().includes('behaviour') || e.title?.toLowerCase().includes('behavior')
        },
        {
          key: 'final',
          label: 'Final (期末考查)',
          color: 'rgba(139, 92, 246, 0.85)',
          match: (e) => e.category === 'final' || e.category === 'final_p1' || e.category === 'final_s1' || e.isFinal || e.type === 'Final'
        }
      ];

      const labels = [];
      const averages = [];
      const counts = [];
      const bgColors = [];

      categories.forEach(cat => {
        const matchExams = exams.filter(e => cat.match(e) && e.percentage !== undefined);
        if (matchExams.length > 0) {
          labels.push(cat.label);
          const sum = matchExams.reduce((acc, e) => acc + (parseFloat(e.percentage) || 0), 0);
          averages.push(Math.round((sum / matchExams.length) * 10) / 10);
          counts.push(matchExams.length);
          bgColors.push(cat.color);
        }
      });

      if (labels.length === 0) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = colors.mutedText;
        ctx.font = '13px sans-serif';
        ctx.fillText('暂无考核项目数据', canvas.width / 2, canvas.height / 2);
        ctx.restore();
        return;
      }

      const ctx = canvas.getContext('2d');
      this.instances[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            {
              label: '平均得分率 (%)',
              data: averages,
              backgroundColor: bgColors,
              borderRadius: 8
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: colors.tooltipBg,
              titleColor: '#ffffff',
              bodyColor: '#e2e8f0',
              callbacks: {
                label: (item) => `平均得分率：${item.raw}% (已录入 ${counts[item.dataIndex]} 次打分)`
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: colors.textColor, font: { size: 10.5, weight: '600' } }
            },
            y: {
              min: 0,
              max: 100,
              grid: { color: colors.gridColor },
              ticks: {
                color: colors.mutedText,
                font: { size: 10 },
                callback: (v) => `${v}%`
              }
            }
          }
        }
      });
    }
  };

  window.academicCharts = academicCharts;
})();

