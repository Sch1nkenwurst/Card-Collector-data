import { createClient } from "@supabase/supabase-js";
import { calculateTotals, cardSearchScore } from "./domain.js";

const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim(),
  supabasePublishableKey =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim(),
  initialTestMode = localStorage.getItem("cardCollectorMode") === "test",
  sb =
    supabaseUrl && supabasePublishableKey
      ? createClient(supabaseUrl, supabasePublishableKey, {
          global: {
            headers: { "x-app-mode": initialTestMode ? "test" : "live" },
          },
        })
      : null;
const state = {
  user: null,
  inventory: [],
  transactions: [],
  kindFilter: "",
  currentScreen: "dashboard",
  testMode: initialTestMode,
  inventorySaleMode: false,
  inventorySaleSelection: new Set(),
};
const money = (n) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
    Number(n || 0),
  );
const dateText = (d) =>
  d ? new Intl.DateTimeFormat("de-DE").format(new Date(`${d}T12:00:00`)) : "–";
const esc = (v = "") =>
  String(v).replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        m
      ],
  );
const today = () => new Date().toISOString().slice(0, 10),
  numberOrNull = (v) => (v === "" ? null : Number(v));
function cardImageUrl(value) {
  if (!value) return "";
  try {
    const raw = String(value).replace(
        /\/(?:low|high)\.(?:webp|png|jpe?g)$/i,
        "",
      ),
      url = new URL(raw);
    return url.protocol === "https:" && url.hostname === "assets.tcgdex.net"
      ? `${raw}/low.webp`
      : "";
  } catch {
    return "";
  }
}
function cardMedia(c) {
  const image = cardImageUrl(c.image_url),
    fallback = esc((c.game || c.name || "?").slice(0, 1));
  return `<div class="card-media">${image ? `<img class="card-image" data-card-image src="${esc(image)}" alt="Kartenbild ${esc(c.name)}" loading="lazy"><span class="card-icon" hidden>${fallback}</span>` : `<span class="card-icon">${fallback}</span>`}</div>`;
}
function marketPrice(c) {
  return Number(c.market_price ?? 0);
}
function suggestedSalePrice(c) {
  return Number(c.selling_price ?? c.market_price ?? c.market_value ?? 0);
}
function marketPriceDate(c) {
  return c.market_price_updated_at
    ? new Intl.DateTimeFormat("de-DE").format(
        new Date(c.market_price_updated_at),
      )
    : "nicht aktualisiert";
}
function bindCardImageFallbacks() {
  $$("[data-card-image]").forEach(
    (img) =>
      (img.onerror = () => {
        img.hidden = true;
        const fallback = img.nextElementSibling;
        if (fallback) fallback.hidden = false;
      }),
  );
}
function setAuthStatus(t, ok = false) {
  $("#authStatus").textContent = t;
  $("#authStatus").style.color = ok ? "var(--green)" : "var(--danger)";
}
function setFormStatus(t) {
  $("#formStatus").textContent = t;
}
function setSync(t, off = false) {
  $("#syncBadge").textContent = t;
  $("#syncBadge").classList.toggle("offline", off);
}
async function initialize() {
  bindEvents();
  if (!sb)
    return setAuthStatus(
      "Die Cloud-Verbindung wird noch eingerichtet. Bitte später erneut öffnen.",
    );
  const { data } = await sb.auth.getSession();
  await applySession(data.session);
  sb.auth.onAuthStateChange((_e, s) => applySession(s));
}
async function applySession(session) {
  state.user = session?.user || null;
  $("#authView").hidden = !!state.user;
  $("#appView").hidden = !state.user;
  if (!state.user) return;
  $("#accountEmail").textContent = state.user.email || "Angemeldetes Konto";
  $("#modeBanner").hidden = !state.testMode;
  $("#testModeToggle").checked = state.testMode;
  await loadData();
}
async function loadData() {
  setSync("Synchronisiert …");
  const [cards, txs] = await Promise.all([
    sb
      .from("inventory_items")
      .select("*")
      .eq("is_test", state.testMode)
      .order("created_at", { ascending: false }),
    sb
      .from("transactions")
      .select("*")
      .eq("is_test", state.testMode)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  if (cards.error || txs.error) {
    setSync("Verbindung gestört", true);
    return;
  }
  state.inventory = cards.data || [];
  state.transactions = txs.data || [];
  setSync(state.testMode ? "Testmodus" : "Synchronisiert");
  renderAll();
}
function bindEvents() {
  $("#authModeBtn").onclick = () => {
    const signup = $("#signupForm").hidden;
    $("#signupForm").hidden = !signup;
    $("#loginForm").hidden = signup;
    $("#authModeBtn").textContent = signup
      ? "Schon registriert? Anmelden"
      : "Noch kein Zugang? Konto erstellen";
    setAuthStatus("");
  };
  $("#loginForm").onsubmit = async (e) => {
    e.preventDefault();
    setAuthStatus("Anmeldung läuft …", true);
    const { error } = await sb.auth.signInWithPassword({
      email: $("#loginEmail").value.trim(),
      password: $("#loginPassword").value,
    });
    if (error)
      setAuthStatus(
        "Anmeldung fehlgeschlagen. Bitte E-Mail und Passwort prüfen.",
      );
  };
  $("#signupForm").onsubmit = async (e) => {
    e.preventDefault();
    setAuthStatus("Konto wird erstellt …", true);
    const { data, error } = await sb.auth.signUp({
      email: $("#signupEmail").value.trim(),
      password: $("#signupPassword").value,
    });
    if (error) return setAuthStatus(error.message);
    setAuthStatus(
      data.session
        ? "Konto erstellt."
        : "Konto erstellt. Bitte bestätige die E-Mail und melde dich danach an.",
      true,
    );
  };
  $("#logoutBtn").onclick = () => sb.auth.signOut();
  $$("[data-screen]").forEach(
    (b) => (b.onclick = () => showScreen(b.dataset.screen)),
  );
  $$("[data-go]").forEach((b) => (b.onclick = () => showScreen(b.dataset.go)));
  $$("[data-action]").forEach(
    (b) =>
      (b.onclick = () =>
        b.dataset.action === "sale"
          ? openMultiSale()
          : openEntry(b.dataset.action)),
  );
  $("#dialogClose").onclick = () => $("#entryDialog").close();
  $("#entryForm").onsubmit = saveEntry;
  $("#inventorySearch").oninput = renderInventory;
  $("#inventoryGame").onchange = renderInventory;
  $("#inventorySaleSelectBtn").onclick = toggleInventorySaleMode;
  $("#inventorySaleCancel").onclick = () => setInventorySaleMode(false);
  $("#inventorySaleContinue").onclick = () =>
    openMultiSale([...state.inventorySaleSelection]);
  $("#refreshMarketPricesBtn").onclick = refreshMarketPrices;
  $$("[data-kind-filter]").forEach(
    (b) =>
      (b.onclick = () => {
        state.kindFilter = b.dataset.kindFilter;
        $$("[data-kind-filter]").forEach((x) =>
          x.classList.toggle("active", x === b),
        );
        renderTransactions();
      }),
  );
  $("#reportPeriod").onchange = renderReports;
  $("#inventoryExportBtn").onclick = exportInventory;
  $("#transactionsExportBtn").onclick = exportTransactions;
  $("#cardmarketExportBtn").onclick = exportCardmarket;
  $("#fullExportBtn").onclick = exportBackup;
  $("#testModeToggle").onchange = (e) => {
    localStorage.setItem(
      "cardCollectorMode",
      e.target.checked ? "test" : "live",
    );
    location.reload();
  };
  $("#resetTestDataBtn").onclick = resetTestData;
}
async function resetTestData() {
  if (
    !state.testMode ||
    !confirm(
      "Wirklich alle Testbestände und Testvorgänge löschen? Deine späteren Live-Daten bleiben erhalten.",
    )
  )
    return;
  $("#resetTestStatus").textContent = "Testdaten werden gelöscht …";
  const tx = await sb.from("transactions").delete().eq("is_test", true),
    cards = tx.error
      ? null
      : await sb.from("inventory_items").delete().eq("is_test", true);
  if (tx.error || cards?.error)
    return ($("#resetTestStatus").textContent = (
      tx.error || cards.error
    ).message);
  $("#resetTestStatus").textContent = "Testdaten vollständig gelöscht.";
  await loadData();
}
function showScreen(id) {
  state.currentScreen = id;
  $$(".screen").forEach((s) => s.classList.toggle("active", s.id === id));
  $$(".bottom-nav [data-screen]").forEach((b) =>
    b.classList.toggle("active", b.dataset.screen === id),
  );
  $("#pageTitle").textContent = {
    dashboard: "Übersicht",
    inventory: "Bestand",
    transactions: "Vorgänge",
    reports: "Finanzen",
    data: "Daten",
  }[id];
  scrollTo({ top: 0, behavior: "smooth" });
}
function openEntry(type, existing = null) {
  $("#entryForm").reset();
  $("#entryId").value = existing?.id || "";
  $("#entryType").value = type;
  setFormStatus("");
  const isCard = type === "card";
  $("#cardFields").hidden = !isCard;
  $("#transactionFields").hidden = isCard;
  $("#dialogTitle").textContent = isCard
    ? existing
      ? "Karte bearbeiten"
      : "Karte hinzufügen"
    : {
        purchase: "Einkauf erfassen",
        sale: "Verkauf erfassen",
        expense: "Kosten erfassen",
      }[type];
  $("#dialogEyebrow").textContent = isCard ? "WARENBESTAND" : "NEUER VORGANG";
  if (isCard && existing) fillCard(existing);
  if (!isCard) {
    $("#txDate").value = today();
    $("#txQuantity").value = 1;
    $("#txFees").value = 0;
    $("#txInventoryId").innerHTML =
      '<option value="">Keine Bestandskarte</option>' +
      state.inventory
        .map(
          (c) =>
            `<option value="${c.id}">${esc(c.name)} · ${esc(c.set_name || "ohne Set")} · ${c.quantity}×</option>`,
        )
        .join("");
    $("#amountLabel").firstChild.textContent =
      type === "sale"
        ? "Verkaufserlös €"
        : type === "purchase"
          ? "Einkaufspreis gesamt €"
          : "Kostenbetrag €";
    $("#txPlatform").value = type === "expense" ? "Sonstiges" : "Cardmarket";
  }
  $("#entryDialog").showModal();
}
function fillCard(c) {
  $("#cardGame").value = c.game;
  $("#cardLanguage").value = c.language;
  $("#cardName").value = c.name;
  $("#cardSet").value = c.set_name || "";
  $("#cardNumber").value = c.card_number || "";
  $("#cardCondition").value = c.condition;
  $("#cardVariant").value = c.variant;
  $("#cardQuantity").value = c.quantity;
  $("#cardLocation").value = c.location || "";
  $("#cardPurchasePrice").value = c.purchase_price ?? "";
  $("#cardMarketValue").value = c.market_value ?? "";
  $("#cardNotes").value = c.notes || "";
}
async function saveEntry(e) {
  e.preventDefault();
  const type = $("#entryType").value;
  setFormStatus("Wird gespeichert …");
  $("#entrySubmit").disabled = true;
  try {
    if (type === "card") await saveCard();
    else await saveTransaction(type);
    $("#entryDialog").close();
    await loadData();
  } catch (err) {
    setFormStatus(err.message || "Speichern fehlgeschlagen.");
  } finally {
    $("#entrySubmit").disabled = false;
  }
}
async function saveCard() {
  const payload = {
    user_id: state.user.id,
    game: $("#cardGame").value,
    language: $("#cardLanguage").value,
    name: $("#cardName").value.trim(),
    set_name: $("#cardSet").value.trim(),
    card_number: $("#cardNumber").value.trim(),
    condition: $("#cardCondition").value,
    variant: $("#cardVariant").value,
    quantity: Math.max(1, Number($("#cardQuantity").value || 1)),
    location: $("#cardLocation").value.trim(),
    purchase_price: numberOrNull($("#cardPurchasePrice").value),
    market_value: numberOrNull($("#cardMarketValue").value),
    notes: $("#cardNotes").value.trim(),
    updated_at: new Date().toISOString(),
  };
  const id = $("#entryId").value,
    result = id
      ? await sb.from("inventory_items").update(payload).eq("id", id)
      : await sb.from("inventory_items").insert(payload);
  if (result.error) throw result.error;
}
async function saveTransaction(type) {
  const inventoryId = $("#txInventoryId").value || null,
    quantity = Math.max(1, Number($("#txQuantity").value || 1));
  const { error } = await sb.rpc("record_transaction", {
    p_kind: type,
    p_inventory_item_id: inventoryId,
    p_description: $("#txDescription").value.trim(),
    p_transaction_date: $("#txDate").value,
    p_quantity: quantity,
    p_amount: Number($("#txAmount").value || 0),
    p_fees: Number($("#txFees").value || 0),
    p_platform: $("#txPlatform").value,
    p_notes: $("#txNotes").value.trim(),
  });
  if (error) throw error;
}
function renderAll() {
  renderDashboard();
  renderInventory();
  renderTransactions();
  renderReports();
  polishBusinessLabels();
}
function kindName(k) {
  return (
    {
      sale: "Verkauf",
      purchase: "Einkauf",
      expense: "Kosten",
      adjustment: "Bestandskorrektur",
    }[k] || k
  );
}
function purchaseHasActiveSale(purchase) {
  const card = state.inventory.find((c) => c.id === purchase.inventory_item_id);
  return !card || Number(card.quantity || 0) < Number(purchase.quantity || 0);
}
function totals(txs = state.transactions) {
  return calculateTotals(txs);
}
function renderDashboard() {
  const count = state.inventory.reduce((n, c) => n + Number(c.quantity), 0),
    value = state.inventory.reduce(
      (n, c) => n + Number(c.quantity) * marketPrice(c),
      0,
    ),
    t = totals();
  $("#kpiCards").textContent = count;
  $("#kpiPositions").textContent =
    `${state.inventory.filter((c) => c.quantity > 0).length} Positionen`;
  $("#kpiValue").textContent = money(value);
  $("#kpiRevenue").textContent = money(t.revenue);
  $("#kpiSales").textContent = `${t.saleCount} Verkäufe`;
  $("#kpiProfit").textContent = money(t.profit);
  $("#kpiProfit").className = t.profit >= 0 ? "positive" : "negative";
  const rows = state.transactions.slice(0, 5);
  $("#recentActivity").innerHTML = rows.length
    ? rows
        .map(
          (tx) =>
            `<div class="activity"><div><strong>${esc(tx.description)}</strong><span class="meta">${dateText(tx.transaction_date)} · ${kindName(tx.kind)}</span></div><strong class="${tx.kind === "sale" ? "positive" : "negative"}">${tx.kind === "sale" ? "+" : "−"}${money(tx.amount)}</strong></div>`,
        )
        .join("")
    : '<div class="empty">Noch keine Vorgänge erfasst.</div>';
}
function setInventorySaleMode(enabled) {
  state.inventorySaleMode = enabled;
  state.inventorySaleSelection.clear();
  $("#inventorySaleBar").hidden = !enabled;
  $("#inventorySaleSelectBtn").classList.toggle("active", enabled);
  $("#inventorySaleSelectBtn").textContent = enabled
    ? "Auswahl läuft"
    : "Aus Bestand verkaufen";
  renderInventory();
}
function toggleInventorySaleMode() {
  setInventorySaleMode(!state.inventorySaleMode);
}
function toggleInventorySaleCard(id) {
  if (state.inventorySaleSelection.has(id))
    state.inventorySaleSelection.delete(id);
  else state.inventorySaleSelection.add(id);
  renderInventory();
}
function updateInventorySaleBar() {
  const cards = [...state.inventorySaleSelection]
      .map((id) => state.inventory.find((c) => c.id === id))
      .filter(Boolean),
    count = cards.reduce((sum, c) => sum + 1, 0);
  $("#inventorySaleCount").textContent =
    `${count} ${count === 1 ? "Position" : "Positionen"} ausgewählt`;
  $("#inventorySaleContinue").disabled = !count;
}
function renderInventory() {
  const q = $("#inventorySearch").value,
    game = $("#inventoryGame").value,
    cards = state.inventory
      .map((c) => ({ card: c, score: cardSearchScore(c, q) }))
      .filter(
        (x) =>
          x.card.quantity > 0 && (!game || x.card.game === game) && x.score > 0,
      )
      .sort(
        (a, b) =>
          b.score - a.score || a.card.name.localeCompare(b.card.name, "de"),
      )
      .map((x) => x.card);
  $("#inventoryList").innerHTML = cards.length
    ? cards
        .map((c) => {
          const selected = state.inventorySaleSelection.has(c.id),
            price = marketPrice(c);
          return `<article class="inventory-card${state.inventorySaleMode ? " sale-selectable" : ""}${selected ? " selected-for-sale" : ""}" data-card-id="${c.id}">${state.inventorySaleMode ? `<button class="inventory-sale-check" data-inventory-sale-select="${c.id}" type="button" aria-pressed="${selected}">${selected ? "✓" : "+"}<span class="sr-only">${selected ? "Auswahl entfernen" : "Für Verkauf auswählen"}</span></button>` : ""}${cardMedia(c)}<div><strong>${esc(c.name)}</strong><div class="meta">${esc(c.set_name || "Set unbekannt")} · ${esc(c.card_number || "ohne Nummer")} · ${esc(c.language.toUpperCase())} · ${esc(c.condition)}</div><span class="qty">${c.quantity}× · ${esc(c.location || "ohne Lagerort")}</span></div><div class="value">${price ? `<span class="market-price">${money(price)}</span><div class="meta">Marktpreis / Karte</div><div class="meta">Position: ${money(price * c.quantity)}</div><div class="price-updated">Stand: ${marketPriceDate(c)}</div>` : '<span class="market-price missing">Kein Marktpreis</span><div class="meta">Bitte aktualisieren</div>'}</div></article>`;
        })
        .join("")
    : '<div class="empty">Noch keine passenden Karten im Bestand.</div>';
  bindCardImageFallbacks();
  $$("[data-inventory-sale-select]").forEach(
    (button) =>
      (button.onclick = (e) => {
        e.stopPropagation();
        toggleInventorySaleCard(button.dataset.inventorySaleSelect);
      }),
  );
  $$("[data-card-id]").forEach(
    (el) =>
      (el.onclick = () =>
        state.inventorySaleMode
          ? toggleInventorySaleCard(el.dataset.cardId)
          : openEntry(
              "card",
              state.inventory.find((c) => c.id === el.dataset.cardId),
            )),
  );
  updateInventorySaleBar();
}
function renderTransactions() {
  const rows = state.transactions.filter(
    (t) => !state.kindFilter || t.kind === state.kindFilter,
  );
  $("#transactionList").innerHTML = rows.length
    ? rows
        .map(
          (t) =>
            `<article class="transaction${t.voided_at ? " voided" : ""}"><div class="tx-icon ${t.kind}">${t.voided_at ? "×" : t.kind === "sale" ? "↑" : t.kind === "adjustment" ? "↺" : "↓"}</div><div><strong>${esc(t.description)}</strong><div class="meta">${dateText(t.transaction_date)} · ${t.voided_at ? "STORNIERT" : kindName(t.kind)} · ${esc(t.platform || "ohne Plattform")}${t.quantity > 1 ? ` · ${t.quantity}×` : ""}${t.external_reference ? ` · Ref. ${esc(t.external_reference)}` : ""}${t.void_reason ? ` · ${esc(t.void_reason)}` : ""}</div></div><div class="value amount ${t.kind}">${t.kind === "adjustment" ? `${t.quantity}× korrigiert` : `${t.kind === "sale" ? "+" : "−"}${money(t.amount)}`}${Number(t.fees) ? `<div class="meta">Gebühren ${money(t.fees)}</div>` : ""}${t.kind === "purchase" && !t.voided_at && !purchaseHasActiveSale(t) ? `<button class="void-tx" data-void-tx="${t.id}">Einkauf stornieren</button>` : ""}${t.kind === "purchase" && !t.voided_at && purchaseHasActiveSale(t) ? `<span class="tx-locked">Nicht stornierbar – bereits verkauft</span>` : ""}${t.kind === "sale" && !t.voided_at ? `<button class="void-tx" data-void-sale="${t.id}">Gesamten Verkauf stornieren</button>` : ""}</div></article>`,
        )
        .join("")
    : '<div class="empty">In dieser Ansicht gibt es noch keine Vorgänge.</div>';
  $$("[data-void-tx]").forEach(
    (b) => (b.onclick = () => voidPurchaseTransaction(b.dataset.voidTx)),
  );
  $$("[data-void-sale]").forEach(
    (b) => (b.onclick = () => voidSaleTransaction(b.dataset.voidSale)),
  );
}
async function voidPurchaseTransaction(id) {
  const tx = state.transactions.find((t) => t.id === id);
  if (!tx) return;
  if (purchaseHasActiveSale(tx))
    return alert(
      "Dieser Einkauf kann nicht storniert werden: Die dazugehörige Menge ist nicht mehr vollständig im Bestand. Storniere zuerst betroffene Verkäufe oder Bestandsbewegungen.",
    );
  if (
    !confirm(
      `Einkaufsbuchung „${tx.description}“ wirklich stornieren? Kosten und Bestand werden gemeinsam zurückgebucht.`,
    )
  )
    return;
  const reason =
      prompt("Grund der Stornierung:", "Fehlbuchung") || "Fehlbuchung",
    { error } = await sb.rpc("void_purchase_transaction", {
      p_transaction_id: id,
      p_reason: reason,
    });
  if (error) return alert(error.message);
  await loadData();
}
function periodTransactions() {
  const period = $("#reportPeriod").value,
    now = new Date();
  return state.transactions.filter((t) => {
    const d = new Date(`${t.transaction_date}T12:00:00`);
    return (
      period === "all" ||
      (period === "year" && d.getFullYear() === now.getFullYear()) ||
      (period === "month" &&
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth())
    );
  });
}
function csvDownload(filename, headers, rows) {
  const cell = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`,
    text =
      "\ufeff" +
      [headers, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
  download(filename, new Blob([text], { type: "text/csv;charset=utf-8" }));
}
function download(filename, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
// Set-Schnellerfassung und Cardmarket-Versandimport.
state.bulkCards = [];
state.importRows = [];
state.importBatch = "";
$("#bulkOpenBtn").onclick = async () => {
  $("#bulkDialog").showModal();
  if (!$("#bulkSet").dataset.loaded) await loadBulkSets();
};
$("#bulkCloseBtn").onclick = () => $("#bulkDialog").close();
$("#cardmarketImportOpen").onclick = () => {
  $("#importDate").value = today();
  $("#cardmarketImportDialog").showModal();
};
$("#cardmarketImportClose").onclick = () =>
  $("#cardmarketImportDialog").close();
$("#bulkLanguage").onchange = loadBulkSets;
$("#bulkSet").onchange = loadBulkSetCards;
$("#bulkSearch").oninput = renderBulkCards;
async function loadBulkSets() {
  const lang = $("#bulkLanguage").value;
  $("#bulkStatus").textContent = "Erweiterungen werden geladen …";
  try {
    const r = await fetch(`https://api.tcgdex.net/v2/${lang}/sets`);
    if (!r.ok) throw new Error();
    const sets = await r.json();
    $("#bulkSet").innerHTML =
      '<option value="">Erweiterung auswählen</option>' +
      sets
        .slice()
        .reverse()
        .map(
          (s) =>
            `<option value="${esc(s.id)}">${esc(s.name)} (${esc(s.id)})</option>`,
        )
        .join("");
    $("#bulkSet").dataset.loaded = "1";
    $("#bulkStatus").textContent = "";
  } catch {
    $("#bulkStatus").textContent =
      "Die Kartenliste konnte gerade nicht geladen werden.";
  }
}
async function loadBulkSetCards() {
  const id = $("#bulkSet").value,
    lang = $("#bulkLanguage").value;
  if (!id) return;
  $("#bulkStatus").textContent = "Karten der Erweiterung werden geladen …";
  try {
    const r = await fetch(
      `https://api.tcgdex.net/v2/${lang}/sets/${encodeURIComponent(id)}`,
    );
    if (!r.ok) throw new Error();
    const set = await r.json(),
      cards = set.cards || [];
    state.bulkCards = cards.map((c) => ({
      id: c.id,
      imageUrl: cardImageUrl(c.image),
      name: c.name || "Unbekannte Karte",
      number: c.localId || "",
      quantity: 0,
      condition: $("#bulkCondition").value,
      purchase: "",
      selling: "",
    }));
    $("#bulkStatus").textContent =
      `${cards.length} Karten geladen. Trage nur bei vorhandenen Karten eine Anzahl ein.`;
    renderBulkCards();
  } catch {
    $("#bulkStatus").textContent =
      "Diese Erweiterung konnte nicht geladen werden.";
  }
}
function renderBulkCards() {
  const q = $("#bulkSearch").value.toLowerCase(),
    rows = state.bulkCards.filter(
      (c) => !q || `${c.name} ${c.number}`.toLowerCase().includes(q),
    );
  $("#bulkCardList").innerHTML = state.bulkCards.length
    ? '<div class="bulk-row header"><span>Karte</span><span>Anzahl</span><span>Zustand</span><span>Einkauf €</span><span>Verkauf €</span></div>' +
      rows
        .map(
          (c) =>
            `<div class="bulk-row" data-bulk-id="${esc(c.id)}"><div class="bulk-card-name"><strong>${esc(c.name)}</strong><span>Nr. ${esc(c.number || "–")}</span></div><input data-bulk="quantity" type="number" min="0" value="${c.quantity || ""}" inputmode="numeric"><select data-bulk="condition">${["MT", "NM", "EX", "GD", "LP", "PL", "PO"].map((x) => `<option${x === c.condition ? " selected" : ""}>${x}</option>`).join("")}</select><input data-bulk="purchase" type="number" min="0" step="0.01" value="${c.purchase}" inputmode="decimal"><input data-bulk="selling" type="number" min="0" step="0.01" value="${c.selling}" inputmode="decimal"></div>`,
        )
        .join("")
    : '<div class="empty">Wähle zuerst eine Erweiterung aus.</div>';
  $$("[data-bulk-id]").forEach((row) =>
    row.querySelectorAll("[data-bulk]").forEach(
      (el) =>
        (el.oninput = () => {
          const c = state.bulkCards.find((x) => x.id === row.dataset.bulkId);
          c[el.dataset.bulk] =
            el.dataset.bulk === "quantity"
              ? Math.max(0, Number(el.value || 0))
              : el.value;
          updateBulkCount();
        }),
    ),
  );
  updateBulkCount();
}
function updateBulkCount() {
  const positions = state.bulkCards.filter((c) => c.quantity > 0),
    total = positions.reduce((n, c) => n + c.quantity, 0);
  $("#bulkSelectedCount").textContent =
    `${total} Karten · ${positions.length} Positionen`;
}
$("#applyBulkDefaults").onclick = () => {
  state.bulkCards
    .filter((c) => c.quantity > 0)
    .forEach((c) => {
      c.condition = $("#bulkCondition").value;
      if ($("#bulkPurchaseDefault").value)
        c.purchase = $("#bulkPurchaseDefault").value;
      if ($("#bulkSellDefault").value) c.selling = $("#bulkSellDefault").value;
    });
  renderBulkCards();
};
$("#bulkForm").onsubmit = async (e) => {
  e.preventDefault();
  const selected = state.bulkCards.filter((c) => c.quantity > 0);
  if (!selected.length)
    return ($("#bulkStatus").textContent =
      "Trage mindestens bei einer Karte eine Anzahl ein.");
  $("#bulkSaveBtn").disabled = true;
  $("#bulkStatus").textContent = "Karten werden gespeichert …";
  const setName = $("#bulkSet").selectedOptions[0]?.textContent || "",
    payload = selected.map((c) => ({
      user_id: state.user.id,
      game: "Pokémon",
      language: $("#bulkLanguage").value,
      name: c.name,
      set_name: setName,
      card_number: c.number,
      condition: c.condition,
      variant: "Normal",
      quantity: c.quantity,
      location: $("#bulkLocation").value.trim(),
      purchase_price: numberOrNull(c.purchase),
      selling_price: numberOrNull(c.selling),
      tcgdex_card_id: c.id,
      image_url: c.imageUrl || null,
      notes: "Set-Schnellerfassung",
      source: "set_bulk",
    }));
  const { error } = await sb.from("inventory_items").insert(payload);
  $("#bulkSaveBtn").disabled = false;
  if (error) return ($("#bulkStatus").textContent = error.message);
  $("#bulkDialog").close();
  state.bulkCards = [];
  await loadData();
};

$("#cardmarketFile").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  state.importBatch = await sha256(`${file.name}\n${text}`);
  const rows = parseDelimited(text);
  if (rows.length < 2)
    return ($("#importStatus").textContent = "Die Datei enthält keine Karten.");
  const headers = rows.shift(),
    idx = (n) => headers.indexOf(n),
    langMap = { 1: "en", 2: "fr", 3: "de", 4: "es", 5: "it" },
    conditionMap = {
      1: "MT",
      2: "NM",
      3: "EX",
      4: "GD",
      5: "LP",
      6: "PL",
      7: "PO",
    };
  state.importRows = rows
    .filter((r) => r[idx("idProduct")])
    .map((r, i) => {
      const productId = r[idx("idProduct")],
        existing = state.inventory.find(
          (c) => String(c.cardmarket_product_id || "") === productId,
        );
      return {
        row: i + 1,
        productId,
        identifier: "",
        name: existing?.name || "",
        setName: existing?.set_name || "",
        cardNumber: existing?.card_number || "",
        resolved: Boolean(existing),
        resolving: false,
        error: "",
        quantity: Math.max(1, Number(r[idx("groupCount")] || 1)),
        price: Number(String(r[idx("price")] || 0).replace(",", ".")),
        language: langMap[r[idx("idLanguage")]] || "de",
        condition: conditionMap[r[idx("condition")]] || "NM",
        variant: r[idx("isReverseHolo")]
          ? "Reverse Holo"
          : r[idx("isFoil")]
            ? "Holo"
            : r[idx("isFirstEd")]
              ? "First Edition"
              : "Normal",
      };
    });
  $("#importStatus").textContent =
    `${state.importRows.length} Positionen erkannt. Gib pro unbekannter Karte nur eine Kennung wie OBF 207 ein.`;
  renderImportPreview();
  $("#importSaveBtn").disabled = false;
};
function parseDelimited(text) {
  const lines = text
    .replace(/^\ufeff/, "")
    .split(/\r?\n/)
    .filter(Boolean);
  return lines.map((line) => {
    let out = [],
      cell = "",
      quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = !quoted;
      else if (ch === ";" && !quoted) {
        out.push(cell);
        cell = "";
      } else cell += ch;
    }
    out.push(cell);
    return out;
  });
}
async function sha256(text) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function renderImportPreview() {
  $("#importPreview").innerHTML =
    '<div class="bulk-row import-row header"><span>Produkt-ID</span><span>Kartenkennung</span><span>Erkannt</span><span>Anzahl</span><span>Preis</span><span>Sprache</span></div>' +
    state.importRows
      .map(
        (r, i) =>
          `<div class="bulk-row import-row" data-import-row="${i}"><span>#${esc(r.productId)}</span><input data-identifier value="${esc(r.identifier)}" placeholder="z. B. OBF 207"><div class="import-result ${r.resolved ? "resolved" : r.error ? "failed" : ""}">${r.resolving ? "Suche …" : r.resolved ? `<strong>${esc(r.name)}</strong><span>${esc(r.setName)} · ${esc(r.cardNumber)}</span>` : r.error ? esc(r.error) : "Kennung eingeben"}</div><strong>${r.quantity}×</strong><span>${money(r.price)}</span><span>${esc(r.language.toUpperCase())} · ${esc(r.condition)}</span></div>`,
      )
      .join("");
  $$("[data-import-row]").forEach((row) => {
    const input = row.querySelector("[data-identifier]");
    if (!input || input.disabled) return;
    let timer;
    input.oninput = () => {
      const item = state.importRows[+row.dataset.importRow];
      item.identifier = input.value.toUpperCase();
      item.resolved = false;
      item.error = "";
      clearTimeout(timer);
      timer = setTimeout(
        () => resolveImportIdentifier(+row.dataset.importRow),
        2500,
      );
    };
    input.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        clearTimeout(timer);
        resolveImportIdentifier(+row.dataset.importRow);
      }
    };
  });
}
function normalizeSetKey(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/\d+/g, (n) => String(Number(n)));
}
function setCodeValues(set) {
  const a = set?.abbreviation,
    values = [
      set?.id,
      set?.code,
      set?.ptcgoCode,
      set?.tcgOnline,
      typeof a === "string" ? a : null,
      a?.official,
      a?.unofficial,
    ];
  return values.filter(Boolean).map((v) => String(v).toUpperCase());
}
async function resolveSetCode(setCode, language) {
  const code = setCode.toUpperCase(),
    cacheKey = `cardcollector.setcodes.v4.${language}`;
  let cache = {};
  try {
    cache = JSON.parse(localStorage.getItem(cacheKey) || "{}");
  } catch {}
  try {
    const { data } = await sb
      .from("set_mappings")
      .select("printed_code,language,tcgdex_set_id,set_name")
      .eq("printed_code", code)
      .in("language", [language, "all"]);
    const central = data?.find((x) => x.language === language) || data?.[0];
    if (central?.tcgdex_set_id) {
      cache[code] = central.tcgdex_set_id;
      localStorage.setItem(cacheKey, JSON.stringify(cache));
      return central.tcgdex_set_id;
    }
  } catch {}
  if (cache[code]) return cache[code];
  const save = (id) => {
      cache[code] = id;
      localStorage.setItem(cacheKey, JSON.stringify(cache));
      return id;
    },
    languageRes = await fetch(`https://api.tcgdex.net/v2/${language}/sets`),
    englishRes =
      language === "en"
        ? languageRes
        : await fetch("https://api.tcgdex.net/v2/en/sets");
  if (!languageRes.ok || !englishRes.ok) throw new Error();
  const languageSets = await languageRes.json(),
    englishSets = language === "en" ? languageSets : await englishRes.json(),
    allSets = [...languageSets, ...englishSets],
    direct = allSets.find(
      (s) =>
        setCodeValues(s).includes(code) ||
        normalizeSetKey(s.id) === normalizeSetKey(code),
    );
  if (direct) return save(direct.id, direct.name);
  try {
    const mapRes = await fetch(
      `https://api.pokemontcg.io/v2/sets?q=ptcgoCode:${encodeURIComponent(code)}&select=id,name,ptcgoCode&pageSize=10`,
    );
    if (mapRes.ok) {
      const mapped = (await mapRes.json()).data?.[0],
        matched =
          mapped &&
          allSets.find(
            (s) =>
              normalizeSetKey(s.id) === normalizeSetKey(mapped.id) ||
              normalizeSetKey(s.name) === normalizeSetKey(mapped.name),
          );
      if (matched) return save(matched.id, matched.name || mapped.name);
    }
  } catch {}
  const unique = [...new Map(allSets.map((s) => [s.id, s])).values()];
  for (let start = 0; start < unique.length; start += 6) {
    const details = await Promise.all(
        unique.slice(start, start + 6).map(async (s) => {
          for (const lang of [...new Set([language, "en"])]) {
            try {
              const response = await fetch(
                `https://api.tcgdex.net/v2/${lang}/sets/${s.id}`,
              );
              if (response.ok) {
                const detail = await response.json();
                if (setCodeValues(detail).includes(code)) return detail;
              }
            } catch {}
          }
          return null;
        }),
      ),
      found = details.find(Boolean);
    if (found) return save(found.id, found.name);
  }
  throw new Error();
}
async function resolveImportIdentifier(index) {
  const item = state.importRows[index],
    requestedIdentifier = item.identifier,
    parts = requestedIdentifier.trim().match(/^([a-z0-9.-]+)\s+([a-z0-9-]+)$/i);
  if (!parts) {
    item.error = "Format: OBF 207";
    return renderImportPreview();
  }
  item.resolving = true;
  item.error = "";
  renderImportPreview();
  try {
    const setCode = parts[1].toUpperCase(),
      number = parts[2].split("/")[0],
      setId = await resolveSetCode(setCode, item.language),
      setRes = await fetch(
        `https://api.tcgdex.net/v2/${item.language}/sets/${setId}`,
      );
    if (!setRes.ok) throw new Error();
    const set = await setRes.json(),
      card = (set.cards || []).find(
        (c) =>
          String(c.localId).replace(/^0+/, "").toLowerCase() ===
          String(number).replace(/^0+/, "").toLowerCase(),
      );
    if (!card) throw new Error();
    const detailRes = await fetch(
        `https://api.tcgdex.net/v2/${item.language}/cards/${card.id}`,
      ),
      detail = detailRes.ok ? await detailRes.json() : card;
    if (item.identifier !== requestedIdentifier) return;
    item.name = detail.name || card.name;
    item.setName = detail.set?.name || set.name || setCode;
    item.cardNumber = detail.localId || card.localId || number;
    item.tcgdexCardId = detail.id || card.id;
    item.imageUrl = cardImageUrl(detail.image || card.image);
    item.resolved = true;
    item.error = "";
  } catch {
    item.resolved = false;
    item.error = "Nicht gefunden – Code prüfen";
  } finally {
    item.resolving = false;
    renderImportPreview();
    updateImportStatus();
  }
}
function updateImportStatus() {
  const done = state.importRows.filter((r) => r.resolved).length;
  $("#importStatus").textContent =
    `${done} von ${state.importRows.length} Positionen eindeutig erkannt.`;
}
const correctionButton = document.createElement("button");
correctionButton.id = "deleteCardBtn";
correctionButton.type = "button";
correctionButton.className = "danger";
correctionButton.textContent = "Fehlbuchung / Bestand korrigieren";
correctionButton.hidden = true;
$("#entryForm").insertBefore(correctionButton, $("#entrySubmit"));
new MutationObserver(() => {
  correctionButton.hidden = !(
    $("#entryDialog").open &&
    $("#entryType").value === "card" &&
    $("#entryId").value
  );
}).observe($("#entryDialog"), { attributes: true, attributeFilter: ["open"] });
correctionButton.onclick = () => {
  const card = state.inventory.find((c) => c.id === $("#entryId").value);
  if (!card) return;
  state.correctionCardId = card.id;
  $("#correctionTitle").textContent = `${card.name} korrigieren`;
  $("#correctionQuantity").max = card.quantity;
  $("#correctionQuantity").value = card.quantity;
  $("#correctionStatus").textContent =
    `Aktueller Bestand: ${card.quantity} Stück`;
  $("#entryDialog").close();
  $("#correctionDialog").showModal();
};
$("#correctionClose").onclick = () => $("#correctionDialog").close();
$("#correctionForm").onsubmit = async (e) => {
  e.preventDefault();
  const card = state.inventory.find((c) => c.id === state.correctionCardId),
    qty = Math.max(1, Number($("#correctionQuantity").value || 1));
  if (!card || qty > card.quantity)
    return ($("#correctionStatus").textContent =
      "Die Korrekturmenge ist größer als der vorhandene Bestand.");
  const reference = $("#correctionReference").value.trim(),
    reason = $("#correctionReason").value,
    notes = $("#correctionNotes").value.trim(),
    voidReason = [reason, notes].filter(Boolean).join(" · ");
  $("#correctionStatus").textContent =
    "Bestand und Korrekturbuchung werden gemeinsam gespeichert …";
  const { error } = await sb.rpc("correct_inventory_purchase", {
    p_inventory_item_id: card.id,
    p_quantity: qty,
    p_reason: voidReason,
    p_reference: reference,
  });
  if (error) return ($("#correctionStatus").textContent = error.message);
  $("#correctionDialog").close();
  $("#correctionForm").reset();
  await loadData();
};

