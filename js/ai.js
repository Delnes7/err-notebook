/**
 * ai.js - 多模态 AI 识图自动录题与 Mark Scheme 解析引擎
 * 支持双引擎：
 * 1. DeepSeek / OpenAI 兼容接口 (api.deepseek.com · deepseek-flash / 通义千问 / GPT-4o 等)
 * 2. Google Gemini 原生接口 (generativelanguage.googleapis.com)
 */

class GeminiAIHelper {
  constructor() {
    this.storageKeys = {
      provider: 'ai_provider',
      gemini: {
        apiKey: 'gemini_api_key',
        model: 'gemini_model',
        baseUrl: 'gemini_base_url'
      },
      deepseek: {
        apiKey: 'openai_api_key',
        model: 'openai_model',
        baseUrl: 'openai_base_url'
      },
      updatedAt: 'ai_config_updated_at'
    };
    this.defaults = {
      gemini: {
        model: 'gemini-3.8-flash',
        baseUrl: 'https://generativelanguage.googleapis.com'
      },
      deepseek: {
        model: 'deepseek-flash',
        baseUrl: 'https://api.deepseek.com'
      }
    };
    this.defaultModel = 'gemini-3.8-flash';
    this.defaultBaseUrl = 'https://generativelanguage.googleapis.com';
  }

  getProvider() {
    const saved = localStorage.getItem(this.storageKeys.provider);
    if (saved === 'deepseek' || saved === 'gemini') return saved;
    if (localStorage.getItem(this.storageKeys.deepseek.apiKey)) return 'deepseek';
    if (localStorage.getItem(this.storageKeys.gemini.apiKey)) return 'gemini';
    return 'deepseek';
  }

  setProvider(provider) {
    const p = provider === 'gemini' ? 'gemini' : 'deepseek';
    localStorage.setItem(this.storageKeys.provider, p);
    return p;
  }

  getConfig(providerOverride = null) {
    const provider = providerOverride === 'gemini' || providerOverride === 'deepseek'
      ? providerOverride
      : this.getProvider();
    const keys = this.storageKeys[provider];
    const def = this.defaults[provider];

    let model = (localStorage.getItem(keys.model) || def.model).trim();
    if (provider === 'gemini' && (model === 'gemini-2.5-flash' || model === 'gemini-2.0-flash')) {
      model = def.model;
    }
    return {
      provider,
      apiKey: (localStorage.getItem(keys.apiKey) || '').trim(),
      model,
      baseUrl: (localStorage.getItem(keys.baseUrl) || def.baseUrl).trim().replace(/\/+$/, '')
    };
  }

  saveConfig({ provider, apiKey, model, baseUrl }) {
    const p = provider ? this.setProvider(provider) : this.getProvider();
    const keys = this.storageKeys[p];
    const def = this.defaults[p];

    if (apiKey !== undefined) {
      localStorage.setItem(keys.apiKey, (apiKey || '').trim());
    }
    if (model !== undefined) {
      localStorage.setItem(keys.model, (model || def.model).trim());
    }
    if (baseUrl !== undefined) {
      const cleanBase = (baseUrl || def.baseUrl).trim().replace(/\/+$/, '') || def.baseUrl;
      localStorage.setItem(keys.baseUrl, cleanBase);
    }
    localStorage.setItem(this.storageKeys.updatedAt, new Date().toISOString());
    if (window.cloudSync && window.cloudSync.isLoggedIn()) {
      window.cloudSync.pushItem('meta', 'ai_config', this.exportSyncPayload()).catch(() => {});
    }
    return this.getConfig(p);
  }

  hasAnySyncableConfig() {
    const gemKey = (localStorage.getItem(this.storageKeys.gemini.apiKey) || '').trim();
    const dsKey = (localStorage.getItem(this.storageKeys.deepseek.apiKey) || '').trim();
    const updatedAt = (localStorage.getItem(this.storageKeys.updatedAt) || '').trim();
    return !!(gemKey || dsKey || updatedAt);
  }

  exportSyncPayload() {
    return {
      provider: this.getProvider(),
      gemini: {
        apiKey: (localStorage.getItem(this.storageKeys.gemini.apiKey) || '').trim(),
        model: (localStorage.getItem(this.storageKeys.gemini.model) || '').trim(),
        baseUrl: (localStorage.getItem(this.storageKeys.gemini.baseUrl) || '').trim()
      },
      deepseek: {
        apiKey: (localStorage.getItem(this.storageKeys.deepseek.apiKey) || '').trim(),
        model: (localStorage.getItem(this.storageKeys.deepseek.model) || '').trim(),
        baseUrl: (localStorage.getItem(this.storageKeys.deepseek.baseUrl) || '').trim()
      },
      updatedAt: (localStorage.getItem(this.storageKeys.updatedAt) || '').trim() || new Date().toISOString()
    };
  }

  importSyncPayload(payload) {
    if (!payload || typeof payload !== 'object') return;
    if (payload.provider === 'gemini' || payload.provider === 'deepseek') {
      localStorage.setItem(this.storageKeys.provider, payload.provider);
    }
    if (payload.gemini && typeof payload.gemini === 'object') {
      const k = this.storageKeys.gemini;
      if (payload.gemini.apiKey !== undefined) localStorage.setItem(k.apiKey, String(payload.gemini.apiKey || '').trim());
      if (payload.gemini.model !== undefined) localStorage.setItem(k.model, String(payload.gemini.model || '').trim());
      if (payload.gemini.baseUrl !== undefined) localStorage.setItem(k.baseUrl, String(payload.gemini.baseUrl || '').trim());
    }
    if (payload.deepseek && typeof payload.deepseek === 'object') {
      const k = this.storageKeys.deepseek;
      if (payload.deepseek.apiKey !== undefined) localStorage.setItem(k.apiKey, String(payload.deepseek.apiKey || '').trim());
      if (payload.deepseek.model !== undefined) localStorage.setItem(k.model, String(payload.deepseek.model || '').trim());
      if (payload.deepseek.baseUrl !== undefined) localStorage.setItem(k.baseUrl, String(payload.deepseek.baseUrl || '').trim());
    }
    if (payload.updatedAt) {
      localStorage.setItem(this.storageKeys.updatedAt, String(payload.updatedAt));
    }
  }

