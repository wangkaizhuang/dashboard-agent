/**
 * Inline JS injected by the preview API into every template HTML.
 * Runs inside the sandboxed iframe (sandbox="allow-scripts").
 * Uses window.parent.postMessage to notify the React parent about
 * hover/click events on annotated components (data-dc attribute).
 */
export const DC_TRACKER_SCRIPT = `
<script id="dc-tracker">
(function(){
  function notify(type, el) {
    var r = el.getBoundingClientRect()
    window.parent.postMessage({
      type: type,
      componentId: el.dataset.dc,
      componentLabel: el.dataset.dcLabel || el.dataset.dc,
      bounds: { top: r.top, left: r.left, width: r.width, height: r.height }
    }, '*')
  }
  document.querySelectorAll('[data-dc]').forEach(function(el) {
    el.addEventListener('mouseenter', function() { notify('dc:hover', el) })
    el.addEventListener('mouseleave', function() {
      window.parent.postMessage({ type: 'dc:hover-end' }, '*')
    })
    el.addEventListener('click', function(e) {
      e.stopPropagation()
      notify('dc:click', el)
    })
  })
})()
<\/script>
`

/** Remove <!-- dc:id:start --> and <!-- dc:id:end --> boundary comments from HTML.
 *  These are stored in the DB for surgical replacement but must not be visible to users. */
export function stripDcMarkers(html: string): string {
  return html.replace(/<!-- dc:[^:]+:(start|end) -->\n?/g, '')
}

/** Inject the tracking script just before </body>. Falls back to appending if no </body> tag. */
export function injectDcTracker(html: string): string {
  if (html.includes('</body>')) {
    return html.replace('</body>', DC_TRACKER_SCRIPT + '</body>')
  }
  return html + DC_TRACKER_SCRIPT
}