state.multiSaleDraft = {};
state.multiSaleShippingManual = false;
function openMultiSale(preselectedIds = []) {
  state.multiSaleDraft = {};
  for (const id of preselectedIds) {
    const card = state.inventory.find((c) => c.id === id && c.quantity > 0);
    if (card)
      state.multiSaleDraft[id] = {
        quantity: 1,
        price: suggestedSalePrice(card),
      };
  }
  state.multiSaleShippingManual = false;
  state.inventorySaleMode = false;
  state.inventorySaleSelection.clear();
  $("#inventorySaleBar").hidden = true;
  $("#inventorySaleSelectBtn").classList.remove("active");
  $("#inventorySaleSelectBtn").textContent = "Aus Bestand verkaufen";
  $("#multiSaleDate").value = today();
  $("#multiSaleReference").value = "";
  $("#multiSalePlatform").value = "Cardmarket";
  $("#multiSaleFees").value = 0;
  $("#multiSaleShippingCharged").value = 0;
  $("#multiSaleShippingCost").value = 0;
  $("#autoFee").checked = true;
  $("#multiSaleNotes").value = "";
  $("#multiSaleSearch").value = "";
  $("#multiSaleStatus").textContent = "";
  renderMultiSale();
  $("#multiSaleDialog").showModal();
}
$$('[data-action="sale"]').forEach((b) => (b.onclick = () => openMultiSale()));
$("#multiSaleClose").onclick = () => $("#multiSaleDialog").close();
$("#multiSaleDialog").addEventListener("close", renderInventory);
$("#multiSaleSearch").oninput = renderMultiSale;
$("#multiSalePlatform").onchange = updateMultiSaleTotal;
$("#autoFee").onchange = updateMultiSaleTotal;
$("#multiSaleFees").oninput = () => {
  $("#autoFee").checked = false;
};
$("#multiSaleShippingCharged").oninput = $("#multiSaleShippingCost").oninput =
  () => {
    state.multiSaleShippingManual = true;
  };
