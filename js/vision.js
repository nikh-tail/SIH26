// ============================================================
// VISION ORCHESTRATOR & PROVIDER ABSTRACTION LAYER
// Automatic fallback: Gemini Cloud Vision -> Local Tesseract OCR -> Manual Entry
// ============================================================

import * as geminiProvider from "./visionProviders/geminiProvider.js";
import * as tesseractProvider from "./visionProviders/tesseractProvider.js";

let lastProviderUsed = null;
const sessionTelemetry = [];

/**
 * Creates an empty, fallback LabelFields object for manual entry.
 * @param {'manual'} [source='manual']
 * @returns {Object}
 */
export function createEmptyLabelFields(source = "manual") {
    return {
        source,
        confidence: 0,
        manufacturerName: null,
        manufacturerAddress: null,
        pinCode: null,
        genericCommodityName: null,
        commodityCategory: "Unknown Commodity",
        netQuantity: null,
        netQuantityUnit: null,
        mfgDate: null,
        mrp: null,
        mrpHasTaxStatement: false,
        consumerCarePhone: null,
        consumerCareEmail: null,
        consumerCareAddress: null,
        fssaiNumber: null,
        prohibitedWordsFound: [],
        nonMetricUnitsFound: [],

        // Nested compliance schema
        product_name: { value: null, present: false, confidence: 0, notes: "Manual entry required" },
        manufacturer_name: { value: null, present: false, confidence: 0, notes: "Manual entry required" },
        manufacturer_address: { value: null, present: false, confidence: 0, notes: "Manual entry required" },
        net_quantity: { value: null, numeric_value: null, numeric_val: null, unit: null, present: false, confidence: 0 },
        mfg_date: { value: null, present: false, confidence: 0 },
        mrp: { value: null, numeric_value: null, has_tax_inclusion_statement: false, present: false, confidence: 0 },
        consumer_care: { value: null, present: false, has_phone: false, has_email: false, confidence: 0 },
        fssai_license: { value: null, present: false, confidence: 0 },
        classification: { commodity_category: "Unknown Commodity" },
        rule_text_checks: {
            exaggerating_words_found: false,
            offending_words: [],
            unit_symbol_valid: true,
            prohibited_units_found: [],
            rule_checks: {
                rule_5_standard_pack_size: { status: "not_determinable" },
                rule_7_font_size: { status: "not_determinable" },
                rule_8_pdp_and_free_space: { status: "not_determinable" },
                rule_9_legibility_and_language: { status: "not_determinable" },
                rule_10_postal_address_and_pin: { status: "not_determinable" },
                rule_12_quantity_expression: { status: "not_determinable" },
                rule_13_unit_statement: { status: "not_determinable" }
            }
        }
    };
}

/**
 * Returns the name of the last AI / OCR provider that executed.
 * @returns {'gemini'|'tesseract'|'manual'|null}
 */
export function getLastProviderUsed() {
    return lastProviderUsed;
}

/**
 * Returns all telemetry entries recorded during this browser session.
 * @returns {Array<Object>}
 */
export function getVisionTelemetry() {
    return [...sessionTelemetry];
}

/**
 * Orchestrates package label extraction across available providers with automatic fallback.
 * @param {Blob|string|Array<Blob|string>} image
 * @param {Object|any} [optionsOrBarcode] - Options object or barcodeData for backward compatibility
 * @returns {Promise<{success: boolean, data: Object, source: string, durationMs: number, error: string|null}>}
 */
export async function analyzeLabel(image, optionsOrBarcode = {}) {
    const startTime = performance.now();
    let options = {};

    if (optionsOrBarcode && typeof optionsOrBarcode === "object") {
        if ("barcode" in optionsOrBarcode || "gtin" in optionsOrBarcode) {
            options = { barcodeData: optionsOrBarcode };
        } else {
            options = { ...optionsOrBarcode };
        }
    }

    const forceOffline = Boolean(
        options.forceOffline ||
        (typeof navigator !== "undefined" && !navigator.onLine) ||
        (typeof localStorage !== "undefined" && localStorage.getItem("slm_offline_mode") === "true")
    );

    console.log(`[Vision Orchestrator] Starting analysis. Offline forced: ${forceOffline}`);

    // STEP 1: Try Cloud Gemini Vision (if online and not forced offline)
    if (!forceOffline) {
        try {
            console.log("[Vision Orchestrator] Attempting Gemini Cloud Vision...");
            const result = await geminiProvider.extractLabelFields(image, options);
            const durationMs = Math.round(performance.now() - startTime);

            lastProviderUsed = "gemini";
            const telemetryEntry = {
                provider: "gemini",
                success: true,
                durationMs,
                error: null,
                timestamp: new Date().toISOString()
            };
            sessionTelemetry.push(telemetryEntry);

            return {
                success: true,
                data: result,
                source: "gemini",
                confidence: result.confidence,
                durationMs,
                error: null,
                telemetry: telemetryEntry
            };
        } catch (geminiErr) {
            console.warn("[Vision Orchestrator] Gemini failed, attempting offline OCR fallback:", geminiErr.message);
            sessionTelemetry.push({
                provider: "gemini",
                success: false,
                durationMs: Math.round(performance.now() - startTime),
                error: geminiErr.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    // STEP 2: Try Client-side Tesseract.js OCR
    try {
        console.log("[Vision Orchestrator] Running client-side Tesseract OCR fallback...");
        const result = await tesseractProvider.extractLabelFields(image, options);
        const durationMs = Math.round(performance.now() - startTime);

        lastProviderUsed = "tesseract";
        const telemetryEntry = {
            provider: "tesseract",
            success: true,
            durationMs,
            error: null,
            timestamp: new Date().toISOString()
        };
        sessionTelemetry.push(telemetryEntry);

        return {
            success: true,
            data: result,
            source: "tesseract",
            confidence: result.confidence,
            durationMs,
            error: null,
            telemetry: telemetryEntry
        };
    } catch (ocrErr) {
        console.warn("[Vision Orchestrator] Tesseract OCR failed, falling back to manual entry:", ocrErr.message);
        sessionTelemetry.push({
            provider: "tesseract",
            success: false,
            durationMs: Math.round(performance.now() - startTime),
            error: ocrErr.message,
            timestamp: new Date().toISOString()
        });
    }

    // STEP 3: Both failed — return clean manual entry structure without throwing
    const durationMs = Math.round(performance.now() - startTime);
    lastProviderUsed = "manual";
    const emptyFields = createEmptyLabelFields("manual");
    const telemetryEntry = {
        provider: "manual",
        success: false,
        durationMs,
        error: "All automated vision providers failed or were unavailable",
        timestamp: new Date().toISOString()
    };
    sessionTelemetry.push(telemetryEntry);

    return {
        success: true,
        data: emptyFields,
        source: "manual",
        confidence: 0,
        durationMs,
        error: "Automated extraction unavailable. Please enter declaration values manually.",
        telemetry: telemetryEntry
    };
}

// Attach backward-compatible VisionEngine global
export const VisionEngine = {
    analyzeLabel,
    getLastProviderUsed,
    getVisionTelemetry,
    createEmptyLabelFields
};

if (typeof window !== "undefined") {
    window.VisionEngine = VisionEngine;
    window.analyzeLabel = analyzeLabel;
}
