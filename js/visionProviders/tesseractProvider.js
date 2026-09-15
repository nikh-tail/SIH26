// ============================================================
// TESSERACT OCR VISION PROVIDER
// Pure client-side offline OCR with heuristic field extraction
// ============================================================

import { createWorker } from "tesseract.js";
import { parseOcrText } from "./labelFieldParser.js";

/**
 * OFFLINE VENDORING NOTE:
 * Tesseract.js caches trained language models in IndexedDB automatically after first use.
 * For completely air-gapped, zero-network first runs without any prior internet:
 * 1. Download `eng.traineddata.gz` & `hin.traineddata.gz` from:
 *    https://github.com/naptha/tessdata/raw/gh-pages/4.0.0/eng.traineddata.gz
 *    https://github.com/naptha/tessdata/raw/gh-pages/4.0.0/hin.traineddata.gz
 * 2. Place them in your project's `/public/tessdata/` folder.
 * 3. Pass `{ langPath: '/tessdata' }` in options.
 */

let cachedWorker = null;
let currentLanguage = null;

/**
 * Gets or initializes a reusable Tesseract worker instance.
 * @param {string} [lang='eng+hin']
 * @param {Object} [options]
 * @returns {Promise<Tesseract.Worker>}
 */
async function getWorker(lang = "eng+hin", options = {}) {
    if (cachedWorker && currentLanguage === lang) {
        return cachedWorker;
    }

    if (cachedWorker) {
        try {
            await cachedWorker.terminate();
        } catch (e) {
            // Ignore termination error
        }
        cachedWorker = null;
    }

    const workerOptions = {};
    if (options.langPath) {
        workerOptions.langPath = options.langPath;
    }

    try {
        const worker = await createWorker(lang, 1, workerOptions);
        cachedWorker = worker;
        currentLanguage = lang;
        return worker;
    } catch (err) {
        console.warn(`[Tesseract] Failed to initialize worker with '${lang}', falling back to 'eng':`, err);
        // Fallback to basic English if bilingual model not cached or fails
        const fallbackWorker = await createWorker("eng", 1, workerOptions);
        cachedWorker = fallbackWorker;
        currentLanguage = "eng";
        return fallbackWorker;
    }
}

/**
 * Converts input into a format accepted by Tesseract (HTMLImageElement, Canvas, Blob, Data URL).
 * @param {Blob|string|Array<Blob|string>} input
 * @returns {string|Blob}
 */
function normalizeImageForOcr(input) {
    if (Array.isArray(input)) {
        return input[0];
    }
    return input;
}

/**
 * Extracts label fields from package photos using client-side Tesseract.js OCR.
 * @param {Blob|string|Array<Blob|string>} imageBlobOrDataUrl
 * @param {Object} [options]
 * @param {string} [options.language='eng+hin']
 * @param {string} [options.langPath]
 * @returns {Promise<Object>} LabelFields
 */
export async function extractLabelFields(imageBlobOrDataUrl, options = {}) {
    const lang = options.language || "eng+hin";
    const image = normalizeImageForOcr(imageBlobOrDataUrl);

    if (!image) {
        throw new Error("No valid image provided for Tesseract OCR.");
    }

    const worker = await getWorker(lang, options);
    const recognizeResult = await worker.recognize(image);

    const rawText = recognizeResult.data.text || "";
    const avgConfidence = (recognizeResult.data.confidence || 50) / 100;

    // Run heuristic rule-based field parser
    const parsedData = parseOcrText(rawText, avgConfidence);

    // Attach raw OCR debug details
    parsedData.rawOcrText = rawText;
    parsedData.source = "tesseract";

    return parsedData;
}