function renderMultiSale() {
  const q = $("#multiSaleSearch").value.trim(),
    selectedIds = new Set(
      Object.entries(state.multiSaleDraft)
        .filter(([, d]) => d.quantity > 0)
        .map(([id]) => id),
    ),
    selected = state.inventory.filter(
      (c) => c.quantity > 0 && selectedIds.has(c.id),
    ),
    ranked = state.inventory
      .map((c) => ({ card: c, score: cardSearchScore(c, q) }))
      .filter(
        (x) =>
          x.card.quantity > 0 && !selectedIds.has(x.card.id) && x.score > 0,
      )
      .sort(
        (a, b) =>
          b.score - a.score || a.card.name.localeCompare(b.card.name, "de"),
      ),
    allMatches = ranked.map((x) => x.card),
    matches = allMatches.slice(0, 60),
    cards = [...selected, ...matches],
    hint = !q
      ? "Alle verfügbaren Karten werden angezeigt. Du kannst scrollen oder direkt suchen."
      : !allMatches.length && !selected.length
        ? "Keine passende Bestandskarte gefunden. Prüfe Name, Set oder Kartennummer – kleine Tippfehler werden bereits berücksichtigt."
        : allMatches.length > 60
          ? "Die besten 60 Vorschläge werden angezeigt. Mit einem genaueren Begriff grenzt du die Liste weiter ein."
          : "";
  $("#multiSaleList").innerHTML =
    '<div class="bulk-row sale-row header"><span>Karte</span><span>Bestand</span><span>Anzahl</span><span>Preis/Stück €</span><span>Summe</span></div>' +
    cards
      .map((c) => {
        const d = state.multiSaleDraft[c.id] || {
          quantity: 0,
          price: suggestedSalePrice(c),
        };
        state.multiSaleDraft[c.id] = d;
        return `<div class="bulk-row sale-row${d.quantity > 0 ? " selected-sale" : ""}" data-sale-id="${c.id}"><div class="bulk-card-name"><strong>${esc(c.name)}</strong><span>${esc(c.set_name)} · ${esc(c.card_number)} · ${esc(c.location || "ohne Lagerort")}</span></div><span>${c.quantity}×</span><input data-sale="quantity" aria-label="Anzahl ${esc(c.name)}" type="number" min="0" max="${c.quantity}" value="${d.quantity || ""}" inputmode="numeric"><input data-sale="price" aria-label="Preis ${esc(c.name)}" type="number" min="0" step="0.01" value="${d.price || ""}" inputmode="decimal"><strong data-line-total>${money(d.quantity * d.price)}</strong></div>`;
      })
      .join("") +
    (hint ? `<div class="sale-search-hint">${esc(hint)}</div>` : "");
  $$("[data-sale-id]").forEach((row) =>
    row.querySelectorAll("[data-sale]").forEach(
      (el) =>
        (el.oninput = () => {
          const d = state.multiSaleDraft[row.dataset.saleId],
            card = state.inventory.find((c) => c.id === row.dataset.saleId),
            value = Number(el.value || 0);
          if (el.dataset.sale === "quantity" && value > card.quantity) {
            d.quantity = card.quantity;
            el.value = card.quantity;
            $("#multiSaleStatus").textContent =
              `Für ${card.name} sind höchstens ${card.quantity} Stück verfügbar.`;
          } else if (!Number.isFinite(value) || value < 0) {
            d[el.dataset.sale] = 0;
            el.value = "0";
            $("#multiSaleStatus").textContent =
              "Anzahl und Preis dürfen nicht negativ sein.";
          } else {
            d[el.dataset.sale] = value;
            $("#multiSaleStatus").textContent = "";
          }
          row.classList.toggle("selected-sale", d.quantity > 0);
          row.querySelector("[data-line-total]").textContent = money(
            d.quantity * d.price,
          );
          updateMultiSaleTotal();
        }),
    ),
  );
  updateMultiSaleTotal();
}
function updateMultiSaleTotal() {
  const draft = Object.values(state.multiSaleDraft),
    sum = draft.reduce((n, d) => n + d.quantity * d.price, 0),
    cardCount = draft.reduce((n, d) => n + d.quantity, 0),
    platform = $("#multiSalePlatform").value,
    cardmarketFee = draft.reduce(
      (n, d) =>
        n +
        d.quantity * (d.price > 0 ? Math.ceil(d.price * 0.05 * 100) / 100 : 0),
      0,
    );
  if ($("#autoFee").checked)
    $("#multiSaleFees").value =
      platform === "Cardmarket" ? cardmarketFee.toFixed(2) : "0.00";
  const shipping =
    cardCount === 0
      ? { name: "Noch keine Karten ausgewählt", price: 0, note: "" }
      : cardCount <= 4
        ? {
            name: "Standardbrief Deutschland",
            price: 0.95,
            note: "bis 20 g / 0,5 cm",
          }
        : cardCount <= 16
          ? {
              name: "Kompaktbrief Deutschland",
              price: 1.1,
              note: "bis 50 g / 1 cm",
            }
          : cardCount <= 40
            ? {
                name: "Großbrief Deutschland",
                price: 1.8,
                note: "bis 500 g / 2 cm",
              }
            : {
                name: "Maxibrief Deutschland",
                price: 2.9,
                note: "bis 1.000 g / 5 cm",
              };
  if (!state.multiSaleShippingManual) {
    $("#multiSaleShippingCharged").value = shipping.price.toFixed(2);
    $("#multiSaleShippingCost").value = shipping.price.toFixed(2);
  }
  $("#shippingSuggestion").textContent =
    `${cardCount} Karte${cardCount === 1 ? "" : "n"} · ${shipping.name}${shipping.note ? ` · ${shipping.note}` : ""} · bitte Verpackung und Cardmarket-Bestellung prüfen`;
  $("#multiSaleTotal").textContent = `Artikel ${money(sum)}`;
}
$("#multiSaleForm").onsubmit = async (e) => {
  e.preventDefault();
  const lines = Object.entries(state.multiSaleDraft)
    .map(([id, d]) => ({
      card: state.inventory.find((c) => c.id === id),
      ...d,
    }))
    .filter((x) => x.card && x.quantity > 0);
  if (!lines.length)
    return ($("#multiSaleStatus").textContent =
      "Wähle mindestens eine Karte und Menge aus.");
  if (lines.some((x) => !Number.isInteger(x.quantity) || x.quantity < 1))
    return ($("#multiSaleStatus").textContent =
      "Die Anzahl muss eine ganze Zahl größer als null sein.");
  if (lines.some((x) => x.quantity > x.card.quantity))
    return ($("#multiSaleStatus").textContent =
      "Bei mindestens einer Karte ist die Menge größer als der Bestand.");
  if (lines.some((x) => !Number.isFinite(x.price) || x.price < 0))
    return ($("#multiSaleStatus").textContent =
      "Bitte prüfe die Verkaufspreise.");
  $("#multiSaleSubmit").disabled = true;
  $("#multiSaleStatus").textContent =
    "Verkauf und Bestand werden gemeinsam gebucht …";
  const payload = lines.map((x) => ({
      inventory_item_id: x.card.id,
      quantity: x.quantity,
      price: x.price,
    })),
    { error } = await sb.rpc("record_multi_sale", {
      p_lines: payload,
      p_transaction_date: $("#multiSaleDate").value,
      p_platform: $("#multiSalePlatform").value,
      p_external_reference: $("#multiSaleReference").value.trim(),
      p_fees: Number($("#multiSaleFees").value || 0),
      p_shipping_charged: Number($("#multiSaleShippingCharged").value || 0),
      p_shipping_cost: Number($("#multiSaleShippingCost").value || 0),
      p_notes: $("#multiSaleNotes").value.trim(),
    });
  $("#multiSaleSubmit").disabled = false;
  if (error) return ($("#multiSaleStatus").textContent = error.message);
  $("#multiSaleDialog").close();
  await loadData();
};

