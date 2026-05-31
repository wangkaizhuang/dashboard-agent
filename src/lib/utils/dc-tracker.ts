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

/**
 * Retroactively repair F3 linkage in templates generated before the dcSwitch
 * prompt fix. Those templates' dcSwitch resolves a controlled component via
 * `getElementById(ctrlId)`, but the component only carries `data-dc="<id>"`
 * (no matching `id`), so the lookup fails and every filter click silently
 * no-ops. We alias `id = data-dc` for any [data-dc] element lacking an id,
 * which makes the existing getElementById fallback resolve.
 *
 * Harmless for new (post-fix) templates that query by [data-dc] directly.
 */
const DC_LINKAGE_FIX_SCRIPT = `
<script id="dc-linkage-fix">
(function(){
  function aliasIds(){
    document.querySelectorAll('[data-dc]').forEach(function(el){
      if(el.id) return;
      var v = el.getAttribute('data-dc');
      if(v && !document.getElementById(v)) el.id = v;
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',aliasIds);
  else aliasIds();
})()
<\/script>
`

/** Inject the linkage-repair shim just before </body>. */
export function injectLinkageFix(html: string): string {
  if (html.includes('</body>')) {
    return html.replace('</body>', DC_LINKAGE_FIX_SCRIPT + '</body>')
  }
  return html + DC_LINKAGE_FIX_SCRIPT
}

/**
 * Safety net for low-quality templates where a chart container div is rendered
 * with zero height (the LLM forgot an explicit height), leaving a blank card.
 * After charts initialize, any ECharts instance registered in DC_CHARTS whose
 * mount node is visible but collapsed (<40px) gets a min-height + resize.
 *
 * Scoped to DC_CHARTS-registered nodes only, so it never touches legitimately
 * hidden elements (e.g. inactive tab panels have offsetParent === null).
 */
const DC_CHART_HEIGHT_FIX_SCRIPT = `
<script id="dc-chart-height-fix">
(function(){
  function fix(){
    try{
      var reg = window.DC_CHARTS || {};
      Object.keys(reg).forEach(function(k){
        var inst = reg[k];
        var dom = inst && inst.getDom && inst.getDom();
        if(!dom) return;
        if(dom.offsetParent !== null && dom.clientHeight < 40){
          dom.style.minHeight = '240px';
          if(inst.resize) try{ inst.resize(); }catch(e){}
        }
      });
    }catch(e){}
  }
  if(document.readyState==='complete') fix(); else window.addEventListener('load', fix);
  setTimeout(fix, 800);
  setTimeout(fix, 2200);
})()
<\/script>
`

/** Inject the collapsed-chart safety net just before </body>. */
export function injectChartHeightFix(html: string): string {
  if (html.includes('</body>')) {
    return html.replace('</body>', DC_CHART_HEIGHT_FIX_SCRIPT + '</body>')
  }
  return html + DC_CHART_HEIGHT_FIX_SCRIPT
}

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

/**
 * Ensure DC_CHARTS and chart-config globals are available before any inline
 * component <script> executes.
 *
 * Old templates declare `const DC_CHARTS = {}` at the page bottom (too late —
 * inline component scripts try to register to DC_CHARTS before it exists).
 * New templates (after prompt fix) put it in <head>.
 *
 * This function:
 *  1. Injects `window.DC_CHARTS = window.DC_CHARTS || {}` (and related globals)
 *     into <head> so they're available from the very first inline script.
 *  2. Replaces the bottom-of-page `const DC_CHARTS = {}` with a no-op comment
 *     so `const` doesn't conflict with the already-set window property.
 */
export function patchTemplateGlobals(html: string): string {
  const GLOBAL_PATCH = `<script>
/* ── Pre-declare chart globals so inline component scripts can access them ── */
if(typeof DC_CHARTS==='undefined')window.DC_CHARTS={}
if(typeof CHART_COLORS==='undefined')window.CHART_COLORS=['#4F46E5','#10B981','#F59E0B','#EF4444','#3B82F6','#8B5CF6','#EC4899','#14B8A6']
if(typeof AXIS_STYLE==='undefined')window.AXIS_STYLE={axisLine:{lineStyle:{color:'#E2E8F0'}},axisTick:{show:false},axisLabel:{color:'#64748B',fontSize:11},splitLine:{lineStyle:{color:'#F1F5F9'}}}
if(typeof TOOLTIP_STYLE==='undefined')window.TOOLTIP_STYLE={backgroundColor:'#1E293B',borderColor:'#334155',textStyle:{color:'#F1F5F9',fontSize:12},borderRadius:8,padding:[8,12]}
<\/script>`

  // 1. Inject globals into <head>
  let patched = html.includes('</head>')
    ? html.replace('</head>', GLOBAL_PATCH + '\n</head>')
    : GLOBAL_PATCH + html

  // 2. Remove the late `const DC_CHARTS = {}` declaration so it doesn't conflict.
  //    dcSwitch and other bottom-script functions will use window.DC_CHARTS instead.
  patched = patched.replace(/const\s+DC_CHARTS\s*=\s*\{\}/g, '/* DC_CHARTS pre-declared in head */')

  return patched
}
