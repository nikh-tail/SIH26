// ============================================================
// MULTI-SOURCE BARCODE & GS1 AUTHENTICITY ENGINE
// (Validates check-digits, decodes GS1 prefixes, queries multiple registries)
// ============================================================

const BarcodeEngine = {
    // 1. EAN / GTIN Check-Digit Validation (Modulo 10 algorithm)
    validateCheckDigit(barcode) {
        const clean = (barcode || '').replace(/\D/g, '');
        if (clean.length !== 8 && clean.length !== 12 && clean.length !== 13 && clean.length !== 14) {
            return { valid: false, reason: 'Invalid GTIN length (must be 8, 12, 13, or 14 digits)' };
        }

        const digits = clean.split('').map(Number);
        const checkDigit = digits.pop();
        
        let sum = 0;
        const reversed = digits.reverse();
        for (let i = 0; i < reversed.length; i++) {
            sum += (i % 2 === 0) ? reversed[i] * 3 : reversed[i];
        }

        const calculated = (10 - (sum % 10)) % 10;
        return {
            valid: calculated === checkDigit,
            calculatedCheckDigit: calculated,
            actualCheckDigit: checkDigit,
            cleanBarcode: clean
        };
    },

    // 2. Decode GS1 Country Allocation Prefix
    decodeGs1Prefix(barcode) {
        const clean = (barcode || '').replace(/\D/g, '');
        if (clean.length < 3) return { country: 'Unknown', isIndia: false };

        const p3 = parseInt(clean.substring(0, 3), 10);
        const p2 = parseInt(clean.substring(0, 2), 10);

        if (p3 === 890) {
            return { country: 'India (GS1 India Licensed)', isIndia: true, prefix: '890', description: 'Assigned by GS1 India to Indian manufacturers' };
        }
        if (p2 >= 0 && p2 <= 19) {
            return { country: 'USA & Canada (GS1 US)', isIndia: false, prefix: '00-19', description: 'Assigned by GS1 US' };
        }
        if (p3 >= 300 && p3 <= 379) {
            return { country: 'France', isIndia: false, prefix: '300-379', description: 'Assigned by GS1 France' };
        }
        if (p3 >= 400 && p3 <= 440) {
            return { country: 'Germany', isIndia: false, prefix: '400-440', description: 'Assigned by GS1 Germany' };
        }
        if (p3 >= 490 && p3 <= 499) {
            return { country: 'Japan', isIndia: false, prefix: '490-499', description: 'Assigned by GS1 Japan' };
        }
        if (p3 >= 500 && p3 <= 509) {
            return { country: 'United Kingdom', isIndia: false, prefix: '500-509', description: 'Assigned by GS1 UK' };
        }
        if (p3 >= 690 && p3 <= 699) {
            return { country: 'China', isIndia: false, prefix: '690-699', description: 'Assigned by GS1 China' };
        }

        return { country: 'International GS1 Allocation', isIndia: false, prefix: String(p3), description: 'Standard GS1 Member Organization prefix' };
    },

    // 3. Multi-Source Lookup Engine
    async lookupProduct(barcode, fallbackQuery = null) {
        const clean = (barcode || '').replace(/\D/g, '');
        const checkValidation = clean ? this.validateCheckDigit(clean) : { valid: false };
        const gs1 = clean ? this.decodeGs1Prefix(clean) : null;

        let result = {
            barcode: clean || null,
            isValidCheckDigit: checkValidation.valid,
            gs1Allocation: gs1,
            isRegistered: false,
            productName: null,
            brand: null,
            manufacturer: null,
            mrp: null,
            netQuantity: null,
            sourcesChecked: [],
            sourcesConfirmed: [],
            verificationStatus: 'unregistered',
            proofSummary: 'No registered records found'
        };

        const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) ? CONFIG.BACKEND_URL.replace(/\/$/, '') : '';
        const apiUrl = `${backendUrl}/api/lookup-product?barcode=${encodeURIComponent(clean)}&query=${encodeURIComponent(fallbackQuery || '')}`;

        try {
            const response = await fetch(apiUrl);
            if (response.ok) {
                const apiData = await response.json();
                result = { ...result, ...apiData };
            }
        } catch (e) {
            console.warn('Backend lookup notice:', e.message);
        }

        // Direct client fallback to Open Food Facts if backend offline
        if (!result.isRegistered && clean) {
            result.sourcesChecked.push('Open Food Facts (Client)');
            try {
                const offUrl = `https://world.openfoodfacts.org/api/v2/product/${clean}.json`;
                const offRes = await fetch(offUrl);
                if (offRes.ok) {
                    const offData = await offRes.json();
                    if (offData.status === 1 && offData.product) {
                        const p = offData.product;
                        result.isRegistered = true;
                        result.productName = p.product_name || p.generic_name || p.product_name_en;
                        result.brand = p.brands || null;
                        result.manufacturer = p.manufacturing_places || p.brands || null;
                        result.netQuantity = p.quantity || null;
                        result.sourcesConfirmed.push('Open Food Facts Registry');
                    }
                }
            } catch (err) {
                console.warn('Client OFF lookup:', err.message);
            }
        }

        // Determine Solid Proof Status
        if (result.isRegistered) {
            result.verificationStatus = 'verified';
            result.proofSummary = `Confirmed in ${result.sourcesConfirmed.join(' & ')}`;
        } else if (clean && checkValidation.valid && gs1 && gs1.isIndia) {
            // Do NOT mark as unverified fake without solid proof: it has a valid GS1 India prefix and check digit
            result.verificationStatus = 'gs1_prefix_verified';
            result.proofSummary = `Valid GS1 India Allocation Prefix (890) & Valid Modulo-10 Check Digit (unindexed in public crowdsourced open indexes)`;
        } else if (clean && checkValidation.valid) {
            result.verificationStatus = 'gs1_prefix_verified';
            result.proofSummary = `Valid GS1 Prefix (${gs1.country}) & Valid Check Digit`;
        } else if (!clean && fallbackQuery) {
            result.verificationStatus = 'label_lookup_mode';
            result.proofSummary = `Operating in Label-Identified Fallback Mode (No Barcode)`;
        } else {
            result.verificationStatus = 'unindexed';
            result.proofSummary = `Checked multiple sources (${result.sourcesChecked.join(', ')}). No public registry match.`;
        }

        return result;
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BarcodeEngine;
}