function tcgdexMarketPrice(detail) {
  const options = [
      detail?.pricing?.cardmarket,
      ...(detail?.variants_detailed || []).map((v) => v?.pricing?.cardmarket),
    ].filter(Boolean),
    priceData = options.find((p) =>
      Number.isFinite(Number(p.trend ?? p.avg7 ?? p.avg)),
    );
  if (!priceData) return null;
  return {
    price: Number(priceData.trend ?? priceData.avg7 ?? priceData.avg),
    updatedAt: priceData.updated || new Date().toISOString(),
    source: "TCGdex · Cardmarket-Trend",
  };
}
async function refreshMarketPrices() {
  const button = $("#refreshMarketPricesBtn"),
    status = $("#marketPriceStatus"),
    cards = state.inventory.filter((c) => c.quantity > 0 && c.tcgdex_card_id);
  if (!cards.length)
    return (status.textContent =
      "Für diese Karten ist noch keine TCGdex-Karten-ID hinterlegt.");
  button.disabled = true;
  status.textContent = `Marktpreise für ${cards.length} Positionen werden geladen …`;
  const updates = [],
    failed = [];
  for (let start = 0; start < cards.length; start += 4) {
    const batch = await Promise.all(
      cards.slice(start, start + 4).map(async (card) => {
        try {
          const response = await fetch(
            `https://api.tcgdex.net/v2/${encodeURIComponent(card.language || "de")}/cards/${encodeURIComponent(card.tcgdex_card_id)}`,
          );
          if (!response.ok) throw new Error();
          const price = tcgdexMarketPrice(await response.json());
          if (!price) throw new Error();
          return { id: card.id, ...price };
        } catch {
          return { id: card.id, name: card.name, error: true };
        }
      }),
    );
    batch.forEach((result) =>
      result.error ? failed.push(result) : updates.push(result),
    );
  }
  if (updates.length) {
    const { error } = await sb.rpc("update_inventory_market_prices", {
      p_prices: updates.map((x) => ({
        id: x.id,
        price: x.price,
        source: x.source,
        updated_at: x.updatedAt,
      })),
    });
    if (error) {
      button.disabled = false;
      status.textContent = error.message;
      return;
    }
  }
  await loadData();
  button.disabled = false;
  status.textContent = `${updates.length} Marktpreise aktualisiert${failed.length ? `; ${failed.length} ohne verfügbaren Preis` : ""}.`;
}

