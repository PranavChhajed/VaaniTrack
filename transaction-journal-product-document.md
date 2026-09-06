## 1\. Product objective

Create a chronological journal of all recorded expenses, grouped by calendar day.

The user should be able to:

1. See what they spent today.
2. Scroll back through previous days.
3. Quickly understand each transaction.
4. Open and edit an individual transaction.
5. Navigate directly to a particular date.
6. Return to today easily.

The journal should be the persistent record behind the voice-capture experience.

**Core loop:**

Speak → Transaction recorded → See it in journal → Correct if necessary

# 2\. Main screen

The main screen is the **Transaction Journal**.

### Header

Display:

**Expenses**

Then a date/navigation control showing the currently viewed period.

For example:

September 2026

There should also be a prominent:

**Today**

action whenever the user is viewing a date other than today.

## 3\. Journal layout

Transactions are grouped into sections by day.

Example:

Expenses  
<br/>September 6  
Today  
<br/>₹1,240  
5 transactions  
<br/>10:42 AM Lunch ₹250  
10:18 AM Coffee ₹120  
9:30 AM Metro ₹80  
8:45 AM Breakfast ₹180  
8:10 AM Groceries ₹610  
<br/><br/>September 5  
Yesterday  
<br/>₹1,850  
4 transactions  
<br/>9:20 PM Dinner ₹700  
6:40 PM Coffee ₹150  
3:15 PM Shopping ₹800  
10:30 AM Breakfast ₹200  
<br/><br/>September 4  
<br/>₹920  
3 transactions  
<br/>...

The exact visual design is open, but the information hierarchy should remain:

**Day → day's total → individual transactions**

The user should not have to open each transaction to understand their daily spending.

# 4\. Day section

Every day containing transactions gets its own section.

Each day should display:

### Date

Examples:

- Today
- Yesterday
- September 4
- September 3

The date should eventually use the user's locale.

### Daily total

Show the total amount spent that day.

For example:

**₹1,240**

This is simply the sum of the transactions recorded for that day.

### Transaction count

Optional but useful:

5 transactions

Do not add category breakdowns, charts, or analytics to this screen yet.

# 5\. Transaction row

Each transaction should be represented by a compact row.

Minimum information:

\[category/icon\] Lunch  
10:42 AM  
₹250

or:

Lunch ₹250  
10:42 AM · UPI

The exact design is flexible.

The row should communicate at a glance:

- description
- amount
- time, when known
- payment method
- optionally category through an icon or secondary label

### Example

🍽️ Lunch ₹250  
10:42 AM · UPI

Another:

🛒 Groceries ₹610  
8:10 AM · Cash

The amount should be visually prominent.

# 6\. Transaction row interaction

Tapping a transaction opens its detail/edit screen.

There should not be multiple complicated actions directly on the row.

The basic interaction is:

**Tap transaction → Edit transaction**

Swipe actions are unnecessary for MVP.

# 7\. Transaction detail / edit flow

The edit screen displays the complete structured transaction.

Example:

Edit expense  
<br/>Amount  
₹250  
<br/>Description  
Lunch  
<br/>Category  
Food  
<br/>Payment method  
UPI  
<br/>Date  
September 6, 2026  
<br/>Time  
10:42 AM  
<br/>Save

The user can modify any editable field.

### Editable fields

- Amount
- Description
- Category
- Payment method
- Date
- Time

### Save behavior

After saving:

1. Update the underlying transaction.
2. Return to the journal.
3. Reflect the updated information immediately.
4. If the date changed, move the transaction into the appropriate day's section.
5. Recalculate affected daily totals.

For example:

September 6 → ₹250 lunch

changed to:

September 5 → ₹300 dinner

should remove the old transaction from September 6 and place it under September 5.

# 8\. Delete transaction

The edit screen should also provide a delete action.

Because this is financial data, deletion should require confirmation.

Example:

Delete this expense?

**Cancel | Delete**

After deletion:

- remove the transaction
- recalculate the day's total
- return to the journal

No undo system is required for the first MVP unless the implementation makes it trivial.

# 9\. Date navigation

There are two different navigation needs.

### A. Sequential browsing

The user should be able to scroll naturally:

Today  
↓  
Yesterday  
↓  
September 4  
↓  
September 3  
↓  
...

The journal itself handles this.

### B. Direct date navigation

The user should be able to jump to a specific date.

A simple calendar/date picker can provide this.

For example:

