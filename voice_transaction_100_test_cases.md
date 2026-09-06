## 1\. Basic natural speech

| #UtteranceExpected structured output |                             |                                             |
| ------------------------------------ | --------------------------- | ------------------------------------------- |
| 1                                    | "250 lunch"                 | ₹250, lunch, food, UPI, today               |
| 2                                    | "120 chai"                  | ₹120, chai, food/beverage, UPI, today       |
| 3                                    | "I spent 500 on dinner"     | ₹500, dinner, food, UPI, today              |
| 4                                    | "Paid 300 for groceries"    | ₹300, groceries, food/groceries, UPI, today |
| 5                                    | "I bought a coffee for 180" | ₹180, coffee, food/beverage, UPI, today     |
| 6                                    | "Spent 70 on snacks"        | ₹70, snacks, food, UPI, today               |
| 7                                    | "Got a dosa for 150"        | ₹150, dosa, food, UPI, today                |
| 8                                    | "I just spent 450 on lunch" | ₹450, lunch, food, UPI, today               |
| 9                                    | "Lunch was 280"             | ₹280, lunch, food, UPI, today               |
| 10                                   | "Just paid 90 for coffee"   | ₹90, coffee, food/beverage, UPI, today      |

## 2\. Conversational / messy speech

| #UtteranceExpected structured output |                                         |                                             |
| ------------------------------------ | --------------------------------------- | ------------------------------------------- |
| 11                                   | "Uh, I spent like 250 on lunch"         | ₹250, lunch, food, UPI, today               |
| 12                                   | "Yeah, just got lunch, it was 320"      | ₹320, lunch, food, UPI, today               |
| 13                                   | "I think I paid 180 for coffee"         | ₹180, coffee, food/beverage, UPI, today     |
| 14                                   | "So yeah, 500 for dinner"               | ₹500, dinner, food, UPI, today              |
| 15                                   | "I just bought some snacks, 120 rupees" | ₹120, snacks, food, UPI, today              |
| 16                                   | "Spent about 600 on groceries"          | ₹600, groceries, food/groceries, UPI, today |
| 17                                   | "Got some food for 240"                 | ₹240, food, food, UPI, today                |
| 18                                   | "Paid, uh, 350 for lunch"               | ₹350, lunch, food, UPI, today               |
| 19                                   | "I paid around 200 for breakfast"       | ₹200, breakfast, food, UPI, today           |
| 20                                   | "That was 150 for chai"                 | ₹150, chai, food/beverage, UPI, today       |

## 3\. Different ways of expressing amounts

| #UtteranceExpected structured output |                                     |                                               |
| ------------------------------------ | ----------------------------------- | --------------------------------------------- |
| 21                                   | "Two hundred and fifty for lunch"   | ₹250, lunch, food, UPI, today                 |
| 22                                   | "Three hundred bucks on dinner"     | ₹300, dinner, food, UPI, today                |
| 23                                   | "A hundred and twenty for coffee"   | ₹120, coffee, food/beverage, UPI, today       |
| 24                                   | "I spent one thousand on groceries" | ₹1,000, groceries, food/groceries, UPI, today |
| 25                                   | "About five hundred on dinner"      | ₹500, dinner, food, UPI, today                |
| 26                                   | "Fifty rupees for chai"             | ₹50, chai, food/beverage, UPI, today          |
| 27                                   | "One twenty on snacks"              | ₹120, snacks, food, UPI, today                |
| 28                                   | "Seven fifty for groceries"         | ₹750, groceries, food/groceries, UPI, today   |
| 29                                   | "Two thousand on shopping"          | ₹2,000, shopping, shopping, UPI, today        |
| 30                                   | "Ninety rupees, coffee"             | ₹90, coffee, food/beverage, UPI, today        |

# 4\. Payment methods and defaults

Assume default = **UPI**.

| #UtteranceExpected structured output |                                        |                                                  |
| ------------------------------------ | -------------------------------------- | ------------------------------------------------ |
| 31                                   | "300 lunch, paid in cash"              | ₹300, lunch, food, **cash**, today               |
| 32                                   | "I paid 500 for dinner with cash"      | ₹500, dinner, food, **cash**, today              |
| 33                                   | "200 for coffee on my card"            | ₹200, coffee, food/beverage, **card**, today     |
| 34                                   | "Spent 800 on groceries using cash"    | ₹800, groceries, food/groceries, **cash**, today |
| 35                                   | "Paid 120 for chai through UPI"        | ₹120, chai, food/beverage, **UPI**, today        |
| 36                                   | "300 lunch"                            | ₹300, lunch, food, **UPI**, today                |
| 37                                   | "Paid 450 for dinner"                  | ₹450, dinner, food, **UPI**, today               |
| 38                                   | "I used cash for the 100 rupee coffee" | ₹100, coffee, food/beverage, **cash**, today     |
| 39                                   | "Spent 600 on groceries with my card"  | ₹600, groceries, food/groceries, **card**, today |
| 40                                   | "150 chai, cash"                       | ₹150, chai, food/beverage, **cash**, today       |