$("#cardmarketImportForm").onsubmit = async (e) => {
  e.preventDefault();
  if (!state.importRows.length) return;
  const missing = state.importRows.filter((r) => !r.resolved);
  if (missing.length)
    return ($("#importStatus").textContent =
      `Bitte noch ${missing.length} Kartenkennung${missing.length === 1 ? "" : "en"} prüfen.`);
  $("#importSaveBtn").disabled = true;
  $("#importStatus").textContent =
    "Der vollständige Einkauf wird gemeinsam gespeichert …";
  const fileName = $("#cardmarketFile").files[0]?.name || "",
    shipment = (fileName.match(/Shipment(\d+)/i) || [])[1] || "",
    location = $("#importLocation").value.trim(),
    date = $("#importDate").value || today(),
    rows = state.importRows.map((row) => {
      const known = state.inventory.find(
        (card) =>
          String(card.cardmarket_product_id || "") === String(row.productId),
      );
      return {
        language: row.language,
        name: row.name,
        set_name: row.setName,
        card_number: row.cardNumber,
        condition: row.condition,
        variant: row.variant,
        quantity: row.quantity,
        price: row.price,
        product_id: row.productId,
        tcgdex_card_id: row.tcgdexCardId || known?.tcgdex_card_id || null,
        image_url: row.imageUrl || known?.image_url || null,
        identifier: row.identifier,
      };
    });
  const { error } = await sb.rpc("record_cardmarket_purchase", {
    p_rows: rows,
    p_transaction_date: date,
    p_external_reference: shipment,
    p_location: location,
    p_import_batch: state.importBatch,
  });
  $("#importSaveBtn").disabled = false;
  if (error) return ($("#importStatus").textContent = error.message);
  $("#cardmarketImportDialog").close();
  state.importRows = [];
  await loadData();
};

