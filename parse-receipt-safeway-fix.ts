// Safeway-specific parser function
function parseSafewayItems(lines: string[], skipPatterns: RegExp[]): any[] {
  const items: any[] = [];
  let i = 0;

  // Safeway has multi-line format:
  // 1. Item code and name
  // 2. Optional original price
  // 3. Final price (sometimes with tax code)
  // 4. Optional savings line

  while (i < lines.length) {
    const line = lines[i];

    // Skip non-item lines
    if (skipPatterns.some(p => p.test(line))) {
      i++;
      continue;
    }

    // Skip section headers
    if (/^(GROCERY|PRODUCE|REFRIG|FROZEN|DAIRY|MEAT|DELI|BAKERY|GENERAL)/i.test(line)) {
      i++;
      // Skip "Price" and "You Pay" lines after section headers
      if (i < lines.length && /^Price$/i.test(lines[i])) i++;
      if (i < lines.length && /^You Pay$/i.test(lines[i])) i++;
      continue;
    }

    // Look for item patterns
    // Pattern 1: Item code followed by name
    const itemCodePattern = /^(\d{8,12})\s+(.+)$/;
    const itemCodeMatch = line.match(itemCodePattern);

    // Pattern 2: PLU code (4-5 digits) followed by name
    const pluPattern = /^(\d{4,5})\s+(.+)$/;
    const pluMatch = line.match(pluPattern);

    // Pattern 3: Just item name (for produce items)
    const nameOnlyPattern = /^([A-Z][A-Z\s]+)$/;
    const nameOnlyMatch = line.match(nameOnlyPattern);

    if (itemCodeMatch || pluMatch || nameOnlyMatch) {
      let itemName = '';
      let itemCode = '';

      if (itemCodeMatch) {
        itemCode = itemCodeMatch[1];
        itemName = itemCodeMatch[2].trim();
      } else if (pluMatch) {
        itemCode = pluMatch[1];
        itemName = pluMatch[2].trim();
      } else if (nameOnlyMatch) {
        itemName = nameOnlyMatch[1].trim();
      }

      // Skip if name is too short or looks like a header
      if (itemName.length < 2 || /^(Price|You Pay|NT|VT|WT)$/i.test(itemName)) {
        i++;
        continue;
      }

      // Now look for the price in the next lines
      let price = 0;
      let originalPrice = 0;
      let foundPrice = false;
      let nextIndex = i + 1;

      // Check next 3 lines for prices
      while (nextIndex < lines.length && nextIndex <= i + 3) {
        const nextLine = lines[nextIndex];

        // Skip savings lines
        if (/savings?|coupon|discount/i.test(nextLine)) {
          nextIndex++;
          continue;
        }

        // Price pattern: number with optional tax code
        const pricePattern = /^(\d+\.\d{2})\s*([A-Z])?$/;
        const priceMatch = nextLine.match(pricePattern);

        if (priceMatch) {
          const priceValue = parseFloat(priceMatch[1]);

          // If we haven't found a price yet, this might be original price
          if (!foundPrice) {
            // Check if next line also has a price (would be the actual price)
            if (nextIndex + 1 < lines.length) {
              const nextNextLine = lines[nextIndex + 1];
              const nextPriceMatch = nextNextLine.match(pricePattern);
              if (nextPriceMatch) {
                // This is original price, next is actual
                originalPrice = priceValue;
                price = parseFloat(nextPriceMatch[1]);
                foundPrice = true;
                nextIndex += 2;
                break;
              }
            }
            // Otherwise this is the actual price
            price = priceValue;
            foundPrice = true;
            nextIndex++;
            break;
          }
        }

        nextIndex++;
      }

      // If we found a valid price, add the item
      if (foundPrice && price > 0 && price < 1000) {
        items.push({
          name: itemName,
          price: price,
          original_price: originalPrice || price,
          quantity: 1,
          raw_text: `${line} ${price}`,
          confidence: 0.9
        });

        i = nextIndex;
      } else {
        i++;
      }
    } else if (/^\d+\.\d{2}\s+lb\s*@/i.test(line) || /lb\s*@\s*\$?\d+\.\d{2}/i.test(line)) {
      // Weight-based item (e.g., "1.09 lb @ $1.69/lb")
      const weightMatch = line.match(/^(\d+\.\d{2})\s+lb\s*@\s*\$?(\d+\.\d{2})/i);
      if (weightMatch) {
        const weight = parseFloat(weightMatch[1]);
        const pricePerLb = parseFloat(weightMatch[2]);
        const totalPrice = weight * pricePerLb;

        // Try to find the item name in previous line
        let itemName = 'Weighted Item';
        if (i > 0) {
          const prevLine = lines[i - 1];
          if (!skipPatterns.some(p => p.test(prevLine)) && /^[A-Z]/.test(prevLine)) {
            itemName = prevLine.trim();
          }
        }

        items.push({
          name: itemName,
          price: Math.round(totalPrice * 100) / 100,
          quantity: weight,
          unit: 'lb',
          price_per_unit: pricePerLb,
          raw_text: line,
          confidence: 0.85
        });
      }
      i++;
    } else {
      i++;
    }
  }

  // Filter out any remaining invalid items
  return items.filter(item =>
    item.name &&
    item.name.length > 2 &&
    !/(savings?|member|rewards?|points?|coupon|discount|number|nember)/i.test(item.name) &&
    item.price > 0
  );
}

