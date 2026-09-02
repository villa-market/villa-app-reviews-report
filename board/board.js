(function () {
  "use strict";

  const state = {
    reviews: [],
    meta: null,
    platform: "all",
    country: "all",
    stars: "all",
    needReplyOnly: false,
    search: "",
  };

  const $ = (sel) => document.querySelector(sel);
  const el = {
    kpis: $("#kpis"),
    countryChips: $("#countryChips"),
    tableBody: $("#tableBody"),
    cardList: $("#cardList"),
    resultCount: $("#resultCount"),
    status: $("#status"),
    generatedChip: $("#generatedChip"),
    needReplyOnly: $("#needReplyOnly"),
    search: $("#search"),
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDate(iso) {
    if (!iso) return "—";
    const d = String(iso).slice(0, 10);
    return d;
  }

  function formatGenerated(iso) {
    if (!iso) return "—";
    // Show Bangkok-friendly short form if +07 present
    try {
      const d = new Date(iso);
      if (!isNaN(d)) {
        return d.toLocaleString("en-GB", {
          timeZone: "Asia/Bangkok",
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }) + " ICT";
      }
    } catch (_) {}
    return String(iso).slice(0, 16);
  }

  function renderKpis() {
    const t = (state.meta && state.meta.totals) || {};
    const delta = (state.meta && state.meta.delta_vs_prev) || null;
    const deltaLabel = delta
      ? (delta.written === 0 ? "Flat vs prev" : (delta.written > 0 ? "+" : "") + delta.written + " vs prev")
      : "—";
    el.kpis.innerHTML = [
      kpi(t.written ?? "—", "Written", `iOS ${t.ios ?? 0} · Android ${t.android ?? 0}`),
      kpi(t.ios ?? "—", "iOS", "App Store"),
      kpi(t.android ?? "—", "Android", "Play Store"),
      kpi(t.need_reply ?? "—", "Need reply", "Curated backlog", true),
      kpi(t.with_reply ?? "—", "With reply", deltaLabel, t.with_reply === 0),
    ].join("");
  }

  function kpi(n, label, sub, warn) {
    return `<div class="kpi${warn ? " warn" : ""}"><div class="bn">${esc(n)}</div><div class="kl">${esc(label)}</div><div class="ks">${esc(sub)}</div></div>`;
  }

  function renderCountryChips() {
    const countries = (state.meta && state.meta.countries) || [];
    const parts = [
      `<button type="button" class="chip${state.country === "all" ? " active" : ""}" data-country="all">All countries</button>`,
    ];
    for (const c of countries) {
      const code = c.code;
      const active = state.country === code ? " active" : "";
      parts.push(
        `<button type="button" class="chip${active}" data-country="${esc(code)}">${esc(code)}<span class="cnt">${esc(c.count)}</span></button>`
      );
    }
    el.countryChips.innerHTML = parts.join("");
  }

  function filtered() {
    const q = state.search.trim().toLowerCase();
    return state.reviews.filter((r) => {
      if (state.platform !== "all" && r.platform !== state.platform) return false;
      if (state.country !== "all") {
        const cs = r.countries || [];
        if (!cs.includes(state.country)) return false;
      }
      if (state.stars !== "all" && Number(r.stars) !== Number(state.stars)) return false;
      if (state.needReplyOnly && !r.need_reply) return false;
      if (q) {
        const hay = [r.author, r.title, r.body, (r.countries || []).join(" "), r.platform]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function replyPill(r) {
    if (r.need_reply) return `<span class="pill need">Need reply</span>`;
    if (r.has_developer_reply) return `<span class="pill ok">Replied</span>`;
    return `<span class="pill ok">${esc(r.reply_status || "—")}</span>`;
  }

  function countryHtml(r) {
    return (r.countries || []).map((c) => `<span class="ccode">${esc(c)}</span>`).join("") || "—";
  }

  function platformPill(r) {
    const p = r.platform === "ios" ? "ios" : "android";
    const label = p === "ios" ? "iOS" : "Android";
    return `<span class="pill ${p}">${label}</span>`;
  }

  function renderList() {
    const rows = filtered();
    el.resultCount.textContent = String(rows.length);

    // Sort: need_reply first, then date desc
    rows.sort((a, b) => {
      if (!!b.need_reply - !!a.need_reply) return (!!b.need_reply) - (!!a.need_reply);
      return String(b.date).localeCompare(String(a.date));
    });

    el.tableBody.innerHTML = rows
      .map((r) => {
        const title = r.title ? `<div class="title">${esc(r.title)}</div>` : "";
        return `<tr class="${r.need_reply ? "need" : ""}">
          <td class="star">${esc(r.stars)}★</td>
          <td><div class="author">${esc(r.author || "—")}</div></td>
          <td>${platformPill(r)}</td>
          <td>${countryHtml(r)}</td>
          <td class="nowrap">${esc(formatDate(r.date))}</td>
          <td>${title}<div class="body">${esc(r.body || "")}</div></td>
          <td>${replyPill(r)}</td>
        </tr>`;
      })
      .join("");

    el.cardList.innerHTML = rows
      .map((r) => {
        const title = r.title ? `<div class="title">${esc(r.title)}</div>` : "";
        return `<article class="rcard${r.need_reply ? " need" : ""}">
          <div class="rcard-top">
            <span class="star">${esc(r.stars)}★</span>
            ${platformPill(r)}
            ${replyPill(r)}
          </div>
          <div class="author">${esc(r.author || "—")}</div>
          ${title}
          <div class="body">${esc(r.body || "")}</div>
          <div class="rcard-foot">
            <span>${esc(formatDate(r.date))}</span>
            <span>${countryHtml(r)}</span>
          </div>
        </article>`;
      })
      .join("");
  }

  function bindFilters() {
    document.querySelectorAll("[data-platform]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.platform = btn.getAttribute("data-platform");
        document.querySelectorAll("[data-platform]").forEach((b) => b.classList.toggle("active", b === btn));
        renderList();
      });
    });
    document.querySelectorAll("[data-stars]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.stars = btn.getAttribute("data-stars");
        document.querySelectorAll("[data-stars]").forEach((b) => b.classList.toggle("active", b === btn));
        renderList();
      });
    });
    el.countryChips.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-country]");
      if (!btn) return;
      state.country = btn.getAttribute("data-country");
      renderCountryChips();
      renderList();
    });
    el.needReplyOnly.addEventListener("change", () => {
      state.needReplyOnly = el.needReplyOnly.checked;
      renderList();
    });
    let t = null;
    el.search.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        state.search = el.search.value;
        renderList();
      }, 120);
    });
  }

  async function load() {
    try {
      const res = await fetch("data/reviews.json", { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      state.meta = data.meta || {};
      state.reviews = data.reviews || [];
      el.generatedChip.textContent = formatGenerated(state.meta.generated_at);
      renderKpis();
      renderCountryChips();
      renderList();
      el.status.hidden = true;
    } catch (err) {
      el.status.hidden = false;
      el.status.textContent = "Could not load data/reviews.json — " + (err && err.message ? err.message : err);
      renderKpis();
    }
  }

  bindFilters();
  load();
})();
