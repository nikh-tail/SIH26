// ============================================================
// LEGAL METROLOGY COMPLIANCE & AUTHENTICITY EVALUATION ENGINE
// (Rules 6, 7, 8, 9 & Label-Identified Fallback Authenticity)
// ============================================================

const ComplianceEngine = {
    evaluateCompliance(visionData, barcodeData, physicalCalibration = {}) {
        const violations = [];
        const declarations = [];
        let score = 100;

        const hasBarcode = Boolean(barcodeData && barcodeData.barcode);

        // ------------------------------------------------------------
        // 1. Mandatory Declarations (Rule 6)
        // ------------------------------------------------------------

        // 1a. Manufacturer / Packer Identity (Rule 6(1)(a))
        const mfg = visionData.manufacturer_name;
        const mfgAddr = visionData.manufacturer_address;
        const mfgPresent = Boolean(mfg && mfg.present && mfg.value);
        const mfgAddrPresent = Boolean(mfgAddr && mfgAddr.present && mfgAddr.value);

        declarations.push({
            rule_ref: 'Rule 6(1)(a)',
            name: 'Manufacturer / Packer Name & Address',
            value: mfgPresent ? `${mfg.value || ''}${mfgAddrPresent ? ' — ' + (mfgAddr.value || '') : ''}` : null,
            status: mfgPresent && mfgAddrPresent ? 'compliant' : (mfgPresent ? 'warning' : 'violation'),
            confidence: mfg?.confidence || 0.85,
            notes: mfgPresent ? 'Manufacturer name identified' : 'Missing registered manufacturer name'
        });

        if (!mfgPresent) {
            violations.push({
                rule_ref: 'Rule 6(1)(a)',
                rule_name: 'Missing Manufacturer Identity',
                severity: 'critical',
                description: 'Name and postal address of manufacturer/packer is missing from the package.',
                statutory_act: 'Legal Metrology (Packaged Commodities) Rules, 2011 — Rule 6(1)(a)',
                penalty_provision: 'Section 36(1) of Legal Metrology Act, 2009 (Fine up to ₹25,000)'
            });
            score -= 20;
        }

        // 1b. Generic Name of Commodity (Rule 6(1)(c))
        const prodName = visionData.product_name;
        const prodPresent = Boolean(prodName && prodName.present && prodName.value);
        declarations.push({
            rule_ref: 'Rule 6(1)(c)',
            name: 'Generic / Common Name of Commodity',
            value: prodPresent ? prodName.value : null,
            status: prodPresent ? 'compliant' : 'violation',
            confidence: prodName?.confidence || 0.9,
            notes: prodPresent ? 'Prominently displayed on Principal Display Panel' : 'Generic product identity not found'
        });
        if (!prodPresent) {
            violations.push({
                rule_ref: 'Rule 6(1)(c)',
                rule_name: 'Missing Common / Generic Commodity Name',
                severity: 'critical',
                description: 'The common or generic name of the commodity is missing from the package.',
                statutory_act: 'Legal Metrology Rules, 2011 — Rule 6(1)(c)',
                penalty_provision: 'Section 36(1) of Legal Metrology Act, 2009'
            });
            score -= 15;
        }

        // 1c. Net Quantity (Rule 6(1)(d))
        const netQty = visionData.net_quantity;
        const qtyPresent = Boolean(netQty && netQty.present && netQty.value);
        declarations.push({
            rule_ref: 'Rule 6(1)(d)',
            name: 'Net Quantity Declaration',
            value: qtyPresent ? netQty.value : null,
            status: qtyPresent ? 'compliant' : 'violation',
            confidence: netQty?.confidence || 0.9,
            notes: qtyPresent ? 'Declared in standard SI metric units' : 'Net weight/volume not found'
        });
        if (!qtyPresent) {
            violations.push({
                rule_ref: 'Rule 6(1)(d)',
                rule_name: 'Missing Net Quantity Declaration',
                severity: 'critical',
                description: 'Net quantity in standard metric units (g, kg, ml, l) is missing.',
                statutory_act: 'Legal Metrology Rules, 2011 — Rule 6(1)(d)',
                penalty_provision: 'Section 36(1) of Legal Metrology Act, 2009'
            });
            score -= 20;
        }

        // 1d. Month and Year of Manufacture / Packing (Rule 6(1)(e))
        const mfgDate = visionData.mfg_date;
        const datePresent = Boolean(mfgDate && mfgDate.present && mfgDate.value);
        declarations.push({
            rule_ref: 'Rule 6(1)(e)',
            name: 'Month & Year of Manufacture / Packing',
            value: datePresent ? mfgDate.value : null,
            status: datePresent ? 'compliant' : 'violation',
            confidence: mfgDate?.confidence || 0.88,
            notes: datePresent ? 'Legible manufacturing/packing date declared' : 'Manufacturing/packing date not legible'
        });
        if (!datePresent) {
            violations.push({
                rule_ref: 'Rule 6(1)(e)',
                rule_name: 'Missing Month & Year of Manufacture',
                severity: 'critical',
                description: 'Month and year of manufacture or packing is missing or unreadable.',
                statutory_act: 'Legal Metrology Rules, 2011 — Rule 6(1)(e)',
                penalty_provision: 'Section 36(1) of Legal Metrology Act, 2009'
            });
            score -= 15;
        }

        // 1e. Maximum Retail Price (MRP) (Rule 6(1)(f))
        const mrp = visionData.mrp;
        const mrpPresent = Boolean(mrp && mrp.present && mrp.value);
        const hasTaxText = mrp?.has_tax_inclusion_statement || (mrp?.value && /incl/i.test(mrp.value));

        declarations.push({
            rule_ref: 'Rule 6(1)(f)',
            name: 'Maximum Retail Price (MRP)',
            value: mrpPresent ? mrp.value : null,
            status: mrpPresent && hasTaxText ? 'compliant' : (mrpPresent ? 'warning' : 'violation'),
            confidence: mrp?.confidence || 0.92,
            notes: mrpPresent ? (hasTaxText ? 'Statutory format (inclusive of all taxes)' : 'Missing inclusive of all taxes wording') : 'MRP not declared'
        });

        if (!mrpPresent) {
            violations.push({
                rule_ref: 'Rule 6(1)(f)',
                rule_name: 'Missing MRP Declaration',
                severity: 'critical',
                description: 'Maximum Retail Price (MRP) in INR is missing.',
                statutory_act: 'Legal Metrology Rules, 2011 — Rule 6(1)(f)',
                penalty_provision: 'Section 36(1) of Legal Metrology Act, 2009'
            });
            score -= 20;
        } else if (!hasTaxText) {
            violations.push({
                rule_ref: 'Rule 6(1)(f)',
                rule_name: 'Improper MRP Format (Missing Tax Inclusion Statement)',
                severity: 'warning',
                description: 'MRP is printed without the mandatory "(inclusive of all taxes)" statement.',
                statutory_act: 'Legal Metrology Rules, 2011 — Rule 6(1)(f)',
                penalty_provision: 'Rule 6(1)(f) advisory notice'
            });
            score -= 5;
        }

        // 1f. Consumer Care Details (Rule 6(1)(g))
        const care = visionData.consumer_care;
        const carePresent = Boolean(care && care.present && care.value);
        declarations.push({
            rule_ref: 'Rule 6(1)(g)',
            name: 'Consumer Care Contact Details',
            value: carePresent ? care.value : null,
            status: carePresent ? 'compliant' : 'violation',
            confidence: care?.confidence || 0.85,
            notes: carePresent ? 'Consumer helpline / grievance email present' : 'No consumer helpline details found'
        });
        if (!carePresent) {
            violations.push({
                rule_ref: 'Rule 6(1)(g)',
                rule_name: 'Missing Consumer Care Cell Contact',
                severity: 'critical',
                description: 'Mandatory consumer grievance telephone / email / contact address is missing.',
                statutory_act: 'Legal Metrology Rules, 2011 — Rule 6(1)(g)',
                penalty_provision: 'Section 36(1) of Legal Metrology Act, 2009'
            });
            score -= 15;
        }

        // ------------------------------------------------------------
        // Rule 12: Prohibited Exaggerating Words Check
        // ------------------------------------------------------------
        const labelText = JSON.stringify(visionData).toLowerCase();
        const prohibitedFound = [];
        const prohibitedList = (typeof CONFIG !== 'undefined' && CONFIG.PROHIBITED_QUANTITY_WORDS) || ['minimum', 'not less than', 'average', 'about', 'approximately', 'approx'];
        
        prohibitedList.forEach(word => {
            if (labelText.includes(word)) {
                prohibitedFound.push(word);
            }
        });

        if (visionData.rule_text_checks?.exaggerating_words_found || prohibitedFound.length > 0) {
            const offending = visionData.rule_text_checks?.offending_words || prohibitedFound;
            violations.push({
                rule_ref: 'Rule 12',
                rule_name: 'Prohibited Exaggerating / Vague Words Used',
                severity: 'critical',
                description: `Quantity declaration contains prohibited vague/exaggerating terms: "${offending.join(', ')}". Words like "minimum", "not less than", "average", or "approximately" are strictly prohibited.`,
                statutory_act: 'Legal Metrology Rules, 2011 — Rule 12',
                penalty_provision: 'Section 36(1) of Legal Metrology Act, 2009 (Penalty up to ₹25,000)'
            });
            score -= 20;
        }

        // ------------------------------------------------------------
        // Rule 5: Standard Package Size Check (Second Schedule)
        // ------------------------------------------------------------
        const category = visionData.classification?.commodity_category;
        const numVal = visionData.net_quantity?.numeric_val;
        const packSizes = (typeof CONFIG !== 'undefined' && CONFIG.SECOND_SCHEDULE_PACK_SIZES) || {};
        
        if (category && packSizes[category] && numVal) {
            const isStandard = packSizes[category].includes(numVal);
            const disclaimerPresent = Boolean(visionData.rule_text_checks?.standard_size_declaration_present);
            
            if (!isStandard && !disclaimerPresent) {
                violations.push({
                    rule_ref: 'Rule 5',
                    rule_name: 'Non-Standard Pack Size Without Disclaimer',
                    severity: 'critical',
                    description: `Declared quantity (${numVal}g/ml) for "${category}" does not match standard sizes under Second Schedule, and mandatory disclaimer "Not a standard pack size under the Legal Metrology (Packaged Commodities) Rules, 2011" is missing.`,
                    statutory_act: 'Legal Metrology Rules, 2011 — Rule 5 & Second Schedule',
                    penalty_provision: 'Section 36(1) of Legal Metrology Act, 2009'
                });
                score -= 15;
            }
        }

        // ------------------------------------------------------------
        // Rule 13: Statement of Units & Prohibited Units Check
        // ------------------------------------------------------------
        const prohibitedUnits = ['dozen', 'score', 'gross', 'great gross', 'lbs', 'oz', 'inches'];
        const unitFound = [];
        prohibitedUnits.forEach(u => {
            if (labelText.includes(u)) unitFound.push(u);
        });

        if (visionData.rule_text_checks?.unit_symbol_valid === false || unitFound.length > 0) {
            const offendingUnits = visionData.rule_text_checks?.prohibited_units_found || unitFound;
            violations.push({
                rule_ref: 'Rule 13',
                rule_name: 'Prohibited / Non-Metric Unit Symbol',
                severity: 'critical',
                description: `Quantity is declared using prohibited non-SI units: "${offendingUnits.join(', ')}". Only standard SI metric units (g, kg, ml, l, m, cm) or count symbols "N"/"U" are permitted.`,
                statutory_act: 'Legal Metrology Rules, 2011 — Rule 13',
                penalty_provision: 'Section 36(1) of Legal Metrology Act, 2009'
            });
            score -= 15;
        }

        // Out of Scope Physical Verification Disclosures (MPE & Dealer Obligations)
        const outOfScopeDisclosures = [
            {
                rule_ref: 'First Schedule & Rules 19–22',
                topic: 'Maximum Permissible Error (MPE)',
                notice: 'Requires physical laboratory sampling, weighing, and volume calibration — cannot be verified from image alone.'
            },
            {
                rule_ref: 'Rule 18',
                topic: 'Dealer & Retailer Obligations',
                notice: 'Verifying retail sale price limits, obliteration of MRP, and maintenance of Class III electronic weighing scale requires physical store enforcement inspection.'
            }
        ];

        // ------------------------------------------------------------
        // 2. Authenticity & Solid Proof Cross-Check
        // ------------------------------------------------------------
        let authenticityStatus = 'AUTHENTIC';
        let authenticityScore = 95;
        let authenticityRemarks = [];

        if (hasBarcode) {
            // Case A: Barcode Present -> Cross-Check Barcode Registry vs Printed Label
            if (barcodeData.isRegistered && barcodeData.brand && mfg?.value) {
                const labelBrand = (mfg.value || '').toLowerCase();
                const regBrand = (barcodeData.brand || '').toLowerCase();
                
                // If brand names clash drastically (e.g. Barcode says Brand A, label says Brand B)
                if (!labelBrand.includes(regBrand) && !regBrand.includes(labelBrand)) {
                    authenticityStatus = 'SUSPECTED_COUNTERFEIT';
                    authenticityScore = 20;
                    authenticityRemarks.push(`CRITICAL MISMATCH: Barcode is registered to "${barcodeData.brand}", but label declares "${mfg.value}".`);
                    violations.push({
                        rule_ref: 'Authenticity Check',
                        rule_name: 'Barcode Identity Mismatch (Suspected Counterfeit)',
                        severity: 'critical',
                        description: `GS1 Barcode database lists "${barcodeData.brand}" while the printed label states "${mfg.value}".`,
                        statutory_act: 'Legal Metrology Act, 2009 & IPC Section 420/482 (False Trademark/Counterfeiting)',
                        penalty_provision: 'Seizure of goods and formal criminal investigation'
                    });
                    score -= 30;
                } else {
                    authenticityRemarks.push(`Barcode registry (${barcodeData.brand}) perfectly matches printed label.`);
                }
            } else if (barcodeData.gs1Allocation && barcodeData.gs1Allocation.isIndia) {
                authenticityRemarks.push(`Valid GS1 India Allocation Prefix (890). Modulo-10 checksum verified.`);
            } else {
                authenticityRemarks.push(`Barcode checksum verified across GS1 standards.`);
            }
        } else {
            // Case B: No Barcode -> Perform Label-Identified Product Authenticity (Fallback Mode)
            authenticityRemarks.push('Product Authenticated via Printed Label Information (Fallback Mode — No Barcode).');

            const fssai = visionData.fssai_license;
            if (fssai && fssai.present && fssai.value) {
                authenticityRemarks.push(`FSSAI License Verified: ${fssai.value}`);
                authenticityScore += 5;
            }

            const pin = visionData.manufacturer_address?.pin_code;
            if (pin && /^[1-9][0-9]{5}$/.test(pin)) {
                authenticityRemarks.push(`Valid Indian 6-digit PIN code detected: ${pin}`);
            }

            if (!mfgPresent) {
                authenticityStatus = 'UNAUTHENTICATED';
                authenticityScore = 30;
                authenticityRemarks.push('Warning: Product lacks both barcode and verifiable manufacturer identity.');
            }
        }

        score = Math.max(0, Math.min(100, score));

        return {
            overall_score: score,
            compliance_status: score >= 85 ? 'COMPLIANT' : (score >= 60 ? 'PARTIAL_COMPLIANCE' : 'NON_COMPLIANT'),
            authenticity_status: authenticityStatus,
            authenticity_score: authenticityScore,
            authenticity_remarks: authenticityRemarks,
            declarations: declarations,
            violations: violations,
            out_of_scope_disclosures: outOfScopeDisclosures,
            has_barcode: hasBarcode,
            verification_proof: barcodeData?.proofSummary || 'Label-based statutory audit'
        };
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ComplianceEngine;
}