September 2026  
<br/>Sun Mon Tue Wed Thu Fri Sat  
1 2 3 4 5  
6 7 8 9 10 11 12  
13 14 15 16 17 18 19  
20 21 22 23 24 25 26  
27 28 29 30

Selecting September 4 should take the user directly to the September 4 section.

The calendar does **not** need spending visualizations, heatmaps, category colors, etc.

It is primarily a navigation mechanism.

# 10\. Today behavior

Today should be the default landing point.

When the app opens:

Show today's transactions.

If there are no transactions:

Today  
<br/>No expenses recorded yet.  
<br/>🎙 Speak

The voice capture action should remain easily accessible.

If the user navigates backward:

September 4  
...

a **Today** button should become available so they can immediately return.

# 11\. Empty dates

Dates with no transactions should **not** appear as empty sections in the chronological journal.

For example, if there are transactions on:

September 6

September 4

September 1

the journal should show those transaction days rather than:

September 6  
September 5  
No expenses  
September 4  
September 3  
No expenses  
...

The date picker can still navigate to empty dates.

If the user selects an empty date:

September 5  
<br/>No expenses recorded.

with the voice capture action available.

# 12\. Transaction ordering

Within each day, transactions should be ordered chronologically.

Newest first is the most useful default:

10:42 AM Lunch ₹250  
10:18 AM Coffee ₹120  
9:30 AM Metro ₹80

If a transaction has no known transaction time, it should not be assigned a fabricated time merely to force ordering.

The system should distinguish:

- **transaction date/time**
- **recorded/created time**

This matters for voice entries such as:

"I spent ₹400 on dinner yesterday."

The transaction date is yesterday even though the user recorded it today.

# 13\. Data behavior

The journal should be backed by the same transaction object produced by the voice system.

Conceptually:

Transaction  
<br/>id  
amount  
description  
category  
payment_method  
date  
time  
created_at  
source

The journal should **not create a second representation of the financial data**.

It is a view over the transaction records.

This is important because corrections made through the journal and corrections made through voice should ultimately modify the same transaction.

# 14\. Voice → Journal interaction

When a voice transaction is successfully recorded:

User speaks  
↓  
Voice model interprets  
↓  
Transaction created  
↓  
Journal updates

Example:

"250 lunch"

Immediately produces:

Today  
<br/>10:42 AM Lunch ₹250

The user should not have to manually refresh the journal.

# 15\. MVP scope

### Must have

- Chronological transaction list
- Grouping by day
- Daily totals
- Transaction rows
- Transaction detail view
- Edit transaction
- Delete transaction
- Date picker
- Jump to today
- Correct chronological ordering
- Empty-state handling
- Automatic journal update after voice capture

### Explicitly not required

- Spending charts
- Category analytics
- Budgets
- Monthly reports
- Search
- Filters
- Recurring expenses
- Financial accounts
- Investments
- Debt tracking
- Splitwise functionality
- AI spending insights
- Complex calendar visualizations

Those can come later.

# 16\. Acceptance criteria

The MVP is successful when these scenarios work:

### Scenario 1: New transaction

User says:

"250 lunch"

The transaction appears under today's date as:

Lunch · ₹250 · UPI

### Scenario 2: Multiple transactions

User says:

"300 lunch and 150 coffee."

The journal shows:

Lunch · ₹300

Coffee · ₹150

as **two transactions** under the same day.

### Scenario 3: Historical transaction

User says:

"I spent 400 on dinner yesterday."

The transaction appears under:

Yesterday

not today.

### Scenario 4: Edit

User opens:

Lunch · ₹250

Changes amount to:

₹300

The journal immediately shows:

Lunch · ₹300

and the daily total updates.

### Scenario 5: Change date

User changes a transaction from September 6 to September 5.

The transaction moves from the September 6 section to September 5.

Both daily totals update.

### Scenario 6: Date navigation

User opens the date picker and selects September 4.

The journal navigates to September 4.

### Scenario 7: Return to today

User is viewing September 4.

They tap **Today**.

The journal returns to September 6.

## One product decision I would make here

**Do not call this a "calendar" in the core product architecture.**

It's a **transaction journal with calendar-based date navigation**.

That's a subtle but important distinction.

The user's primary task isn't:

"Look at my calendar."

It's:

**"Look at what I spent."**

The calendar is just one mechanism for navigating that history. This keeps the MVP focused and leaves you room later to discover whether users actually want a monthly calendar visualization or whether the chronological journal is sufficient.