(async () => {
  const REPORT_KEY = "__MYCHATMEMO_DOUBAO_DOM_REPORT_V2__";
  const ENABLE_SCROLL_SAMPLING = false;
  // 可选：填入你刚发送的一条独特提问的文本片段（如 "测试标记ABC123"），
  // 脚本会反查包含该文本的元素及其祖先路径，直接定位新版用户消息的结构。
  const SENTINEL_TEXT = "一句话概括";

  function normalizeText(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function preview(text, limit = 180) {
    const value = normalizeText(text);
    return value.length > limit ? `${value.slice(0, limit)}...` : value;
  }

  function safeQueryAll(selector, root = document) {
    try {
      return Array.from(root.querySelectorAll(selector));
    } catch {
      return [];
    }
  }

  function stableClasses(element) {
    return Array.from(element.classList || [])
      .filter((token) => /^[a-z0-9_-]+$/i.test(token))
      .slice(0, 5);
  }

  function selectorHint(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return "";

    const tag = element.tagName.toLowerCase();
    if (element.id) return `${tag}#${element.id}`;

    const attrs = [
      "data-testid",
      "data-message-id",
      "data-conversation-id",
      "data-foundation-type",
      "data-role",
      "role",
      "aria-label",
    ];

    for (const attr of attrs) {
      const value = element.getAttribute(attr);
      if (value) return `${tag}[${attr}="${value}"]`;
    }

    const classes = stableClasses(element).slice(0, 2);
    return classes.length ? `${tag}.${classes.join(".")}` : tag;
  }

  function pathToRoot(element, maxDepth = 10) {
    const path = [];
    let current = element;
    let depth = 0;

    while (current && depth < maxDepth) {
      path.push(selectorHint(current));
      current = current.parentElement;
      depth += 1;
    }

    return path;
  }

  function attrsOf(element) {
    if (!element || !element.attributes) return {};

    const result = {};
    Array.from(element.attributes).forEach((attr) => {
      if (
        attr.name.startsWith("data-") ||
        attr.name === "class" ||
        attr.name === "role" ||
        attr.name === "aria-label"
      ) {
        result[attr.name] = attr.value;
      }
    });
    return result;
  }

  function textOf(element) {
    if (!element) return "";

    const clone = element.cloneNode(true);
    safeQueryAll(
      [
        "button",
        "svg",
        "img",
        "input",
        "textarea",
        "[role='button']",
        "[contenteditable='true']",
        "[data-testid*='copy']",
        "[data-testid*='toolbar']",
        "[class*='toolbar']",
        "[class*='action']",
      ].join(","),
      clone,
    ).forEach((node) => node.remove());

    return normalizeText(clone.innerText || clone.textContent || "");
  }

  function findScrollHost() {
    const anchor =
      document.querySelector("[data-message-id]") ||
      document.querySelector('[data-testid="union_message"]') ||
      document.querySelector("main") ||
      document.body;

    const candidates = new Set([
      document.scrollingElement,
      document.documentElement,
      document.body,
      document.querySelector("main"),
      document.querySelector('[role="main"]'),
    ]);

    let current = anchor;
    let depth = 0;
    while (current && depth < 12) {
      candidates.add(current);
      current = current.parentElement;
      depth += 1;
    }

    return Array.from(candidates)
      .filter((element) => element instanceof HTMLElement)
      .map((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const clientHeight = element.clientHeight || Math.round(rect.height) || 0;
        const scrollHeight = element.scrollHeight || 0;
        const scrollable = Math.max(0, scrollHeight - clientHeight);
        let score = 0;

        if (scrollable > 100) score += 5;
        if (style.overflowY === "auto" || style.overflowY === "scroll") score += 3;
        if (anchor && element.contains(anchor)) score += 3;
        if (element.querySelectorAll?.("[data-message-id], [data-testid='union_message']").length >= 2) {
          score += 2;
        }
        if (clientHeight < 80) score -= 4;

        return {
          element,
          hint: selectorHint(element),
          path: pathToRoot(element),
          scrollHeight,
          clientHeight,
          scrollTop: element.scrollTop,
          scrollable,
          overflowY: style.overflowY,
          score,
        };
      })
      .sort((a, b) => b.score - a.score)[0] || null;
  }

  function getCurrentContainerNodes() {
    return [
      ...safeQueryAll("[data-message-id]"),
      ...safeQueryAll('[data-testid="union_message"]'),
    ].filter((element, index, all) => all.indexOf(element) === index);
  }

  // 属性普查：统计全文档 data-* / role 属性出现频次，
  // 当旧容器选择器整体失效时，用来发现新版 DOM 的属性命名。
  function attributeCensus() {
    const nameCounts = new Map();
    const valueCounts = new Map();
    const trackedValues = ["data-testid", "data-foundation-type", "role"];

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node = walker.currentNode;
    while (node) {
      if (node.attributes) {
        Array.from(node.attributes).forEach((attr) => {
          const isData = attr.name.startsWith("data-");
          if (!isData && attr.name !== "role") return;

          nameCounts.set(attr.name, (nameCounts.get(attr.name) || 0) + 1);

          if (trackedValues.includes(attr.name) && attr.value.length <= 60) {
            const key = `${attr.name}="${attr.value}"`;
            valueCounts.set(key, (valueCounts.get(key) || 0) + 1);
          }
        });
      }
      node = walker.nextNode();
    }

    const sortEntries = (map) =>
      Array.from(map.entries()).sort((a, b) => b[1] - a[1]);

    return {
      attributeNames: sortEntries(nameCounts)
        .slice(0, 40)
        .map(([name, count]) => ({ name, count })),
      trackedValues: sortEntries(valueCounts)
        .slice(0, 60)
        .map(([value, count]) => ({ value, count })),
    };
  }

  // 哨兵文本反查：找到包含指定文本的最深层元素，输出其祖先路径与属性。
  function findSentinel(sentinel) {
    if (!sentinel) return [];

    const matches = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node = walker.currentNode;
    while (node) {
      if (
        node instanceof HTMLElement &&
        (node.textContent || "").includes(sentinel)
      ) {
        // 只保留最深匹配（子元素不再包含哨兵文本的元素）
        const hasDeeperMatch = Array.from(node.children).some((child) =>
          (child.textContent || "").includes(sentinel),
        );
        if (!hasDeeperMatch) {
          matches.push(node);
        }
      }
      node = walker.nextNode();
    }

    return matches.slice(0, 10).map((element, index) => ({
      index,
      hint: selectorHint(element),
      attrs: attrsOf(element),
      path: pathToRoot(element, 12),
      layout: layoutHint(element),
      textLength: textOf(element).length,
      preview: preview(textOf(element)),
    }));
  }

  function collectTextCandidates(root = document) {
    const selectors = [
      ".whitespace-pre-wrap",
      ".flow-markdown-body",
      "[data-slate-node='element']",
      "[data-testid*='message']",
      "[data-testid*='content']",
      "[class*='markdown']",
      "[class*='Markdown']",
      "[class*='prose']",
      "[class*='message']",
      "[class*='Message']",
      "[class*='content']",
      "[class*='Content']",
      "[class*='answer']",
      "[class*='reply']",
      "article",
      "p",
      "li",
      "pre",
      "code",
    ];

    const seen = new Set();
    const candidates = [];

    selectors.forEach((selector) => {
      safeQueryAll(selector, root).forEach((element) => {
        if (seen.has(element)) return;
        seen.add(element);

        const text = textOf(element);
        if (text.length < 2) return;

        candidates.push({
          element,
          selector,
          hint: selectorHint(element),
          path: pathToRoot(element, 8),
          attrs: attrsOf(element),
          textLength: text.length,
          preview: preview(text),
        });
      });
    });

    return candidates.sort((a, b) => b.textLength - a.textLength);
  }

  function foundationHints(container) {
    const candidates = new Set([
      container,
      container.parentElement,
      container.parentElement?.parentElement,
      container.closest("[data-foundation-type]"),
    ]);

    safeQueryAll("[data-foundation-type]", container.parentElement || container)
      .forEach((element) => candidates.add(element));

    return Array.from(candidates)
      .filter(Boolean)
      .map((element) => ({
        hint: selectorHint(element),
        value: element.getAttribute("data-foundation-type") || "",
        attrs: attrsOf(element),
        textPreview: preview(textOf(element), 80),
      }))
      .filter((item) => item.value || item.textPreview);
  }

  function classifyByCurrentAdapter(container) {
    const parentFoundation = container.parentElement
      ?.querySelector("[data-foundation-type]")
      ?.getAttribute("data-foundation-type") || "";

    const userTexts = safeQueryAll(".whitespace-pre-wrap", container).map(textOf).filter(Boolean);
    const assistantTexts = safeQueryAll(".flow-markdown-body", container)
      .filter((element) => !element.closest("[data-thinking-box-expanded]"))
      .map(textOf)
      .filter(Boolean);
    const thinkingTexts = safeQueryAll(
      "[data-thinking-box-expanded] .flow-markdown-body, [data-testid='think_block_collapse'] [data-testid='message_text_content']",
      container,
    ).map(textOf).filter(Boolean);

    return {
      foundationType: parentFoundation,
      roleGuess:
        parentFoundation.includes("send-message") ? "user" :
        parentFoundation.includes("receive-message") ? "assistant" :
        userTexts.length && !assistantTexts.length ? "user" :
        assistantTexts.length ? "assistant" :
        "unknown",
      currentUserTextLength: userTexts.join("\n\n").length,
      currentAssistantTextLength: assistantTexts.join("\n\n").length,
      currentThinkingTextLength: thinkingTexts.join("\n\n").length,
      currentUserPreview: preview(userTexts.join("\n\n")),
      currentAssistantPreview: preview(assistantTexts.join("\n\n")),
      currentThinkingPreview: preview(thinkingTexts.join("\n\n")),
    };
  }

  function layoutHint(element) {
    const rect = element.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    const viewportCenter = window.innerWidth / 2;

    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      sideGuess: center > viewportCenter ? "right" : "left",
      visible: rect.bottom > 0 && rect.top < window.innerHeight,
    };
  }

  function summarizeContainer(container, index) {
    const directText = textOf(container);
    const textCandidates = collectTextCandidates(container).slice(0, 20);
    const current = classifyByCurrentAdapter(container);

    return {
      index,
      hint: selectorHint(container),
      attrs: attrsOf(container),
      path: pathToRoot(container),
      layout: layoutHint(container),
      textLength: directText.length,
      textPreview: preview(directText),
      currentAdapterSignals: current,
      foundationHints: foundationHints(container),
      descendantTextCandidates: textCandidates.map((item) => ({
        selector: item.selector,
        hint: item.hint,
        attrs: item.attrs,
        path: item.path,
        textLength: item.textLength,
        preview: item.preview,
      })),
    };
  }

  function ancestorSignature(element) {
    return pathToRoot(element, 5).join(" > ");
  }

  function deriveAncestorCandidates(textCandidates) {
    const map = new Map();

    textCandidates.slice(0, 300).forEach((candidate) => {
      let current = candidate.element.parentElement;
      let depth = 0;
      while (current && depth < 8 && current !== document.body) {
        const signature = ancestorSignature(current);
        const text = textOf(current);

        if (text.length >= candidate.textLength && text.length >= 10) {
          const existing = map.get(signature) || {
            hint: selectorHint(current),
            path: pathToRoot(current),
            attrs: attrsOf(current),
            count: 0,
            maxTextLength: 0,
            samplePreviews: [],
          };

          existing.count += 1;
          existing.maxTextLength = Math.max(existing.maxTextLength, text.length);
          if (existing.samplePreviews.length < 3) {
            existing.samplePreviews.push(preview(text));
          }
          map.set(signature, existing);
        }

        current = current.parentElement;
        depth += 1;
      }
    });

    return Array.from(map.values())
      .filter((item) => item.count >= 2)
      .sort((a, b) => b.count - a.count || b.maxTextLength - a.maxTextLength)
      .slice(0, 30);
  }

  async function maybeSampleScroll() {
    if (!ENABLE_SCROLL_SAMPLING) return [];

    const scrollHost = findScrollHost();
    if (!scrollHost || scrollHost.scrollable <= 0) return [];

    const original = scrollHost.element.scrollTop;
    const stops = [0, Math.round(scrollHost.scrollable / 2), scrollHost.scrollable];
    const samples = [];

    for (const stop of stops) {
      scrollHost.element.scrollTop = stop;
      await new Promise((resolve) => setTimeout(resolve, 350));
      samples.push({
        scrollTop: stop,
        containerCount: getCurrentContainerNodes().length,
        textCandidateCount: collectTextCandidates().length,
      });
    }

    scrollHost.element.scrollTop = original;
    return samples;
  }

  const containers = getCurrentContainerNodes();
  const textCandidates = collectTextCandidates();
  const scrollHost = findScrollHost();
  const scrollSamples = await maybeSampleScroll();
  const containerSummaries = containers.map(summarizeContainer);
  const sentinelMatches = findSentinel(SENTINEL_TEXT);
  const census = attributeCensus();

  const assistantFailures = containerSummaries.filter((item) => {
    const signals = item.currentAdapterSignals;
    return (
      signals.roleGuess !== "user" &&
      signals.currentAssistantTextLength === 0 &&
      item.textLength > 0
    );
  });

  const report = {
    generatedAt: new Date().toISOString(),
    page: {
      title: document.title,
      url: location.href,
    },
    summary: {
      messageContainerCount: containers.length,
      containerCountBySelector: {
        "[data-message-id]": safeQueryAll("[data-message-id]").length,
        "[data-testid='union_message']": safeQueryAll('[data-testid="union_message"]').length,
      },
      textCandidateCount: textCandidates.length,
      sentinelConfigured: Boolean(SENTINEL_TEXT),
      sentinelMatchCount: sentinelMatches.length,
      currentUserTextContainerCount: containerSummaries.filter(
        (item) => item.currentAdapterSignals.currentUserTextLength > 0,
      ).length,
      currentAssistantTextContainerCount: containerSummaries.filter(
        (item) => item.currentAdapterSignals.currentAssistantTextLength > 0,
      ).length,
      probableAssistantExtractionFailureCount: assistantFailures.length,
    },
    currentAdapterSelectors: {
      messageContainer: "[data-message-id], [data-testid='union_message']",
      userContent: ".whitespace-pre-wrap",
      assistantContent: ".flow-markdown-body",
      thinkingContent:
        "[data-thinking-box-expanded] .flow-markdown-body, [data-testid='think_block_collapse'] [data-testid='message_text_content']",
      roleHint: "parent [data-foundation-type]",
    },
    scrollAnalysis: scrollHost ? {
      hint: scrollHost.hint,
      path: scrollHost.path,
      scrollHeight: scrollHost.scrollHeight,
      clientHeight: scrollHost.clientHeight,
      scrollTop: scrollHost.scrollTop,
      scrollable: scrollHost.scrollable,
      overflowY: scrollHost.overflowY,
      sampled: ENABLE_SCROLL_SAMPLING,
      samples: scrollSamples,
    } : null,
    selectorDiscovery: {
      topTextCandidates: textCandidates.slice(0, 80).map((item) => ({
        selector: item.selector,
        hint: item.hint,
        attrs: item.attrs,
        path: item.path,
        textLength: item.textLength,
        preview: item.preview,
      })),
      repeatedAncestorCandidates: deriveAncestorCandidates(textCandidates),
    },
    samples: {
      currentUserLike: containerSummaries
        .filter((item) => item.currentAdapterSignals.currentUserTextLength > 0)
        .slice(0, 5),
      currentAssistantLike: containerSummaries
        .filter((item) => item.currentAdapterSignals.currentAssistantTextLength > 0)
        .slice(0, 5),
      assistantExtractionFailures: assistantFailures.slice(0, 8),
    },
    sentinelMatches,
    attributeCensus: census,
    containers: containerSummaries,
  };

  window[REPORT_KEY] = report;

  console.group("MyChatMemo Doubao DOM report v2");
  console.log("Report key:", `window.${REPORT_KEY}`);
  console.log("Summary:", report.summary);
  console.log("Scroll analysis:", report.scrollAnalysis);
  if (SENTINEL_TEXT) {
    console.log("Sentinel matches:", sentinelMatches);
  }
  console.log("Attribute census (top):", census.attributeNames.slice(0, 15));
  console.table(
    report.containers.slice(0, 20).map((item) => ({
      index: item.index,
      hint: item.hint,
      side: item.layout.sideGuess,
      textLength: item.textLength,
      roleGuess: item.currentAdapterSignals.roleGuess,
      userLen: item.currentAdapterSignals.currentUserTextLength,
      assistantLen: item.currentAdapterSignals.currentAssistantTextLength,
      preview: item.textPreview,
    })),
  );
  console.groupEnd();

  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "doubao-dom-report-v2.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
})();
