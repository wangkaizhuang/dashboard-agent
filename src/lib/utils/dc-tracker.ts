/**
 * Inline JS injected by the preview API into every template HTML.
 * Runs inside the sandboxed iframe (sandbox="allow-scripts").
 * Uses window.parent.postMessage to notify the React parent about
 * hover/click events on annotated components (data-dc attribute).
 *
 * The tracker is INACTIVE until the parent sends dc:setAnnotationMode {active:true}.
 * This lets the parent toggle annotation mode without reloading the iframe.
 */
export const DC_TRACKER_SCRIPT = `
<script id="dc-tracker">
(function(){
  var active = false;

  function getStyle() {
    var s = document.getElementById('_dc_style');
    if (!s) {
      s = document.createElement('style');
      s.id = '_dc_style';
      document.head.appendChild(s);
    }
    return s;
  }

  function applyAnnotationStyle(on) {
    getStyle().textContent = on
      ? '[data-dc]{cursor:pointer!important;transition:box-shadow .12s,outline .12s;}' +
        '[data-dc]:hover{box-shadow:0 0 0 2px rgba(99,102,241,.45)!important;}'
      : '';
  }

  function notify(type, el) {
    var r = el.getBoundingClientRect();
    window.parent.postMessage({
      type: type,
      componentId: el.dataset.dc,
      componentLabel: el.dataset.dcLabel || el.dataset.dc,
      bounds: { top: r.top, left: r.left, width: r.width, height: r.height }
    }, '*');
  }

  function attachListeners() {
    document.querySelectorAll('[data-dc]').forEach(function(el) {
      if (el._dcReady) return;
      el._dcReady = true;
      el.addEventListener('mouseenter', function() {
        if (active) notify('dc:hover', el);
      });
      el.addEventListener('mouseleave', function() {
        if (active) window.parent.postMessage({ type: 'dc:hover-end' }, '*');
      });
      el.addEventListener('click', function(e) {
        if (active) {
          e.stopPropagation();
          notify('dc:click', el);
        }
      });
    });
  }

  // Listen for annotation mode toggle and re-scan requests from the parent
  window.addEventListener('message', function(e) {
    if (!e.data) return;
    if (e.data.type === 'dc:setAnnotationMode') {
      active = !!e.data.active;
      applyAnnotationStyle(active);
      if (active) attachListeners(); // re-scan in case of lazy/async content
    }
  });

  // Initial scan — run now AND after delays for async chart renders
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachListeners);
  } else {
    attachListeners();
  }
  setTimeout(attachListeners, 600);
  setTimeout(attachListeners, 2500);
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
