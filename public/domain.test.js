import { describe, expect, it } from "vitest";
import {
  calculateTotals,
  cardSearchScore,
  editDistance,
  normalizeSearch,
} from "./domain.js";

describe("Bestandssuche", () => {
  const card = {
    name: "Glurak ex",
    set_name: "Obsidianflammen",
    card_number: "207",
    location: "Box A",
  };

  it("normalisiert Umlaute und Sonderzeichen", () => {
    expect(normalizeSearch("  Pokémon – Ära ")).toBe("pokemon ara");
  });

  it("findet Karten trotz eines kleinen Tippfehlers", () => {
    expect(cardSearchScore(card, "Glurack")).toBeGreaterThan(0);
  });

  it("verwirft deutlich unpassende Suchbegriffe", () => {
    expect(cardSearchScore(card, "Pikachu")).toBe(0);
  });

  it("berechnet den Zeichenabstand korrekt", () => {
    expect(editDistance("karte", "karten")).toBe(1);
  });
});

describe("Finanzauswertung", () => {
  it("ignoriert stornierte Vorgänge und berücksichtigt Gebühren sowie Versand", () => {
    const totals = calculateTotals([
      {
        kind: "sale",
        amount: 30,
        shipping_charged: 2,
        fees: 1.5,
        shipping_cost: 1,
      },
      { kind: "purchase", amount: 10, fees: 0.5, shipping_cost: 1 },
      { kind: "expense", amount: 2, fees: 0, shipping_cost: 0 },
      { kind: "purchase", amount: 999, voided_at: "2026-08-10T12:00:00Z" },
    ]);

    expect(totals).toEqual({
      revenue: 32,
      costs: 16,
      profit: 16,
      saleCount: 1,
    });
  });
});
