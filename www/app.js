/* ShiftVault — application shell, views and interactions */
(function () {
  "use strict";

  var t = SV.i18n.t;
  var store = SV.store;
  var money = SV.money;
  var VERSION = "1.2.0";

  var TABS = ["overview", "track", "ledger", "goals", "options"];
  var TAB_ICONS = { overview: "overview", track: "clock", ledger: "list", goals: "target", options: "sliders" };

  function svg(paths) {
    return (
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + "</svg>"
    );
  }

  var ICONS = {
    overview: svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
    clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
    list: svg('<path d="M8 7h12M8 12h12M8 17h12"/><path d="M4 7h.01M4 12h.01M4 17h.01"/>'),
    target: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".9" fill="currentColor" stroke="none"/>'),
    sliders: svg('<path d="M4 7h9M19 7h1M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>'),
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/>'),
    moon: svg('<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    trash: svg('<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l.9 13h9.2l.9-13"/>'),
    download: svg('<path d="M12 4v10M8 10.5l4 4 4-4M5 20h14"/>'),
    pencil: svg('<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M14.5 5.5l4 4"/>'),
    close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>')
  };

  var ui = {
    accountForm: false,
    goalForm: false,
    entryType: "expense",
    tutorialStep: 0
  };

  var modalResolve = null;

  /* ------------------------------------------------------------------ utils */

  function esc(value) {
    return String(value === null || value === undefined ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function num(value) {
    var n = parseFloat(String(value === null || value === undefined ? "" : value).replace(",", "."));
    return isFinite(n) ? n : 0;
  }

  function pad(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function settings() {
    return store.get().settings;
  }

  function tab() {
    var hash = String(location.hash || "").replace(/^#\/?/, "");
    return TABS.indexOf(hash) !== -1 ? hash : "overview";
  }

  function navigate(id) {
    if (TABS.indexOf(id) === -1) return;
    if (tab() === id) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    location.hash = id;
  }

  function displayValue(eur) {
    var code = money.currency();
    return money.toDisplay(eur, code).toFixed(money.decimals(code));
  }

  function monthStats() {
    var now = new Date();
    var prefix = now.getFullYear() + "-" + pad(now.getMonth() + 1);
    var hours = 0;
    var earned = 0;
    store.get().transactions.forEach(function (tx) {
      if (tx.source === "shift" && tx.type === "income" && tx.date && tx.date.slice(0, 7) === prefix) {
        hours += tx.hours || 0;
        earned += tx.amount;
      }
    });
    return { hours: hours, earned: earned };
  }

  function nativeAndroid() {
    var cap = window.Capacitor;
    if (!cap || typeof cap.isNativePlatform !== "function") return null;
    try {
      if (!cap.isNativePlatform()) return null;
      if (typeof cap.getPlatform === "function" && cap.getPlatform() !== "android") return null;
      return cap;
    } catch (err) {
      return null;
    }
  }

  function capPlugin(name) {
    var cap = nativeAndroid();
    if (!cap) return null;
    try {
      if (cap.Plugins && cap.Plugins[name]) return cap.Plugins[name];
      if (typeof cap.registerPlugin === "function") return cap.registerPlugin(name);
    } catch (err) {
      /* the plugin is not part of this runtime */
    }
    return null;
  }

  function haptic(style) {
    var haptics = capPlugin("Haptics");
    if (!haptics || typeof haptics.impact !== "function") return;
    try {
      var result = haptics.impact({ style: style || "LIGHT" });
      if (result && typeof result.catch === "function") result.catch(function () {});
    } catch (err) {
      /* haptics are best effort and Android-only */
    }
  }

  var nativeBarsTheme = null;

  function syncSystemBars(theme) {
    var mode = theme === "light" ? "light" : "dark";
    if (!nativeAndroid() || nativeBarsTheme === mode) return;
    var dark = mode === "dark";
    var statusBar = capPlugin("StatusBar");
    var bars = capPlugin("SystemBars");
    if (!statusBar && !bars) return;
    nativeBarsTheme = mode;
    if (statusBar) {
      try {
        var style = statusBar.setStyle({ style: dark ? "DARK" : "LIGHT" });
        if (style && typeof style.catch === "function") style.catch(function () {});
        var color = statusBar.setBackgroundColor({ color: dark ? "#000000" : "#F4F4F6" });
        if (color && typeof color.catch === "function") color.catch(function () {});
      } catch (err) {
        /* status bar is Android-only */
      }
    }
    if (bars) {
      try {
        var result = bars.setTheme({ theme: mode });
        if (result && typeof result.catch === "function") result.catch(function () {});
      } catch (err) {
        /* navigation bar is Android-only */
      }
    }
  }

  function applyNativeIcon(variant) {
    var iconSwitch = capPlugin("IconSwitch");
    if (!iconSwitch || typeof iconSwitch.setIcon !== "function") return;
    try {
      var result = iconSwitch.setIcon({ variant: variant === "light" ? "light" : "dark" });
      if (result && typeof result.catch === "function") result.catch(function () {});
    } catch (err) {
      /* native icon plugin is only available in the Android build */
    }
  }

  function onNativeBack() {
    var root = document.getElementById("modal-root");
    if (root && root.innerHTML.trim()) {
      closeModal(false);
      return;
    }
    if (tab() !== "track") {
      navigate("track");
      return;
    }
    var appPlugin = capPlugin("App");
    if (appPlugin && typeof appPlugin.exitApp === "function") {
      try {
        var result = appPlugin.exitApp();
        if (result && typeof result.catch === "function") result.catch(function () {});
      } catch (err) {
        /* exit is Android-only */
      }
    }
  }

  function setupNativeShell() {
    var appPlugin = capPlugin("App");
    if (!appPlugin || typeof appPlugin.addListener !== "function") return;
    try {
      var listener = appPlugin.addListener("backButton", onNativeBack);
      if (listener && typeof listener.catch === "function") listener.catch(function () {});
    } catch (err) {
      /* not running inside the Android shell */
    }
  }

  function accountById(id) {
    return store.get().accounts.find(function (account) {
      return account.id === id;
    });
  }

  function entryCount(accountId) {
    return store.get().transactions.filter(function (tx) {
      return tx.accountId === accountId;
    }).length;
  }

  function sortedTransactions() {
    return store.get().transactions.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
  }

  function accountOptions(selectedId) {
    return store
      .get()
      .accounts.map(function (account) {
        return (
          '<option value="' + esc(account.id) + '"' + (account.id === selectedId ? " selected" : "") + ">" +
          esc(account.name) +
          "</option>"
        );
      })
      .join("");
  }

  /* ------------------------------------------------------------------ chrome */

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme === "light" ? "light" : "dark");
    var meta = document.getElementById("theme-color-meta");
    if (meta) meta.setAttribute("content", theme === "light" ? "#F4F4F6" : "#000000");
    syncSystemBars(theme);
  }

  function renderHeader() {
    var total = store.total();
    var totalEl = document.getElementById("header-total");
    if (totalEl) {
      totalEl.textContent = money.format(total);
      totalEl.classList.toggle("negative", total < 0);
    }
    var brandIcon = document.getElementById("brand-icon");
    if (brandIcon) {
      var src = SV.icon.dataUrl(settings().icon === "light" ? "light" : "dark", 96);
      if (brandIcon.getAttribute("src") !== src) brandIcon.setAttribute("src", src);
    }
    var toggle = document.getElementById("theme-toggle");
    var iconSlot = document.getElementById("theme-icon");
    if (iconSlot) iconSlot.innerHTML = settings().theme === "dark" ? ICONS.sun : ICONS.moon;
    if (toggle) {
      toggle.setAttribute("aria-label", t("aria.toggleTheme"));
      toggle.setAttribute("title", t("aria.toggleTheme"));
    }
  }

  function renderTabs() {
    var root = document.getElementById("tabs");
    if (!root) return;
    var active = tab();
    root.innerHTML = TABS.map(function (id) {
      return (
        '<button class="tab' + (id === active ? " active" : "") + '" type="button" data-action="go-tab" data-tab="' + id + '"' +
        (id === active ? ' aria-current="page"' : "") +
        ">" +
        ICONS[TAB_ICONS[id]] +
        '<span class="tab-label">' + esc(t("nav." + id)) + "</span>" +
        "</button>"
      );
    }).join("");
  }

  function renderBanner() {
    var root = document.getElementById("banner-root");
    if (!root) return;
    if (settings().welcomeDismissed) {
      root.innerHTML = "";
      return;
    }
    root.innerHTML =
      '<div class="banner" role="region" aria-label="' + esc(t("welcome.title")) + '">' +
        '<div class="banner-body">' +
          '<p class="banner-title">' + esc(t("welcome.title")) + "</p>" +
          '<p class="banner-text">' + esc(t("welcome.body")) + "</p>" +
          '<div class="banner-actions">' +
            '<button class="btn btn-sm btn-primary" type="button" data-action="tutorial-open">' +
              esc(t("welcome.tutorial")) +
            "</button>" +
            '<button class="btn btn-sm btn-ghost" type="button" data-action="welcome-dismiss">' +
              esc(t("welcome.dismiss")) +
            "</button>" +
          "</div>" +
        "</div>" +
        '<button class="icon-btn sm" type="button" data-action="welcome-dismiss" aria-label="' +
          esc(t("welcome.dismiss")) + '">' + ICONS.close + "</button>" +
      "</div>";
  }

  function applyI18n() {
    var nodes = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute("data-i18n");
      if (key) nodes[i].textContent = t(key);
    }
    var labeled = document.querySelectorAll("[data-i18n-aria]");
    for (var j = 0; j < labeled.length; j++) {
      labeled[j].setAttribute("aria-label", t(labeled[j].getAttribute("data-i18n-aria")));
    }
  }

  function renderAll() {
    applyTheme(settings().theme);
    SV.i18n.setLang(settings().lang);
    applyI18n();
    renderHeader();
    renderTabs();
    renderBanner();
    renderView();
  }

  function renderView() {
    var root = document.getElementById("view");
    if (!root) return;
    var html = "";
    switch (tab()) {
      case "track":
        html = viewTrack();
        break;
      case "ledger":
        html = viewLedger();
        break;
      case "goals":
        html = viewGoals();
        break;
      case "options":
        html = viewOptions();
        break;
      default:
        html = viewOverview();
    }
    root.innerHTML = html;
    if (tab() === "options") SV.icon.paintAll(root);
  }

  /* ------------------------------------------------------------------ bits */

  function emptyState(title, body, action) {
    return (
      '<div class="empty">' +
        '<p class="empty-title">' + esc(title) + "</p>" +
        '<p class="empty-body">' + esc(body) + "</p>" +
        (action || "") +
      "</div>"
    );
  }

  function hintBox(title, body, action) {
    return (
      '<div class="hint-box">' +
        '<span class="hint-mark" aria-hidden="true"></span>' +
        '<div class="hint-body">' +
          '<p class="hint-title">' + esc(title) + "</p>" +
          '<p class="hint-text">' + esc(body) + "</p>" +
          (action || "") +
        "</div>" +
      "</div>"
    );
  }

  function tabButton(id, label) {
    return (
      '<button class="btn btn-sm" type="button" data-action="go-tab" data-tab="' + id + '">' +
      esc(label) + ICONS.arrow + "</button>"
    );
  }

  function liquidityPills(reserved, available) {
    return (
      '<div class="split-pills">' +
        '<div class="split-pill">' +
          '<span class="split-label">' + esc(t("overview.reserved")) + "</span>" +
          '<span class="split-value num">' + esc(money.format(reserved)) + "</span>" +
        "</div>" +
        '<div class="split-pill' + (available > 0 ? " available" : available < 0 ? " shortfall" : "") + '">' +
          '<span class="split-label">' + esc(t("overview.available")) + "</span>" +
          '<span class="split-value num">' + esc(money.format(available)) + "</span>" +
        "</div>" +
      "</div>"
    );
  }

  function liquiditySplit(accounts, withTotals) {
    if (!accounts || accounts.length === 0) return "";
    var rows = accounts.map(function (account) {
      return (
        '<div class="split-row">' +
          '<span class="split-account">' + esc(account.name) + "</span>" +
          liquidityPills(store.reservedFor(account.id), store.availableFor(account.id)) +
        "</div>"
      );
    });
    if (withTotals) {
      rows.push(
        '<div class="split-row">' +
          '<span class="split-account">' + esc(t("overview.allAccounts")) + "</span>" +
          liquidityPills(store.reserved(), store.available()) +
        "</div>"
      );
    }
    return '<div class="liquidity-split">' + rows.join("") + "</div>";
  }

  function accountBadge(account) {
    return (
      '<span class="account-badge" title="' + esc(t("goals.linkedAccount")) + '">' +
        '<span class="account-badge-dot" aria-hidden="true"></span>' +
        esc(account ? account.name : t("goals.accountMissing")) +
      "</span>"
    );
  }

  /* ------------------------------------------------------------------ overview */

  function viewOverview() {
    var state = store.get();
    var total = store.total();
    var stats = monthStats();
    var rate = state.settings.hourlyRate;

    var html = '<section class="hero">';
    html += '<div class="hero-main">';
    html += '<p class="eyebrow">' + esc(t("overview.liquidity")) + "</p>";
    html += '<p class="hero-amount num' + (total < 0 ? " negative" : "") + '">' + esc(money.format(total)) + "</p>";
    html += liquiditySplit(state.accounts, state.accounts.length > 1);
    html += '<p class="hero-meta">';
    html += "<span>" + esc(t("overview.accountCount", { n: state.accounts.length })) + "</span>";
    html += "<span>" + esc(t("overview.thisMonth")) + "</span>";
    html += "</p></div>";
    html += '<dl class="hero-stats">';
    html +=
      '<div class="stat"><dt class="stat-label">' + esc(t("overview.rate")) + "</dt>" +
      '<dd class="stat-value num">' + (rate > 0 ? esc(money.format(rate)) + " / h" : "&mdash;") + "</dd></div>";
    html +=
      '<div class="stat"><dt class="stat-label">' + esc(t("overview.hours")) + "</dt>" +
      '<dd class="stat-value num">' + esc(money.formatHours(stats.hours)) + " h</dd></div>";
    html +=
      '<div class="stat"><dt class="stat-label">' + esc(t("overview.earned")) + "</dt>" +
      '<dd class="stat-value num">' + esc(money.format(stats.earned)) + "</dd></div>";
    html += "</dl></section>";

    html += '<section class="section">';
    html += '<div class="section-head">';
    html += '<h2 class="section-title">' + esc(t("overview.accounts")) + ' <span class="section-count num">' + state.accounts.length + "</span></h2>";
    if (!ui.accountForm && state.accounts.length > 0) {
      html += '<button class="btn btn-sm" type="button" data-action="toggle-account-form">' + ICONS.plus + esc(t("overview.newAccount")) + "</button>";
    }
    html += "</div>";

    if (ui.accountForm) html += accountForm();

    if (state.accounts.length === 0 && !ui.accountForm) {
      html += emptyState(
        t("overview.emptyTitle"),
        t("overview.emptyBody"),
        '<button class="btn btn-sm btn-primary" type="button" data-action="toggle-account-form">' + ICONS.plus + esc(t("overview.newAccount")) + "</button>"
      );
    } else if (state.accounts.length > 0) {
      html += '<div class="grid">';
      state.accounts.forEach(function (account) {
        var count = entryCount(account.id);
        var goalCount = store.goalsFor(account.id).length;
        var meta = t("overview.entries", { n: count });
        if (goalCount > 0) meta += " \u00b7 " + t("overview.goals", { n: goalCount });
        html +=
          '<article class="card account-card">' +
            '<div class="account-top">' +
              '<span class="account-name">' + esc(account.name) + "</span>" +
              '<button class="icon-btn sm" type="button" data-action="delete-account" data-id="' + esc(account.id) + '" aria-label="' + esc(t("common.delete")) + '">' + ICONS.trash + "</button>" +
            "</div>" +
            '<p class="account-balance num' + (account.balance < 0 ? " negative" : "") + '">' + esc(money.format(account.balance)) + "</p>" +
            '<div class="account-split">' + liquidityPills(store.reservedFor(account.id), store.availableFor(account.id)) + "</div>" +
            '<p class="account-meta">' + esc(meta) + "</p>" +
          "</article>";
      });
      html += "</div>";
    }
    html += "</section>";
    return html;
  }

  function accountForm() {
    return (
      '<form class="card form-card" data-form="account" novalidate>' +
        '<div class="card-head"><h3 class="card-title">' + esc(t("overview.newAccount")) + "</h3></div>" +
        '<div class="form-grid">' +
          '<label class="field">' +
            '<span class="field-label">' + esc(t("accounts.name")) + "</span>" +
            '<input class="input" name="name" type="text" maxlength="60" autocomplete="off" required>' +
          "</label>" +
          '<label class="field">' +
            '<span class="field-label">' + esc(t("accounts.starting")) + " <span class=\"opt\">" + esc(t("common.optional")) + "</span></span>" +
            '<span class="input-suffix">' +
              '<input name="balance" type="number" step="0.01" inputmode="decimal" placeholder="0.00">' +
              '<span class="suffix">' + esc(money.symbol()) + "</span>" +
            "</span>" +
            '<span class="field-hint">' + esc(t("accounts.startingHint", { currency: money.currency() })) + "</span>" +
          "</label>" +
        "</div>" +
        '<div class="form-actions">' +
          '<button class="btn" type="button" data-action="cancel-account-form">' + esc(t("common.cancel")) + "</button>" +
          '<button class="btn btn-primary" type="submit">' + esc(t("accounts.create")) + "</button>" +
        "</div>" +
      "</form>"
    );
  }

  /* ------------------------------------------------------------------ track */

  function viewTrack() {
    var state = store.get();
    var rate = state.settings.hourlyRate;
    var accounts = state.accounts;

    var html = '<div class="page-head"><div>' +
      '<h1 class="page-title">' + esc(t("track.title")) + "</h1>" +
      '<p class="page-sub">' + esc(t("track.monthHours")) + ": " + esc(money.formatHours(monthStats().hours)) + " h</p>" +
      "</div></div>";

    if (accounts.length === 0) {
      html += emptyState(t("track.noAccountTitle"), t("track.noAccountBody"), tabButton("overview", t("track.goOverview")));
      return html;
    }

    if (!(rate > 0)) {
      html += hintBox(t("track.noRateTitle"), t("track.noRateBody"), tabButton("options", t("track.goOptions")));
    }

    html += '<div class="two-col">';
    html += '<form class="card form-card" data-form="shift" novalidate>';
    html += '<div class="card-head"><h2 class="card-title">' + esc(t("track.title")) + "</h2></div>";
    html += '<label class="field"><span class="field-label">' + esc(t("track.account")) + "</span>";
    html += '<span class="select-wrap"><select class="input" name="accountId" required>' + accountOptions(accounts[0].id) + "</select></span></label>";
    html += '<label class="field"><span class="field-label">' + esc(t("track.hours")) + "</span>";
    html += '<span class="input-suffix"><input id="shift-hours" name="hours" type="number" step="0.25" min="0" inputmode="decimal" placeholder="0.00" autocomplete="off" required><span class="suffix">h</span></span>';
    html += '<span class="field-hint">' + esc(t("track.hoursHint")) + "</span></label>";
    html += '<div class="calc-row"><span class="eyebrow">' + esc(t("track.earnings")) + "</span>";
    html += '<span class="calc-value num" id="shift-earnings">' + esc(money.format(0)) + "</span></div>";
    html += '<button class="btn btn-primary btn-block" type="submit"' + (rate > 0 ? "" : " disabled") + ">" + esc(t("track.submit")) + "</button>";
    html += "</form>";

    html += '<aside class="card">';
    html += '<div class="card-head"><h3 class="card-title">' + esc(t("track.rate")) + "</h3></div>";
    html += '<p class="calc-value num">' + (rate > 0 ? esc(money.format(rate)) + " / h" : "&mdash;") + "</p>";
    html += '<hr class="hairline">';
    html += '<dl class="goal-stats">';
    html += "<div><dt>" + esc(t("overview.hours")) + '</dt><dd class="num">' + esc(money.formatHours(monthStats().hours)) + " h</dd></div>";
    html += "<div><dt>" + esc(t("overview.earned")) + '</dt><dd class="num">' + esc(money.format(monthStats().earned)) + "</dd></div>";
    html += "</dl>";
    html += "</aside>";
    html += "</div>";
    return html;
  }

  /* ------------------------------------------------------------------ ledger */

  function viewLedger() {
    var state = store.get();
    var accounts = state.accounts;
    var list = sortedTransactions();
    var html = '<div class="page-head"><div>' +
      '<h1 class="page-title">' + esc(t("ledger.title")) + "</h1>" +
      '<p class="page-sub">' + esc(t("ledger.count", { n: list.length })) + "</p>" +
      "</div>";
    html += '<div class="btn-row" style="margin-left:auto">';
    html += '<button class="btn btn-sm" type="button" data-action="export-csv">' + ICONS.download + esc(t("ledger.exportCsv")) + "</button>";
    html += '<button class="btn btn-sm" type="button" data-action="export-json">' + esc(t("ledger.exportJson")) + "</button>";
    html += "</div></div>";

    if (accounts.length === 0) {
      html += emptyState(
        t("track.noAccountTitle"),
        t("ledger.noAccountBody"),
        tabButton("overview", t("track.goOverview"))
      );
      return html;
    }

    html += '<form class="card form-card" data-form="entry" novalidate>';
    html += '<input type="hidden" id="entry-type" name="type" value="' + ui.entryType + '">';
    html += '<div class="segmented" role="group" aria-label="' + esc(t("ledger.add")) + '">';
    html += '<button type="button" data-action="set-entry-type" data-value="income" class="' + (ui.entryType === "income" ? "active income" : "") + '">' + esc(t("ledger.income")) + "</button>";
    html += '<button type="button" data-action="set-entry-type" data-value="expense" class="' + (ui.entryType === "expense" ? "active expense" : "") + '">' + esc(t("ledger.expense")) + "</button>";
    html += "</div>";
    html += '<div class="form-grid">';
    html += '<label class="field"><span class="field-label">' + esc(t("ledger.amount")) + "</span>";
    html += '<span class="input-suffix"><input name="amount" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00" required><span class="suffix">' + esc(money.symbol()) + "</span></span></label>";
    html += '<label class="field"><span class="field-label">' + esc(t("ledger.account")) + "</span>";
    html += '<span class="select-wrap"><select class="input" name="accountId" required>' + accountOptions(accounts[0].id) + "</select></span></label>";
    html += '<label class="field"><span class="field-label">' + esc(t("ledger.note")) + " <span class=\"opt\">" + esc(t("common.optional")) + "</span></span>";
    html += '<input class="input" name="note" type="text" maxlength="120" autocomplete="off"></label>';
    html += '<label class="field"><span class="field-label">' + esc(t("ledger.date")) + "</span>";
    html += '<input class="input" name="date" type="date" value="' + todayISO() + '" required></label>';
    html += "</div>";
    html += '<button class="btn btn-primary btn-block" type="submit">' + esc(t("ledger.add")) + "</button>";
    html += "</form>";

    if (list.length === 0) {
      html += emptyState(t("ledger.emptyTitle"), t("ledger.emptyBody"), "");
      return html;
    }

    html += '<ul class="entry-list">';
    list.forEach(function (tx) {
      var account = accountById(tx.accountId);
      var title = tx.note || t(tx.type === "income" ? "ledger.income" : "ledger.expense");
      var amountClass = tx.type === "income" ? "pos" : "neg";
      var sign = tx.type === "income" ? "+" : "\u2212";
      html += '<li class="entry">';
      html += '<div class="entry-main">';
      html += '<span class="entry-title">' + esc(title) + "</span>";
      html += '<span class="entry-meta">';
      if (tx.source === "shift") html += '<span class="tag">' + esc(t("ledger.shift")) + "</span>";
      html += "<span>" + esc(account ? account.name : "") + "</span><span>&middot;</span>";
      html += "<span>" + esc(money.formatDate(tx.date)) + "</span>";
      html += "</span></div>";
      html += '<span class="entry-amount num ' + amountClass + '">' + sign + esc(money.format(tx.amount)) + "</span>";
      html += '<button class="icon-btn sm" type="button" data-action="delete-entry" data-id="' + esc(tx.id) + '" aria-label="' + esc(t("ledger.delete")) + '">' + ICONS.trash + "</button>";
      html += "</li>";
    });
    html += "</ul>";
    return html;
  }

  /* ------------------------------------------------------------------ goals */

  function viewGoals() {
    var state = store.get();
    var goals = state.goals;
    var accounts = state.accounts;
    var rate = state.settings.hourlyRate;

    var html = '<div class="page-head"><div>' +
      '<h1 class="page-title">' + esc(t("goals.title")) + "</h1>" +
      '<p class="page-sub">' + esc(t("overview.rate")) + ": " + (rate > 0 ? esc(money.format(rate)) + " / h" : "&mdash;") + "</p>" +
      "</div>";
    if (!ui.goalForm && goals.length > 0 && accounts.length > 0) {
      html += '<button class="btn btn-sm" type="button" data-action="toggle-goal-form" style="margin-left:auto">' + ICONS.plus + esc(t("goals.new")) + "</button>";
    }
    html += "</div>";

    if (accounts.length === 0) {
      html += emptyState(t("goals.noAccountTitle"), t("goals.noAccountBody"), tabButton("overview", t("track.goOverview")));
      return html;
    }

    if (ui.goalForm) html += goalForm();

    if (goals.length === 0 && !ui.goalForm) {
      html += emptyState(
        t("goals.emptyTitle"),
        t("goals.emptyBody"),
        '<button class="btn btn-sm btn-primary" type="button" data-action="toggle-goal-form">' + ICONS.plus + esc(t("goals.new")) + "</button>"
      );
      return html;
    }

    if (goals.length > 0) {
      html += '<div class="grid">';
      goals.forEach(function (goal) {
        var pct = goal.target > 0 ? Math.min(100, Math.max(0, (goal.saved / goal.target) * 100)) : 0;
        var remaining = Math.max(0, goal.target - goal.saved);
        var complete = goal.saved >= goal.target;
        var rounded = Math.round(pct);
        var hoursLeft = rate > 0 ? remaining / rate : null;
        html += '<article class="card goal-card">';
        html += '<div class="goal-head"><h3 class="goal-name">' + esc(goal.name) + "</h3>" +
          accountBadge(accountById(goal.accountId)) +
          '<div class="goal-actions">' +
            '<button class="icon-btn sm" type="button" data-action="edit-goal" data-id="' + esc(goal.id) + '" aria-label="' + esc(t("goals.edit")) + '">' + ICONS.pencil + "</button>" +
            '<button class="icon-btn sm" type="button" data-action="delete-goal" data-id="' + esc(goal.id) + '" aria-label="' + esc(t("common.delete")) + '">' + ICONS.trash + "</button>" +
          "</div></div>";
        html += '<div class="goal-figures"><span class="goal-saved num">' + esc(money.format(goal.saved)) + "</span>" +
          '<span class="goal-target num">/ ' + esc(money.format(goal.target)) + "</span>" +
          '<span class="goal-pct num' + (complete ? " done" : "") + '">' + rounded + "%</span></div>";
        html += '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + rounded + '" aria-label="' + esc(t("goals.progressAria", { pct: rounded })) + '">' +
          '<span class="progress-fill" style="width:' + pct.toFixed(2) + '%"></span></div>';
        html += '<dl class="goal-stats">';
        html += "<div><dt>" + esc(t("goals.remaining")) + '</dt><dd class="num">' + esc(money.format(remaining)) + "</dd></div>";
        html += "<div><dt>" + esc(t("goals.hoursLeft")) + '</dt><dd class="num">' +
          (hoursLeft === null ? "&mdash;" : esc(money.formatHours(Math.ceil(hoursLeft * 10) / 10)) + " h") + "</dd></div>";
        html += "</dl>";
        if (hoursLeft === null) {
          html += '<p class="field-hint">' + esc(t("goals.needRate")) + "</p>";
        }
        if (complete) {
          html += '<button class="btn btn-sm btn-primary btn-block" type="button" data-action="complete-goal" data-id="' + esc(goal.id) + '">' + esc(t("goals.completeSpend")) + "</button>";
        }
        html += '<form class="goal-update" data-form="goal-update" data-id="' + esc(goal.id) + '">';
        html += '<span class="input-wrap"><input name="saved" type="number" step="0.01" min="0" inputmode="decimal" value="' + esc(displayValue(goal.saved)) + '" aria-label="' + esc(t("goals.saved")) + '"><span class="suffix">' + esc(money.symbol()) + "</span></span>";
        html += '<button class="btn btn-sm" type="submit">' + esc(t("goals.update")) + "</button>";
        html += "</form>";
        html += "</article>";
      });
      html += "</div>";
    }
    return html;
  }

  function goalForm() {
    return (
      '<form class="card form-card" data-form="goal" novalidate>' +
        '<div class="card-head"><h3 class="card-title">' + esc(t("goals.new")) + "</h3></div>" +
        '<div class="form-grid">' +
          '<label class="field span-2">' +
            '<span class="field-label">' + esc(t("goals.name")) + "</span>" +
            '<input class="input" name="name" type="text" maxlength="60" autocomplete="off" required>' +
          "</label>" +
          '<label class="field span-2">' +
            '<span class="field-label">' + esc(t("goals.linkedAccount")) + "</span>" +
            '<span class="select-wrap"><select class="input" name="accountId" required>' + accountOptions() + "</select></span>" +
            '<span class="field-hint">' + esc(t("goals.linkedAccountHint")) + "</span>" +
          "</label>" +
          '<label class="field">' +
            '<span class="field-label">' + esc(t("goals.target")) + "</span>" +
            '<span class="input-suffix"><input name="target" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00" required><span class="suffix">' + esc(money.symbol()) + "</span></span>" +
          "</label>" +
          '<label class="field">' +
            '<span class="field-label">' + esc(t("goals.saved")) + " <span class=\"opt\">" + esc(t("common.optional")) + "</span></span>" +
            '<span class="input-suffix"><input name="saved" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00"><span class="suffix">' + esc(money.symbol()) + "</span></span>" +
            '<span class="field-hint">' + esc(t("goals.savedHint", { currency: money.currency() })) + "</span>" +
          "</label>" +
        "</div>" +
        '<div class="form-actions">' +
          '<button class="btn" type="button" data-action="cancel-goal-form">' + esc(t("common.cancel")) + "</button>" +
          '<button class="btn btn-primary" type="submit">' + esc(t("goals.create")) + "</button>" +
        "</div>" +
      "</form>"
    );
  }

  /* ------------------------------------------------------------------ options */

  function fxStatusText() {
    var status = SV.fx.status();
    var fetchedAt = store.get().fx.fetchedAt;
    if (status === "loading") return t("options.loading");
    if (status === "offline") return t("options.offline");
    if (status === "error") return t("options.fxError");
    return fetchedAt ? t("options.updated", { when: money.formatTimestamp(fetchedAt) }) : t("options.never");
  }

  function viewOptions() {
    var state = store.get();
    var lang = state.settings.lang;
    var rate = state.settings.hourlyRate;
    var status = SV.fx.status();
    var live = money.hasLiveRates() && status !== "offline" && status !== "error";

    var html = '<div class="page-head"><div><h1 class="page-title">' + esc(t("options.title")) + "</h1></div></div>";
    html += '<div class="options-grid">';

    /* Appearance */
    html += '<section class="card">';
    html += '<div class="card-head"><h2 class="card-title">' + esc(t("options.appearance")) + "</h2></div>";
    html += '<div class="option-block">';
    html += '<span class="option-label">' + esc(t("options.theme")) + "</span>";
    html += '<div class="segmented" role="group" aria-label="' + esc(t("options.theme")) + '">';
    html += '<button type="button" data-action="set-theme" data-value="dark" class="' + (state.settings.theme === "dark" ? "active" : "") + '">' + esc(t("options.dark")) + "</button>";
    html += '<button type="button" data-action="set-theme" data-value="light" class="' + (state.settings.theme === "light" ? "active" : "") + '">' + esc(t("options.light")) + "</button>";
    html += "</div></div>";
    html += '<div class="option-block">';
    html += '<label class="option-label" for="lang-select">' + esc(t("options.language")) + "</label>";
    html += '<span class="select-wrap"><select class="input" id="lang-select" data-setting="lang">';
    SV.i18n.langs.forEach(function (code) {
      html += '<option value="' + code + '"' + (code === lang ? " selected" : "") + ">" + esc(SV.i18n.names[code]) + "</option>";
    });
    html += "</select></span></div>";
    html += "</section>";

    /* Wage and currency */
    html += '<section class="card">';
    html += '<div class="card-head"><h2 class="card-title">' + esc(t("options.wage")) + "</h2></div>";
    html += '<div class="option-block">';
    html += '<label class="option-label" for="rate-input">' + esc(t("options.hourlyRate")) + "</label>";
    html += '<span class="input-suffix"><input id="rate-input" type="number" step="0.01" min="0" inputmode="decimal" value="' + esc(displayValue(rate)) + '" data-setting="hourlyRate"><span class="suffix">' + esc(money.symbol()) + " / h</span></span>";
    html += '<span class="field-hint">' + esc(t("options.rateHint", { currency: money.currency() })) + "</span>";
    html += "</div>";
    html += '<div class="option-block">';
    html += '<label class="option-label" for="currency-select">' + esc(t("options.currency")) + "</label>";
    html += '<span class="select-wrap"><select class="input" id="currency-select" data-setting="currency">';
    money.currencies.forEach(function (code) {
      html += '<option value="' + code + '"' + (code === state.settings.currency ? " selected" : "") + ">" + esc(code) + " &middot; " + esc(money.currencyName(code)) + "</option>";
    });
    html += "</select></span>";
    html += '<span class="field-hint">' + esc(t("options.currencyHint")) + "</span>";
    html += '<div class="fx-row">';
    html += '<span class="fx-dot' + (live ? "" : " off") + '" aria-hidden="true"></span>';
    html += '<span class="fx-status">' + esc(fxStatusText()) + "</span>";
    html += '<button class="btn btn-sm" type="button" data-action="refresh-fx"' + (status === "loading" ? " disabled" : "") + ">" + esc(t("options.refresh")) + "</button>";
    html += "</div></div>";
    html += "</section>";

    /* Icon */
    html += '<section class="card">';
    html += '<div class="card-head"><h2 class="card-title">' + esc(t("options.icon")) + "</h2></div>";
    html += '<p class="field-hint" style="margin-bottom:12px">' + esc(t("options.iconHint")) + "</p>";
    html += '<div class="icon-choices">';
    html += '<button class="icon-choice' + (state.settings.icon === "dark" ? " selected" : "") + '" type="button" data-action="set-icon" data-value="dark">' +
      '<canvas data-icon="dark" width="112" height="112" aria-hidden="true"></canvas>' +
      "<span>" + esc(t("options.iconDark")) + "</span></button>";
    html += '<button class="icon-choice' + (state.settings.icon === "light" ? " selected" : "") + '" type="button" data-action="set-icon" data-value="light">' +
      '<canvas data-icon="light" width="112" height="112" aria-hidden="true"></canvas>' +
      "<span>" + esc(t("options.iconLight")) + "</span></button>";
    html += "</div>";
    html += '<div class="btn-row" style="margin-top:12px">' +
      '<button class="btn btn-sm" type="button" data-action="download-icon">' + ICONS.download + esc(t("options.download")) + "</button></div>";
    if (nativeAndroid()) {
      html += '<p class="field-hint" style="margin-top:10px">' + esc(t("options.iconAndroidNote")) + "</p>";
    }
    html += "</section>";

    /* Tutorial */
    html += '<section class="card">';
    html += '<div class="card-head"><h2 class="card-title">' + esc(t("options.tutorial")) + "</h2></div>";
    html += '<p class="field-hint" style="margin-bottom:12px">' + esc(t("options.tutorialHint")) + "</p>";
    html += '<button class="btn btn-sm" type="button" data-action="tutorial-open">' + esc(t("options.launchTutorial")) + "</button>";
    html += "</section>";

    /* Data */
    html += '<section class="card">';
    html += '<div class="card-head"><h2 class="card-title">' + esc(t("options.data")) + "</h2></div>";
    html += '<p class="field-hint">' + esc(t("options.dataHint")) + "</p>";
    html += '<div class="btn-row" style="margin-top:12px">' +
      '<button class="btn btn-sm" type="button" data-action="export-csv">' + ICONS.download + esc(t("ledger.exportCsv")) + "</button>" +
      '<button class="btn btn-sm" type="button" data-action="export-json">' + esc(t("ledger.exportJson")) + "</button></div>";
    html += '<hr class="hairline">';
    html += '<button class="btn btn-danger btn-sm" type="button" data-action="reset-data">' + esc(t("options.reset")) + "</button>";
    html += "</section>";

    /* About */
    html += '<section class="card">';
    html += '<div class="card-head"><h2 class="card-title">' + esc(t("options.about")) + "</h2></div>";
    html += '<p class="field-hint">' + esc(t("options.aboutBody")) + "</p>";
    html += '<div class="about-lines" style="margin-top:12px">' +
      "<div><strong>" + esc(t("options.version")) + "</strong> " + VERSION + "</div>" +
      "<div>" + esc(t("options.license")) + "</div>" +
      "</div>";
    html += "</section>";

    html += "</div>";
    return html;
  }

  /* ------------------------------------------------------------------ dialogs */

  function lockScroll(lock) {
    document.body.style.overflow = lock ? "hidden" : "";
  }

  function closeModal(result) {
    var root = document.getElementById("modal-root");
    if (root) root.innerHTML = "";
    lockScroll(false);
    if (modalResolve) {
      var resolve = modalResolve;
      modalResolve = null;
      resolve(result);
    }
  }

  function confirmDialog(title, text, confirmLabel) {
    return new Promise(function (resolve) {
      modalResolve = resolve;
      var root = document.getElementById("modal-root");
      root.innerHTML =
        '<div class="modal-overlay" data-overlay="true">' +
          '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">' +
            '<div class="modal-head">' +
              '<h2 class="modal-title" id="modal-title">' + esc(title) + "</h2>" +
              '<button class="icon-btn sm modal-close" type="button" data-action="modal-cancel" aria-label="' + esc(t("common.close")) + '">' + ICONS.close + "</button>" +
            "</div>" +
            '<p class="modal-text">' + esc(text) + "</p>" +
            '<div class="modal-actions">' +
              '<button class="btn" type="button" data-action="modal-cancel">' + esc(t("common.cancel")) + "</button>" +
              '<button class="btn btn-danger" type="button" data-action="modal-confirm">' + esc(confirmLabel || t("common.delete")) + "</button>" +
            "</div>" +
          "</div>" +
        "</div>";
      lockScroll(true);
    });
  }

  function spendGoalDialog(goal) {
    var account = accountById(goal.accountId);
    return new Promise(function (resolve) {
      modalResolve = resolve;
      var root = document.getElementById("modal-root");
      root.innerHTML =
        '<div class="modal-overlay" data-overlay="true">' +
          '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="spend-title">' +
            '<div class="modal-head">' +
              '<h2 class="modal-title" id="spend-title">' + esc(t("goals.spendTitle")) + "</h2>" +
              '<button class="icon-btn sm modal-close" type="button" data-action="modal-cancel" aria-label="' + esc(t("common.close")) + '">' + ICONS.close + "</button>" +
            "</div>" +
            '<p class="modal-text">' + esc(t("goals.spendBody", { name: goal.name, amount: money.format(goal.saved) })) + "</p>" +
            '<div class="modal-body">' +
              '<div class="spend-account">' +
                '<span class="field-label">' + esc(t("goals.spendAccount")) + "</span>" +
                accountBadge(account) +
              "</div>" +
            "</div>" +
            '<div class="modal-actions">' +
              '<button class="btn" type="button" data-action="modal-cancel">' + esc(t("common.cancel")) + "</button>" +
              '<button class="btn btn-primary" type="button" data-action="modal-spend-confirm">' + esc(t("goals.spendConfirm")) + "</button>" +
            "</div>" +
          "</div>" +
        "</div>";
      lockScroll(true);
    });
  }

  function goalEditDialog(goal) {
    return new Promise(function (resolve) {
      modalResolve = resolve;
      var root = document.getElementById("modal-root");
      root.innerHTML =
        '<div class="modal-overlay" data-overlay="true">' +
          '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="goal-edit-title">' +
            '<div class="modal-head">' +
              '<h2 class="modal-title" id="goal-edit-title">' + esc(t("goals.editTitle")) + "</h2>" +
              '<button class="icon-btn sm modal-close" type="button" data-action="modal-cancel" aria-label="' + esc(t("common.close")) + '">' + ICONS.close + "</button>" +
            "</div>" +
            '<div class="modal-body">' +
              '<label class="field"><span class="field-label">' + esc(t("goals.name")) + "</span>" +
                '<input class="input" id="goal-edit-name" type="text" maxlength="60" autocomplete="off" value="' + esc(goal.name) + '">' +
              "</label>" +
              '<label class="field"><span class="field-label">' + esc(t("goals.target")) + "</span>" +
                '<span class="input-suffix"><input id="goal-edit-target" type="number" step="0.01" min="0" inputmode="decimal" value="' + esc(displayValue(goal.target)) + '"><span class="suffix">' + esc(money.symbol()) + "</span></span>" +
              "</label>" +
              '<label class="field"><span class="field-label">' + esc(t("goals.linkedAccount")) + "</span>" +
                '<span class="select-wrap"><select class="input" id="goal-edit-account">' + accountOptions(goal.accountId) + "</select></span>" +
                '<span class="field-hint">' + esc(t("goals.linkedAccountHint")) + "</span>" +
              "</label>" +
            "</div>" +
            '<div class="modal-actions">' +
              '<button class="btn" type="button" data-action="modal-cancel">' + esc(t("common.cancel")) + "</button>" +
              '<button class="btn btn-primary" type="button" data-action="modal-goal-save">' + esc(t("common.save")) + "</button>" +
            "</div>" +
          "</div>" +
        "</div>";
      lockScroll(true);
    });
  }

  function openTutorial(step) {
    ui.tutorialStep = Math.max(0, Math.min(2, Number(step) || 0));
    renderTutorial();
    lockScroll(true);
  }

  function renderTutorial() {
    var step = ui.tutorialStep;
    var titles = [t("tutorial.step1Title"), t("tutorial.step2Title"), t("tutorial.step3Title")];
    var bodies = [t("tutorial.step1Body"), t("tutorial.step2Body"), t("tutorial.step3Body")];
    var dots = "";
    for (var i = 0; i < 3; i++) {
      dots += '<span class="tutorial-dot' + (i === step ? " active" : "") + '"></span>';
    }
    var root = document.getElementById("modal-root");
    root.innerHTML =
      '<div class="modal-overlay" data-overlay="true">' +
        '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">' +
          '<div class="modal-head">' +
            '<h2 class="modal-title" id="tutorial-title">' + esc(t("options.tutorial")) + "</h2>" +
            '<button class="icon-btn sm modal-close" type="button" data-action="close-modal" aria-label="' + esc(t("tutorial.close")) + '">' + ICONS.close + "</button>" +
          "</div>" +
          '<div class="tutorial-step">' +
            '<p class="eyebrow">' + esc(t("tutorial.step", { n: step + 1, total: 3 })) + "</p>" +
            '<h3 class="tutorial-step-title">' + esc(titles[step]) + "</h3>" +
            '<p class="tutorial-step-body">' + esc(bodies[step]) + "</p>" +
          "</div>" +
          '<div class="tutorial-dots" aria-hidden="true">' + dots + "</div>" +
          '<div class="tutorial-foot">' +
            '<span class="step-count">' + esc(t("tutorial.step", { n: step + 1, total: 3 })) + "</span>" +
            '<span class="spacer"></span>' +
            (step > 0 ? '<button class="btn btn-sm" type="button" data-action="tutorial-back">' + esc(t("tutorial.back")) + "</button>" : "") +
            '<button class="btn btn-sm btn-ghost" type="button" data-action="tutorial-skip">' + esc(t("tutorial.skip")) + "</button>" +
            (step < 2
              ? '<button class="btn btn-sm btn-primary" type="button" data-action="tutorial-next">' + esc(t("tutorial.next")) + "</button>"
              : '<button class="btn btn-sm btn-primary" type="button" data-action="tutorial-done">' + esc(t("tutorial.done")) + "</button>") +
          "</div>" +
        "</div>" +
      "</div>";
  }

  function finishTutorial() {
    store.setSetting("tutorialSeen", true);
    closeModal(true);
  }

  /* ------------------------------------------------------------------ toasts */

  function toast(message) {
    var root = document.getElementById("toast-root");
    if (!root) return;
    var node = document.createElement("div");
    node.className = "toast";
    node.textContent = message;
    root.appendChild(node);
    window.setTimeout(function () {
      node.classList.add("leaving");
    }, 2100);
    window.setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, 2400);
  }

  /* ------------------------------------------------------------------ exports */

  function download(filename, content, mime) {
    try {
      var blob = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 1500);
      return true;
    } catch (err) {
      console.error("ShiftVault: download failed", err);
      return false;
    }
  }

  function nativeExportPlugins() {
    var filesystem = capPlugin("Filesystem");
    var share = capPlugin("Share");
    if (!filesystem || typeof filesystem.writeFile !== "function" || typeof filesystem.getUri !== "function") return null;
    if (!share || typeof share.share !== "function") return null;
    return { filesystem: filesystem, share: share };
  }

  function nativeExport(fileName, content, title) {
    var plugins = nativeExportPlugins();
    if (!plugins) return null;
    return Promise.resolve()
      .then(function () {
        return plugins.filesystem.writeFile({
          path: fileName,
          data: content,
          directory: "CACHE",
          encoding: "utf8"
        });
      })
      .then(function () {
        return plugins.filesystem.getUri({ path: fileName, directory: "CACHE" });
      })
      .then(function (file) {
        if (!file || !file.uri) throw new Error("No shareable URI for " + fileName);
        return plugins.share.share({
          title: title,
          dialogTitle: title,
          url: file.uri
        });
      });
  }

  function exportFile(fileName, content, mime, title) {
    var pending = nativeExport(fileName, content, title);
    if (!pending) {
      if (download(fileName, content, mime)) toast(t("ledger.exported", { file: fileName }));
      else toast(t("ledger.exportFailed"));
      return;
    }
    pending
      .then(function () {
        toast(t("ledger.exported", { file: fileName }));
      })
      .catch(function (err) {
        // Never fail silently inside the Android WebView.
        console.error("ShiftVault: native export failed", err);
        toast(t("ledger.exportFailed"));
      });
  }

  function csvCell(value) {
    var text = String(value === null || value === undefined ? "" : value);
    if (/[",\r\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  function exportCsv() {
    var state = store.get();
    var code = state.settings.currency;
    var rows = [["Date", "Type", "Account", "Note", "Hours", "Amount", "Currency"]];
    state.transactions
      .slice()
      .sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
      })
      .forEach(function (tx) {
        var account = accountById(tx.accountId);
        rows.push([
          tx.date,
          tx.type,
          account ? account.name : "",
          tx.note,
          tx.source === "shift" ? money.formatHours(tx.hours) : "",
          money.toDisplay(tx.amount, code).toFixed(money.decimals(code)),
          code
        ]);
      });
    var csv = "\uFEFF" + rows.map(function (row) {
      return row.map(csvCell).join(",");
    }).join("\r\n");
    exportFile("shiftvault-ledger.csv", csv, "text/csv;charset=utf-8", "ShiftVault \u00b7 " + t("ledger.exportCsv"));
  }

  function exportJson() {
    exportFile(
      "shiftvault-backup-" + todayISO() + ".json",
      JSON.stringify(store.get(), null, 2),
      "application/json;charset=utf-8",
      "ShiftVault \u00b7 " + t("ledger.exportJson")
    );
  }

  /* ------------------------------------------------------------------ actions */

  function setTheme(theme) {
    store.setSetting("theme", theme === "light" ? "light" : "dark");
    applyTheme(theme);
  }

  function setEntryType(type) {
    ui.entryType = type === "income" ? "income" : "expense";
    var hidden = document.getElementById("entry-type");
    if (hidden) hidden.value = ui.entryType;
    var buttons = document.querySelectorAll('[data-action="set-entry-type"]');
    for (var i = 0; i < buttons.length; i++) {
      var button = buttons[i];
      var isActive = button.getAttribute("data-value") === ui.entryType;
      button.classList.toggle("active", isActive);
      button.classList.toggle("income", isActive && ui.entryType === "income");
      button.classList.toggle("expense", isActive && ui.entryType === "expense");
    }
  }

  function deleteAccount(id) {
    var account = accountById(id);
    if (!account) return;
    confirmDialog(t("accounts.deleteTitle"), t("accounts.deleteBody"), t("common.delete")).then(function (ok) {
      if (!ok) return;
      store.removeAccount(id);
      toast(t("accounts.deleted"));
    });
  }

  function completeGoalAction(id) {
    var goal = store.get().goals.find(function (item) {
      return item.id === id;
    });
    if (!goal) return;
    if (!accountById(goal.accountId)) {
      toast(t("goals.spendNoAccount"));
      return;
    }
    spendGoalDialog(goal).then(function (ok) {
      if (!ok) return;
      var tx = store.completeGoal(goal.id, t("goals.spendNote", { name: goal.name }));
      if (!tx) {
        toast(t("goals.spendNoAccount"));
        return;
      }
      haptic("MEDIUM");
      toast(t("goals.spendDone", { amount: money.format(tx.amount) }));
    });
  }

  function editGoalAction(id) {
    var goal = store.get().goals.find(function (item) {
      return item.id === id;
    });
    if (!goal) return;
    goalEditDialog(goal).then(function (result) {
      if (!result) return;
      var name = String(result.name || "").trim();
      if (!name) {
        toast(t("accounts.nameRequired"));
        return;
      }
      var target = num(result.target);
      if (!(target > 0)) {
        toast(t("goals.invalidTarget"));
        return;
      }
      if (!result.accountId) {
        toast(t("goals.accountRequired"));
        return;
      }
      if (store.updateGoal(goal.id, { name: name, target: money.toEur(target), accountId: String(result.accountId) })) {
        toast(t("goals.updated"));
      }
    });
  }

  function deleteGoal(id) {
    confirmDialog(t("goals.deleteTitle"), t("goals.deleteBody"), t("common.delete")).then(function (ok) {
      if (!ok) return;
      store.removeGoal(id);
      toast(t("goals.deleted"));
    });
  }

  function confirmReset() {
    confirmDialog(t("options.resetTitle"), t("options.resetBody"), t("options.reset")).then(function (ok) {
      if (!ok) return;
      store.reset();
      applyTheme(settings().theme);
      SV.i18n.setLang(settings().lang);
      SV.icon.apply(settings().icon);
      applyNativeIcon(settings().icon);
      toast(t("options.resetDone"));
    });
  }

  function refreshFx() {
    SV.fx.refresh(true).then(function () {
      renderView();
    });
  }

  function updateShiftPreview() {
    var input = document.getElementById("shift-hours");
    var out = document.getElementById("shift-earnings");
    if (!input || !out) return;
    var hours = num(input.value);
    if (hours < 0) hours = 0;
    out.textContent = money.format(hours * settings().hourlyRate);
  }

  function focusField(selector) {
    var el = document.querySelector(selector);
    if (el && typeof el.focus === "function") el.focus();
  }

  /* ------------------------------------------------------------------ events */

  function onClick(event) {
    var actionEl = event.target.closest ? event.target.closest("[data-action]") : null;

    if (!actionEl) {
      if (event.target.hasAttribute && event.target.hasAttribute("data-overlay")) closeModal(false);
      return;
    }

    var action = actionEl.getAttribute("data-action");
    var value = actionEl.getAttribute("data-value");
    var id = actionEl.getAttribute("data-id");

    switch (action) {
      case "go-tab":
        haptic("LIGHT");
        navigate(actionEl.getAttribute("data-tab"));
        break;
      case "toggle-theme":
        setTheme(settings().theme === "dark" ? "light" : "dark");
        break;
      case "set-theme":
        setTheme(value);
        break;
      case "toggle-account-form":
        ui.accountForm = !ui.accountForm;
        renderView();
        if (ui.accountForm) focusField('form[data-form="account"] input[name="name"]');
        break;
      case "cancel-account-form":
        ui.accountForm = false;
        renderView();
        break;
      case "toggle-goal-form":
        ui.goalForm = !ui.goalForm;
        renderView();
        if (ui.goalForm) focusField('form[data-form="goal"] input[name="name"]');
        break;
      case "cancel-goal-form":
        ui.goalForm = false;
        renderView();
        break;
      case "delete-account":
        deleteAccount(id);
        break;
      case "delete-goal":
        deleteGoal(id);
        break;
      case "complete-goal":
        completeGoalAction(id);
        break;
      case "edit-goal":
        editGoalAction(id);
        break;
      case "delete-entry":
        if (store.removeTransaction(id)) toast(t("ledger.deleted"));
        break;
      case "set-entry-type":
        setEntryType(value);
        break;
      case "export-csv":
        exportCsv();
        break;
      case "export-json":
        exportJson();
        break;
      case "refresh-fx":
        refreshFx();
        break;
      case "set-icon":
        store.setSetting("icon", value === "light" ? "light" : "dark");
        SV.icon.apply(settings().icon);
        applyNativeIcon(settings().icon);
        toast(t("options.iconApplied"));
        break;
      case "download-icon":
        SV.icon.download(settings().icon);
        break;
      case "tutorial-open":
        openTutorial(0);
        break;
      case "tutorial-back":
        ui.tutorialStep = Math.max(0, ui.tutorialStep - 1);
        renderTutorial();
        break;
      case "tutorial-next":
        ui.tutorialStep = Math.min(2, ui.tutorialStep + 1);
        renderTutorial();
        break;
      case "tutorial-done":
        finishTutorial();
        break;
      case "tutorial-skip":
        finishTutorial();
        break;
      case "welcome-dismiss":
        store.setSetting("welcomeDismissed", true);
        renderBanner();
        break;
      case "reset-data":
        confirmReset();
        break;
      case "modal-confirm":
        closeModal(true);
        break;
      case "modal-spend-confirm":
        closeModal(true);
        break;
      case "modal-goal-save":
        var editName = document.getElementById("goal-edit-name");
        var editTarget = document.getElementById("goal-edit-target");
        var editAccount = document.getElementById("goal-edit-account");
        closeModal({
          name: editName ? editName.value : "",
          target: editTarget ? editTarget.value : "",
          accountId: editAccount ? editAccount.value : ""
        });
        break;
      case "modal-cancel":
      case "close-modal":
        closeModal(false);
        break;
      default:
        break;
    }
  }

  function onSubmit(event) {
    var form = event.target.closest ? event.target.closest("form[data-form]") : null;
    if (!form) return;
    event.preventDefault();
    var kind = form.getAttribute("data-form");

    if (kind === "account") {
      var accountData = new FormData(form);
      var name = String(accountData.get("name") || "").trim();
      if (!name) {
        toast(t("accounts.nameRequired"));
        return;
      }
      var starting = num(accountData.get("balance"));
      store.addAccount({ name: name, balance: money.toEur(starting) });
      ui.accountForm = false;
      toast(t("accounts.added"));
      return;
    }

    if (kind === "shift") {
      var shiftData = new FormData(form);
      var hours = num(shiftData.get("hours"));
      var rate = settings().hourlyRate;
      if (!(hours > 0)) {
        toast(t("track.invalidHours"));
        return;
      }
      if (!(rate > 0)) {
        toast(t("track.noRateTitle"));
        return;
      }
      var shift = store.addShift({
        accountId: String(shiftData.get("accountId") || ""),
        hours: hours,
        rate: rate,
        date: todayISO(),
        note: t("track.shiftNote", { hours: money.formatHours(hours) })
      });
      if (shift) {
        haptic("MEDIUM");
        toast(t("track.success"));
      }
      return;
    }

    if (kind === "entry") {
      var entryData = new FormData(form);
      var amount = num(entryData.get("amount"));
      if (!(amount > 0)) {
        toast(t("ledger.invalidAmount"));
        return;
      }
      var entry = store.addTransaction({
        accountId: String(entryData.get("accountId") || ""),
        type: ui.entryType,
        amount: money.toEur(amount),
        note: String(entryData.get("note") || ""),
        date: String(entryData.get("date") || todayISO())
      });
      if (entry) {
        haptic("MEDIUM");
        toast(t("ledger.added"));
      }
      return;
    }

    if (kind === "goal") {
      var goalData = new FormData(form);
      var goalName = String(goalData.get("name") || "").trim();
      var target = num(goalData.get("target"));
      if (!goalName) {
        toast(t("accounts.nameRequired"));
        return;
      }
      if (!(target > 0)) {
        toast(t("goals.invalidTarget"));
        return;
      }
      var goalAccountId = String(goalData.get("accountId") || "");
      if (!goalAccountId) {
        toast(t("goals.accountRequired"));
        return;
      }
      var goal = store.addGoal({
        name: goalName,
        target: money.toEur(target),
        saved: money.toEur(num(goalData.get("saved"))),
        accountId: goalAccountId
      });
      if (goal) {
        ui.goalForm = false;
        toast(t("goals.added"));
      } else {
        toast(t("goals.accountRequired"));
      }
      return;
    }

    if (kind === "goal-update") {
      var savedValue = num(new FormData(form).get("saved"));
      var goalId = form.getAttribute("data-id");
      if (store.setGoalSaved(goalId, money.toEur(Math.max(0, savedValue)))) {
        toast(t("goals.updated"));
      }
    }
  }

  function onChange(event) {
    var el = event.target.closest ? event.target.closest("[data-setting]") : null;
    if (!el) return;
    var key = el.getAttribute("data-setting");

    if (key === "lang") {
      var lang = el.value;
      SV.i18n.setLang(lang);
      store.setSetting("lang", lang);
      return;
    }

    if (key === "currency") {
      store.setSetting("currency", el.value);
      return;
    }

    if (key === "hourlyRate") {
      var value = num(el.value);
      if (value < 0) value = 0;
      store.setHourlyRate(money.toEur(value));
    }
  }

  function onInput(event) {
    if (event.target && event.target.id === "shift-hours") updateShiftPreview();
  }

  function onKeydown(event) {
    if (event.key === "Escape") {
      var root = document.getElementById("modal-root");
      if (root && root.innerHTML.trim()) closeModal(false);
    }
  }

  function onHashChange() {
    renderTabs();
    renderView();
    window.scrollTo({ top: 0 });
  }

  /* ------------------------------------------------------------------ boot */

  function init() {
    SV.i18n.setLang(settings().lang);
    applyTheme(settings().theme);
    SV.icon.apply(settings().icon);
    applyNativeIcon(settings().icon);
    setupNativeShell();

    var view = document.getElementById("view");
    if (view) view.innerHTML = "";

    renderAll();

    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
    document.addEventListener("change", onChange);
    document.addEventListener("input", onInput);
    document.addEventListener("keydown", onKeydown);
    window.addEventListener("hashchange", onHashChange);

    store.subscribe(function () {
      renderAll();
    });

    SV.fx.subscribe(function () {
      renderView();
      renderHeader();
    });

    if (!location.hash) {
      try {
        history.replaceState(null, "", "#overview");
      } catch (err) {
        /* some browsers reject history writes on file:// */
      }
    }

    SV.fx.init();

    var hoursInput = document.getElementById("shift-hours");
    if (hoursInput) hoursInput.focus();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
