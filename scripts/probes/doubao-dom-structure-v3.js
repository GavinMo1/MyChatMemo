(() => {
  // Doubao DOM 结构转储 v3：只输出消息容器的骨架树（标签 + 属性 + 类名），
  // 不抓正文文本，用于确认用户/助手消息的正文包裹层选择器。

  const MAX_DEPTH = 8;
  const MAX_CHILDREN = 12;

  // 语义类优先：过滤掉 CSS Modules 哈希类（如 container-qX9Csx），
  // 保留 Tailwind / 设计系统 / 语义类（flex、md-box-root、rounded-s-radius-s）
  function isHashedClass(token) {
    return /^[a-z][a-z0-9]*-[A-Za-z0-9_-]{5,}$/.test(token) && !/^(s-|md-|v_|semi-)/.test(token);
  }

  function describe(element, depth) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE || depth > MAX_DEPTH) return null;

    const dataAttrs = {};
    Array.from(element.attributes).forEach((attr) => {
      if (attr.name.startsWith("data-")) dataAttrs[attr.name] = attr.value;
    });

    const allClasses = Array.from(element.classList || []);
    const semanticClasses = allClasses.filter((token) => !isHashedClass(token));

    const node = {
      tag: element.tagName.toLowerCase(),
      classes: semanticClasses.slice(0, 8),
      hashedClasses: allClasses.filter(isHashedClass).slice(0, 3),
      data: Object.keys(dataAttrs).length ? dataAttrs : undefined,
      textLen: (element.childNodes.length === 1 && element.firstChild.nodeType === Node.TEXT_NODE)
        ? (element.textContent || "").trim().length
        : undefined,
    };

    const children = Array.from(element.children)
      .map((child) => describe(child, depth + 1))
      .filter(Boolean);

    if (children.length > 0) {
      node.children = children.slice(0, MAX_CHILDREN);
      if (children.length > MAX_CHILDREN) {
        node.truncatedChildren = children.length - MAX_CHILDREN;
      }
    }
    return node;
  }

  function compact(node, indent = "") {
    const classes = (node.classes || []).join(" ");
    const hashed = (node.hashedClasses || []).length ? ` ~${node.hashedClasses.join(",")}` : "";
    const data = node.data
      ? " " + Object.entries(node.data).map(([k, v]) => `[${k}="${v}"]`).join(" ")
      : "";
    const textLen = node.textLen !== undefined ? ` text=${node.textLen}` : "";
    const truncated = node.truncatedChildren ? ` (+${node.truncatedChildren} more)` : "";
    const lines = [`${indent}<${node.tag}> ${classes}${hashed}${data}${textLen}${truncated}`];
    (node.children || []).forEach((child) => lines.push(compact(child, indent + "  ")));
    return lines.join("\n");
  }

  const containers = Array.from(document.querySelectorAll("[data-message-id]"));
  const trees = containers.map((container) => {
    const foundationType = container.parentElement
      ?.querySelector("[data-foundation-type]")
      ?.getAttribute("data-foundation-type") || "";
    return {
      messageId: container.getAttribute("data-message-id"),
      foundationType,
      tree: describe(container),
    };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    url: location.href,
    containerCount: containers.length,
    trees,
  };

  window.__MYCHATMEMO_DOUBAO_STRUCTURE_V3__ = report;

  console.group("MyChatMemo Doubao structure v3");
  trees.forEach((item, i) => {
    console.log(`--- #${i} [${item.foundationType}] id=${item.messageId} ---`);
    console.log(compact(item.tree));
  });
  console.groupEnd();

  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "doubao-dom-structure-v3.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
})();