// Buchhalterisch konsistente Auswertung: stornierte Buchungen bleiben sichtbar,
// werden aber in keiner Summe mehr mitgerechnet.
function renderReports() {
  const rows = periodTransactions(),
    active = rows.filter((x) => !x.voided_at),
    t = totals(active),
    purchases = active
      .filter((x) => x.kind === "purchase")
      .reduce((n, x) => n + Number(x.amount || 0), 0),
    expenses = t.costs - purchases,
    stockCards = state.inventory.filter((c) => c.quantity > 0),
    pricedCards = stockCards.filter((c) => marketPrice(c) > 0),
    hypotheticalValue = pricedCards.reduce(
      (sum, c) => sum + Number(c.quantity) * marketPrice(c),
      0,
    );
  $("#reportSummary").innerHTML = [
    ["Umsatz", t.revenue],
    ["Einkäufe", purchases],
    ["Gebühren & Kosten", expenses],
    ["Gewinn", t.profit],
    ["Hypothetischer Bestandswert", hypotheticalValue],
  ]
    .map(
      ([l, v]) =>
        `<div><span>${l}</span><strong class="${l === "Gewinn" ? (v >= 0 ? "positive" : "negative") : ""}">${money(v)}</strong></div>`,
    )
    .join("");
  $("#marketValueNote").textContent =
    `Unverbindliche Schätzung aus ${pricedCards.length} von ${stockCards.length} Bestandspositionen auf Basis der zuletzt gespeicherten Marktpreise. Kein gebuchter Gewinn.`;
  const groups = {};
  state.transactions.forEach((tx) => {
    const key = tx.transaction_date.slice(0, 7);
    (groups[key] ||= []).push(tx);
  });
  const months = Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  $("#monthlyReport").innerHTML = months.length
    ? months
        .map(([key, txs]) => {
          const m = totals(txs);
          return `<div class="month-row"><strong>${new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(new Date(`${key}-01T12:00:00`))}</strong><span>${money(m.revenue)}</span><span>${money(m.costs)}</span><span class="${m.profit >= 0 ? "positive" : "negative"}">${money(m.profit)}</span></div>`;
        })
        .join("")
    : '<div class="empty">Noch keine Finanzdaten vorhanden.</div>';
}

