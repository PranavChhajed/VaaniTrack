import type { Transaction } from "./types";

export type IconKind =
  | "food"
  | "drink"
  | "transport"
  | "shopping"
  | "bills"
  | "person"
  | "receipt";

/**
 * Which picture goes beside a transaction.
 *
 * Read from the description first, not the category. More than half of the
 * journal's rows have no category at all, because the extractor is told to
 * leave it blank rather than guess (PRD FR-1, FR-11), and a row list where
 * most rows share one placeholder icon is no help in finding anything.
 *
 * This is a picture, never a category. Nothing here is written back to the
 * transaction, so a wrong guess costs a slightly odd icon and no more; the
 * rule against inventing a category is about what gets recorded, and this
 * records nothing.
 *
 * Order matters: the first rule to match wins, so "lemon tea" is a drink
 * before it is food, and "car petrol expense" is transport.
 */
const RULES: [IconKind, string[]][] = [
  [
    "transport",
    ["parking", "petrol", "diesel", "fuel", "train", "metro", "bus", "cab",
     "taxi", "auto", "rickshaw", "uber", "ola", "rapido", "ticket", "toll",
     "flight", "travel", "traveling", "travelling", "driver", "puncher",
     "puncture"],
  ],
  [
    "drink",
    ["chai", "tea", "coffee", "milkshake", "shake", "juice", "lassi",
     "buttermilk", "sting", "redbull", "sprite", "coke", "pepsi", "soda",
     "water", "drink", "beer", "wine", "whiskey", "lime"],
  ],
  [
    "food",
    ["lunch", "dinner", "breakfast", "brunch", "snack", "food", "meal",
     "dosa", "idli", "biryani", "roll", "wrap", "sandwich", "pizza", "burger",
     "chinese", "restaurant", "cafe", "canteen", "mess", "ice cream",
     "icecream", "cake", "biscuit", "chocolate", "oreo", "sweet", "grocery",
     "groceries", "atta", "milk", "dahi", "curd", "vegetable", "fruit", "egg",
     "bread", "rice"],
  ],
  [
    "shopping",
    ["shopping", "clothes", "shirt", "shoes", "book", "pen", "brush",
     "speaker", "phone", "charger", "gift", "figure", "amazon", "flipkart",
     "blinkit", "zepto", "store"],
  ],
  [
    "bills",
    ["recharge", "bill", "rent", "electricity", "wifi", "internet", "data",
     "fee", "subscription", "printout", "print out", "print", "xerox", "emi",
     "insurance"],
  ],
];

const PATTERNS: [IconKind, RegExp][] = RULES.map(([kind, words]) => [
  kind,
  new RegExp(`\\b(?:${words.join("|")})(?:s|es)?\\b`, "i"),
]);

/** What the extractor's own categories map to, when the words say nothing. */
const BY_CATEGORY: Record<string, IconKind> = {
  food: "food",
  groceries: "food",
  drink: "drink",
  drinks: "drink",
  transport: "transport",
  travel: "transport",
  shopping: "shopping",
  bills: "bills",
  utilities: "bills",
};

/** The kind of thing a word or short phrase names ("lunch", "ice cream"), or null if it is not a known item. */
export function itemKind(text: string): IconKind | null {
  for (const [kind, pattern] of PATTERNS) if (pattern.test(text)) return kind;
  return null;
}

/** Like itemKind, but the whole text must be the item: "ice cream" yes, "pachhattar bill" no. */
export function itemKindWhole(text: string): IconKind | null {
  const t = text.trim();
  for (const [kind, words] of RULES) {
    if (new RegExp("^(?:" + words.join("|") + ")(?:s|es)?$", "i").test(t)) return kind;
  }
  return null;
}

export function iconFor(t: Transaction): IconKind {
  const description = t.description.value;
  if (description) {
    for (const [kind, pattern] of PATTERNS) {
      if (pattern.test(description)) return kind;
    }
  }

  const category = t.category.value?.toLowerCase();
  if (category && BY_CATEGORY[category]) return BY_CATEGORY[category];

  // Money that went to someone, with nothing said about what for.
  if (!description && t.payee.value) return "person";

  return "receipt";
}
