// ============================================================
// GEMINI VISION PROVIDER
// Calls backend Gemini Vision endpoint with 8s hard timeout & typed errors
// ============================================================

export class VisionProviderTimeoutError extends Error {
    constructor(message = "Gemini Vision request timed out after 8 seconds") {
        super(message);
        this.name = "VisionProviderTimeoutError";
    }
}

export class VisionProviderNetworkError extends Error {
    constructor(message = "Network error connecting to Gemini Vision service") {
        super(message);
        this.name = "VisionProviderNetworkError";
    }
}

export class VisionProviderAPIError extends Error {
    constructor(message = "Gemini Vision API error", status = 500, statusText = "") {
        super(message);
        this.name = "VisionProviderAPIError";
        this.status = status;
        this.statusText = statusText;
    }
}

/**
 * Converts a Blob to a base64 Data URL string.
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * Normalizes an array or single image input to base64 strings.
 * @param {Blob|string|Array<Blob|string>} input
 * @returns {Promise<string[]>}
 */
async function normalizeImages(input) {
    const rawList = Array.isArray(input) ? input : [input];
    const base64List = [];

    for (const item of rawList) {
        if (!item) continue;
        if (typeof item === "string") {
            base64List.push(item);
        } else if (item instanceof Blob) {
            base64List.push(await blobToBase64(item));
        }
    }

    return base64List;
}

/**
 * Extracts label fields from package photos using the Gemini Cloud Vision backend.
 * @param {Blob|string|Array<Blob|string>} imageBlobOrDataUrl
 * @param {Object} [options]
 * @param {Object} [options.barcodeData]
 * @param {number} [options.timeoutMs=8000]
 * @param {string} [options.endpoint]
 * @returns {Promise<Object>} LabelFields
 */
export async function extractLabelFields(imageBlobOrDataUrl, options = {}) {
    const timeoutMs = options.timeoutMs || 8000;
    const endpoint = options.endpoint || (typeof CONFIG !== "undefined" && CONFIG.VISION_PROXY_URL) || "http://localhost:5001/api/analyze-label";
    const barcodeData = options.barcodeData || null;

    if (typeof navigator !== "undefined" && !navigator.onLine) {
        throw new VisionProviderNetworkError("Device is offline. Gemini Cloud Vision cannot be reached.");
    }

    const images = await normalizeImages(imageBlobOrDataUrl);
    if (images.length === 0) {
        throw new Error("No valid image provided for Gemini Vision analysis.");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, timeoutMs);

    let response;
    try {
        response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                imageBase64: images[0],
                imageBase64s: images,
                barcodeData
            }),
            signal: controller.signal
        });
    } catch (fetchErr) {
        clearTimeout(timeoutId);
        if (fetchErr.name === "AbortError") {
            throw new VisionProviderTimeoutError(`Gemini Vision request timed out after ${timeoutMs / 1000}s`);
        }
        throw new VisionProviderNetworkError(`Failed to reach Gemini Vision endpoint (${fetchErr.message})`);
    } finally {
        clearTimeout(timeoutId);
    }

    if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new VisionProviderAPIError(
            `Gemini Vision returned HTTP ${response.status}: ${errorText}`,
            response.status,
            response.statusText
        );
    }

    let payload;
    try {
        payload = await response.json();
    } catch (jsonErr) {
        throw new VisionProviderAPIError("Invalid JSON response received from Gemini Vision service", 502);
    }

    if (!payload || !payload.data) {
        throw new VisionProviderAPIError(payload?.error || "Gemini returned empty or invalid data payload", 500);
    }

    const data = payload.data;

    // Calculate aggregate confidence from detected fields
    const confidenceValues = [
        data.manufacturer_name?.confidence,
        data.manufacturer_address?.confidence,
        data.product_name?.confidence,
        data.net_quantity?.confidence,
        data.mfg_date?.confidence,
        data.mrp?.confidence,
        data.consumer_care?.confidence
    ].filter(v => typeof v === "number" && !isNaN(v));

    const avgConfidence = confidenceValues.length > 0
        ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length
        : 0.90;

    // Ensure source and confidence are always set
    data.source = "gemini";
    data.confidence = Math.round(avgConfidence * 100) / 100;

    // Also populate camelCase convenience aliases
    data.manufacturerName = data.manufacturer_name?.value || null;
    data.manufacturerAddress = data.manufacturer_address?.value || null;
    data.pinCode = data.manufacturer_address?.pin_code || (data.manufacturer_address?.value?.match(/\b\d{6}\b/)?.[0]) || null;
    data.genericCommodityName = data.product_name?.value || null;
    data.netQuantity = data.net_quantity?.numeric_value || data.net_quantity?.value || null;
    data.netQuantityUnit = data.net_quantity?.unit || null;
    data.mfgDate = data.mfg_date?.value || null;
    data.mrp = data.mrp?.numeric_value || data.mrp?.value || null;
    data.mrpHasTaxStatement = Boolean(data.mrp?.has_tax_inclusion_statement);
    data.consumerCarePhone = data.consumer_care?.phone || null;
    data.consumerCareEmail = data.consumer_care?.email || null;
    data.consumerCareAddress = data.consumer_care?.address || null;
    data.fssaiNumber = data.fssai_license?.value || null;
    data.commodityCategory = data.classification?.commodity_category || null;
    data.prohibitedWordsFound = data.rule_text_checks?.offending_words || [];
    data.nonMetricUnitsFound = data.rule_text_checks?.prohibited_units_found || [];

    return data;
}
