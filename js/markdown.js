/**
 * markdown.js - 错题本专用 Markdown 与 LaTeX 公式渲染引擎
 * 支持 KaTeX 公式渲染（行内 $ 和 独立块 $$）、代码高亮、表格、列表、任务项与图片
 */

class MarkdownRenderer {
  constructor() {
    this.hasKatex = typeof window.katex !== 'undefined';
  }

  checkKatex() {
    if (typeof window.katex !== 'undefined') {
      this.hasKatex = true;
    }
    return this.hasKatex;
  }

  escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * 渲染数学公式与 Markdown
   * 处理步骤：
   * 1. 抽取所有的 $$...$$ 块级公式和 $...$ 行内公式，用唯一的 token 占位，防止 Markdown 符号（如下划线 _ 或星号 *）破坏公式
   * 2. 渲染核心 Markdown（表格、标题、列表、加粗、引用、代码块、图片等）
   * 3. 将占位 token 替换回由 KaTeX 渲染出的 HTML（如果 KaTeX 离线，则优雅降级为优美的数学字符占位框）
   */
  render(text) {
    if (!text || typeof text !== 'string') return '';

    this.checkKatex();
    const mathTokens = [];
    let processed = text;

    // 1. 提取独立块级公式 $$ ... $$
    processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (match, formula) => {
      const id = `__MATH_BLOCK_${mathTokens.length}__`;
      mathTokens.push({ id, formula: formula.trim(), isBlock: true });
      return id;
    });

    // 2. 提取行内公式 $ ... $ (排查转义 \$ 和纯金额如 $100 )
    // 要求 $ 内部不能以空格开头或结尾
    processed = processed.replace(/(?<!\\)\$([^\$\n\r]+?)(?<!\\)\$/g, (match, formula) => {
      const id = `__MATH_INLINE_${mathTokens.length}__`;
      mathTokens.push({ id, formula: formula.trim(), isBlock: false });
      return id;
    });