  hasApiKey() {
    return !!this.getConfig().apiKey;
  }

  getMaskedKey() {
    const key = this.getConfig().apiKey;
    if (!key) return '';
    if (key.length <= 10) return '****';
    return `${key.slice(0, 6)}...${key.slice(-4)}`;
  }

  _isHeicFile(fileOrDataUrl) {
    if (!fileOrDataUrl) return false;
    if (typeof fileOrDataUrl === 'string') {
      return /^data:image\/hei[cf]/i.test(fileOrDataUrl);
    }
    const type = (fileOrDataUrl.type || '').toLowerCase();
    const name = (fileOrDataUrl.name || '').toLowerCase();
    return type === 'image/heic' || type === 'image/heif' || /\.hei[cf]$/i.test(name);
  }

  /**
   * 压缩图片为适合视觉模型识别的 JPEG DataURL + 纯 Base64 (自动兼容 iPhone HEIC/HEIF)
   */
  async compressImage(fileOrDataUrl, maxWidth = 1400, quality = 0.82) {
    let source = fileOrDataUrl;

    if (this._isHeicFile(source) && typeof source !== 'string') {
      let convertedBlob = null;
      if (typeof window !== 'undefined' && window.HeicTo && typeof window.HeicTo.heicTo === 'function') {
        try {
          convertedBlob = await window.HeicTo.heicTo({
            blob: source,
            type: 'image/jpeg',
            quality: 0.9
          });
        } catch (heicErr) {
          console.warn('HeicTo 转换失败，尝试备用解码或原图提交:', heicErr);
        }
      }
      if (!convertedBlob && typeof window !== 'undefined' && typeof window.heic2any === 'function') {
        try {
          const converted = await window.heic2any({
            blob: source,
            toType: 'image/jpeg',
            quality: 0.9
          });
          convertedBlob = Array.isArray(converted) ? converted[0] : converted;
        } catch (heicErr) {
          console.warn('heic2any 转换失败，将直接以 image/heic 原图提交:', heicErr);
        }
      }
      if (convertedBlob) {
        source = convertedBlob;
      }
    }

    return new Promise((resolve, reject) => {
      const loadFromDataUrl = (dataUrl) => {
        const img = new Image();
        img.onload = () => {
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;
          if (w > maxWidth) {
            h = Math.round((h * maxWidth) / w);
            w = maxWidth;
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          const compressedUrl = canvas.toDataURL('image/jpeg', quality);
          const base64 = compressedUrl.split(',')[1] || '';
          resolve({
            dataUrl: compressedUrl,
            mimeType: 'image/jpeg',
            base64,
            width: w,
            height: h
          });
        };
        img.onerror = () => {
          // 若当前浏览器无法解码 HEIC 但 Gemini 原生支持 image/heic，降级直接上传原始 HEIC
          if (this._isHeicFile(fileOrDataUrl) && typeof dataUrl === 'string') {
            const base64 = dataUrl.split(',')[1] || '';
            resolve({
              dataUrl,
              mimeType: 'image/heic',
              base64,
              isHeicRaw: true
            });
            return;
          }
          reject(new Error('图片解码失败，请确认图片格式有效'));
        };
        img.src = dataUrl;
      };

      if (typeof source === 'string') {
        loadFromDataUrl(source);
      } else {
        const reader = new FileReader();
        reader.onload = (e) => loadFromDataUrl(e.target.result);
        reader.onerror = () => reject(new Error('读取图片文件失败'));
        reader.readAsDataURL(source);
      }
    });
  }

  _buildEndpoint(modelOverride = null) {
    const cfg = this.getConfig();
    if (!cfg.apiKey) {
      throw new Error(`尚未配置 ${cfg.provider === 'deepseek' ? 'DeepSeek' : 'Gemini'} API Key，请先填写并保存密钥`);
    }
    if (cfg.provider === 'deepseek') {
      const base = cfg.baseUrl || this.defaults.deepseek.baseUrl;
      return /\/v1$/i.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
    }
    const model = modelOverride || cfg.model || this.defaultModel;
    return `${cfg.baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
  }

  async _fetchOnce(url, payload, timeoutMs, extraHeaders = {}) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...extraHeaders
        },
        body: JSON.stringify(payload),
        signal: controller ? controller.signal : undefined
      });
    } catch (err) {
      if (err && err.name === 'AbortError') {
        throw new Error(`请求超时 (${Math.round(timeoutMs / 1000)}秒)，请检查网络连接或稍后重试`);
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }

    const rawText = await response.text();
    let json;
    try {
      json = JSON.parse(rawText);
    } catch (e) {
      throw Object.assign(
        new Error(`接口返回非 JSON 响应 (HTTP ${response.status}): ${rawText.slice(0, 200)}`),
        { status: response.status }
      );
    }

    if (!response.ok) {
      const apiMsg = json?.error?.message || json?.message || rawText.slice(0, 240);
      const status = response.status;
      throw Object.assign(
        new Error(`API 请求失败 (${status}): ${apiMsg}`),
        { status }
      );
    }

    return json;
  }

  async _callOpenAIChat(payload, timeoutMs = 300000) {
    const cfg = this.getConfig('deepseek');
    const url = this._buildEndpoint();
    return this._fetchOnce(url, payload, timeoutMs, {
      Authorization: `Bearer ${cfg.apiKey}`
    });
  }

  async _callGenerateContent(payload, modelOverride = null, timeoutMs = 300000) {
    const cfg = this.getConfig();
    const primaryModel = modelOverride || cfg.model || this.defaultModel;
    const url = this._buildEndpoint(primaryModel);

    // 遇到 503 (高峰期拥堵) 自动重试最多 2 次
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this._fetchOnce(url, payload, timeoutMs);
      } catch (err) {
        lastError = err;
        if (err && err.status === 503 && attempt < 2) {
          await new Promise(r => setTimeout(r, (attempt + 1) * 3000));
          continue;
        }
        break;
      }
    }

    // 若主模型持续 503 拥堵，自动尝试备用模型 gemini-3.8-pro
    if (lastError && lastError.status === 503 && !modelOverride && primaryModel === 'gemini-3.8-flash') {
      try {
        const fallbackUrl = this._buildEndpoint('gemini-3.8-pro');
        return await this._fetchOnce(fallbackUrl, payload, timeoutMs);
      } catch (fallbackErr) {
        // 若备用模型也失败（例如无权限或同样拥堵），仍抛出原始 503 提示
      }
    }

    throw lastError;
  }

  _buildThinkingConfig(modelName, mode = 'recognize') {
    const m = (modelName || '').toLowerCase();
    if (/^gemini-3/.test(m)) {
      return { thinkingLevel: mode === 'test' ? 'minimal' : 'low' };
    }
    if (/^gemini-2\.5/.test(m)) {
      return { thinkingBudget: mode === 'test' ? 0 : 512 };
    }
    return null;
  }

  /**
   * 测试当前 API Key 与网络连通性 (兼容 DeepSeek/OpenAI 与 Gemini)
   */
  async testConnection() {
    const cfg = this.getConfig();
    if (cfg.provider === 'deepseek') {
      const res = await this._callOpenAIChat({
        model: cfg.model || this.defaults.deepseek.model,
        messages: [
          { role: 'user', content: 'Please reply with exactly: OK' }
        ],
        max_tokens: 16,
        temperature: 0
      }, 30000);
      const text = (res?.choices?.[0]?.message?.content || 'OK').trim();
      return {
        ok: true,
        provider: 'deepseek',
        model: cfg.model,
        reply: text
      };
    }

    const generationConfig = {
      temperature: 0,
      maxOutputTokens: 16
    };
    const thinkingConfig = this._buildThinkingConfig(cfg.model, 'test');
    if (thinkingConfig) generationConfig.thinkingConfig = thinkingConfig;

    const res = await this._callGenerateContent({
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Please reply with exactly: OK' }]
        }
      ],
      generationConfig
    }, null, 30000);

    const text = res?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim() || 'OK';
    return {
      ok: true,
      provider: 'gemini',
      model: cfg.model,
      reply: text
    };
  }

  _buildSubjectCatalog(subjects = []) {
    return subjects.map(s => {
      const seen = new Set();
      const units = (s.units || []).filter(u => {
        if (seen.has(u.id)) return false;
        seen.add(u.id);
        return true;
      }).map(u => `  - unitId: "${u.id}" | name: "${u.name}"`).join('\n');
      return `Subject ID: "${s.id}" | Name: "${s.name}"${s.curriculum ? ` (${s.curriculum})` : ''}\nUnits:\n${units || '  - (no units)'}`;
    }).join('\n\n');
  }

  _getResponseSchema() {
    const rowSchema = {
      type: 'OBJECT',
      properties: {
        question: { type: 'STRING' },
        answer: { type: 'STRING' },
        marks: { type: 'STRING' },
        guidance: { type: 'STRING' }
      },
      required: ['answer', 'marks', 'guidance']
    };

    return {
      type: 'OBJECT',
      properties: {
        subjectId: { type: 'STRING' },
        unitId: { type: 'STRING' },
        paperCode: { type: 'STRING' },
        title: { type: 'STRING' },
        questionType: { type: 'STRING', enum: ['structured', 'multiple_choice'] },
        mcqType: { type: 'STRING', enum: ['single', 'multiple'] },
        stem: { type: 'STRING' },
        stemMarks: { type: 'STRING' },
        optionsList: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              key: { type: 'STRING' },
              text: { type: 'STRING' }
            },
            required: ['key', 'text']
          }
        },
        correctOptions: {
          type: 'ARRAY',
          items: { type: 'STRING' }
        },
        parts: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              label: { type: 'STRING' },
              marks: { type: 'STRING' },
              text: { type: 'STRING' },
              afterText: { type: 'STRING' },
              hasFigure: { type: 'BOOLEAN' },
              solutionRows: {
                type: 'ARRAY',
                items: rowSchema
              }
            },
            required: ['label', 'text']
          }
        },
        mcqSolutionRows: {
          type: 'ARRAY',
          items: rowSchema
        }
      },
      required: ['questionType', 'stem', 'title']
    };
  }

  /**
   * 识别题目图片 + 可选 Mark Scheme 答案图片，返回结构化错题对象
   */
  async recognizeQuestion({
    questionImages = [],
    markSchemeImages = [],
    subjects = [],
    currentSubjectId = '',
    autoGenerateSolution = true
  }) {
    if (!questionImages || questionImages.length === 0) {
      throw new Error('请先上传或粘贴至少一张题目图片');
    }

    const catalogText = this._buildSubjectCatalog(subjects);
    const hasMarkScheme = markSchemeImages && markSchemeImages.length > 0;

    const instruction = `You are an expert A-Level / CNCC (CIE Cambridge / Physics / Mathematics / Economics / Chemistry / Biology / Geography) exam question transcriber and Mark Scheme parser.

Analyze the attached QUESTION image(s)${hasMarkScheme ? ' and MARK SCHEME image(s)' : ''} and output strictly valid JSON matching the response schema.

CRITICAL FORMATTING RULES:
1. **LaTeX Math & Symbols**:
   - Wrap ALL inline mathematical expressions, variables, equations, fractions, probabilities, and physics formulas in single dollar signs: \`$...$\` (e.g. \`$x$\`, \`$\\frac{4}{x+10}$\`, \`$P(A \\mid B)$\`, \`$9.8\\,\\text{m s}^{-2}$\`).
   - Wrap standalone multi-line/displayed equations in \`$$...$$\`.
   - Transcribe the original problem text faithfully (do NOT translate English exam questions into Chinese unless the original image is in Chinese).

2. **Subject & Unit Classification**:
   - Match the closest \`subjectId\` and \`unitId\` from the Subject/Unit catalog below.
   - Currently selected subjectId in UI: "${currentSubjectId || ''}". Prefer matching within the actual subject shown by the question content.
   - Generate a concise Chinese summary \`title\` (6-16 characters, e.g. "条件概率与树形图求解", "竖直上抛运动图像分析").

3. **CIE Paper Code (\`paperCode\`)**:
   - If the header/footer/margin shows a Cambridge paper code (like \`9709/53/O/N/21\` Question \`7\`, or \`9702/22/M/J/23\` Q3), convert it to compact format: \`<Season><YY>-<Paper>-<QNum>\` where Oct/Nov=\`W\`, May/June=\`S\`, Feb/March=\`M\` (e.g. \`W21-53-7\`, \`S23-22-3\`). If not visible, return \`""\`.

4. **Question Structure**:
   - If it is a multiple-choice question (options A/B/C/D/...), set \`questionType: "multiple_choice"\`, put the question body in \`stem\`, put options in \`optionsList\` (\`[{key:"A", text:"..."}, ...]\`), set \`mcqType\` (\`"single"\` or \`"multiple"\`), put known correct answer letter(s) in \`correctOptions\` (if Mark Scheme or answer is visible or obvious), and put Mark Scheme/explanation rows in \`mcqSolutionRows\`. Leave \`parts\` empty.
   - If it is a structured / calculation / essay question:
     - Set \`questionType: "structured"\`.
     - If the question has sub-parts (\`(a)\`, \`(b)\`, \`(c)\`, \`(a)(i)\`, \`(a)(ii)\`, etc.):
       - Put ONLY the shared introductory context (text BEFORE the first sub-part) into \`stem\` (or \`""\` if none).
       - Put EVERY sub-part into \`parts\` (do NOT merge \`(a)\`/\`(b)\` into \`stem\`).
     - If the question has NO sub-parts at all (only one standalone main question/stem, even if it has \`[3]\` marks at the end):
       - Put the full question text into \`stem\` WITHOUT the trailing \`[3]\` mark bracket, put \`"3"\` into \`stemMarks\`, and leave \`parts\` as an empty array \`[]\`. Do NOT create a fake \`"本题"\` item in \`parts\`.
     - For each item in \`parts\` (when sub-parts exist):
       - \`label\`: e.g. \`"(a)"\`, \`"(b)"\`, \`"(a)(i)"\`
       - \`marks\`: numeric mark count as string e.g. \`"3"\`, or \`""\` if not shown
       - \`text\`: the sub-part prompt text in Markdown/LaTeX. Do NOT include blank dotted answer lines (\`......\`) or trailing mark brackets like \`[3]\`.
       - \`afterText\`: any transitional/context text that appears AFTER this sub-part and BEFORE the next sub-part (e.g. "The median and interquartile range for the Panthers are 103 minutes and 14 minutes respectively." between (a) and (b)). Return \`""\` if none.
       - \`hasFigure\`: \`true\` if that sub-part (or diagram right inside it) contains a visual figure/tree diagram/circuit/graph/chart that needs cropping from the original photo.

5. **Mark Scheme / Solution Parsing**:
${hasMarkScheme
        ? `   - MARK SCHEME IMAGE(S) ARE PROVIDED! Carefully match each sub-part (\`(a)\`, \`(b)\`, \`(c)\`...) and transcribe EVERY step row into \`solutionRows\` with \`question\` (put label on first row like \`"(c)"\`, empty string \`""\` on subsequent rows of same part), \`answer\` (exact LaTeX steps/final answer), \`marks\` (exact code like \`"B1"\`, \`"M1"\`, \`"A1"\`, \`"B1 FT"\`, \`"SC B1"\`), and \`guidance\` (exact examiner guidance notes). ALWAYS include the part's final total-marks row at the end of \`solutionRows\` (e.g. \`{ "question": "", "answer": "", "marks": "3", "guidance": "" }\` with ONLY the total integer in \`marks\` and empty strings for the other 3 columns).`
        : autoGenerateSolution
          ? `   - No Mark Scheme image was provided. Generate an official CIE-style Mark Scheme in \`solutionRows\` (or \`mcqSolutionRows\` if no sub-parts / MCQ), strictly following Cambridge International Mark Scheme conventions:
     - **Language**: Use the SAME language as the question (for English CIE questions, write \`answer\` and \`guidance\` in concise English — NEVER Chinese).
     - **\`question\` column**: Put ONLY the question/sub-part label (e.g. \`"(a)"\`, \`"(b)"\`, or question number / \`"本题"\`) on the FIRST row of each part, and \`""\` (empty string) on all subsequent rows of that part. NEVER put step names like \`P(A)\` or \`结论\` in \`question\`.
     - **\`answer\` column**: Show the key mathematical working and final conclusion in \`$...$\` LaTeX (plus brief English phrase like \`so events are independent\` if needed).
     - **\`marks\` column**: Assign realistic CIE mark codes (\`"B1"\`, \`"M1"\`, \`"A1"\`, \`"B1 FT"\`, \`"M1 A1"\`) whose sum matches the question's mark count (e.g. for a \`[3]\` mark question, use rows totaling 3 marks such as \`B1\`, \`M1\`, \`A1\`), and ALWAYS append a final total row \`{ "question": "", "answer": "", "marks": "3", "guidance": "" }\` (ONLY the total integer in \`marks\`, empty strings for \`question\`, \`answer\`, \`guidance\`) as the last row of each part (and for single-part questions). NEVER write \`"AI参考"\`.
     - **\`guidance\` column**: Write concise CIE examiner guidance in English (e.g. \`"Both stated, accept unsimplified."\` / \`"OE"\` / \`"Evaluated and conclusion stated."\` / \`"FT from their P(A) and P(B)"\`).`
          : `   - No Mark Scheme image was provided. Leave \`solutionRows\` and \`mcqSolutionRows\` as empty arrays \`[]\`.`
      }

SUBJECT & UNIT CATALOG:
${catalogText}`;

    const cfg = this.getConfig();
    if (cfg.provider === 'deepseek') {
      return this._recognizeWithOpenAI({
        cfg,
        instruction,
        questionImages,
        markSchemeImages,
        hasMarkScheme
      });
    }

    const requestParts = [{ text: instruction }];

    questionImages.forEach((img, idx) => {
      requestParts.push({ text: `Question Image #${idx + 1}:` });
      requestParts.push({
        inline_data: {
          mime_type: img.mimeType || 'image/jpeg',
          data: img.base64
        }
      });
    });

