// Content Script 位于隔离世界，不能靠覆写 History API 截获网站主世界导航。
// 使用只读 URL 检查，并在可见性/历史事件发生时立即复核。
let lastUrl: string | null = null;
let routeRevision = 0;

export function getRouteRevision(): number {
  const url = window.location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    routeRevision += 1;
  }
  return routeRevision;
}

export function interceptHistory(callback: () => void): () => void {
  let previousRevision = getRouteRevision();
  const check = () => {
    const revision = getRouteRevision();
    if (revision === previousRevision) return;
    previousRevision = revision;
    callback();
  };
  const timer = setInterval(check, 500);
  window.addEventListener('popstate', check);
  window.addEventListener('hashchange', check);
  document.addEventListener('visibilitychange', check);

  return () => {
    clearInterval(timer);
    window.removeEventListener('popstate', check);
    window.removeEventListener('hashchange', check);
    document.removeEventListener('visibilitychange', check);
  };
}
