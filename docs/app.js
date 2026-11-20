"use strict";

(function () {
  var SAVED_KEY = "dental-digest-saved";
  var state = { index: [], day: null, spec: "all", query: "", view: "day", saved: {} };

  function $(id) { return document.getElementById(id); }

  // نبني العناصر عبر DOM وtextContent فقط (لا innerHTML) لحماية الصفحة من أي نص قادم من المصادر
  function el(tag, props, children) {
    var node = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === "class") node.className = props[k];
      else if (k === "text") node.textContent = props[k];
      else node.setAttribute(k, props[k]);
    });
    (children || []).forEach(function (c) {
      if (c) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function loadSaved() {
    try { state.saved = JSON.parse(localStorage.getItem(SAVED_KEY) || "{}") || {}; }
    catch (e) { state.saved = {}; }
  }
  function persistSaved() {
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(state.saved)); } catch (e) { /* التخزين غير متاح */ }
  }

  function fetchJSON(path) {
    return fetch(path, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error(path + " " + r.status);
      return r.json();
    });
  }

  function fmtDate(iso) {
    try {
      return new Date(iso + "T12:00:00").toLocaleDateString("ar-u-nu-latn", {
        weekday: "long", year: "numeric", month: "long", day: "numeric"
      });
    } catch (e) { return iso; }
  }

  function currentItems() {
    var items = state.view === "saved"
      ? Object.keys(state.saved).map(function (k) { return state.saved[k]; })
      : (state.day ? state.day.items : []);
    var q = state.query.trim().toLowerCase();
    return items.filter(function (it) {
      if (state.spec !== "all" && !(it.specs || []).some(function (s) { return s.id === state.spec; })) return false;
      if (!q) return true;
      var hay = [it.title, it.title_ar, it.journal, it.summary_ar, it.takeaway_ar, it.conclusion].join(" ").toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }

  function renderChips() {
    var box = $("chips");
    box.textContent = "";
    var base = state.view === "saved"
      ? Object.keys(state.saved).map(function (k) { return state.saved[k]; })
      : (state.day ? state.day.items : []);
    var counts = {}, labels = {};
    base.forEach(function (it) {
      (it.specs || []).forEach(function (s) { counts[s.id] = (counts[s.id] || 0) + 1; labels[s.id] = s.label; });
    });
    var ids = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    if (state.spec !== "all" && !counts[state.spec]) state.spec = "all";

    function chip(id, text) {
      var b = el("button", { class: "chip" + (state.spec === id ? " is-active" : ""), type: "button", text: text });
      b.addEventListener("click", function () { state.spec = id; render(); });
      return b;
    }
    box.appendChild(chip("all", "الكل (" + base.length + ")"));
    ids.forEach(function (id) { box.appendChild(chip(id, labels[id] + " (" + counts[id] + ")")); });
  }

  function citation(it) {
    var parts = [it.authors, it.title + ".", it.journal + ".", it.pub_date + "."];
    if (/^\d+$/.test(it.pmid)) parts.push("PMID: " + it.pmid + ".");
    if (it.doi) parts.push("doi:" + it.doi);
    return parts.filter(Boolean).join(" ");
  }

  function copyText(text, btn) {
    var done = function () {
      var old = btn.textContent;
      btn.textContent = "تم النسخ ✓";
      setTimeout(function () { btn.textContent = old; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {});
    }
  }

  function block(title, text, cls) {
    return el("div", { class: "block" }, [el("h4", { text: title }), el("p", { class: cls || "", text: text })]);
  }

  function card(it) {
    var isSaved = !!state.saved[it.pmid];
    var badges = [];
    if (it.study_type) badges.push(el("span", { class: "badge type", text: it.study_type }));
    (it.specs || []).forEach(function (s) { badges.push(el("span", { class: "badge", text: s.label })); });

    var star = el("button", {
      class: "star" + (isSaved ? " is-on" : ""), type: "button",
      "aria-label": isSaved ? "إزالة من المحفوظات" : "حفظ", "aria-pressed": String(isSaved),
      text: isSaved ? "★" : "☆"
    });
    star.addEventListener("click", function () {
      if (state.saved[it.pmid]) delete state.saved[it.pmid]; else state.saved[it.pmid] = it;
      persistSaved();
      render();
    });

    var meta = [it.journal, it.pub_date, it.authors].filter(Boolean).join(" · ");
    var node = el("article", { class: "card" }, [
      el("div", { class: "card-head" }, [el("div", { class: "badges" }, badges), star]),
      it.title_ar ? el("h3", { class: "title-ar", text: it.title_ar }) : el("h3", { class: "title", lang: "en", text: it.title }),
      it.title_ar ? el("p", { class: "orig", lang: "en", text: it.title }) : null,
      el("p", { class: "meta", text: meta })
    ]);

    if (it.summary_ar) {
      node.appendChild(block("الملخص", it.summary_ar));
      if (it.takeaway_ar) {
        var tk = block("الخلاصة السريرية", it.takeaway_ar);
        tk.className += " takeaway";
        node.appendChild(tk);
      }
      node.appendChild(el("p", { class: "fine", text: "ملخص آلي مبني على الملخص الأصلي فقط — راجع المقال قبل الاعتماد عليه." }));
    } else if (it.conclusion) {
      node.appendChild(block("Conclusion (من ملخص المقال الأصلي)", it.conclusion, "en"));
    } else if (!it.has_abstract) {
      node.appendChild(el("p", { class: "fine", text: "لا يتوفر ملخص لهذا المقال في PubMed." }));
    }

    var actions = el("div", { class: "actions" });
    if (it.url) actions.appendChild(el("a", { class: "btn", href: it.url, target: "_blank", rel: "noopener noreferrer", text: "PubMed" }));
    if (it.doi) actions.appendChild(el("a", { class: "btn", href: "https://doi.org/" + encodeURI(it.doi), target: "_blank", rel: "noopener noreferrer", text: "DOI" }));
    var copy = el("button", { class: "btn", type: "button", text: "نسخ المرجع" });
    copy.addEventListener("click", function () { copyText(citation(it), copy); });
    actions.appendChild(copy);
    node.appendChild(actions);
    return node;
  }

  function renderNotice() {
    var n = $("notice");
    var msg = "";
    if (state.view === "day" && state.day) {
      if (state.day.demo) msg = "هذه بيانات تجريبية لعرض التصميم فقط وليست أبحاثاً حقيقية، وستُستبدل تلقائياً عند أول تحديث يومي.";
      else if (!state.day.ai_summaries) msg = "تُعرض هنا خلاصة المقال الأصلي بالإنجليزية. اضغط «ترجمة للعربية» تحت أي بحث لترجمته.";
    }
    n.hidden = !msg;
    n.textContent = msg;
  }

  function render() {
    var savedKeys = Object.keys(state.saved).length;
    $("savedCount").textContent = savedKeys ? "(" + savedKeys + ")" : "";
    $("dateRow").hidden = state.view === "saved";
    $("tabDay").className = "tab" + (state.view === "day" ? " is-active" : "");
    $("tabSaved").className = "tab" + (state.view === "saved" ? " is-active" : "");
    $("tabDay").setAttribute("aria-selected", String(state.view === "day"));
    $("tabSaved").setAttribute("aria-selected", String(state.view === "saved"));

    renderNotice();
    renderChips();

    var items = currentItems();
    var list = $("list");
    list.textContent = "";
    items.forEach(function (it) { list.appendChild(card(it)); });

    var status = $("status");
    if (state.view === "saved") {
      status.textContent = items.length ? items.length + " بحث محفوظ على هذا الجهاز" : "لا توجد أبحاث محفوظة بعد. اضغط ☆ على أي بحث لحفظه.";
    } else if (state.day) {
      status.textContent = items.length ? items.length + " بحث — " + fmtDate(state.day.date) : "لا نتائج مطابقة.";
    }

    var pos = state.index.findIndex(function (d) { return state.day && d.date === state.day.date; });
    $("olderBtn").disabled = pos < 0 || pos >= state.index.length - 1;
    $("newerBtn").disabled = pos <= 0;
  }

  function loadDay(date) {
    return fetchJSON("data/" + date + ".json").then(function (day) {
      state.day = day;
      $("dateSelect").value = date;
      render();
    }).catch(function () {
      $("status").textContent = "تعذّر تحميل بيانات هذا اليوم.";
    });
  }

  function step(delta) {
    var pos = state.index.findIndex(function (d) { return state.day && d.date === state.day.date; });
    var next = state.index[pos + delta];
    if (next) loadDay(next.date);
  }

  function init() {
    loadSaved();

    $("search").addEventListener("input", function (e) { state.query = e.target.value; render(); });
    $("tabDay").addEventListener("click", function () { state.view = "day"; state.spec = "all"; render(); });
    $("tabSaved").addEventListener("click", function () { state.view = "saved"; state.spec = "all"; render(); });
    $("dateSelect").addEventListener("change", function (e) { loadDay(e.target.value); });
    $("olderBtn").addEventListener("click", function () { step(1); });
    $("newerBtn").addEventListener("click", function () { step(-1); });

    fetchJSON("data/index.json").then(function (idx) {
      state.index = idx.dates || [];
      if (!state.index.length) {
        $("status").textContent = "لا توجد بيانات بعد. شغّل التحديث اليومي مرة واحدة من تبويب Actions.";
        render();
        return;
      }
      var sel = $("dateSelect");
      state.index.forEach(function (d) {
        sel.appendChild(el("option", { value: d.date, text: fmtDate(d.date) + " — " + d.count + " بحث" }));
      });
      return loadDay(state.index[0].date);
    }).catch(function () {
      $("status").textContent = "تعذّر تحميل البيانات. إن فتحت الملف مباشرة من الجهاز فاستخدم خادماً محلياً أو انشره على GitHub Pages.";
    });
  }

  init();
})();
