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

  // Apply a visible highlight ring to annotatable elements.
  // We always style both [data-dc] AND .card so templates generated before
  // the data-dc requirement was enforced still get visual feedback.
  function applyAnnotationStyle(on) {
    getStyle().textContent = on
      ? '[data-dc],.card{cursor:pointer!important;transition:box-shadow .15s;}' +
        '[data-dc]:hover,.card:hover{' +
          'box-shadow:0 0 0 2px #6366f1,0 0 0 5px rgba(99,102,241,.18)!important;' +
          'outline:none!important;}' +
        '[data-dc]:hover *,.card:hover *{pointer-events:none;}'
      : '';
  }

  // Attach mouseenter/mouseleave/click listeners to each annotatable element.
  // Falls back to .card if no [data-dc] elements are present (old templates).
  function attachListeners() {
    var hasDc = !!document.querySelector('[data-dc]');
    var elements = hasDc
      ? document.querySelectorAll('[data-dc]')
      : document.querySelectorAll('.card');

    elements.forEach(function(el) {
      if (el._dcReady) return;
      el._dcReady = true;

      // Derive id/label: prefer data-dc attributes, fall back to heuristics
      var dcId = el.getAttribute('data-dc')
        || el.id
        || ('card-' + Math.floor(Math.random() * 99999));
      var titleEl = el.querySelector('.card-title,.metric-label,.card-header');
      var dcLabel = el.getAttribute('data-dc-label')
        || (titleEl ? titleEl.textContent.trim() : null)
        || dcId;

      el.addEventListener('mouseenter', function() {
        if (!active) return;
        var r = el.getBoundingClientRect();
        window.parent.postMessage({
          type: 'dc:hover',
          componentId: dcId,
          componentLabel: dcLabel,
          bounds: { top: r.top, left: r.left, width: r.width, height: r.height }
        }, '*');
      });

      el.addEventListener('mouseleave', function() {
        if (active) window.parent.postMessage({ type: 'dc:hover-end' }, '*');
      });

      el.addEventListener('click', function(e) {
        if (!active) return;
        e.stopPropagation();
        var r = el.getBoundingClientRect();
        window.parent.postMessage({
          type: 'dc:click',
          componentId: dcId,
          componentLabel: dcLabel,
          bounds: { top: r.top, left: r.left, width: r.width, height: r.height }
        }, '*');
      });
    });
  }

  // Listen for annotation mode toggle from the React parent
  window.addEventListener('message', function(e) {
    if (!e.data) return;
    if (e.data.type === 'dc:setAnnotationMode') {
      active = !!e.data.active;
      applyAnnotationStyle(active);
      if (active) attachListeners(); // re-scan for any async/lazy content
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