    // 3. 处理代码块 ```lang ... ``` (支持 Prism.js 及内置通用语法高亮)
    const codeTokens = [];
    processed = processed.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const id = `__CODE_BLOCK_${codeTokens.length}__`;
      const cleanLang = (lang || '').trim().toLowerCase();
      const highlighted = this.highlightCode(code.trim(), cleanLang);
      const langClass = cleanLang ? `language-${cleanLang}` : '';
      const html = `
        <div class="my-3 rounded-xl overflow-hidden border border-slate-700/80 bg-slate-900 text-slate-100 text-xs font-mono shadow-sm">
          <div class="px-3.5 py-1.5 bg-slate-800/90 text-[11px] text-slate-400 font-bold tracking-wider uppercase border-b border-slate-700/80 flex items-center justify-between select-none">
            <span class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
              <span>${cleanLang || 'CODE'}</span>
            </span>
            <span class="text-[10px] text-slate-500 font-normal">语法高亮</span>
          </div>
          <pre class="p-3.5 overflow-x-auto leading-relaxed"><code class="${langClass}">${highlighted}</code></pre>
        </div>
      `;
      codeTokens.push({ id, html });
      return id;
    });

    // 4. 解析行内代码 `code`
    processed = processed.replace(/`([^`\n]+)`/g, (match, code) => {
      return `<code class="px-1.5 py-0.5 rounded text-xs font-mono bg-slate-100 dark:bg-slate-800 text-pink-600 dark:text-pink-400 border border-slate-200 dark:border-slate-700">${this.escapeHtml(code)}</code>`;
    });

    // 5. 解析图片与链接
    // 图片: ![alt](url) - 不显示下方小字说明，保持试卷纯净感
    processed = processed.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, url) => {
      return `<div class="my-3 text-center">
        <img src="${url}" alt="${this.escapeHtml(alt)}" class="max-w-full max-h-96 inline-block rounded-lg shadow-md border border-slate-200 dark:border-slate-700 object-contain hover:shadow-lg transition-shadow cursor-pointer" onclick="window.previewImage && window.previewImage('${url}')" />
      </div>`;
    });

    // 链接: [text](url)
    processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-indigo-600 dark:text-indigo-400 hover:underline font-medium">${text}</a>`;
    });

    // 6. 分割为段落和行来解析块级元素
    const lines = processed.split('\n');
    let inTable = false;
    let tableRows = [];
    const htmlLines = [];

    const flushTable = () => {
      if (!inTable || tableRows.length === 0) return;

      // 智能检测是否为剑桥官方标准的 Mark Scheme 4栏或评分表格
      const firstRowStr = (tableRows[0] || []).join(' ').toLowerCase();
      const isMarkScheme = (firstRowStr.includes('question') && (firstRowStr.includes('answer') || firstRowStr.includes('mark') || firstRowStr.includes('guidance'))) ||
                           (firstRowStr.includes('mark scheme')) ||
                           (firstRowStr.includes('题号') && (firstRowStr.includes('答案') || firstRowStr.includes('得分') || firstRowStr.includes('评分标准')));

      if (isMarkScheme) {
        let msHtml = '<div class="overflow-x-auto my-3"><table class="mark-scheme-table w-full text-left text-sm border-collapse">';
        tableRows.forEach((row, idx) => {
          const isHeader = idx === 0;
          const tag = isHeader ? 'th' : 'td';
          msHtml += '<tr>';
          row.forEach((cell, colIdx) => {
            let colClass = '';
            if (colIdx === 0) colClass = 'ms-col-question';
            else if (colIdx === 1) colClass = 'ms-col-answer';
            else if (colIdx === 2) colClass = 'ms-col-marks';
            else if (colIdx === 3) colClass = 'ms-col-guidance';
            msHtml += `<${tag} class="${colClass}">${cell}</${tag}>`;
          });
          msHtml += '</tr>';
        });
        msHtml += '</table></div>';
        htmlLines.push(msHtml);
        tableRows = [];
        inTable = false;
        return;
      }

      let tableHtml = '<div class="overflow-x-auto my-3"><table class="w-full text-left text-sm border-collapse border border-slate-200 dark:border-slate-700 rounded-lg">';
      
      tableRows.forEach((row, idx) => {
        const isHeader = idx === 0 && tableRows.length > 1;
        const tag = isHeader ? 'th' : 'td';
        const bg = isHeader ? 'bg-slate-100 dark:bg-slate-800 font-semibold text-slate-800 dark:text-slate-200' : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300';
        
        tableHtml += `<tr class="border-b border-slate-200 dark:border-slate-700">`;
        row.forEach(cell => {
          tableHtml += `<${tag} class="px-3 py-2 border-r border-slate-200 dark:border-slate-700 last:border-r-0 ${bg}">${cell}</${tag}>`;
        });
        tableHtml += `</tr>`;
      });

      tableHtml += '</table></div>';
      htmlLines.push(tableHtml);
      tableRows = [];
      inTable = false;
    };

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // 表格处理
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        inTable = true;
        // 分割单元格
        const rawCells = line.trim().slice(1, -1).split('|');
        // 判断是否是分隔行 |---|---|
        if (rawCells.every(c => c.trim().match(/^:?-+:?$/))) {
          continue; // 跳过分割线
        }
        tableRows.push(rawCells.map(c => this.parseInline(c.trim())));
        continue;
      } else {
        if (inTable) flushTable();
      }

      // 标题
      if (line.match(/^######\s+(.*)/)) {
        htmlLines.push(`<h6 class="text-sm font-bold text-slate-800 dark:text-slate-200 mt-4 mb-2">${this.parseInline(RegExp.$1)}</h6>`);
        continue;
      }
      if (line.match(/^#####\s+(.*)/)) {
        htmlLines.push(`<h5 class="text-base font-bold text-slate-800 dark:text-slate-200 mt-4 mb-2">${this.parseInline(RegExp.$1)}</h5>`);
        continue;
      }
      if (line.match(/^####\s+(.*)/)) {
        htmlLines.push(`<h4 class="text-lg font-bold text-slate-800 dark:text-slate-200 mt-4 mb-2">${this.parseInline(RegExp.$1)}</h4>`);
        continue;
      }
      if (line.match(/^###\s+(.*)/)) {
        htmlLines.push(`<h3 class="text-xl font-bold text-slate-900 dark:text-slate-100 mt-5 mb-2 border-b border-slate-100 dark:border-slate-800 pb-1">${this.parseInline(RegExp.$1)}</h3>`);
        continue;
      }
      if (line.match(/^##\s+(.*)/)) {
        htmlLines.push(`<h2 class="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-6 mb-3 border-b border-slate-200 dark:border-slate-800 pb-1.5">${this.parseInline(RegExp.$1)}</h2>`);
        continue;
      }
      if (line.match(/^#\s+(.*)/)) {
        htmlLines.push(`<h1 class="text-3xl font-extrabold text-slate-900 dark:text-slate-100 mt-6 mb-4 border-b-2 border-indigo-500 pb-2">${this.parseInline(RegExp.$1)}</h1>`);
        continue;
      }

      // 水平分割线
      if (line.match(/^(?:---|\*\*\*|___)\s*$/)) {
        htmlLines.push(`<hr class="my-4 border-t border-slate-200 dark:border-slate-700" />`);
        continue;
      }

      // 引用块 >
      if (line.match(/^>\s+(.*)/)) {
        htmlLines.push(`<blockquote class="pl-4 py-1.5 my-2 border-l-4 border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 text-slate-700 dark:text-slate-300 italic rounded-r">${this.parseInline(RegExp.$1)}</blockquote>`);
        continue;
      }

      // 无序列表
      if (line.match(/^[\*\-]\s+(.*)/)) {
        const item = RegExp.$1;
        // 任务列表
        if (item.startsWith('[ ] ')) {
          htmlLines.push(`<li class="flex items-center space-x-2 my-1 list-none text-slate-700 dark:text-slate-300"><input type="checkbox" disabled class="rounded text-indigo-600 mr-2" /><span>${this.parseInline(item.slice(4))}</span></li>`);
        } else if (item.startsWith('[x] ') || item.startsWith('[X] ')) {
          htmlLines.push(`<li class="flex items-center space-x-2 my-1 list-none text-slate-700 dark:text-slate-300"><input type="checkbox" checked disabled class="rounded text-indigo-600 mr-2" /><span class="line-through text-slate-400">${this.parseInline(item.slice(4))}</span></li>`);
        } else {
          htmlLines.push(`<li class="ml-5 list-disc my-1 text-slate-700 dark:text-slate-300 leading-relaxed">${this.parseInline(item)}</li>`);
        }
        continue;
      }

      // 有序列表
      if (line.match(/^(\d+)\.\s+(.*)/)) {
        const num = RegExp.$1;
        const item = RegExp.$2;
        htmlLines.push(`<li class="ml-5 list-decimal my-1 text-slate-700 dark:text-slate-300 leading-relaxed" value="${num}">${this.parseInline(item)}</li>`);
        continue;
      }

      // 空白行
      if (line.trim() === '') {
        htmlLines.push('<div class="h-2"></div>');
        continue;
      }

      // 普通段落
      htmlLines.push(`<p class="my-1.5 text-slate-700 dark:text-slate-300 leading-relaxed">${this.parseInline(line)}</p>`);
    }

    if (inTable) flushTable();

    let finalHtml = htmlLines.join('\n');

    // 7. 还原代码块
    codeTokens.forEach(t => {
      finalHtml = finalHtml.replace(t.id, t.html);
    });

    // 8. 还原并渲染数学公式
    mathTokens.forEach(t => {
      const renderedMath = this.renderMath(t.formula, t.isBlock);
      finalHtml = finalHtml.replace(t.id, renderedMath);
    });

    return finalHtml;
  }

  parseInline(text) {
    if (!text) return '';
    return text
      // 加粗与斜体
      .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold text-slate-900 dark:text-slate-100">$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em class="italic">$1</em>')
      .replace(/~~([^~]+)~~/g, '<del class="line-through text-slate-400">$1</del>');
  }

  renderMath(formula, isBlock) {
    if (this.hasKatex && window.katex) {
      try {
        const html = window.katex.renderToString(formula, {
          displayMode: isBlock,
          throwOnError: false,
          output: 'htmlAndMathml'
        });
        if (isBlock) {
          return `<div class="my-3 py-2 text-center overflow-x-auto bg-slate-50 dark:bg-slate-800/40 rounded-lg p-2 border border-slate-100 dark:border-slate-800">${html}</div>`;
        }
        return `<span class="inline-math px-0.5">${html}</span>`;
      } catch (e) {
        console.warn('KaTeX render error:', e);
      }
    }

    // 优雅降级 (若 KaTeX 尚未加载完成或离线)
    const escaped = this.escapeHtml(formula);
    if (isBlock) {
      return `<div class="my-3 p-3 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-lg font-mono text-center text-sm text-indigo-700 dark:text-indigo-300 overflow-x-auto">
        <span class="text-xs uppercase tracking-wider block text-indigo-400 font-semibold mb-1">LaTeX Math</span>
        <code>$$ ${escaped} $$</code>
      </div>`;
    }
    return `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60" title="LaTeX Formula">$${escaped}$</span>`;
  }

  /**
   * 代码语法高亮处理器 (支持 Prism.js CDN 与内置分词解析引擎)
   */
  highlightCode(code, lang) {
    if (!code) return '';
    const cleanLang = (lang || '').toLowerCase();

    // 1. 优先调用已加载的 Prism.js
    if (typeof window !== 'undefined' && window.Prism) {
      let prismGrammar = window.Prism.languages[cleanLang];
      if (!prismGrammar) {
        if (cleanLang === 'py' || cleanLang === 'python3') prismGrammar = window.Prism.languages.python;
        else if (cleanLang === 'js') prismGrammar = window.Prism.languages.javascript;
        else if (cleanLang === 'ts') prismGrammar = window.Prism.languages.typescript;
        else if (cleanLang === 'html' || cleanLang === 'xml') prismGrammar = window.Prism.languages.markup;
        else if (cleanLang === 'sh' || cleanLang === 'shell' || cleanLang === 'zsh') prismGrammar = window.Prism.languages.bash;
        else if (cleanLang === 'md' || cleanLang === 'markdown') prismGrammar = window.Prism.languages.markdown;
      }
      if (prismGrammar) {
        try {
          return window.Prism.highlight(code, prismGrammar, cleanLang);
        } catch (e) {
          // fallback
        }
      }
    }

    // 2. 内置轻量级通用高亮分词器 (零网络依赖，支持离线即时高亮)
    return this.fallbackHighlight(code, cleanLang);
  }

  fallbackHighlight(code, lang) {
    const tokens = [];
    const placeholder = (text, cls) => {
      const id = `___HL_TOKEN_${tokens.length}___`;
      tokens.push({ id, html: `<span class="token ${cls}">${this.escapeHtml(text)}</span>` });
      return id;
    };

    let text = code;

    // 1. 匹配多行与单行注释
    text = text.replace(/(\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|\/\/[^\n]*|#[^\n]*|%[^\n]*)/g, (match) => {
      return placeholder(match, 'comment');
    });

    // 2. 匹配双引号与单引号字符串与反引号
    text = text.replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/g, (match) => {
      return placeholder(match, 'string');
    });

    // 3. 转义普通代码字符
    text = this.escapeHtml(text);

    // 4. 匹配数字
    text = text.replace(/\b(\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b/gi, '<span class="token number">$1</span>');

    // 5. 常见编程语言与 SQL 核心关键字高亮
    const keywords = [
      'def', 'class', 'import', 'from', 'as', 'return', 'if', 'elif', 'else', 'while', 'for', 'in',
      'try', 'except', 'finally', 'with', 'lambda', 'pass', 'break', 'continue', 'yield', 'global',
      'function', 'const', 'let', 'var', 'async', 'await', 'new', 'this', 'typeof', 'instanceof',
      'void', 'public', 'private', 'protected', 'static', 'int', 'float', 'double', 'char', 'bool',
      'boolean', 'true', 'false', 'null', 'undefined', 'None', 'True', 'False',
      'SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'JOIN', 'GROUP', 'ORDER', 'BY', 'HAVING'
    ];
    const kwRegex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g');
    text = text.replace(kwRegex, '<span class="token keyword">$1</span>');

    // 6. 函数名调用高亮
    text = text.replace(/\b([a-zA-Z_]\w*)\s*(?=\()/g, '<span class="token function">$1</span>');

    // 7. 还原注释与字符串
    tokens.forEach(t => {
      text = text.replace(t.id, t.html);
    });

    return text;
  }

  /**
   * 工具栏快捷插入模板
   */
  static insertTemplate(textarea, type) {
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end);
    let before = '';
    let after = '';
    let defaultText = '';

    switch (type) {
      case 'bold':
        before = '**';
        after = '**';
        defaultText = selected || '加粗文本';
        break;
      case 'italic':
        before = '*';
        after = '*';
        defaultText = selected || '斜体文本';
        break;
      case 'inline-math':
        before = '$';
        after = '$';
        defaultText = selected || 'x^2 + y^2 = r^2';
        break;
      case 'block-math':
        before = '\n$$\n';
        after = '\n$$\n';
        defaultText = selected || '\\int_{0}^{1} f(x)dx = \\frac{1}{2}';
        break;
      case 'code':
        before = '`';
        after = '`';
        defaultText = selected || 'code';
        break;
      case 'code-block':
        before = '\n```python\n';
        after = '\n```\n';
        defaultText = selected || '# 在此输入代码';
        break;
      case 'quote':
        before = '\n> ';
        after = '\n';
        defaultText = selected || '关键考点/提醒';
        break;
      case 'table':
        before = '\n| 步骤 | 说明 | 考点 |\n| :--- | :--- | :--- |\n| 1 | ';
        after = ' | 解析 |\n| 2 | 第二步 | 易错点 |\n';
        defaultText = selected || '第一步内容';
        break;
      case 'mark-scheme':
        before = '\n| Question | Answer | Marks | Guidance |\n| :---: | :--- | :---: | :--- |\n| 1(a) | ';
        after = ' | **B1** | Find value of $x$. |\n| 1(b) | $P(A \\cap B) = \\frac{1}{6}$ | **M1**<br>**A1** | Correct method seen<br>Final answer fraction |\n| | | **[3]** | *Total Marks* |\n';
        defaultText = selected || '$\\frac{4}{x+10} = \\frac{1}{6} \\implies x=14$';
        break;
      case 'list-bullet':
        before = '\n- ';
        after = '\n';
        defaultText = selected || '列表项';
        break;
      case 'list-numbered':
        before = '\n1. ';
        after = '\n';
        defaultText = selected || '第一步';
        break;
      case 'fraction':
        before = '$\\frac{';
        after = '}{分母}$';
        defaultText = selected || '分子';
        break;
      case 'sqrt':
        before = '$\\sqrt{';
        after = '}$';
        defaultText = selected || 'x';
        break;
      case 'subsup':
        before = '$x_{';
        after = '}^{2}$';
        defaultText = selected || '1';
        break;
      default:
        break;
    }

    const replacement = before + defaultText + after;
    textarea.focus();
    textarea.setRangeText(replacement, start, end, 'end');
    // 触发 input 事件以更新预览
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

// 导出全局类与单例
window.MarkdownRenderer = MarkdownRenderer;
window.markdownRenderer = new MarkdownRenderer();

