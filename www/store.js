/* ShiftVault — local state (localStorage, offline-first) */
(function () {
  "use strict";

  var KEY = "shiftvault.state.v1";
  var VERSION = 1;
  var SUPPORTED_LANGS = ["en", "de", "es", "fr", "it", "pt"];

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  function round(value) {
    var n = Number(value);
    if (!isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
  }

  function detectLang() {
    try {
      if (window.SV && SV.i18n) return SV.i18n.detect();
    } catch (err) {
      /* ignore */
    }
    return "en";
  }

  function detectTheme() {
    try {
      if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
    } catch (err) {
      /* ignore */
    }
    return "dark";
  }

  function freshState() {
    return {
      version: VERSION,
      settings: {
        lang: detectLang(),
        theme: detectTheme(),
        currency: "EUR",
        hourlyRate: 0,
        icon: "dark",
        welcomeDismissed: false,
        tutorialSeen: false
      },
      accounts: [],
      transactions: [],
      goals: [],
      fx: { base: "EUR", rates: {}, fetchedAt: 0 }
    };
  }

  function toNumber(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  function isDateString(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function sanitize(raw) {
    var state = freshState();
    if (!raw || typeof raw !== "object") return state;

    var s = raw.settings && typeof raw.settings === "object" ? raw.settings : {};
    state.settings.lang = SUPPORTED_LANGS.indexOf(s.lang) !== -1 ? s.lang : state.settings.lang;
    state.settings.theme = s.theme === "light" || s.theme === "dark" ? s.theme : state.settings.theme;
    state.settings.currency = typeof s.currency === "string" && /^[A-Z]{3}$/.test(s.currency) ? s.currency : "EUR";
    state.settings.hourlyRate = Math.max(0, round(s.hourlyRate));
    state.settings.icon = s.icon === "light" ? "light" : "dark";
    state.settings.welcomeDismissed = !!s.welcomeDismissed;
    state.settings.tutorialSeen = !!s.tutorialSeen;

    var accounts = Array.isArray(raw.accounts) ? raw.accounts : [];
    state.accounts = accounts
      .filter(function (account) {
        return account && typeof account.name === "string" && account.name.trim().length > 0;
      })
      .map(function (account) {
        return {
          id: typeof account.id === "string" && account.id ? account.id : uid(),
          name: String(account.name).slice(0, 60),
          balance: round(account.balance),
          createdAt: typeof account.createdAt === "string" ? account.createdAt : new Date().toISOString()
        };
      });

    var accountIds = state.accounts.map(function (account) {
      return account.id;
    });

    var transactions = Array.isArray(raw.transactions) ? raw.transactions : [];
    state.transactions = transactions
      .filter(function (tx) {
        return (
          tx &&
          (tx.type === "income" || tx.type === "expense") &&
          toNumber(tx.amount, 0) > 0 &&
          accountIds.indexOf(tx.accountId) !== -1
        );
      })
      .map(function (tx) {
        return {
          id: typeof tx.id === "string" && tx.id ? tx.id : uid(),
          accountId: tx.accountId,
          type: tx.type,
          amount: round(tx.amount),
          note: typeof tx.note === "string" ? tx.note.slice(0, 120) : "",
          date: isDateString(tx.date) ? tx.date : new Date().toISOString().slice(0, 10),
          createdAt: typeof tx.createdAt === "string" ? tx.createdAt : new Date().toISOString(),
          source: tx.source === "shift" ? "shift" : "manual",
          hours: Math.max(0, round(tx.hours))
        };
      });

    var goals = Array.isArray(raw.goals) ? raw.goals : [];
    state.goals = goals
      .filter(function (goal) {
        return goal && typeof goal.name === "string" && toNumber(goal.target, 0) > 0;
      })
      .map(function (goal) {
        return {
          id: typeof goal.id === "string" && goal.id ? goal.id : uid(),
          name: String(goal.name).slice(0, 60),
          target: round(goal.target),
          saved: Math.max(0, round(goal.saved)),
          createdAt: typeof goal.createdAt === "string" ? goal.createdAt : new Date().toISOString()
        };
      });

    var fx = raw.fx && typeof raw.fx === "object" ? raw.fx : {};
    state.fx = {
      base: "EUR",
      rates: fx.rates && typeof fx.rates === "object" ? fx.rates : {},
      fetchedAt: Math.max(0, toNumber(fx.fetchedAt, 0))
    };

    return state;
  }

  function load() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) return freshState();
      return sanitize(JSON.parse(raw));
    } catch (err) {
      return freshState();
    }
  }

  var state = load();
  var listeners = [];
  var saveFailed = false;

  function persist() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
      saveFailed = false;
    } catch (err) {
      if (!saveFailed) {
        saveFailed = true;
        // Storage can be unavailable (private mode, quota). Keep working in memory.
        console.warn("ShiftVault: could not persist state", err);
      }
    }
  }

  function commit() {
    persist();
    for (var i = 0; i < listeners.length; i++) {
      try {
        listeners[i](state);
      } catch (err) {
        console.error("ShiftVault listener error", err);
      }
    }
  }

  function subscribe(fn) {
    if (typeof fn !== "function") return function () {};
    listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (item) {
        return item !== fn;
      });
    };
  }

  function setting(key) {
    return state.settings[key];
  }

  function setSetting(key, value) {
    if (state.settings[key] === value) return;
    state.settings[key] = value;
    commit();
  }

  function setHourlyRate(eurPerHour) {
    var next = Math.max(0, round(eurPerHour));
    if (state.settings.hourlyRate === next) return;
    state.settings.hourlyRate = next;
    commit();
  }

  function totalLiquidity() {
    return round(
      state.accounts.reduce(function (sum, account) {
        return sum + account.balance;
      }, 0)
    );
  }

  function addAccount(input) {
    var name = String((input && input.name) || "").trim().slice(0, 60);
    if (!name) return null;
    var account = {
      id: uid(),
      name: name,
      balance: round(input.balance || 0),
      createdAt: new Date().toISOString()
    };
    state.accounts.push(account);
    commit();
    return account;
  }

  function removeAccount(id) {
    var exists = state.accounts.some(function (account) {
      return account.id === id;
    });
    if (!exists) return false;
    state.accounts = state.accounts.filter(function (account) {
      return account.id !== id;
    });
    state.transactions = state.transactions.filter(function (tx) {
      return tx.accountId !== id;
    });
    commit();
    return true;
  }

  function addTransaction(input) {
    var account = state.accounts.find(function (item) {
      return item.id === input.accountId;
    });
    if (!account) return null;
    var amount = round(input.amount);
    if (!(amount > 0)) return null;
    var type = input.type === "income" ? "income" : "expense";
    var tx = {
      id: uid(),
      accountId: account.id,
      type: type,
      amount: amount,
      note: String(input.note || "").trim().slice(0, 120),
      date: isDateString(input.date) ? input.date : new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
      source: input.source === "shift" ? "shift" : "manual",
      hours: Math.max(0, round(input.hours))
    };
    state.transactions.push(tx);
    account.balance = round(account.balance + (type === "income" ? amount : -amount));
    commit();
    return tx;
  }

  function removeTransaction(id) {
    var tx = state.transactions.find(function (item) {
      return item.id === id;
    });
    if (!tx) return false;
    var account = state.accounts.find(function (item) {
      return item.id === tx.accountId;
    });
    if (account) {
      account.balance = round(account.balance - (tx.type === "income" ? tx.amount : -tx.amount));
    }
    state.transactions = state.transactions.filter(function (item) {
      return item.id !== id;
    });
    commit();
    return true;
  }

  function addShift(input) {
    var hours = Number(input.hours);
    if (!(hours > 0)) return null;
    var amount = round(hours * Math.max(0, Number(input.rate) || 0));
    if (!(amount > 0)) return null;
    return addTransaction({
      accountId: input.accountId,
      type: "income",
      amount: amount,
      note: input.note || "",
      date: input.date,
      source: "shift",
      hours: hours
    });
  }

  function addGoal(input) {
    var name = String((input && input.name) || "").trim().slice(0, 60);
    var target = round(input && input.target);
    if (!name || !(target > 0)) return null;
    var goal = {
      id: uid(),
      name: name,
      target: target,
      saved: Math.max(0, round(input.saved || 0)),
      createdAt: new Date().toISOString()
    };
    state.goals.push(goal);
    commit();
    return goal;
  }

  function setGoalSaved(id, saved) {
    var goal = state.goals.find(function (item) {
      return item.id === id;
    });
    if (!goal) return false;
    goal.saved = Math.max(0, round(saved));
    commit();
    return true;
  }

  function removeGoal(id) {
    var before = state.goals.length;
    state.goals = state.goals.filter(function (goal) {
      return goal.id !== id;
    });
    if (state.goals.length === before) return false;
    commit();
    return true;
  }

  function setFx(payload) {
    state.fx = {
      base: "EUR",
      rates: payload && payload.rates ? payload.rates : {},
      fetchedAt: payload && payload.fetchedAt ? payload.fetchedAt : Date.now()
    };
    commit();
  }

  function reset() {
    try {
      window.localStorage.removeItem(KEY);
    } catch (err) {
      /* ignore */
    }
    state = freshState();
    commit();
  }

  window.SV = window.SV || {};
  window.SV.store = {
    get: function () {
      return state;
    },
    subscribe: subscribe,
    setting: setting,
    setSetting: setSetting,
    setHourlyRate: setHourlyRate,
    total: totalLiquidity,
    addAccount: addAccount,
    removeAccount: removeAccount,
    addTransaction: addTransaction,
    removeTransaction: removeTransaction,
    addShift: addShift,
    addGoal: addGoal,
    setGoalSaved: setGoalSaved,
    removeGoal: removeGoal,
    setFx: setFx,
    reset: reset,
    uid: uid,
    round: round
  };
})();
