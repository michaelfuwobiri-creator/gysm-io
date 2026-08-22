// Wraps a project's generated HTML for use in small, non-interactive
// thumbnail previews (dashboard build list, dashboard template strip,
// /templates grid cards, BuildGuild grid) -- injects a scoped style that
// hides scrollbars and disables interaction inside the iframe's own
// document. Without this, a generated app whose content is taller than
// its thumbnail box renders its own native scrollbar chrome inside the
// little preview, which looks broken (confirmed on the dashboard's
// template strip). Full-size previews (the template preview modal, a
// build's real preview pane, the published page itself) pass the
// untouched html and are unaffected -- this only ever touches the copy
// handed to a thumbnail iframe, never the saved project row.
export function toThumbnailHtml(html: string): string {
  const style =
    "<style>html,body{overflow:hidden!important;scrollbar-width:none!important}" +
    "::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}" +
    "*{pointer-events:none!important}</style>";
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${style}</head>`);
  }
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => `${m}${style}`);
  }
  // No <head> tag at all (generated HTML isn't guaranteed to have one) --
  // prepend so the style still applies before first paint.
  return style + html;
}
