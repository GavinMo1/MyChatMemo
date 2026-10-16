import { afterEach, describe, expect, it } from 'vitest';
import { ChatGPTAdapter } from '@/content/adapters/chatgpt';

// 通过原有 protected 扩展入口采样；抽离前后都运行同一组行为断言。
class FormattingAdapter extends ChatGPTAdapter {
  convert(element: Element): string {
    return this.sanitizeContent(element);
  }
}
const adapter = new FormattingAdapter();

function convert(html: string): string {
  const element = document.createElement('div');
  element.innerHTML = html;
  return adapter.convert(element);
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('adapter DOM to Markdown behavior', () => {
  it('preserves code text, language hints and the existing closing-fence format', () => {
    expect(
      convert(
        '<pre><code class="highlight language-python">if a &lt; b:\n  print("ok")\n</code></pre>'
      )
    ).toBe('```python\nif a < b:\n  print("ok")\n```');
    expect(convert('<pre class="lang-js">const a = 1;</pre>')).toBe('```js\nconst a = 1;\n```');
    expect(convert('<pre><code>plain</code></pre>')).toBe('```\nplain\n```');
  });

  it('keeps inline code delimiters, including double backticks around literal backticks', () => {
    expect(convert('<p>执行 <code>npm test</code>，再看 <code>a`b</code>。</p>')).toBe(
      '执行 `npm test`，再看 `` a`b ``。'
    );
  });

  it('keeps nested unordered and ordered lists, numbering offsets and two-space indentation', () => {
    expect(
      convert(
        '<ul><li>外层<strong>粗体</strong><ol start="3"><li>内层甲</li><li>内层乙<ul><li>最深</li></ul></li></ol></li><li>下一项</li></ul>'
      )
    ).toBe('- 外层**粗体**\n  3. 内层甲\n  4. 内层乙\n    - 最深\n- 下一项');
    expect(convert('<li>独立项目</li>')).toBe('- 独立项目');
  });

  it('keeps table escaping, inline formatting, newline flattening and ragged row padding', () => {
    expect(
      convert(
        '<table><thead><tr><th>列A</th><th>列B</th></tr></thead><tbody><tr><td>含|竖线<br>下一行</td></tr><tr><td>最后</td><td><strong>粗</strong></td></tr></tbody></table>'
      )
    ).toBe('| 列A | 列B |\n| --- | --- |\n| 含\\|竖线 下一行 |  |\n| 最后 | **粗** |');
    expect(convert('<table></table>')).toBe('');
  });

  it.each([1, 2, 3, 4, 5, 6])('preserves heading level %i and inline emphasis', (level) => {
    expect(convert(`<h${level}><em>标题</em></h${level}>`)).toBe(`${'#'.repeat(level)} *标题*`);
  });

  it('preserves links, images, horizontal rules and strike-through markup', () => {
    expect(
      convert(
        '<p><a href="https://example.com/doc">链接</a> <img src="/image.png" alt="示意图"> <del>旧</del><s>弃</s></p><hr>'
      )
    ).toBe('[链接](https://example.com/doc) ![示意图](/image.png) ~~旧~~~~弃~~\n\n---');
  });

  it('keeps blockquote line prefixes and compresses excess blank lines after conversion', () => {
    expect(convert('<blockquote>第一行<br>第二行</blockquote>')).toBe('> 第一行\n> 第二行');
    expect(convert('<p> A </p><br><br><br><p>B</p>')).toBe('A\n\nB');
    expect(
      convert(
        '<section><!-- ignored --><span>正文</span><custom-element>后续</custom-element></section>'
      )
    ).toBe('正文后续');
  });

  it('removes controls only from a clone and leaves the original DOM and listeners intact', () => {
    const element = document.createElement('article');
    element.innerHTML =
      '<p>保留<strong>格式</strong><button>复制</button><svg><title>图标</title></svg><span class="copy-button">复制控件</span><span class="regenerate-button">重新生成</span><span data-testid="copy-button">快捷复制</span></p>';
    document.body.appendChild(element);
    const originalHTML = element.innerHTML;
    const originalButton = element.querySelector('button')!;
    let clicks = 0;
    originalButton.addEventListener('click', () => {
      clicks += 1;
    });
    expect(adapter.convert(element)).toBe('保留**格式**');
    expect(element.innerHTML).toBe(originalHTML);
    expect(element.querySelector('button')).toBe(originalButton);
    expect(originalButton.isConnected).toBe(true);
    originalButton.click();
    expect(clicks).toBe(1);
  });

  it('keeps sanitizeContent override and super delegation available to platform adapters', () => {
    class CustomAdapter extends ChatGPTAdapter {
      protected sanitizeContent(element: Element): string {
        return `平台前缀:${super.sanitizeContent(element)}`;
      }
    }
    document.body.innerHTML =
      '<main><div data-message-author-role="assistant"><div class="markdown prose"><strong>回答</strong></div></div></main>';
    expect(new CustomAdapter().extractMessages()[0].content).toBe('平台前缀:**回答**');
  });
});
