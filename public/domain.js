export function normalizeSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previous = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

export function cardSearchScore(card, query) {
  const normalizedQuery = normalizeSearch(query);
  const haystack = normalizeSearch(
    `${card.name} ${card.set_name} ${card.card_number} ${card.location}`,
  );
  if (!normalizedQuery) return 1;
  if (haystack.includes(normalizedQuery)) return 100 - normalizedQuery.length;

  const words = haystack.split(" ");
  const tokens = normalizedQuery.split(" ");
  let score = 0;
  for (const token of tokens) {
    if (words.some((word) => word.startsWith(token))) {
      score += 60;
      continue;
    }
    const tolerance = token.length >= 6 ? 2 : 1;
    const best = Math.min(...words.map((word) => editDistance(token, word)));
    if (best > tolerance) return 0;
    score += 30 - best;
  }
  return score;
}

export function calculateTotals(transactions) {
  const active = transactions.filter((transaction) => !transaction.voided_at);
  const sales = active.filter((transaction) => transaction.kind === "sale");
  const purchases = active.filter(
    (transaction) => transaction.kind === "purchase",
  );
  const expenses = active.filter(
    (transaction) => transaction.kind === "expense",
  );
  const sum = (rows, field) =>
    rows.reduce((total, row) => total + Number(row[field] || 0), 0);
  const revenue = sum(sales, "amount") + sum(sales, "shipping_charged");
  const costs =
    sum(purchases, "amount") +
    sum(purchases, "fees") +
    sum(purchases, "shipping_cost") +
    sum(expenses, "amount") +
    sum(expenses, "fees") +
    sum(expenses, "shipping_cost") +
    sum(sales, "fees") +
    sum(sales, "shipping_cost");

  return { revenue, costs, profit: revenue - costs, saleCount: sales.length };
}
