/** 克隆 DOM 元素并将格式化内容转换为 Markdown，不修改原始页面。 */
export function elementToMarkdown(element: Element): string {
  const clone = element.cloneNode(true) as Element;

  // 移除干扰元素：按钮、图标、复制按钮等
  const ignoreSelectors =
    'button, svg, .copy-button, .regenerate-button, [data-testid="copy-button"]';
  clone.querySelectorAll(ignoreSelectors).forEach((el) => el.remove());

  const md = htmlToMarkdown(clone).trim();
  // 压缩多余空行（超过 2 个连续换行压缩为 2 个）
  return md.replace(/\n{3,}/g, '\n\n');
}

// ─────────────────────────────────────────
// HTML → Markdown 转换器
// ─────────────────────────────────────────

/**
 * 递归将 DOM 节点转换为 Markdown 文本。
 * 覆盖 AI 回复中常见的格式：标题、加粗、斜体、行内代码、代码块、
 * 有序/无序列表、链接、图片、引用块、表格、水平线等。
 */
function htmlToMarkdown(node: Node): string {
  // 文本节点
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? '';
  }

  // 非元素节点
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  // ── 代码块 <pre> ──────────────────────────────────────────
  if (tag === 'pre') {
    const codeEl = el.querySelector('code');
    const codeText = codeEl ? (codeEl.textContent ?? '') : (el.textContent ?? '');
    // 尝试从 class 获取语言标识，例如 class="language-python"
    const langClass = (codeEl ?? el).className
      .split(/\s+/)
      .find((c) => c.startsWith('language-') || c.startsWith('lang-'));
    const lang = langClass ? langClass.replace(/^(language-|lang-)/, '') : '';
    return `\n\`\`\`${lang}\n${codeText.replace(/\n$/, '')}\n\`\`\`\n`;
  }

  // ── 行内代码 <code>（不在 <pre> 内） ──────────────────────
  if (tag === 'code') {
    const text = el.textContent ?? '';
    // 如果内容包含反引号，用双反引号包裹
    if (text.includes('`')) return `\`\` ${text} \`\``;
    return `\`${text}\``;
  }

  // 递归处理子节点
  const childrenMd = processChildren(el);

  switch (tag) {
    // ── 标题 ────────────────────────────────────────────────
    case 'h1':
      return `\n# ${childrenMd.trim()}\n`;
    case 'h2':
      return `\n## ${childrenMd.trim()}\n`;
    case 'h3':
      return `\n### ${childrenMd.trim()}\n`;
    case 'h4':
      return `\n#### ${childrenMd.trim()}\n`;
    case 'h5':
      return `\n##### ${childrenMd.trim()}\n`;
    case 'h6':
      return `\n###### ${childrenMd.trim()}\n`;

    // ── 段落 ────────────────────────────────────────────────
    case 'p':
      return `\n${childrenMd.trim()}\n`;

    // ── 换行 ────────────────────────────────────────────────
    case 'br':
      return '\n';

    // ── 加粗 / 斜体 / 删除线 ───────────────────────────────
    case 'strong':
    case 'b':
      return `**${childrenMd}**`;
    case 'em':
    case 'i':
      return `*${childrenMd}*`;
    case 'del':
    case 's':
      return `~~${childrenMd}~~`;

    // ── 链接 ────────────────────────────────────────────────
    case 'a': {
      const href = el.getAttribute('href') ?? '';
      return `[${childrenMd}](${href})`;
    }

    // ── 图片 ────────────────────────────────────────────────
    case 'img': {
      const src = el.getAttribute('src') ?? '';
      const alt = el.getAttribute('alt') ?? '';
      return `![${alt}](${src})`;
    }

    // ── 引用块 ──────────────────────────────────────────────
    case 'blockquote': {
      const lines = childrenMd.trim().split('\n');
      return '\n' + lines.map((l) => `> ${l}`).join('\n') + '\n';
    }

    // ── 水平线 ──────────────────────────────────────────────
    case 'hr':
      return '\n---\n';

    // ── 无序列表 ────────────────────────────────────────────
    case 'ul': {
      const items = Array.from(el.children)
        .filter((c) => c.tagName.toLowerCase() === 'li')
        .map((li) => formatListItem(li as HTMLElement, '-'));
      return '\n' + items.join('\n') + '\n';
    }

    // ── 有序列表 ────────────────────────────────────────────
    case 'ol': {
      const start = parseInt(el.getAttribute('start') ?? '1', 10);
      const items = Array.from(el.children)
        .filter((c) => c.tagName.toLowerCase() === 'li')
        .map((li, i) => formatListItem(li as HTMLElement, `${start + i}.`));
      return '\n' + items.join('\n') + '\n';
    }

    // ── 列表项（独立出现，不在 ul/ol 内时回退） ─────────────
    case 'li':
      return `- ${childrenMd.trim()}\n`;

    // ── 表格 ────────────────────────────────────────────────
    case 'table':
      return '\n' + tableToMarkdown(el) + '\n';

    // ── 忽略的容器标签，直接返回子内容 ──────────────────────
    case 'div':
    case 'section':
    case 'article':
    case 'main':
    case 'span':
    case 'mark':
    case 'sup':
    case 'sub':
    case 'thead':
    case 'tbody':
    case 'tfoot':
    case 'tr':
    case 'td':
    case 'th':
    case 'details':
    case 'summary':
    case 'figure':
    case 'figcaption':
      return childrenMd;

    default:
      return childrenMd;
  }
}

/** 递归处理所有子节点 */
function processChildren(el: Element): string {
  let result = '';
  for (const child of Array.from(el.childNodes)) {
    result += htmlToMarkdown(child);
  }
  return result;
}

/** 格式化列表项（处理嵌套列表） */
function formatListItem(li: HTMLElement, bullet: string): string {
  const parts: string[] = [];
  const nestedLists: string[] = [];

  for (const child of Array.from(li.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const childTag = (child as HTMLElement).tagName.toLowerCase();
      if (childTag === 'ul' || childTag === 'ol') {
        // 嵌套列表：缩进处理
        const nested = htmlToMarkdown(child).trim();
        nestedLists.push(
          nested
            .split('\n')
            .map((l) => `  ${l}`)
            .join('\n')
        );
        continue;
      }
    }
    parts.push(htmlToMarkdown(child));
  }

  const mainContent = parts.join('').trim();
  const result = `${bullet} ${mainContent}`;
  if (nestedLists.length > 0) {
    return result + '\n' + nestedLists.join('\n');
  }
  return result;
}

/** 将 <table> 转为 Markdown 表格 */
function tableToMarkdown(table: HTMLElement): string {
  const rows = Array.from(table.querySelectorAll('tr'));
  if (rows.length === 0) return '';

  const matrix: string[][] = [];
  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll('th, td'));
    matrix.push(
      cells.map((cell) => processChildren(cell).trim().replace(/\|/g, '\\|').replace(/\n/g, ' '))
    );
  }

  if (matrix.length === 0) return '';

  const colCount = Math.max(...matrix.map((r) => r.length));
  // 确保每行列数一致
  for (const row of matrix) {
    while (row.length < colCount) row.push('');
  }

  const lines: string[] = [];
  // 第一行为表头
  lines.push('| ' + matrix[0].join(' | ') + ' |');
  // 分隔线
  lines.push('| ' + matrix[0].map(() => '---').join(' | ') + ' |');
  // 数据行
  for (let i = 1; i < matrix.length; i++) {
    lines.push('| ' + matrix[i].join(' | ') + ' |');
  }

  return lines.join('\n');
}
