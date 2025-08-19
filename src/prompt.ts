export function getPromptText(items: any[]) {
const promptText = `Find EXACT duplicate items only. Be very strict - items are duplicates ONLY if they represent the SAME product with minor variations.

DUPLICATE EXAMPLES (✅ CORRECT):
- "Aloo Tikki" vs "aloo tikki" (case difference)
- "French Fries" vs "French Fries." (punctuation)  
- "Chicken Lolipop" vs "CHICKEN LOLIPOP" (case difference)
- "DM Tomato Ketchup 8g" vs "DM Tomato Ketchup 8gm" (g vs gm abbreviation)
- "Apple - 10KG" vs "Apple - 10kg" (case difference in quantity)

NOT DUPLICATES (❌ WRONG):
- "Chicken Lolipop" vs "Chicken Cut 65" (different food items)
- "Black pepper" vs "black final" (different spices)  
- "Corn Flour" vs "Corn Samosa" (ingredient vs food item)
- "sparsh-chilli powder,500gm pack" vs "Sparsh - Chilli Powder, 1 Kg Pouch" (DIFFERENT QUANTITIES: 500gm ≠ 1kg)
- "French Fries" vs "Marinated Chicken" (completely different items)
- "ONION - 20KG" vs "Onion - Kg" (different quantities: 20kg ≠ 1kg)
- "Aloo Tikki" vs "Aloo Tikki- Stock Transfer" (STOCK TRANSFER items are separate business purposes)
- "Carry bag" vs "Carry bag- Stock Transfer" (regular item vs stock transfer item)

RULES:
1. Items must be the SAME product (not just similar words)
2. Only differences allowed: case, punctuation, minor spelling (typos)
3. Unit and rate must match exactly
4. SAME QUANTITY: Items with different quantities (500gm vs 1kg, 20kg vs 1kg) are NOT duplicates
5. EXCLUDE STOCK TRANSFERS: Never group items containing "Stock Transfer" with regular items - they serve different business purposes
6. When in doubt, DON'T group them - BE VERY CONSERVATIVE

EXAMPLE SCENARIO:
If you have: "Apple - 10KG", "Apple - 10kg", "Apple - 10KG - Stock Transfer"
Result: Group only "Apple - 10KG" and "Apple - 10kg" together. Leave "Apple - 10KG - Stock Transfer" ungrouped.

Return JSON:
{
  "duplicates": [
    {
      "group": 1,
      "items": [{"item_name": "Apple 10KG", "rate": 100, "unit": "kg"}, {"item_name": "apple 10kg", "rate": 100, "unit": "kg"}]
    }
  ],
  "summary": {"total_items": ${items.length}, "duplicate_groups": 0}
}

Items: ${JSON.stringify(items)}`;

return promptText;
}