// Update the parseItemsByStoreType function to include Safeway
function parseItemsByStoreTypeUpdated(lines: string[], storeName: string, storeType: string): any[] {
  const items: any[] = [];

  // Skip patterns - lines that are NOT items
  const skipPatterns = [
    /^(ST#|OP#?|TE#|TR#|REG|REGISTER|CASHIER|CSH)/i,
    /^\d{10,}$/,
    /^(SUBTOTAL|TOTAL|TAX|CASH|CREDIT|DEBIT|CHANGE|BALANCE|PAYMENT)/i,
    /^#\s*ITEMS?\s+(SOLD|PURCHASED)/i,
    /^(THANK|THANKS)\s+(YOU|U)/i,
    /^(Save|SAVE)\s+(money|MONEY)/i,
    /^\(\d{3}\)\s*\d{3}/,
    /^(MANAGER|MGR)/i,
    /^\d+\s+[A-Z]+\s+(DR|ST|AVE|RD|BLVD|LN|WAY|PKWY)/i,
    /^(COUPON|DISCOUNT|SAVINGS?|YOUR\s+SAVINGS?|Member\s+Sav)/i,
    /^(VISA|MASTERCARD|AMEX|DISCOVER|DEBIT|EBT)/i,
    /^(MEMBER|REWARDS?|POINTS?|EXTRABUCKS|EB)/i,
    /^\*{3,}/,
    /^={3,}/,
    /^-{3,}/,
    /^STORE\s*#?\d+/i,
    /^\d{1,2}[:/]\d{2}\s*(AM|PM)?/i,
    /^(Nember|Number)\s+(Savings?|Savines)/i,  // Typos in OCR
    /^Member\s+Sav/i,
    /^YOUR\s+CASHIER/i,
    /^CARD\s*#/i,
    /^REF:/i,
    /^AUTH:/i,
    /^AID\s/i,
    /^TVR\s/i,
    /^AL\s+US\s+DEBIT/i,
  ];

  // Route to appropriate parser based on store
  if (storeName === 'SAFEWAY') {
    return parseSafewayItems(lines, skipPatterns);
  } else if (storeName === 'WALMART') {
    return parseWalmartItems(lines, skipPatterns);
  } else if (storeName === 'TARGET') {
    return parseTargetItems(lines, skipPatterns);
  } else if (['CVS', 'WALGREENS'].includes(storeName)) {
    return parsePharmacyItems(lines, skipPatterns);
  } else if (storeName === 'COSTCO') {
    return parseCostcoItems(lines, skipPatterns);
  } else {
    return parseGenericItems(lines, skipPatterns);
  }
}

// Export for testing
export { parseSafewayItems, parseItemsByStoreTypeUpdated };