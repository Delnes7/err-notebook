const renderer = window.markdownRenderer;
const attack = renderer.render('![`x`](data:image/png;base64,YWJj)');
if (!attack.includes('data:image/png;base64,YWJj')) throw Error('base64 image missing');
if (/alt="[^"]*<code/.test(attack)) throw Error('HTML inside image attribute');
if (!renderer.render('a<br>b').includes('a<br>b')) throw Error('line breaks missing');
if (renderer.render('<img src=x onerror=alert(1)>').includes('<img src=x')) throw Error('raw HTML injection');
if (renderer.render('[link](javascript:alert(1))').includes('href=')) throw Error('unsafe URL');
print('markdown security PASS');
