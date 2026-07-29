import json
import re


async def test_document_preview_proposal_print_spacing(page):
    """Focused Playwright flow for DocumentPreview.js proposal/contract print spacing."""
    await page.set_viewport_size({"width": 1920, "height": 1080})
    await page.goto("https://foodops-insights.preview.emergentagent.com/login")
    await page.get_by_test_id("login-email-input").fill("demo.agency@kora.com")
    await page.get_by_test_id("login-password-input").fill("Evoque2024!")
    await page.get_by_test_id("login-submit-btn").click()
    await page.wait_for_url(re.compile(r".*/dashboard"), timeout=30000)
    await page.goto("https://foodops-insights.preview.emergentagent.com/events/event_qa_print_spacing_20260729")
    await page.wait_for_selector('[data-testid="proposal-editor"]', timeout=30000)
    await page.evaluate(INSTALL_PRINT_INTERCEPTOR_JS)
    await page.get_by_test_id("tab-generate").click()
    await page.get_by_test_id("generate-proposal-btn").scroll_into_view_if_needed()
    await page.get_by_test_id("generate-proposal-btn").click()
    await page.wait_for_selector(".doc-root .info-grid", timeout=15000)
    preview_metrics = await page.evaluate("window.__collectDocMetrics(document)")
    await page.get_by_role("button", name=re.compile("Imprimir|Print")).first().click()
    await page.wait_for_function("window.__lastPrintInfo && window.__lastPrintInfo.called", timeout=10000)
    print_metrics = await page.evaluate("window.__lastPrintInfo")
    print(json.dumps({"preview": preview_metrics, "print": print_metrics}, indent=2))


INSTALL_PRINT_INTERCEPTOR_JS = r"""
(() => {
  window.__collectDocMetrics = (doc) => {
    const win = doc.defaultView || window;
    const root = doc.querySelector('.doc-root');
    const info = root?.querySelector('.info-grid');
    const header = root?.querySelector('.header');
    const summary = root?.querySelector('.catering-summary');
    const items = root?.querySelector('.items-section');
    const firstDate = root?.querySelector('.date-group');
    const firstSection = root?.querySelector('.category-section');
    const secondSection = root?.querySelectorAll('.category-section')?.[1];
    const rect = (el) => el ? el.getBoundingClientRect() : null;
    const gap = (a, b) => {
      const ar = rect(a), br = rect(b);
      if (!ar || !br) return null;
      return Math.round((br.top - ar.bottom) * 100) / 100;
    };
    const infoStyle = info ? win.getComputedStyle(info) : null;
    const bodyStyle = win.getComputedStyle(doc.body);
    const htmlStyle = win.getComputedStyle(doc.documentElement);
    const rootStyle = root ? win.getComputedStyle(root) : null;
    const tracks = infoStyle?.gridTemplateColumns || '';
    return {
      hasDocRoot: !!root,
      hasCateringSummary: !!summary,
      categorySectionCount: root?.querySelectorAll('.category-section').length || 0,
      infoGridClass: info?.className || null,
      infoGridDisplay: infoStyle?.display || null,
      infoGridTemplateColumns: tracks,
      infoGridTrackCount: tracks && tracks !== 'none' ? tracks.trim().split(/\s+/).length : 0,
      infoGridWidth: info ? Math.round(info.getBoundingClientRect().width) : null,
      bodyWidthStyle: bodyStyle.width,
      htmlMinWidthStyle: htmlStyle.minWidth,
      rootWidth: root ? Math.round(root.getBoundingClientRect().width) : null,
      rootPaddingTop: rootStyle?.paddingTop || null,
      gapHeaderToSummaryOrItems: gap(header, summary || items),
      gapSummaryToItems: summary ? gap(summary, items) : null,
      gapFirstDateToFirstSection: gap(firstDate, firstSection),
      gapFirstToSecondSection: gap(firstSection, secondSection),
      metaViewport: doc.querySelector('meta[name="viewport"]')?.getAttribute('content') || null,
      linkCount: doc.querySelectorAll('link[rel="stylesheet"]').length,
      styleCount: doc.querySelectorAll('style').length,
      stylesheetCount: doc.styleSheets.length,
      stylesheetLinksReady: Array.from(doc.querySelectorAll('link[rel="stylesheet"]')).every((l) => {
        try { return !!l.sheet; } catch (e) { return true; }
      }),
    };
  };
  const patchIframe = (iframe) => {
    const patchOnce = () => {
      try {
        const win = iframe.contentWindow;
        const doc = iframe.contentDocument || win?.document;
        if (!win || !doc) return;
        win.print = function() {
          const iframeRect = iframe.getBoundingClientRect();
          window.__lastPrintInfo = {
            called: true,
            iframeStyleWidth: iframe.style.width,
            iframeStyleHeight: iframe.style.height,
            iframeRectWidth: Math.round(iframeRect.width),
            iframeRectHeight: Math.round(iframeRect.height),
            iframeOpacity: iframe.style.opacity,
            frameInnerWidth: win.innerWidth,
            frameInnerHeight: win.innerHeight,
            htmlLength: doc.documentElement?.outerHTML?.length || 0,
            ...window.__collectDocMetrics(doc),
          };
        };
      } catch (e) {
        window.__printPatchError = String(e);
      }
    };
    patchOnce();
    [0, 20, 50, 100, 200, 400, 800, 1200].forEach((ms) => setTimeout(patchOnce, ms));
  };
  window.__lastPrintInfo = null;
  Array.from(document.querySelectorAll('iframe[aria-hidden="true"]')).forEach(patchIframe);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node?.tagName === 'IFRAME' && node.getAttribute('aria-hidden') === 'true') {
          patchIframe(node);
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.__printObserverInstalled = true;
})();
"""