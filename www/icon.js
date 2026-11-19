/* ShiftVault — canvas bank-vault icon generator (Dark Vault / Light Vault) */
(function () {
  "use strict";

  var VARIANTS = {
    dark: {
      bg: "#08080A",
      plate: "#101014",
      ink: "#EDEDF2",
      ring: "#3C3C46",
      accent: "#10B981"
    },
    light: {
      bg: "#FFFFFF",
      plate: "#F5F5F7",
      ink: "#0B0B0F",
      ring: "#C6C6D0",
      accent: "#10B981"
    }
  };

  var cache = {};

  function roundRect(ctx, x, y, width, height, radius) {
    var r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function draw(ctx, size, variantName) {
    var variant = VARIANTS[variantName] || VARIANTS.dark;
    var u = size / 512;
    var dialX = 198 * u;
    var dialY = 256 * u;
    var i;

    ctx.clearRect(0, 0, size, size);

    // App icon background
    roundRect(ctx, 0, 0, size, size, size * 0.22);
    ctx.fillStyle = variant.bg;
    ctx.fill();

    // Safe body
    roundRect(ctx, 84 * u, 74 * u, 344 * u, 364 * u, 26 * u);
    ctx.fillStyle = variant.plate;
    ctx.fill();
    ctx.lineWidth = 9 * u;
    ctx.strokeStyle = variant.ink;
    ctx.stroke();

    // Door seam
    roundRect(ctx, 112 * u, 102 * u, 288 * u, 308 * u, 16 * u);
    ctx.lineWidth = 4 * u;
    ctx.strokeStyle = variant.ring;
    ctx.stroke();

    // Bolts
    var bolts = [
      [132, 122],
      [380, 122],
      [132, 390],
      [380, 390]
    ];
    ctx.fillStyle = variant.ring;
    for (i = 0; i < bolts.length; i++) {
      ctx.beginPath();
      ctx.arc(bolts[i][0] * u, bolts[i][1] * u, 7 * u, 0, Math.PI * 2);
      ctx.fill();
    }

    // Dial
    ctx.beginPath();
    ctx.arc(dialX, dialY, 58 * u, 0, Math.PI * 2);
    ctx.lineWidth = 12 * u;
    ctx.strokeStyle = variant.ink;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(dialX, dialY, 43 * u, 0, Math.PI * 2);
    ctx.lineWidth = 4 * u;
    ctx.strokeStyle = variant.ring;
    ctx.stroke();

    ctx.strokeStyle = variant.ink;
    ctx.lineWidth = 7 * u;
    ctx.lineCap = "round";
    for (i = 0; i < 6; i++) {
      var angle = (Math.PI * i) / 3;
      ctx.beginPath();
      ctx.moveTo(dialX + Math.cos(angle) * 15 * u, dialY + Math.sin(angle) * 15 * u);
      ctx.lineTo(dialX + Math.cos(angle) * 32 * u, dialY + Math.sin(angle) * 32 * u);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(dialX, dialY, 17 * u, 0, Math.PI * 2);
    ctx.fillStyle = variant.ink;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(dialX, dialY, 5 * u, 0, Math.PI * 2);
    ctx.fillStyle = variant.bg;
    ctx.fill();

    // Spoked handle
    var handleX = 334 * u;
    var handleY = 256 * u;
    ctx.strokeStyle = variant.ink;
    ctx.lineWidth = 14 * u;
    for (i = 0; i < 3; i++) {
      var handleAngle = -Math.PI / 2 + (Math.PI * 2 * i) / 3;
      ctx.beginPath();
      ctx.moveTo(handleX + Math.cos(handleAngle) * 14 * u, handleY + Math.sin(handleAngle) * 14 * u);
      ctx.lineTo(handleX + Math.cos(handleAngle) * 56 * u, handleY + Math.sin(handleAngle) * 56 * u);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(handleX, handleY, 22 * u, 0, Math.PI * 2);
    ctx.fillStyle = variant.ink;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(handleX, handleY, 7 * u, 0, Math.PI * 2);
    ctx.fillStyle = variant.plate;
    ctx.fill();

    // Status LED
    ctx.beginPath();
    ctx.arc(380 * u, 148 * u, 10 * u, 0, Math.PI * 2);
    ctx.fillStyle = variant.accent;
    ctx.fill();
  }

  function createCanvas(size, variant) {
    var canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext("2d");
    if (ctx) draw(ctx, size, variant);
    return canvas;
  }

  function dataUrl(variant, size) {
    var key = variant + ":" + size;
    if (!cache[key]) {
      var canvas = createCanvas(size, variant);
      cache[key] = canvas.toDataURL("image/png");
    }
    return cache[key];
  }

  function apply(variant) {
    var url = dataUrl(variant === "light" ? "light" : "dark", 192);
    var favicon = document.getElementById("favicon");
    var apple = document.getElementById("apple-icon");
    if (favicon) favicon.setAttribute("href", url);
    if (apple) apple.setAttribute("href", url);
  }

  function paint(canvas) {
    var variant = canvas.getAttribute("data-icon") || "dark";
    var px = Math.round((canvas.clientWidth || 56) * (window.devicePixelRatio || 1));
    var size = Math.max(96, px);
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext("2d");
    if (ctx) draw(ctx, size, variant);
  }

  function paintAll(scope) {
    var root = scope || document;
    var canvases = root.querySelectorAll("canvas[data-icon]");
    for (var i = 0; i < canvases.length; i++) paint(canvases[i]);
  }

  function download(variant) {
    var canvas = createCanvas(1024, variant === "light" ? "light" : "dark");
    var link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = "shiftvault-icon-" + (variant === "light" ? "light" : "dark") + ".png";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  window.SV = window.SV || {};
  window.SV.icon = {
    apply: apply,
    paint: paint,
    paintAll: paintAll,
    download: download,
    dataUrl: dataUrl
  };
})();