function exportInventory() {
  csvDownload(
    "schinkenwurst-bestand.csv",
    [
      "Spiel",
      "Name",
      "Set",
      "Kartennummer",
      "Sprache",
      "Zustand",
      "Variante",
      "Anzahl",
      "Lagerort",
      "Einkaufspreis",
      "Verkaufspreis",
      "manueller Marktwert",
      "aktueller Marktpreis",
      "Marktpreisquelle",
      "Marktpreis aktualisiert",
      "Cardmarket Produkt-ID",
      "TCGdex Karten-ID",
      "Bildadresse",
      "Notizen",
    ],
    state.inventory.map((c) => [
      c.game,
      c.name,
      c.set_name,
      c.card_number,
      c.language,
      c.condition,
      c.variant,
      c.quantity,
      c.location,
      c.purchase_price,
      c.selling_price,
      c.market_value,
      c.market_price,
      c.market_price_source,
      c.market_price_updated_at,
      c.cardmarket_product_id,
      c.tcgdex_card_id,
      c.image_url,
      c.notes,
    ]),
  );
}
function exportTransactions() {
  csvDownload(
    "schinkenwurst-vorgaenge.csv",
    [
      "Datum",
      "Art",
      "Bezeichnung",
      "Anzahl",
      "Betrag",
      "Gebühren",
      "berechneter Versand",
      "tatsächliche Versandkosten",
      "Plattform",
      "externe Referenz",
      "Vorgangsgruppe",
      "Status",
      "Stornogrund",
      "Notizen",
    ],
    state.transactions.map((t) => [
      t.transaction_date,
      kindName(t.kind),
      t.description,
      t.quantity,
      t.amount,
      t.fees,
      t.shipping_charged,
      t.shipping_cost,
      t.platform,
      t.external_reference,
      t.transaction_group,
      t.voided_at ? "storniert" : "aktiv",
      t.void_reason,
      t.notes,
    ]),
  );
}
function exportCardmarket() {
  csvDownload(
    "schinkenwurst-cardmarket-vorlage.csv",
    [
      "Name",
      "Expansion",
      "Collector Number",
      "Language",
      "Condition",
      "Amount",
      "Price",
      "Comments",
    ],
    state.inventory.map((c) => [
      c.name,
      c.set_name,
      c.card_number,
      c.language,
      c.condition,
      c.quantity,
      c.selling_price || c.market_value || "",
      c.location || "",
    ]),
  );
}
function exportBackup() {
  download(
    `schinkenwurst-sicherung-${today()}.json`,
    new Blob(
      [
        JSON.stringify(
          {
            format: "schinkenwurst-kartenlager-backup",
            version: 2,
            exportedAt: new Date().toISOString(),
            mode: state.testMode ? "test" : "live",
            account: state.user?.email || "",
            inventory: state.inventory,
            transactions: state.transactions,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    ),
  );
}

async function voidSaleTransaction(id) {
  const tx = state.transactions.find((t) => t.id === id);
  if (!tx) return;
  const sales = state.transactions.filter(
      (t) =>
        t.kind === "sale" &&
        !t.voided_at &&
        (tx.transaction_group
          ? t.transaction_group === tx.transaction_group
          : t.id === id),
    ),
    quantity = sales.reduce((n, t) => n + Number(t.quantity || 0), 0);
  if (
    !sales.length ||
    !confirm(
      `Verkauf mit ${quantity} Karte(n) wirklich stornieren? Umsatz und Bestand werden gemeinsam zurückgebucht.`,
    )
  )
    return;
  const reason =
      prompt("Grund der Stornierung:", "Fehlbuchung") || "Fehlbuchung",
    { error } = await sb.rpc("void_sale_transaction", {
      p_transaction_id: id,
      p_reason: reason,
    });
  if (error) return alert(error.message);
  await loadData();
}

function applySchinkenwurstBranding() {
  document.title = "Schinkenwurst – Kartenlager";
  const authMark = $(".brand-mark"),
    authEyebrow = $("#authView .eyebrow"),
    authTitle = $("#authView h1"),
    authText = $("#authView .muted");
  if (authMark) authMark.textContent = "SW";
  if (authEyebrow) authEyebrow.textContent = "SCHINKENWURST KARTENHANDEL";
  if (authTitle) authTitle.textContent = "Dein Kartenlager";
  if (authText)
    authText.textContent =
      "Bestand, Einkäufe, Verkäufe und Auswertungen – dein persönliches Warenwirtschaftssystem.";
  const headerInner = $(".app-header > div");
  if (headerInner) {
    headerInner.classList.add("header-brand");
    headerInner.querySelector(".eyebrow").textContent =
      "SCHINKENWURST · KARTENLAGER";
    headerInner.insertAdjacentHTML(
      "afterbegin",
      '<div class="header-monogram" aria-hidden="true">SW</div>',
    );
  }
  const welcomeTitle = $("#dashboard h2"),
    welcomeBlock = $("#dashboard .welcome > div");
  if (welcomeTitle) welcomeTitle.textContent = "Willkommen im Kartenlager";
  if (welcomeBlock) {
    const intro = document.createElement("p");
    intro.className = "section-intro";
    intro.textContent = "Bestand und Geschäftszahlen auf einen Blick.";
    welcomeBlock.appendChild(intro);
  }
  const profitCard = $("#kpiProfit")?.closest(".kpi");
  if (profitCard) {
    profitCard.querySelector("span").textContent = "Ergebnis";
    profitCard.querySelector("small").textContent =
      "Einnahmen minus erfasste Kosten";
  }
  const quickPanel = $$("#dashboard .panel").find((p) =>
    p.querySelector(".action-grid"),
  );
  if (quickPanel) {
    quickPanel.querySelector("h3").textContent = "Was möchtest du tun?";
    const grid = quickPanel.querySelector(".action-grid");
    grid.classList.add("action-grid-clean");
    const purchase = grid.querySelector('[data-action="purchase"]');
    if (purchase) purchase.remove();
    const inventory = grid.querySelector('[data-go="inventory"]');
    if (inventory) {
      inventory.innerHTML =
        '<span class="action-symbol">▣</span>Bestand verwalten';
      grid.prepend(inventory);
    }
    const sale = grid.querySelector('[data-action="sale"]');
    if (sale)
      sale.innerHTML = '<span class="action-symbol">↑</span>Verkauf erfassen';
    const expense = grid.querySelector('[data-action="expense"]');
    if (expense)
      expense.innerHTML = '<span class="action-symbol">€</span>Kosten erfassen';
  }
  const allButton = $("#dashboard [data-go='transactions']");
  if (allButton) allButton.textContent = "Alle Vorgänge";
  const dataHeading = $("#data h2");
  if (dataHeading) dataHeading.textContent = "Einstellungen";
  const version = $(".app-version");
  if (version)
    version.textContent = "Schinkenwurst Kartenlager · Version 0.11.0";
  polishBusinessLabels();
}

function polishBusinessLabels() {
  const importButton = $("#cardmarketImportOpen"),
    bulkButton = $("#bulkOpenBtn"),
    singleButton = $("#inventory [data-action='card']");
  if (importButton) importButton.textContent = "Cardmarket-Einkauf";
  if (bulkButton) bulkButton.textContent = "Mehrere Karten";
  if (singleButton) singleButton.textContent = "Einzelkarte";
  $$("#reportSummary span").forEach((label) => {
    if (label.textContent === "Gewinn") label.textContent = "Ergebnis";
  });
}

applySchinkenwurstBranding();
initialize();