    if (hasMarkScheme) {
      requestParts.push({ text: '--- MARK SCHEME / ANSWER IMAGES BELOW ---' });
      markSchemeImages.forEach((img, idx) => {
        requestParts.push({ text: `Mark Scheme Image #${idx + 1}:` });
        requestParts.push({
          inline_data: {
            mime_type: img.mimeType || 'image/jpeg',
            data: img.base64
          }
        });
      });
    }

    const generationConfig = {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: this._getResponseSchema()
    };
    const thinkingConfig = this._buildThinkingConfig(cfg.model, 'recognize');
    if (thinkingConfig) generationConfig.thinkingConfig = thinkingConfig;

    const payload = {
      contents: [
        {
          role: 'user',
          parts: requestParts
        }
      ],
      generationConfig
    };

    let res = await this._callGenerateContent(payload);
    let candidate = res?.candidates?.[0];
    if (!candidate) {
      const blockReason = res?.promptFeedback?.blockReason;
      throw new Error(blockReason ? `请求被安全策略拦截: ${blockReason}` : 'Gemini 未返回有效候选结果');
    }

    let rawOutput = (candidate.content?.parts || []).map(p => p.text || '').join('').trim();


    const cleanedJson = rawOutput
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    try {
      return this._normalizeStructuredResult(JSON.parse(cleanedJson));
    } catch (e) {
      console.error('AI JSON Parse Error:', rawOutput);
      throw new Error('解析 AI 返回的结构化数据失败，请重试');
    }
  }

  async _recognizeWithOpenAI({ cfg, instruction, questionImages, markSchemeImages, hasMarkScheme }) {
    const allImgs = [...questionImages, ...(markSchemeImages || [])];
    if (allImgs.some(img => img.isHeicRaw)) {
      throw new Error('DeepSeek / OpenAI 兼容接口不支持未转码的 HEIC 原图，请先将照片转为 JPG 或直接用电脑截图粘贴');
    }

    const jsonSchemaHint = `

OUTPUT FORMAT (return ONLY a valid JSON object matching this exact structure, no extra text):
{
  "subjectId": "string (from catalog)",
  "unitId": "string (from catalog)",
  "paperCode": "string (e.g. W21-53-7 or empty string)",
  "title": "string (concise Chinese summary 6-16 chars)",
  "questionType": "structured" | "multiple_choice",
  "mcqType": "single" | "multiple",
  "stem": "string (ONLY shared intro before sub-parts, or full question if no sub-parts)",
  "stemMarks": "string (total marks e.g. '3' when there are NO sub-parts, else '')",
  "optionsList": [{ "key": "A", "text": "..." }],
  "correctOptions": ["A"],
  "parts": [
    // When sub-parts (a), (b), (i), (ii)... exist, split each into an object here; if the question has NO sub-parts (only one main stem), leave parts as [].
    {
      "label": "(a)",
      "marks": "3",
      "text": "string (Markdown + $...$ LaTeX)",
      "hasFigure": false,
      "solutionRows": [
        { "question": "(a)", "answer": "string", "marks": "B1", "guidance": "string" }
      ]
    }
  ],
  "mcqSolutionRows": [
    { "question": "本题", "answer": "string", "marks": "B1", "guidance": "string" }
  ]
}`;

    const contentParts = [{ type: 'text', text: instruction + jsonSchemaHint }];

    questionImages.forEach((img, idx) => {
      contentParts.push({ type: 'text', text: `Question Image #${idx + 1}:` });
      contentParts.push({
        type: 'image_url',
        image_url: { url: img.dataUrl }
      });
    });

    if (hasMarkScheme) {
      contentParts.push({ type: 'text', text: '--- MARK SCHEME / ANSWER IMAGES BELOW ---' });
      markSchemeImages.forEach((img, idx) => {
        contentParts.push({ type: 'text', text: `Mark Scheme Image #${idx + 1}:` });
        contentParts.push({
          type: 'image_url',
          image_url: { url: img.dataUrl }
        });
      });
    }

    const res = await this._callOpenAIChat({
      model: cfg.model || this.defaults.deepseek.model,
      messages: [
        { role: 'user', content: contentParts }
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' }
    }, 300000);

    const rawOutput = (res?.choices?.[0]?.message?.content || '').trim();
    if (!rawOutput) {
      throw new Error('DeepSeek 返回了空内容，请检查图片清晰度或重试');
    }

    const cleanedJson = rawOutput
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    try {
      return this._normalizeStructuredResult(JSON.parse(cleanedJson));
    } catch (e) {
      console.error('OpenAI/DeepSeek JSON Parse Error:', rawOutput);
      throw new Error('解析 AI 返回的结构化数据失败，请重试');
    }
  }

  _unescapeAiNewlines(str) {
    if (typeof str !== 'string' || !str.includes('\\n')) return str;
    // 将 AI 双重转义的字面量 "\n" 还原为真实换行，同时保护 \neq / \nu / \nabla / \notin / \not / \newline 等 LaTeX 命令
    return str.replace(/\\n(?!(?:eq|e|u|abla|otin|atural|less|gtr|mid|parallel|sim|cong|subset|subseteq|vdash|exists|rightarrow|leftarrow|Rightarrow|Leftarrow|leftrightarrow|Leftrightarrow|ewline|olimits|umber|ot)\b)/g, '\n');
  }

  _normalizeSolutionRows(rows, expectedTotalMarks = null) {
    if (!Array.isArray(rows)) return [];
    const normalized = rows.map(r => ({
      ...r,
      question: this._unescapeAiNewlines(r.question || ''),
      answer: this._unescapeAiNewlines(r.answer || ''),
      marks: this._unescapeAiNewlines(r.marks || ''),
      guidance: this._unescapeAiNewlines(r.guidance || '')
    }));
    if (normalized.length === 0) return normalized;

    const last = normalized[normalized.length - 1];
    const hasTotalRow =
      !String(last.question || '').trim() &&
      !String(last.answer || '').trim() &&
      !String(last.guidance || '').trim() &&
      /^\d+$/.test(String(last.marks || '').trim());

    if (!hasTotalRow) {
      let total = 0;
      const parsedExpected = parseInt(String(expectedTotalMarks || '').trim(), 10);
      if (!isNaN(parsedExpected) && parsedExpected > 0) {
        total = parsedExpected;
      } else {
        normalized.forEach(r => {
          const mText = String(r.marks || '');
          const matches = mText.match(/[BMA]\s*(\d+)/gi);
          if (matches) {
            matches.forEach(token => {
              const num = parseInt(token.replace(/^[BMA]\s*/i, ''), 10);
              if (!isNaN(num)) total += num;
            });
          }
        });
      }
      if (total > 0) {
        normalized.push({
          question: '',
          answer: '',
          marks: String(total),
          guidance: ''
        });
      }
    }
    return normalized;
  }

  /**
   * 兜底规范化：若模型将 (a)/(b)/(i) 写进了 stem 而返回空 parts，则自动按行首小问标记拆分；
   * 若确实只有一道大题干（无任何小问标记），则保留在 stem 中、parts 为空数组。
   */
  _normalizeStructuredResult(result) {
    if (!result || typeof result !== 'object') return result;

    if (result.stem) result.stem = this._unescapeAiNewlines(result.stem);
    if (Array.isArray(result.mcqSolutionRows)) {
      result.mcqSolutionRows = this._normalizeSolutionRows(result.mcqSolutionRows, result.stemMarks);
    }

    if (result.questionType === 'multiple_choice') return result;

    const stripTrailingMarks = (txt, currentMarks) => {
      let cleaned = String(txt || '').trim();
      let marks = currentMarks !== undefined ? String(currentMarks || '').trim() : '';
      const mm = cleaned.match(/(?:\*\s*)?\[(\d+)\]\s*\*?\s*$/);
      if (mm) {
        if (!marks) marks = mm[1];
        cleaned = cleaned.replace(/(?:\*\s*)?\[(\d+)\]\s*\*?\s*$/, '').trim();
      }
      return { text: cleaned, marks };
    };

    if (Array.isArray(result.parts) && result.parts.length > 0) {
      result.parts.forEach(p => {
        const stripped = stripTrailingMarks(this._unescapeAiNewlines(p.text), p.marks);
        p.text = stripped.text;
        p.marks = stripped.marks;
        p.afterText = p.afterText ? this._unescapeAiNewlines(p.afterText).trim() : '';
        if (Array.isArray(p.solutionRows)) {
          p.solutionRows = this._normalizeSolutionRows(p.solutionRows, p.marks);
        }
      });
      return result;
    }

    const rawStem = String(result.stem || '').trim();
    const fallbackRows = Array.isArray(result.mcqSolutionRows) ? result.mcqSolutionRows : [];
    if (!rawStem) {
      result.parts = [];
      return result;
    }

    // 尝试按行首的 (a) / (b) / (i) / (ii) / （1） 等小问标记拆分
    const lines = rawStem.split(/\r?\n/);
    const markerRegex = /^\s*(?:\*{0,2})\s*(\([a-zA-Z]\)|\(\s*[ivxIVX]+\s*\)|\(\d+\)|（\d+）)\s*(?:\*{0,2})\s*(.*)$/;
    let introLines = [];
    const parsedParts = [];
    let current = null;

    for (const line of lines) {
      const m = line.match(markerRegex);
      if (m) {
        if (current) parsedParts.push(current);
        let text = (m[2] || '').trim();
        let marks = '';
        const marksMatch = text.match(/\[(\d+)\]\s*$/);
        if (marksMatch) {
          marks = marksMatch[1];
          text = text.replace(/\[(\d+)\]\s*$/, '').trim();
        }
        current = {
          label: m[1].replace(/\s+/g, ''),
          marks,
          text,
          hasFigure: false,
          solutionRows: []
        };
      } else if (current) {
        current.text = current.text ? `${current.text}\n${line}` : line;
      } else {
        introLines.push(line);
      }
    }
    if (current) parsedParts.push(current);

    if (parsedParts.length > 0) {
      // 检查每小问末尾是否带有 [3] 分值
      parsedParts.forEach(p => {
        p.text = p.text.trim();
        if (!p.marks) {
          const mm = p.text.match(/\[(\d+)\]\s*$/);
          if (mm) {
            p.marks = mm[1];
            p.text = p.text.replace(/\[(\d+)\]\s*$/, '').trim();
          }
        }
      });
      if (parsedParts.length === 1 && fallbackRows.length > 0) {
        parsedParts[0].solutionRows = fallbackRows;
      }
      result.stem = introLines.join('\n').trim();
      result.parts = parsedParts;
    } else {
      // 无小问标记：保持在大题公共题干 stem，parts 置空；始终剥离末尾 [3] 避免与 stemMarks 重复
      const stripped = stripTrailingMarks(rawStem, result.stemMarks);
      result.stem = stripped.text;
      result.stemMarks = stripped.marks;
      result.parts = [];
    }
    return result;
  }

  _parseJsonOutput(rawOutput, errorMsg = '解析 AI 返回的 JSON 失败，请重试') {
    const text = String(rawOutput || '').trim();
    const cleaned = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    try {
      return JSON.parse(cleaned);
    } catch (_) {
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start !== -1 && end > start) {
        try {
          return JSON.parse(cleaned.slice(start, end + 1));
        } catch (__) {}
      }
      console.error('AI JSON Parse Error:', rawOutput);
      throw new Error(errorMsg);
    }
  }

  /**
   * 联网 / AI 查询 CIE 真题题号（未上传 Mark Scheme 时使用）。
   * Gemini 使用 Google Search Grounding 实时联网检索；DeepSeek API 仅用已有文本/图像推理（优先纯文本省 Token）。
   */
  async lookupCiePaperCode({ questionText = '', questionImages = [] }) {
    if (!this.hasApiKey()) {
      throw new Error('请先配置并保存 AI API Key');
    }
    const cleanText = String(questionText || '').trim();
    const hasImgs = Array.isArray(questionImages) && questionImages.length > 0;
    if (!cleanText && !hasImgs) {
      throw new Error('请先识别/输入题干内容，或上传题目图片后再查询 CIE 题号');
    }

    const cfg = this.getConfig();
    const prompt = `Identify the exact Cambridge International (CIE / CAIE A-Level / IGCSE) past paper code and question number for the following exam question.
${cleanText ? `\nQuestion text:\n${cleanText.slice(0, 1500)}\n` : ''}
Convert the official reference (e.g. "9709/53/O/N/21 Question 7" or "9702/22/M/J/23 Q3") into compact format "<Season><YY>-<Paper>-<QNum>" where Oct/Nov="W", May/June="S", Feb/March="M" (e.g. "W21-53-7", "S23-22-3").

Return ONLY a valid JSON object (no markdown fences or extra prose):
{
  "paperCode": "compact code like W21-53-7, or empty string if uncertain",
  "fullRef": "official ref like 9709/53/O/N/21 Q7, or empty string",
  "confidence": "high" | "medium" | "low",
  "notes": "brief Chinese explanation (<= 40 chars)"
}`;

    if (cfg.provider === 'deepseek') {
      // 若已有题干文字，使用纯文本模型 deepseek-chat，不传图片以极度节省 Token
      if (cleanText) {
        const res = await this._callOpenAIChat({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          response_format: { type: 'json_object' }
        }, 60000);
        const raw = (res?.choices?.[0]?.message?.content || '').trim();
        const parsed = this._parseJsonOutput(raw, 'DeepSeek 返回的题号格式解析失败');
        return { ...parsed, usedWebSearch: false, sources: [] };
      }

      const firstImg = questionImages[0];
      if (firstImg.isHeicRaw) {
        throw new Error('DeepSeek 不支持未转码的 HEIC 原图，请先识图填入题干或改用截图');
      }
      const res = await this._callOpenAIChat({
        model: cfg.model || this.defaults.deepseek.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: firstImg.dataUrl } }
            ]
          }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      }, 90000);
      const raw = (res?.choices?.[0]?.message?.content || '').trim();
      const parsed = this._parseJsonOutput(raw, 'DeepSeek 返回的题号格式解析失败');
      return { ...parsed, usedWebSearch: false, sources: [] };
    }

    // Gemini：启用 Google Search Grounding 实时联网搜索
    const parts = [{ text: prompt }];
    if (!cleanText && hasImgs) {
      const firstImg = questionImages[0];
      parts.push({
        inline_data: {
          mime_type: firstImg.mimeType || 'image/jpeg',
          data: firstImg.base64
        }
      });
    }
    const payload = {
      contents: [{ role: 'user', parts }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.1 }
    };
    const res = await this._callGenerateContent(payload, null, 90000);
    const candidate = res?.candidates?.[0];
    const raw = (candidate?.content?.parts || []).map(p => p.text || '').join('').trim();
    const parsed = this._parseJsonOutput(raw, 'Gemini 联网检索返回的题号格式解析失败');
    const chunks = candidate?.groundingMetadata?.groundingChunks || [];
    const sources = chunks
      .map(c => ({ title: c?.web?.title || '', uri: c?.web?.uri || '' }))
      .filter(s => s.uri)
      .slice(0, 3);
    return { ...parsed, usedWebSearch: true, sources };
  }

  /**
   * 仅识别 Mark Scheme 答案图（不发送题目图片、不重识题干，节省 Token）。
   */
  async recognizeMarkSchemeOnly({
    markSchemeImages = [],
    questionType = 'structured',
    parts = [],
    stem = ''
  }) {
    if (!this.hasApiKey()) {
      throw new Error('请先配置并保存 AI API Key');
    }
    if (!markSchemeImages || markSchemeImages.length === 0) {
      throw new Error('请先上传或粘贴至少一张 Mark Scheme / 答案图');
    }

    const partLabels = (Array.isArray(parts) ? parts : [])
      .map(p => p.label)
      .filter(Boolean);
    const hasSubParts = questionType !== 'multiple_choice' && partLabels.length > 0;

    const instruction = `You are an expert Cambridge (CIE) / A-Level Mark Scheme transcriber.
The question text is ALREADY captured in the user's form, so DO NOT transcribe or modify the question.
Analyze ONLY the attached MARK SCHEME image(s) and transcribe the exact marking steps into structured JSON.

Context:
- Question Type: ${questionType === 'multiple_choice' ? 'multiple_choice' : 'structured'}
${hasSubParts ? `- Existing Sub-part Labels to match: ${partLabels.join(', ')}` : '- Single question without sub-parts (put rows in mcqSolutionRows).'}
${stem ? `- Short Stem Hint (first 200 chars): ${String(stem).slice(0, 200)}` : ''}

RULES:
1. Wrap ALL math expressions/formulas in single dollar signs \`$...$\` (or \`$$...$$\` for display math).
2. Transcribe EVERY step row faithfully:
   - \`question\`: put sub-part label on the first row of each part (e.g. "(a)"), and "" on subsequent rows of the same part (or "本题" on first row if no sub-parts).
   - \`answer\`: exact LaTeX steps / final answer.
   - \`marks\`: exact mark code like "B1", "M1", "A1", "B1 FT", "SC B1".
   - \`guidance\`: exact examiner guidance notes (or "").
   - ALWAYS include a final total-marks row at the end of each part's \`solutionRows\` (and \`mcqSolutionRows\`) with ONLY the integer total in \`marks\` and empty strings for the other 3 columns: \`{ "question": "", "answer": "", "marks": "3", "guidance": "" }\`.
3. ${hasSubParts
      ? `Output \`parts\`: an array matching the existing sub-part labels (${partLabels.join(', ')}), each with \`label\` and \`solutionRows\`. Leave \`mcqSolutionRows\` empty.`
      : `Output all rows in \`mcqSolutionRows\`. Leave \`parts\` empty.${questionType === 'multiple_choice' ? ' Also set \`correctOptions\` (e.g. ["B"]) if the answer key letter is shown.' : ''}`
    }

