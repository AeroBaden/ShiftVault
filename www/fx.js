/* ShiftVault — currency conversion, live Frankfurter FX and money formatting */
(function () {
  "use strict";

  var CURRENCIES = ["EUR", "USD", "GBP", "CHF", "JPY", "CAD", "AUD", "CNY", "SEK", "NOK", "PLN", "TRY"];
  var ZERO_DECIMAL = { JPY: true };
  var TTL = 12 * 60 * 60 * 1000;
  var API = "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=" + CURRENCIES.filter(function (code) {
    return code !== "EUR";
  }).join(",");

  /* Reasonable offline baseline, used until live rates arrive or when offline. */
  var FALLBACK = {
    EUR: 1,
    USD: 1.1,
    GBP: 0.84,
    CHF: 0.93,
    JPY: 176,
    CAD: 1.57,
    AUD: 1.64,
    CNY: 7.33,
    SEK: 11.15,
    NOK: 10.65,
    PLN: 4.42,
    TRY: 55.5
  };

  var status = "idle"; // idle | loading | ok | offline | error
  var listeners = [];
  var inFlight = false;
  var formatterCache = {};

  function store() {
    return window.SV.store;
  }

  function settings() {
    return store().get().settings;
  }

  function emit() {
    for (var i = 0; i < listeners.length; i++) {
      try {
        listeners[i](status);
      } catch (err) {
        console.error("ShiftVault FX listener error", err);
      }
    }
  }

  function subscribe(fn) {
    if (typeof fn === "function") listeners.push(fn);
  }

  function currency() {
    return settings().currency;
  }

  function storedRates() {
    var fx = store().get().fx;
    return fx && fx.rates && typeof fx.rates === "object" ? fx.rates : {};
  }

  function rate(code) {
    var stored = storedRates()[code];
    if (typeof stored === "number" && stored > 0) return stored;
    if (typeof FALLBACK[code] === "number") return FALLBACK[code];
    return 1;
  }

  function hasLiveRates() {
    var fx = store().get().fx;
    return !!(fx && fx.fetchedAt > 0);
  }

  function isStale() {
    var fx = store().get().fx;
    return !fx || !fx.fetchedAt || Date.now() - fx.fetchedAt > TTL;
  }

  function toDisplay(eur, code) {
    var target = code || currency();
    return (Number(eur) || 0) * rate(target);
  }

  function toEur(displayValue, code) {
    var source = code || currency();
    var value = Number(displayValue) || 0;
    var r = rate(source);
    return r > 0 ? value / r : value;
  }

  function decimals(code) {
    return ZERO_DECIMAL[code || currency()] ? 0 : 2;
  }

  function formatterFor(code) {
    var locale = window.SV.i18n ? window.SV.i18n.locale() : "en-US";
    var digits = decimals(code);
    var key = locale + "|" + code + "|" + digits;
    if (!formatterCache[key]) {
      try {
        formatterCache[key] = new Intl.NumberFormat(locale, {
          style: "currency",
          currency: code,
          minimumFractionDigits: digits,
          maximumFractionDigits: digits
        });
      } catch (err) {
        formatterCache[key] = new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "EUR",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
      }
    }
    return formatterCache[key];
  }

  function format(eur, opts) {
    var code = (opts && opts.currency) || currency();
    var value = toDisplay(eur, code);
    try {
      return formatterFor(code).format(value);
    } catch (err) {
      return value.toFixed(2) + " " + code;
    }
  }

  function formatNumber(value) {
    try {
      return new Intl.NumberFormat(window.SV.i18n ? window.SV.i18n.locale() : "en-US").format(value);
    } catch (err) {
      return String(value);
    }
  }

  function symbol(code) {
    var target = code || currency();
    try {
      var parts = new Intl.NumberFormat(window.SV.i18n ? window.SV.i18n.locale() : "en-US", {
        style: "currency",
        currency: target
      }).formatToParts(0);
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === "currency") return parts[i].value;
      }
    } catch (err) {
      /* ignore */
    }
    return target;
  }

  function currencyName(code) {
    try {
      if (typeof Intl.DisplayNames === "function") {
        var names = new Intl.DisplayNames([window.SV.i18n ? window.SV.i18n.locale() : "en"], { type: "currency" });
        var name = names.of(code);
        if (name && name !== code) return name;
      }
    } catch (err) {
      /* ignore */
    }
    return code;
  }

  function formatHours(hours) {
    var value = Number(hours) || 0;
    return String(Math.round(value * 100) / 100);
  }

  function formatDate(isoDate, style) {
    if (!isoDate) return "";
    var date = new Date(isoDate + "T00:00:00");
    if (isNaN(date.getTime())) return isoDate;
    try {
      return new Intl.DateTimeFormat(window.SV.i18n ? window.SV.i18n.locale() : "en-US", style || {
        year: "numeric",
        month: "short",
        day: "2-digit"
      }).format(date);
    } catch (err) {
      return isoDate;
    }
  }

  function formatTimestamp(ts) {
    if (!ts) return "";
    try {
      return new Intl.DateTimeFormat(window.SV.i18n ? window.SV.i18n.locale() : "en-US", {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(new Date(ts));
    } catch (err) {
      return new Date(ts).toLocaleString();
    }
  }

  function refresh(force) {
    if (inFlight) return Promise.resolve(null);
    if (!force && !isStale()) {
      status = navigator.onLine === false ? "offline" : "ok";
      emit();
      return Promise.resolve(storedRates());
    }

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      status = "offline";
      emit();
      return Promise.resolve(null);
    }

    inFlight = true;
    status = "loading";
    emit();

    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = setTimeout(function () {
      if (controller) controller.abort();
    }, 9000);

    return fetch(API, { cache: "no-store", signal: controller ? controller.signal : undefined })
      .then(function (response) {
        if (!response.ok) throw new Error("FX HTTP " + response.status);
        return response.json();
      })
      .then(function (payload) {
        if (!payload || !payload.rates || typeof payload.rates !== "object") throw new Error("FX payload");
        var rates = { EUR: 1 };
        CURRENCIES.forEach(function (code) {
          if (code === "EUR") return;
          var value = payload.rates[code];
          if (typeof value === "number" && value > 0) rates[code] = value;
        });
        store().setFx({ base: "EUR", rates: rates, fetchedAt: Date.now() });
        status = "ok";
        inFlight = false;
        clearTimeout(timer);
        emit();
        return rates;
      })
      .catch(function (err) {
        inFlight = false;
        clearTimeout(timer);
        status = navigator.onLine === false ? "offline" : "error";
        emit();
        if (window.console) console.warn("ShiftVault: exchange rates unavailable", err && err.message);
        return null;
      });
  }

  function init() {
    window.addEventListener("online", function () {
      refresh(false);
    });
    window.addEventListener("offline", function () {
      status = "offline";
      emit();
    });
    if (isStale()) refresh(false);
    else status = "ok";
  }

  window.SV = window.SV || {};
  window.SV.money = {
    currencies: CURRENCIES,
    rate: rate,
    toDisplay: toDisplay,
    toEur: toEur,
    decimals: decimals,
    format: format,
    formatNumber: formatNumber,
    formatHours: formatHours,
    formatDate: formatDate,
    formatTimestamp: formatTimestamp,
    symbol: symbol,
    currencyName: currencyName,
    currency: currency,
    hasLiveRates: hasLiveRates
  };
  window.SV.fx = {
    init: init,
    refresh: refresh,
    subscribe: subscribe,
    status: function () {
      return status;
    },
    isStale: isStale,
    hasLiveRates: hasLiveRates
  };
})();
