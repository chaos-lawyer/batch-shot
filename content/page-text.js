function extractPageText(payload = {}) {
  const limit = payload.limit || 100000;
  let text = document.body?.innerText || '';
  if (text.length > limit) {
    text = text.slice(0, limit);
  }
  const title = document.title || '';
  const lang = document.documentElement.lang || '';
  const metaDescription = document.querySelector('meta[name="description"]')?.content || '';
  const canonicalUrl = document.querySelector('link[rel="canonical"]')?.href || '';

  return {
    url: window.location.href,
    title,
    capturedAt: new Date().toISOString(),
    text,
    textLength: text.length,
    metaDescription,
    lang,
    canonicalUrl
  };
}
