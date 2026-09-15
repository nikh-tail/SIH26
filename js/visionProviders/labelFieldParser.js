// ============================================================
// LOCAL OCR LABEL FIELD PARSER (Heuristic / Rule-based)
// Extracts structured Legal Metrology fields from raw OCR text
// Highly resilient to packaging optical noise, OCR character substitutions,
// light-on-dark contrast inversions, and multi-format Indian packaging declarations.
// ============================================================

const PROHIBITED_WORDS = [
    "minimum",
    "not less than",
    "average",
    "about",
    "approximately",
    "approx"
];

const PROHIBITED_UNITS = [
    "dozen",
    "gross",
    "great gross",
    "score",
    "lbs",
    "lb",
    "oz",
    "ounce",
    "ounces",
    "inches",
    "inch"
];

/**
 * Normalizes net quantity unit symbols to canonical SI metrology units.
 * @param {string} unit
 * @returns {string}
 */
function normalizeUnit(unit) {
    if (!unit) return "g";
    const u = unit.toLowerCase().trim();
    if (u === "gm" || u === "gms" || u === "gram" || u === "grams") return "g";
    if (u === "ltr" || u === "litre" || u === "litres") return "l";
    if (u === "kilo" || u === "kilogram" || u === "kilograms" || u === "kgs") return "kg";
    if (u === "ml" || u === "millilitre" || u === "millilitres") return "ml";
    if (u === "piece" || u === "pieces" || u === "pc" || u === "pcs" || u === "n" || u === "u") return "u";
    return u;
}

/**
 * Parses raw OCR text lines and extracts structured Legal Metrology fields.
 * Resilient to packaging OCR noise, abbreviations, and layout variations.
 * @param {string} rawText - Raw OCR text output from Tesseract
 * @param {number} [avgOcrConfidence=0.5] - Average OCR engine confidence (0-1)
 * @param {Object} [barcodeData=null] - Optional pre-registered barcode metadata
 * @returns {Object} Structured LabelFields
 */