Return ONLY valid JSON matching:
{
  "correctOptions": ["A"],
  "parts": [
    {
      "label": "(a)",
      "solutionRows": [
        { "question": "(a)", "answer": "string", "marks": "B1", "guidance": "string" }
      ]
    }
  ],
  "mcqSolutionRows": [
    { "question": "本题", "answer": "string", "marks": "B1", "guidance": "string" }
  ]
}`;

    const cfg = this.getConfig();
    if (cfg.provider === 'deepseek') {
      if (markSchemeImages.some(img => img.isHeicRaw)) {
        throw new Error('DeepSeek / OpenAI 兼容接口不支持未转码的 HEIC 原图，请先转为 JPG 或直接截图粘贴');
      }
      const contentParts = [{ type: 'text', text: instruction }];
      markSchemeImages.forEach((img, idx) => {
        contentParts.push({ type: 'text', text: `Mark Scheme Image #${idx + 1}:` });
        contentParts.push({ type: 'image_url', image_url: { url: img.dataUrl } });
      });
      const res = await this._callOpenAIChat({
        model: cfg.model || this.defaults.deepseek.model,
        messages: [{ role: 'user', content: contentParts }],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      }, 300000);
      const raw = (res?.choices?.[0]?.message?.content || '').trim();
      const parsed = this._parseJsonOutput(raw, '解析 Mark Scheme 结构化数据失败，请重试');
      return this._normalizeMarkSchemeResult(parsed);
    }

    const requestParts = [{ text: instruction }];
    markSchemeImages.forEach((img, idx) => {
      requestParts.push({ text: `Mark Scheme Image #${idx + 1}:` });
      requestParts.push({
        inline_data: {
          mime_type: img.mimeType || 'image/jpeg',
          data: img.base64
        }
      });
    });
    const generationConfig = {
      temperature: 0.1,
      responseMimeType: 'application/json'
    };
    const thinkingConfig = this._buildThinkingConfig(cfg.model, 'recognize');
    if (thinkingConfig) generationConfig.thinkingConfig = thinkingConfig;

    const res = await this._callGenerateContent({
      contents: [{ role: 'user', parts: requestParts }],
      generationConfig
    }, null, 300000);
    const raw = (res?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
    const parsed = this._parseJsonOutput(raw, '解析 Mark Scheme 结构化数据失败，请重试');
    return this._normalizeMarkSchemeResult(parsed);
  }

  _normalizeMarkSchemeResult(msResult) {
    if (!msResult || typeof msResult !== 'object') return msResult;
    if (Array.isArray(msResult.mcqSolutionRows)) {
      msResult.mcqSolutionRows = this._normalizeSolutionRows(msResult.mcqSolutionRows);
    }
    if (Array.isArray(msResult.parts)) {
      msResult.parts.forEach(p => {
        if (Array.isArray(p.solutionRows)) {
          p.solutionRows = this._normalizeSolutionRows(p.solutionRows);
        }
      });
    }
    return msResult;
  }
}

window.geminiAI = new GeminiAIHelper();