# 5\. Dates and temporal language

| #UtteranceExpected structured output |                                             |                                                      |
| ------------------------------------ | ------------------------------------------- | ---------------------------------------------------- |
| 41                                   | "I spent 400 on dinner yesterday"           | ₹400, dinner, food, UPI, **Sep 5**                   |
| 42                                   | "Yesterday's lunch was 300"                 | ₹300, lunch, food, UPI, **Sep 5**                    |
| 43                                   | "I bought coffee for 180 this morning"      | ₹180, coffee, food/beverage, UPI, **Sep 6**, morning |
| 44                                   | "Spent 500 on dinner last night"            | ₹500, dinner, food, UPI, **Sep 5**, night            |
| 45                                   | "Day before yesterday I spent 250 on lunch" | ₹250, lunch, food, UPI, **Sep 4**                    |
| 46                                   | "I paid 700 for groceries two days ago"     | ₹700, groceries, food/groceries, UPI, **Sep 4**      |
| 47                                   | "This morning, 100 for chai"                | ₹100, chai, food/beverage, UPI, **Sep 6**, morning   |
| 48                                   | "Last night I spent 350 on food"            | ₹350, food, food, UPI, **Sep 5**, night              |
| 49                                   | "On September 3rd I spent 900 on shopping"  | ₹900, shopping, shopping, UPI, **Sep 3**             |
| 50                                   | "I spent 250 on lunch today"                | ₹250, lunch, food, UPI, **Sep 6**                    |

# 6\. Multiple transactions in one utterance

Each must become a **separate transaction**.

| #UtteranceExpected structured output |                                                                      |                                          |
| ------------------------------------ | -------------------------------------------------------------------- | ---------------------------------------- |
| 51                                   | "300 lunch and 150 coffee"                                           | 2 transactions: ₹300 lunch, ₹150 coffee  |
| 52                                   | "Spent 200 on breakfast, 300 on lunch, and 400 on dinner"            | 3 transactions                           |
| 53                                   | "I got coffee for 120 and snacks for 80"                             | 2 transactions                           |
| 54                                   | "250 lunch, 100 chai, 150 snacks"                                    | 3 transactions                           |
| 55                                   | "Spent 500 on groceries and 200 on toiletries"                       | 2 transactions                           |
| 56                                   | "I paid 300 for lunch and 100 for coffee in cash"                    | 2 transactions, both cash                |
| 57                                   | "Yesterday I spent 400 on dinner and 100 on dessert"                 | 2 transactions, both Sep 5               |
| 58                                   | "Today I bought breakfast for 150, coffee for 80, and lunch for 250" | 3 transactions                           |
| 59                                   | "200 for chai and 600 for groceries, groceries was cash"             | 2 transactions; chai UPI, groceries cash |
| 60                                   | "Lunch was 300 and dinner was 500, both paid cash"                   | 2 transactions, both cash                |

# 7\. Conversational corrections

These tests are particularly important.

| #ConversationExpected result |                                                                     |                                                      |
| ---------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------- |
| 61                           | User: "300 lunch." → "Actually, lunch was 350."                     | Update lunch ₹300 → **₹350**                         |
| 62                           | User: "150 coffee." → "Actually, make that 180."                    | Update coffee ₹150 → **₹180**                        |
| 63                           | User: "500 dinner." → "No, wait, 550."                              | Update dinner ₹500 → **₹550**                        |
| 64                           | User: "250 lunch." → "That's 280 actually."                         | Update lunch → **₹280**                              |
| 65                           | User: "400 groceries." → "I mean 450."                              | Update groceries → **₹450**                          |
| 66                           | User: "200 coffee." → "The coffee was 220."                         | Update coffee → **₹220**                             |
| 67                           | User: "300 lunch and 150 coffee." → "Actually, the coffee was 180." | Update coffee ₹150 → **₹180**                        |
| 68                           | User: "500 dinner." → "No, I paid 600."                             | Update dinner ₹500 → **₹600**                        |
| 69                           | User: "250 lunch." → "Change that to 300."                          | Update lunch → **₹300**                              |
| 70                           | User: "100 chai." → "Actually, make it 120 cash."                   | Update amount to ₹120 **and payment method to cash** |

# 8\. Self-correction within one utterance

These should produce **one transaction**, using the final intended value.

| #UtteranceExpected structured output |                                                    |                      |
| ------------------------------------ | -------------------------------------------------- | -------------------- |
| 71                                   | "Spent 250… no, wait, 280 on lunch."               | ₹280 lunch           |
| 72                                   | "Coffee was 100, actually 120."                    | ₹120 coffee          |
| 73                                   | "I paid 500… sorry, 550 for dinner."               | ₹550 dinner          |
| 74                                   | "Lunch was 300, no, 350."                          | ₹350 lunch           |
| 75                                   | "Spent 200 on chai… actually make that 180."       | ₹180 chai            |
| 76                                   | "I spent 400 on groceries, wait, it was 450 cash." | ₹450 groceries, cash |
| 77                                   | "300 for lunch, no 320, sorry."                    | ₹320 lunch           |
| 78                                   | "I paid 150 for coffee, actually it was 170."      | ₹170 coffee          |
| 79                                   | "Dinner was 600… no, 650."                         | ₹650 dinner          |
| 80                                   | "Uh, 100 for chai, actually 120 through cash."     | ₹120 chai, cash      |