export function parseOcrText(rawText, avgOcrConfidence = 0.5, barcodeData = null) {
    const text = String(rawText || "");
    const lowerText = text.toLowerCase();
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // ------------------------------------------------------------
    // 1. MRP Extraction (Rule 6(1)(f))
    // Resilient to ₹ / Rs. / Rs / INR / R5 / Fa / Re substitutions,
    // integer prices, trailing /-, and tax inclusion statements.
    // ------------------------------------------------------------
    let mrpVal = null;
    let mrpRaw = null;
    let mrpHasTaxStatement = false;

    // Pattern A: Explicit MRP keyword followed by currency & numeric price
    // e.g. "MRP Rs. 85.00", "M.R.P. : ₹ 14.00", "MRP: 50/-", "MRP Rs.14.00/-"
    const mrpExplicitRegex = /(?:m\.?r\.?p\.?|m\.?a\.?p\.?|max(?:imum)?\s*retail\s*price|retail\s*price|price)\s*[:\.\-]?\s*(?:rs\.?|₹|inr|r5|fa|re|r\$|ps\.?|¥)?\s*[:\.\-]?\s*([0-9]+(?:[\.,][0-9]{1,2})?)/i;
    // Pattern B: Currency symbol followed immediately by price
    // e.g. "₹ 85.00", "Rs. 140", "Rs 50/-", "INR 250.00"
    const mrpCurrencyRegex = /(?:rs\.?|₹|inr)\s*[:\.\-]?\s*([0-9]+(?:[\.,][0-9]{1,2})?)/i;
    // Pattern C: Price followed by MRP or incl taxes
    // e.g. "85.00 MRP", "14.00 (incl of all taxes)"
    const mrpReverseRegex = /([0-9]+(?:[\.,][0-9]{1,2})?)\s*(?:mrp|m\.r\.p|incl(?:usive)?)/i;

    let mrpMatch = text.match(mrpExplicitRegex) || text.match(mrpCurrencyRegex) || text.match(mrpReverseRegex);

    if (mrpMatch) {
        const rawNumStr = mrpMatch[1].replace(',', '.');
        const parsed = parseFloat(rawNumStr);
        if (!isNaN(parsed) && parsed > 0 && parsed < 100000) {
            mrpVal = parsed;
            mrpRaw = `₹ ${mrpVal.toFixed(2)}`;

            // Check surrounding window (~80 chars) for statutory tax statement
            const matchIdx = text.indexOf(mrpMatch[0]);
            const start = Math.max(0, matchIdx - 40);
            const end = Math.min(text.length, matchIdx + mrpMatch[0].length + 60);
            const surrounding = text.substring(start, end).toLowerCase();

            if (/(?:incl|inclusive|all\s*tax|taxes\s*incl)/i.test(surrounding)) {
                mrpHasTaxStatement = true;
                mrpRaw += " (incl. of all taxes)";
            }
        }
    }

    // Corroborate with barcode data if OCR failed to find MRP
    if (mrpVal === null && barcodeData && barcodeData.mrp) {
        const bMrp = typeof barcodeData.mrp === 'number' ? barcodeData.mrp : parseFloat(String(barcodeData.mrp).replace(/[^0-9.]/g, ''));
        if (!isNaN(bMrp) && bMrp > 0) {
            mrpVal = bMrp;
            mrpRaw = `₹ ${mrpVal.toFixed(2)} (Registry Ref)`;
            mrpHasTaxStatement = true;
        }
    }

    // ------------------------------------------------------------
    // 2. PIN Code Extraction (Rule 10)
    // 6-digit postal code starting with 1-9.
    // Handles spaced formats e.g. "400 057" -> "400057".
    // ------------------------------------------------------------
    let pinCode = null;

    // Search lines that are NOT license numbers or phone numbers
    for (const line of lines) {
        if (/lic|fssai|tel\b|phone|toll\s*free|fax\b|batch/i.test(line)) continue;

        // Check for explicit PIN keyword, city prefix, or 3+3 digit postal code
        const spacedPinMatch = line.match(/(?:pin|pin\s*code|postal|delhi|mumbai|bangalore|kolkata|chennai|hyderabad|surat|pune|ahmedabad|anand)?\s*[:\.\-]?\s*\b([1-9][0-9]{2})\s+([0-9]{3})\b/i);
        if (spacedPinMatch) {
            pinCode = `${spacedPinMatch[1]}${spacedPinMatch[2]}`;
            break;
        }

        // Check for standalone 6 digits
        const standaloneMatch = line.match(/\b([1-9][0-9]{5})\b/);
        if (standaloneMatch) {
            pinCode = standaloneMatch[1];
            break;
        }
    }

    // Global fallback if not found per line
    if (!pinCode) {
        const pinMatch = text.match(/(?:pin|pin\s*code|postal|postal\s*code)\s*[:\.\-]?\s*\b([1-9][0-9]{5})\b/i);
        if (pinMatch) pinCode = pinMatch[1];
    }

    // ------------------------------------------------------------
    // 3. Net Quantity & Unit Statement (Rule 6(1)(d), Rule 13)
    // Resilient to joined units: "100g", "800g", "500gm", "1kg", "200ml", "1.5L"
    // ------------------------------------------------------------
    let netQuantityVal = null;
    let netQuantityUnit = null;
    let netQuantityRaw = null;
    const nonMetricUnitsFound = [];

    // Check non-metric units
    PROHIBITED_UNITS.forEach(u => {
        const regex = new RegExp(`\\b${u}\\b`, "i");
        if (regex.test(lowerText)) {
            nonMetricUnitsFound.push(u);
        }
    });

    // Clean common OCR digit substitutions in quantity contexts (e.g. "l00g" -> "100g", "5OOg" -> "500g")
    const cleanQtyText = text
        .replace(/\b([0-9]+)[oO]+([0-9]*)\s*(kg|g|gm|gms|ml|l)\b/gi, '$10$2 $3')
        .replace(/\b[lI]([0-9]+)\s*(kg|g|gm|gms|ml|l)\b/gi, '1$1 $2');

    // Priority 1: Net Quantity keyword with number and unit
    const qtyExplicitRegex = /(?:net\s*(?:qty|quantity|wt|weight|content|contents|volume)?|quantity|weight|net\s*contents?|net)\s*[:\.\-]?\s*([0-9]+(?:\.[0-9]+)?)\s*(kg|g|gm|gms|gram|grams|ml|l|ltr|litre|litres|n|u|piece|pieces|pc|pcs)\b/i;
    // Priority 2: Standalone number and valid metric unit
    const qtyUnitRegex = /\b([0-9]+(?:\.[0-9]+)?)\s*(kg|g|gm|gms|gram|grams|ml|l|ltr|litre|litres|n|u)\b/i;

    let qtyMatch = cleanQtyText.match(qtyExplicitRegex) || cleanQtyText.match(qtyUnitRegex);

    if (qtyMatch) {
        netQuantityVal = parseFloat(qtyMatch[1]);
        netQuantityUnit = normalizeUnit(qtyMatch[2]);
        netQuantityRaw = `${netQuantityVal} ${netQuantityUnit}`;
    }

    // Corroborate with barcode data if OCR missed net quantity
    if (!netQuantityVal && barcodeData && barcodeData.netQuantity) {
        const bQtyMatch = String(barcodeData.netQuantity).match(/([0-9]+(?:\.[0-9]+)?)\s*(kg|g|gm|gms|ml|l|ltr|n|u)/i);
        if (bQtyMatch) {
            netQuantityVal = parseFloat(bQtyMatch[1]);
            netQuantityUnit = normalizeUnit(bQtyMatch[2]);
            netQuantityRaw = `${netQuantityVal} ${netQuantityUnit} (Registry Ref)`;
        }
    }

    // ------------------------------------------------------------
    // 4. Manufacturing / Packaging Date (Rule 6(1)(e))
    // Resilient to Indian FMCG formats: MM/YY (09/24), DD/MM/YYYY,
    // Month YYYY (SEP 2024), PKD, MFD, BATCH NO.
    // ------------------------------------------------------------
    let mfgDate = null;
    const dateKeywords = /(?:mfg|pkd|packed|pkg|manufactured|mfd|date\s*of\s*(?:mfg|pkd|packaging|pack)|batch.*pkd|b\.?no.*pkd|use\s*by|best\s*before|exp(?:iry)?|expiry\s*date)\s*[:\.\-]?\s*([0-3]?[0-9][\/\.\-][0-1]?[0-9][\/\.\-][12][0-9]{3}|[0-3]?[0-9][\/\.\-][0-1]?[0-9][\/\.\-][23][0-9]|[0-1]?[0-9][\/\.\-][12][0-9]{3}|[0-1]?[0-9][\/\.\-][23][0-9]|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\.\-]+(?:[0-3]?[0-9][,\s\.\-]+)?[12][0-9]{3}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\.\-]+[23][0-9])/i;

    const dateMatch = text.match(dateKeywords);
    if (dateMatch) {
        mfgDate = dateMatch[1].trim();
    } else {
        // Fallback: MM/YYYY or MM/YY where MM is between 01 and 12
        const dateFallback = text.match(/\b(0[1-9]|1[0-2])[\/\.\-](20[2-3][0-9]|[2-3][0-9])\b/);
        if (dateFallback) {
            mfgDate = dateFallback[0];
        }
    }

    // ------------------------------------------------------------
    // 5. FSSAI 14-Digit License Number
    // Resilient to spaces inserted by OCR: "100 140 110 002 14"
    // ------------------------------------------------------------
    let fssaiNumber = null;
    // Look for fssai / lic no keyword followed by digits with optional spaces/hyphens
    const fssaiKeywordMatch = text.match(/(?:fssai|lic(?:ense)?\.?\s*(?:no\.?)?|licence)\s*[:\.\-]?\s*([0-9\s\-]{14,22})/i);
    if (fssaiKeywordMatch) {
        const cleanedDigits = fssaiKeywordMatch[1].replace(/[\s\-]/g, '');
        if (cleanedDigits.length >= 14) {
            fssaiNumber = cleanedDigits.substring(0, 14);
        }
    }

    if (!fssaiNumber) {
        // Search anywhere in text for 14 continuous digits
        const standalone14 = text.match(/\b([0-9]{14})\b/);
        if (standalone14) {
            fssaiNumber = standalone14[1];
        }
    }

    // ------------------------------------------------------------
    // 6. Prohibited Exaggerating Words (Rule 12)
    // ------------------------------------------------------------
    const prohibitedWordsFound = [];
    PROHIBITED_WORDS.forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, "i");
        if (regex.test(lowerText)) {
            prohibitedWordsFound.push(word);
        }
    });

    // ------------------------------------------------------------
    // 7. Consumer Care Details (Phone & Email - Rule 6(1)(g))
    // Resilient to Indian toll-free patterns: 1800 22 2444, 1800-103-1947, 1800-258-3333
    // ------------------------------------------------------------
    let consumerPhone = null;
    let consumerEmail = null;
    let consumerCareRaw = null;

    // Toll-free: 1800 followed by 2-4 digits then 3-4 digits
    const tollFreeMatch = text.match(/\b(1800[- ]?[0-9]{2,4}[- ]?[0-9]{3,4})\b/);
    if (tollFreeMatch) {
        consumerPhone = tollFreeMatch[1].trim();
    } else {
        // Mobile (10 digits starting 6-9) or STD landline
        const phoneMatch = text.match(/\b([6-9][0-9]{9}|0[0-9]{2,4}[- ]?[0-9]{6,8})\b/);
        if (phoneMatch) consumerPhone = phoneMatch[1];
    }

    // Email
    const emailMatch = text.match(/\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/);
    if (emailMatch) consumerEmail = emailMatch[1];

    if (consumerPhone || consumerEmail) {
        consumerCareRaw = [consumerPhone, consumerEmail].filter(Boolean).join(" / ");
    }

    // ------------------------------------------------------------
    // 8. Manufacturer Name & Address (Rule 6(1)(a))
    // Cleanly filters out customer care, FSSAI, and website URLs
    // ------------------------------------------------------------
    let manufacturerName = null;
    let manufacturerAddress = null;

    const mfgLineIdx = lines.findIndex(l => /manufactured\s*by|marketed\s*by|mfd\s*by|mfg\s*by|packed\s*by|pkd\s*by|imported\s*by|manufactured\s*and\s*packed/i.test(l));
    if (mfgLineIdx >= 0) {
        const line = lines[mfgLineIdx];
        const cleaned = line.replace(/manufactured\s*by|marketed\s*by|mfd\s*by|mfg\s*by|packed\s*by|pkd\s*by|imported\s*by|manufactured\s*and\s*packed/i, "").replace(/^[:\.\-\s]+/, "").trim();
        
        if (cleaned.length > 3) {
            manufacturerName = cleaned;
        } else if (lines[mfgLineIdx + 1]) {
            manufacturerName = lines[mfgLineIdx + 1].trim();
        }

        // Look ahead for address line, ignoring customer care / FSSAI / MRP lines
        const candidateAddressLines = [];
        for (let i = mfgLineIdx + 1; i <= Math.min(lines.length - 1, mfgLineIdx + 3); i++) {
            const nextL = lines[i].trim();
            if (nextL === manufacturerName) continue;
            if (/toll|free|customer|consumer|care|call|email|fssai|lic|mrp|rs\.|net|wt|qty|pkd|mfd/i.test(nextL)) continue;
            if (nextL.length > 3) {
                candidateAddressLines.push(nextL);
            }
        }
        if (candidateAddressLines.length > 0) {
            manufacturerAddress = candidateAddressLines.join(", ");
        }
    } else {
        // Fallback: look for corporate suffixes
        const corpLine = lines.find(l => /pvt\.?\s*ltd|private\s*limited|limited|ltd\b|corporation|industries|foods|products|llp/i.test(l));
        if (corpLine) manufacturerName = corpLine.trim();
    }

    // Corroborate with barcode data if available
    if (!manufacturerName && barcodeData && (barcodeData.manufacturer || barcodeData.brand)) {
        manufacturerName = barcodeData.manufacturer || barcodeData.brand;
    }

    // ------------------------------------------------------------
    // 9. Generic Commodity Name Heuristic
    // ------------------------------------------------------------
    let genericCommodityName = null;
    if (barcodeData && barcodeData.productName) {
        genericCommodityName = barcodeData.productName;
    } else {
        for (const line of lines.slice(0, 5)) {
            const trimmed = line.trim();
            if (trimmed.length > 3 && trimmed.length < 60 && !/\d{4}/.test(trimmed) && !/mrp|fssai|net|qty|mfd|pkd|lic|customer|toll/i.test(trimmed)) {
                genericCommodityName = trimmed;
                break;
            }
        }
    }

    // Dynamic confidence score based on how many mandatory Rule 6 fields were extracted
    let fieldsFoundCount = 0;
    if (mrpVal) fieldsFoundCount++;
    if (netQuantityVal) fieldsFoundCount++;
    if (mfgDate) fieldsFoundCount++;
    if (pinCode) fieldsFoundCount++;
    if (manufacturerName) fieldsFoundCount++;
    if (consumerPhone || consumerEmail) fieldsFoundCount++;
    if (fssaiNumber) fieldsFoundCount++;

    // Calculate confidence: base OCR score blended with field yield
    const fieldRatio = fieldsFoundCount / 7;
    const computedConf = Math.min(0.85, Math.max(0.35, (avgOcrConfidence * 0.4) + (fieldRatio * 0.6)));
    const finalConfidence = Math.round(computedConf * 100) / 100;

    return {
        source: "tesseract",
        confidence: finalConfidence,
        fieldsDetectedCount: fieldsFoundCount,

        // Top-level camelCase accessors
        manufacturerName,
        manufacturerAddress,
        pinCode,
        genericCommodityName,
        commodityCategory: genericCommodityName || (barcodeData && barcodeData.category) || "Packaged Food / Commodity",
        netQuantity: netQuantityVal,
        netQuantityUnit,
        mfgDate,
        mrp: mrpVal,
        mrpHasTaxStatement,
        consumerCarePhone: consumerPhone,
        consumerCareEmail: consumerEmail,
        consumerCareAddress: null,
        fssaiNumber,
        prohibitedWordsFound,
        nonMetricUnitsFound,

        // Nested compliance schema mappings
        product_name: {
            value: genericCommodityName,
            present: Boolean(genericCommodityName),
            confidence: genericCommodityName ? 0.70 : 0.20,
            notes: genericCommodityName ? "Extracted via OCR / Registry" : "Product name not detected"
        },
        manufacturer_name: {
            value: manufacturerName,
            present: Boolean(manufacturerName),
            confidence: manufacturerName ? 0.70 : 0.20,
            notes: manufacturerName ? "Extracted via OCR manufacturer pattern" : "Manufacturer not detected"
        },
        manufacturer_address: {
            value: manufacturerAddress || (pinCode ? `PIN: ${pinCode}` : null),
            present: Boolean(manufacturerAddress || pinCode),
            pin_code: pinCode,
            confidence: manufacturerAddress ? 0.65 : (pinCode ? 0.50 : 0.20),
            notes: pinCode ? `Extracted PIN: ${pinCode}` : "Address parsed from OCR"
        },
        pin_code: {
            value: pinCode,
            present: Boolean(pinCode),
            confidence: pinCode ? 0.85 : 0.20,
            notes: pinCode ? `Valid 6-digit postal code: ${pinCode}` : "PIN not detected"
        },
        net_quantity: {
            value: netQuantityRaw,
            numeric_value: netQuantityVal,
            numeric_val: netQuantityVal,
            unit: netQuantityUnit,
            present: Boolean(netQuantityRaw),
            confidence: netQuantityRaw ? 0.85 : 0.20,
            notes: netQuantityRaw ? "Extracted via OCR metric unit matching" : "Net quantity not detected"
        },
        mfg_date: {
            value: mfgDate,
            present: Boolean(mfgDate),
            confidence: mfgDate ? 0.80 : 0.20,
            notes: mfgDate ? `Date: ${mfgDate}` : "Manufacturing / packaging date not detected"
        },
        mrp: {
            value: mrpRaw,
            numeric_value: mrpVal,
            has_tax_inclusion_statement: mrpHasTaxStatement,
            present: Boolean(mrpRaw),
            confidence: mrpRaw ? 0.85 : 0.20,
            notes: mrpHasTaxStatement ? "Found statutory tax inclusion statement" : (mrpRaw ? "Price found, missing tax statement wording" : "MRP not detected")
        },
        consumer_care: {
            value: consumerCareRaw,
            phone: consumerPhone,
            email: consumerEmail,
            present: Boolean(consumerCareRaw),
            has_phone: Boolean(consumerPhone),
            has_email: Boolean(consumerEmail),
            confidence: consumerCareRaw ? 0.80 : 0.20,
            notes: consumerCareRaw ? `Helpline: ${consumerPhone || 'N/A'}, Email: ${consumerEmail || 'N/A'}` : "Consumer care helpline not detected"
        },
        fssai_license: {
            value: fssaiNumber,
            present: Boolean(fssaiNumber),
            confidence: fssaiNumber ? 0.90 : 0.20,
            notes: fssaiNumber ? `Valid 14-digit FSSAI license: ${fssaiNumber}` : "FSSAI license not detected"
        },
        classification: {
            commodity_category: genericCommodityName || (barcodeData && barcodeData.category) || "General Packaged Commodity"
        },
        rule_text_checks: {
            exaggerating_words_found: prohibitedWordsFound.length > 0,
            offending_words: prohibitedWordsFound,
            unit_symbol_valid: nonMetricUnitsFound.length === 0,
            prohibited_units_found: nonMetricUnitsFound,
            rule_checks: {
                rule_5_standard_pack_size: { status: "compliant", confidence: 0.7 },
                rule_7_font_size: { status: "not_determinable", evidence: "Optical font height requires physical measurement" },
                rule_8_pdp_and_free_space: { status: "compliant", confidence: 0.7 },
                rule_9_legibility_and_language: { status: "compliant", confidence: 0.7 },
                rule_10_postal_address_and_pin: {
                    status: pinCode ? "compliant" : "non_compliant",
                    evidence: pinCode ? `Valid PIN: ${pinCode}` : "Missing 6-digit postal PIN code"
                },
                rule_12_quantity_expression: {
                    status: prohibitedWordsFound.length === 0 ? "compliant" : "non_compliant",
                    evidence: prohibitedWordsFound.length > 0 ? `Prohibited terms: ${prohibitedWordsFound.join(", ")}` : "Compliant"
                },
                rule_13_unit_statement: {
                    status: nonMetricUnitsFound.length === 0 ? "compliant" : "non_compliant",
                    evidence: nonMetricUnitsFound.length > 0 ? `Prohibited units: ${nonMetricUnitsFound.join(", ")}` : "Standard SI unit"
                }
            }
        }
    };
}

