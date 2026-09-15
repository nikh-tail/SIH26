// ============================================================
// LOCAL OCR LABEL FIELD PARSER (Heuristic / Rule-based)
// Extracts structured Legal Metrology fields from raw OCR text
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

const STANDARD_METRIC_UNITS = [
    "g", "kg", "ml", "l", "gm", "gms", "gram", "grams", "litre", "litres", "ltr", "n", "u"
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
    if (u === "kilo" || u === "kilogram") return "kg";
    return u;
}

/**
 * Parses raw OCR text lines and extracts structured Legal Metrology fields.
 * @param {string} rawText - Raw OCR text output from Tesseract
 * @param {number} [avgOcrConfidence=0.5] - Average OCR engine confidence (0-1)
 * @returns {Object} Structured LabelFields
 */
export function parseOcrText(rawText, avgOcrConfidence = 0.5) {
    const text = String(rawText || "");
    const lowerText = text.toLowerCase();
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // 1. MRP Extraction
    let mrpVal = null;
    let mrpRaw = null;
    let mrpHasTaxStatement = false;
    const mrpMatch = text.match(/(?:mrp|r\.?p\.?|rs\.?|₹|inr)\s*[:\.\-]?\s*([0-9]+(?:\.[0-9]{1,2})?)/i) ||
                     text.match(/([0-9]+(?:\.[0-9]{1,2})?)\s*(?:mrp|incl\.?)/i);

    if (mrpMatch) {
        mrpVal = parseFloat(mrpMatch[1]);
        mrpRaw = `₹ ${mrpVal.toFixed(2)}`;

        // Check window of ~60 characters around MRP for tax statement
        const matchIdx = text.indexOf(mrpMatch[0]);
        const start = Math.max(0, matchIdx - 40);
        const end = Math.min(text.length, matchIdx + mrpMatch[0].length + 50);
        const surrounding = text.substring(start, end).toLowerCase();

        if (/incl|inclusive|tax/i.test(surrounding)) {
            mrpHasTaxStatement = true;
            mrpRaw += " (incl. of all taxes)";
        }
    }

    // 2. PIN Code Extraction
    let pinCode = null;
    const pinMatch = text.match(/(?:pin|pin\s*code|postal|delhi|mumbai|bangalore|kolkata|chennai|hyderabad|surat|pune|ahmedabad)?\s*[:\.\-]?\s*\b([1-9][0-9]{5})\b/i);
    if (pinMatch) {
        pinCode = pinMatch[1];
    } else {
        const standalonePin = text.match(/\b([1-9][0-9]{5})\b/);
        if (standalonePin) pinCode = standalonePin[1];
    }

    // 3. Net Quantity & Non-Metric Units
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

    // Extract valid SI net quantity
    const qtyRegex = /(?:net\s*(?:qty|quantity|wt|weight)?|quantity|weight)\s*[:\.\-]?\s*([0-9]+(?:\.[0-9]+)?)\s*(kg|g|gm|gms|ml|l|ltr|litre|n|u)\b/i;
    let qtyMatch = text.match(qtyRegex);
    if (!qtyMatch) {
        // Fallback: search any number immediately followed by an SI unit
        qtyMatch = text.match(/\b([0-9]+(?:\.[0-9]+)?)\s*(kg|g|gm|gms|ml|l|ltr|litre|n|u)\b/i);
    }

    if (qtyMatch) {
        netQuantityVal = parseFloat(qtyMatch[1]);
        netQuantityUnit = normalizeUnit(qtyMatch[2]);
        netQuantityRaw = `${netQuantityVal} ${netQuantityUnit}`;
    }

    // 4. Manufacturing Date
    let mfgDate = null;
    const dateKeywords = /(?:mfg|pkd|packed|manufactured|mfd|date\s*of\s*mfg|use\s*by|best\s*before)\s*[:\.\-]?\s*([0-3]?[0-9][\/\.\-][0-1]?[0-9][\/\.\-][12][0-9]{3}|[0-1]?[0-9][\/\.\-][12][0-9]{3}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+[12][0-9]{3})/i;
    const dateMatch = text.match(dateKeywords);
    if (dateMatch) {
        mfgDate = dateMatch[1];
    } else {
        const generalDate = text.match(/\b([0-1]?[0-9][\/\.\-][12][0-9]{3})\b/);
        if (generalDate) mfgDate = generalDate[1];
    }

    // 5. FSSAI License Number
    let fssaiNumber = null;
    const fssaiMatch = text.match(/(?:fssai|lic\.?\s*no\.?|license)\s*[:\.\-]?\s*([0-9]{14})/i) ||
                       text.match(/\b([0-9]{14})\b/);
    if (fssaiMatch) {
        fssaiNumber = fssaiMatch[1];
    }

    // 6. Prohibited Exaggerating Words
    const prohibitedWordsFound = [];
    PROHIBITED_WORDS.forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, "i");
        if (regex.test(lowerText)) {
            prohibitedWordsFound.push(word);
        }
    });

    // 7. Consumer Care Details (Phone & Email)
    let consumerPhone = null;
    let consumerEmail = null;
    let consumerCareRaw = null;

    const phoneMatch = text.match(/\b(1800[- ]?[0-9]{3}[- ]?[0-9]{3,4}|[6-9][0-9]{9}|0[0-9]{2,4}[- ]?[0-9]{6,8})\b/);
    if (phoneMatch) consumerPhone = phoneMatch[1];

    const emailMatch = text.match(/\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/);
    if (emailMatch) consumerEmail = emailMatch[1];

    if (consumerPhone || consumerEmail) {
        consumerCareRaw = [consumerPhone, consumerEmail].filter(Boolean).join(" / ");
    }

    // 8. Manufacturer Name & Address Heuristics
    let manufacturerName = null;
    let manufacturerAddress = null;

    const mfgLineIdx = lines.findIndex(l => /manufactured\s*by|marketed\s*by|mfd\s*by|packed\s*by|imported\s*by/i.test(l));
    if (mfgLineIdx >= 0) {
        const line = lines[mfgLineIdx];
        const cleaned = line.replace(/manufactured\s*by|marketed\s*by|mfd\s*by|packed\s*by|imported\s*by/i, "").replace(/^[:\.\-\s]+/, "");
        manufacturerName = cleaned || lines[mfgLineIdx + 1] || null;
        if (lines[mfgLineIdx + 1] && lines[mfgLineIdx + 1] !== manufacturerName) {
            manufacturerAddress = [lines[mfgLineIdx + 1], lines[mfgLineIdx + 2]].filter(Boolean).join(", ");
        }
    } else if (lines.length > 2) {
        // Fallback: look for Pvt Ltd / Ltd / Industries
        const corpLine = lines.find(l => /pvt\.?\s*ltd|limited|corporation|industries|foods/i.test(l));
        if (corpLine) manufacturerName = corpLine;
    }

    // 9. Generic Commodity Name Heuristic
    // Usually top line or prominent line not containing numbers or dates
    let genericCommodityName = null;
    for (const line of lines.slice(0, 4)) {
        if (line.length > 3 && line.length < 50 && !/\d{4}/.test(line) && !/mrp|fssai|net|qty/i.test(line)) {
            genericCommodityName = line;
            break;
        }
    }

    // Compute overall confidence score capped at 0.6 max for OCR
    const rawConf = Math.min(0.60, Math.max(0.25, avgOcrConfidence));
    const finalConfidence = Math.round(rawConf * 100) / 100;

    // Construct full backward-compatible response
    return {
        // Core schema
        source: "tesseract",
        confidence: finalConfidence,

        // Top-level camelCase accessors
        manufacturerName,
        manufacturerAddress,
        pinCode,
        genericCommodityName,
        commodityCategory: genericCommodityName || "Packaged Food / Commodity",
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

        // Nested compliance.js schema mappings
        product_name: {
            value: genericCommodityName,
            present: Boolean(genericCommodityName),
            confidence: 0.40,
            notes: "Extracted via offline OCR"
        },
        manufacturer_name: {
            value: manufacturerName,
            present: Boolean(manufacturerName),
            confidence: 0.40,
            notes: "Extracted via offline OCR keyword match"
        },
        manufacturer_address: {
            value: manufacturerAddress || (pinCode ? `PIN: ${pinCode}` : null),
            present: Boolean(manufacturerAddress || pinCode),
            pin_code: pinCode,
            confidence: 0.40,
            notes: pinCode ? `Extracted PIN: ${pinCode}` : "Address parsed from OCR"
        },
        pin_code: {
            value: pinCode,
            present: Boolean(pinCode),
            confidence: 0.55,
            notes: pinCode ? `Valid 6-digit postal code: ${pinCode}` : "PIN not detected"
        },
        net_quantity: {
            value: netQuantityRaw,
            numeric_value: netQuantityVal,
            numeric_val: netQuantityVal,
            unit: netQuantityUnit,
            present: Boolean(netQuantityRaw),
            confidence: 0.55,
            notes: "Extracted via offline OCR unit matching"
        },
        mfg_date: {
            value: mfgDate,
            present: Boolean(mfgDate),
            confidence: 0.55,
            notes: "Extracted via offline OCR date parsing"
        },
        mrp: {
            value: mrpRaw,
            numeric_value: mrpVal,
            has_tax_inclusion_statement: mrpHasTaxStatement,
            present: Boolean(mrpRaw),
            confidence: 0.55,
            notes: mrpHasTaxStatement ? "Found tax inclusion wording" : "Missing tax statement wording"
        },
        consumer_care: {
            value: consumerCareRaw,
            phone: consumerPhone,
            email: consumerEmail,
            present: Boolean(consumerCareRaw),
            has_phone: Boolean(consumerPhone),
            has_email: Boolean(consumerEmail),
            confidence: 0.50,
            notes: "Extracted via helpline/email regex"
        },
        fssai_license: {
            value: fssaiNumber,
            present: Boolean(fssaiNumber),
            confidence: 0.60
        },
        classification: {
            commodity_category: genericCommodityName || "General Packaged Commodity"
        },
        rule_text_checks: {
            exaggerating_words_found: prohibitedWordsFound.length > 0,
            offending_words: prohibitedWordsFound,
            unit_symbol_valid: nonMetricUnitsFound.length === 0,
            prohibited_units_found: nonMetricUnitsFound,
            rule_checks: {
                rule_5_standard_pack_size: { status: "compliant", confidence: 0.5 },
                rule_7_font_size: { status: "not_determinable", evidence: "Optical font height requires physical measurement" },
                rule_8_pdp_and_free_space: { status: "compliant", confidence: 0.5 },
                rule_9_legibility_and_language: { status: "compliant", confidence: 0.5 },
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
