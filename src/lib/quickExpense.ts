import type { ExtractedTransaction, PaymentMethod } from './types';

// Deliberately a closed grammar, not a general natural-language parser.
// Anything outside one explicit amount + a known expense label goes to the model.
const categories: Record<string, string> = {
  lunch: 'food', breakfast: 'food', dinner: 'food', chai: 'food',
  coffee: 'food', snacks: 'food', tea: 'food',
  auto: 'transport', taxi: 'transport', uber: 'transport',
};

export function quickExpense(text: string, today: string, payment: PaymentMethod): ExtractedTransaction[] | null {
  const match = /^(?:(?:i\s+)?(?:just\s+)?(?:spent|paid)\s+)?([1-9]\d{0,6}(?:\.\d{1,2})?)(?:\s+rupees)?\s+(?:(?:on|for)\s+)?(lunch|breakfast|dinner|chai|coffee|snacks|tea|auto|taxi|uber)[.!]?$/i.exec(text.trim());
  if (!match) return null;
  const description = match[2].toLowerCase();
  return [{
    amount: Number(match[1]), amountProvenance: 'said',
    description, descriptionProvenance: 'said',
    category: categories[description], categoryProvenance: 'inferred',
    payee: null, payeeProvenance: 'unknown',
    paymentMethod: payment, paymentMethodProvenance: 'default',
    date: today, dateProvenance: 'default',
    time: null, timeProvenance: 'unknown',
    needsConfirmation: false, confirmationReason: null,
  }];
}