# 9\. Ambiguity

These are **not necessarily failures** if the model asks an appropriate clarification.

The test is whether it recognizes the ambiguity rather than guessing.

| #UtteranceExpected behavior |                            |                                                                                                                             |
| --------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 81                          | "Paid Rahul 500."          | Determine whether this is money **paid to Rahul** or potentially another interpretation if transaction direction matters    |
| 82                          | "Rahul paid 500."          | Determine whether Rahul paid the user or whether user recorded Rahul's payment                                              |
| 83                          | "Spent 500."               | Amount known, but description/category unknown. Record without inventing category, or ask only if category is required      |
| 84                          | "Paid for it, 300."        | Amount known; description unknown. Do not invent description                                                                |
| 85                          | "That was 200."            | If no active transaction context, clarification required                                                                    |
| 86                          | "Actually, make that 300." | If multiple recent transactions are plausible, ask which transaction                                                        |
| 87                          | "I paid 500 for Rahul."    | Determine whether this means a payment made on Rahul's behalf or money transferred to Rahul, depending on product semantics |
| 88                          | "Dinner, 500."             | ₹500 dinner, UPI, today. **Not ambiguous** despite unusual word order                                                       |
| 89                          | "Coffee and 200."          | Likely ₹200 coffee, but test whether the model handles reversed ordering correctly                                          |
| 90                          | "Paid 300."                | ₹300 payment, UPI, today, but description/category remains unknown                                                          |

# 10\. Harder real-world cases

| #UtteranceExpected structured output |                                                                                                       |                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 91                                   | "I spent 350 on lunch yesterday, cash."                                                               | ₹350 lunch, food, cash, Sep 5                                       |
| 92                                   | "This morning I paid 120 for chai and 300 for breakfast."                                             | 2 transactions, Sep 6, UPI                                          |
| 93                                   | "Yesterday's dinner was 600, but I paid cash."                                                        | ₹600 dinner, cash, Sep 5                                            |
| 94                                   | "I spent around 250 on lunch, actually it was 280."                                                   | ₹280 lunch, UPI, today                                              |
| 95                                   | "Paid Rahul 500 through UPI yesterday."                                                               | ₹500, Rahul, UPI, Sep 5, subject to transaction-direction semantics |
| 96                                   | "I got groceries for 1,250 and paid cash."                                                            | ₹1,250 groceries, cash, today                                       |
| 97                                   | "Spent 300 on lunch, 150 on coffee, actually coffee was 180."                                         | 2 transactions: lunch ₹300, coffee ₹180                             |
| 98                                   | "Uh yesterday I had lunch for about 400, no sorry, 450, and I paid cash."                             | ₹450 lunch, cash, Sep 5                                             |
| 99                                   | "I spent 200 on coffee today and 300 on lunch yesterday."                                             | 2 transactions: ₹200 coffee Sep 6, ₹300 lunch Sep 5                 |
| 100                                  | "Today I spent 300 on lunch, 150 on coffee, paid the lunch in cash, and actually the coffee was 180." | 2 transactions: lunch ₹300 cash Sep 6; coffee ₹180 UPI Sep 6        |

# How I'd actually use this

Don't treat all 100 as one generic accuracy score. Create **separate scores by failure mode**:

| Test groupTestsMetric |        |                                |
| --------------------- | ------ | ------------------------------ |
| Basic natural speech  | 1-10   | Capture accuracy               |
| Messy speech          | 11-20  | Capture accuracy               |
| Amount variations     | 21-30  | Amount accuracy                |
| Payment methods       | 31-40  | Payment accuracy               |
| Dates                 | 41-50  | Date accuracy                  |
| Multiple transactions | 51-60  | Transaction splitting accuracy |
| Corrections           | 61-70  | Correction accuracy            |
| Self-correction       | 71-80  | Final-intent accuracy          |
| Ambiguity             | 81-90  | Appropriate clarification rate |
| Complex combinations  | 91-100 | End-to-end accuracy            |

And I would add one **critical metric**:

### Silent financial errors

A transaction that looks valid but contains the wrong financial information.

For example:

User: "I spent 280 on lunch."

Model records:

₹280, lunch, cash

when default is UPI.

That is more serious than simply failing to understand the sentence.

Your evaluation should therefore distinguish:

**Correct capture**

**Correct capture after clarification**

**Correct capture after user correction**

**Incorrect capture**

**Appropriate clarification**

**Unnecessary clarification**

**Failed recognition**

The last two are especially useful because your product's goal isn't maximum automation. It is **maximum reliable capture with minimum friction**.