// ============================================================
// TESSERACT OCR VISION PROVIDER
// Pure client-side offline OCR with Computer Vision preprocessing
// and heuristic Legal Metrology field extraction
// ============================================================

import { createWorker } from "tesseract.js";
import { parseOcrText } from "./labelFieldParser.js";

let cachedWorker = null;
let currentLanguage = null;

/**
 * Returns local vendored worker options for 100% air-gapped offline use.
 */
function getLocalOptions() {
    const origin = (typeof window !== "undefined" && window.location && window.location.origin) ? window.location.origin : "";
    return {
        workerPath: `${origin}/tessdata/worker.min.js`,
        corePath: `${origin}/tessdata/tesseract-core-simd-lstm.wasm.js`,
        langPath: `${origin}/tessdata`,
        gzip: true
    };
}

/**
 * Gets or initializes a reusable Tesseract worker instance configured for packaging OCR.
 * @param {string} [lang='eng']
 * @param {Object} [options]
 * @returns {Promise<Tesseract.Worker>}
 */
async function getWorker(lang = "eng", options = {}) {
    const isOffline = (typeof localStorage !== "undefined" && localStorage.getItem("slm_offline_mode") === "true") ||
                      (typeof navigator !== "undefined" && !navigator.onLine);
    const targetLang = isOffline ? "eng" : (options.language || lang || "eng");

    if (cachedWorker && currentLanguage === targetLang) {
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

    const localOpts = getLocalOptions();
    const workerOptions = {
        ...localOpts,
        ...(options.workerOptions || {})
    };
    if (options.langPath) {
        workerOptions.langPath = options.langPath;
    }

    try {
        console.log(`[Tesseract] Initializing offline worker for '${targetLang}'...`);
        const worker = await createWorker(targetLang, 1, workerOptions);
        
        // Configure Tesseract for sparse packaging text layout (PSM 11)
        await worker.setParameters({
            tessedit_pageseg_mode: '11', // SPARSE_TEXT: Find as much text as possible in any order
            preserve_interword_spaces: '1'
        });

        cachedWorker = worker;
        currentLanguage = targetLang;
        return worker;
    } catch (err) {
        console.warn(`[Tesseract] Initialization failed with '${targetLang}', retrying with base local 'eng':`, err.message);
        const fallbackWorker = await createWorker("eng", 1, workerOptions);
        try {
            await fallbackWorker.setParameters({
                tessedit_pageseg_mode: '11',
                preserve_interword_spaces: '1'
            });
        } catch (pe) {}
        cachedWorker = fallbackWorker;
        currentLanguage = "eng";
        return fallbackWorker;
    }
}

/**
 * Loads an image source (data URL, blob, or HTMLImageElement) into a loaded HTMLImageElement.
 * @param {string|Blob|HTMLImageElement} source
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(source) {
    return new Promise((resolve, reject) => {
        if (typeof Image === "undefined") {
            return resolve(source);
        }
        if (source instanceof HTMLImageElement && source.complete && source.naturalWidth > 0) {
            return resolve(source);
        }
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Failed to load image for OCR preprocessing"));
        if (typeof source === "string") {
            img.src = source;
        } else if (source instanceof Blob) {
            img.src = URL.createObjectURL(source);
        } else {
            resolve(source);
        }
    });
}

/**
 * Preprocesses a packaging photo using client-side Canvas computer vision:
 * 1. Rescales high-resolution camera photos to optimal OCR dimension (~1400-1600px).
 * 2. Converts to perceptual grayscale (0.299R + 0.587G + 0.114B).
 * 3. Applies percentile-based dynamic contrast stretching (clipping 2nd/98th percentiles).
 * 4. Applies 3x3 unsharp mask convolution filter to sharpen fine 1mm packaging text.
 * 5. Generates both Normal and Inverted polarity versions for dark-on-light & light-on-dark text.
 * 
 * @param {HTMLImageElement|HTMLCanvasElement} img
 * @returns {{normal: HTMLCanvasElement|any, inverted: HTMLCanvasElement|null, isDark: boolean}}
 */
function preprocessImage(img) {
    if (typeof document === "undefined" || !img) {
        return { normal: img, inverted: null, isDark: false };
    }

    const origW = img.naturalWidth || img.width || 1200;
    const origH = img.naturalHeight || img.height || 800;

    // Rescale to optimal OCR resolution (max dimension 1600px, min dimension >= 800px)
    let scale = 1;
    const maxDim = Math.max(origW, origH);
    if (maxDim > 1600) {
        scale = 1600 / maxDim;
    } else if (maxDim < 800) {
        scale = 1200 / maxDim;
    }

    const w = Math.max(100, Math.round(origW * scale));
    const h = Math.max(100, Math.round(origH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);

    let imgData;
    try {
        imgData = ctx.getImageData(0, 0, w, h);
    } catch (e) {
        // Tainted canvas fallback
        return { normal: canvas, inverted: null, isDark: false };
    }

    const d = imgData.data;
    const totalPixels = w * h;

    // 1. Calculate luminance histogram
    const hist = new Uint32Array(256);
    const gray = new Uint8Array(totalPixels);
    let sumLum = 0;

    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
        // Luminance Y = 0.299R + 0.587G + 0.114B
        const y = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
        gray[p] = y;
        hist[y]++;
        sumLum += y;
    }

    const meanLum = sumLum / totalPixels;
    const isDark = meanLum < 125;

    // Find 2nd and 98th percentiles for robust contrast stretching (clips glare and dark borders)
    let p2 = 0, p98 = 255;
    let count = 0;
    const lowerThreshold = totalPixels * 0.02;
    const upperThreshold = totalPixels * 0.98;

    for (let i = 0; i < 256; i++) {
        count += hist[i];
        if (p2 === 0 && count >= lowerThreshold) p2 = i;
        if (count >= upperThreshold) { p98 = i; break; }
    }
    if (p98 <= p2) { p2 = 0; p98 = 255; }
    const range = p98 - p2;

    // 2. Contrast stretch
    const stretched = new Uint8Array(totalPixels);
    for (let p = 0; p < totalPixels; p++) {
        const val = gray[p];
        if (val <= p2) stretched[p] = 0;
        else if (val >= p98) stretched[p] = 255;
        else stretched[p] = Math.round(((val - p2) / range) * 255);
    }

    // 3. 3x3 unsharp mask sharpening filter & dual polarity canvas construction
    const normalImgData = ctx.createImageData(w, h);
    const nd = normalImgData.data;

    const invCanvas = document.createElement("canvas");
    invCanvas.width = w;
    invCanvas.height = h;
    const invCtx = invCanvas.getContext("2d", { willReadFrequently: true });
    const invImgData = invCtx.createImageData(w, h);
    const id = invImgData.data;

    for (let y = 0; y < h; y++) {
        const yOffset = y * w;
        const prevYOffset = (y > 0 ? y - 1 : 0) * w;
        const nextYOffset = (y < h - 1 ? y + 1 : h - 1) * w;

        for (let x = 0; x < w; x++) {
            const p = yOffset + x;
            const left = yOffset + (x > 0 ? x - 1 : 0);
            const right = yOffset + (x < w - 1 ? x + 1 : w - 1);

            const center = stretched[p];
            const top = stretched[prevYOffset + x];
            const bottom = stretched[nextYOffset + x];
            const lVal = stretched[left];
            const rVal = stretched[right];

            // Unsharp kernel: center*3.0 - 0.5*(top+bottom+left+right)
            let sharp = Math.round(3.0 * center - 0.5 * (top + bottom + lVal + rVal));
            if (sharp < 0) sharp = 0;
            else if (sharp > 255) sharp = 255;

            const idx = p * 4;
            // Normal enhanced
            nd[idx] = sharp;
            nd[idx + 1] = sharp;
            nd[idx + 2] = sharp;
            nd[idx + 3] = 255;

            // Inverted polarity (for light text on dark packaging)
            const invVal = 255 - sharp;
            id[idx] = invVal;
            id[idx + 1] = invVal;
            id[idx + 2] = invVal;
            id[idx + 3] = 255;
        }
    }

    ctx.putImageData(normalImgData, 0, 0);
    invCtx.putImageData(invImgData, 0, 0);

    return {
        normal: canvas,
        inverted: invCanvas,
        isDark
    };
}

/**
 * Runs OCR with dual-polarity execution to read both dark-on-light
 * and light-on-dark packaging text.
 * @param {Tesseract.Worker} worker
 * @param {string|Blob|HTMLImageElement} imgSource
 * @returns {Promise<{text: string, confidence: number}>}
 */
async function recognizeWithDualPolarity(worker, imgSource) {
    let prep;
    try {
        const loaded = await loadImage(imgSource);
        prep = preprocessImage(loaded);
    } catch (e) {
        console.warn("[Tesseract Preprocessor] Fallback to raw image:", e);
        prep = { normal: imgSource, inverted: null, isDark: false };
    }

    // Determine primary pass based on package background luminance
    const firstPassCanvas = (prep.isDark && prep.inverted) ? prep.inverted : prep.normal;
    const secondPassCanvas = prep.isDark ? prep.normal : prep.inverted;

    console.log(`[Tesseract] Running Primary OCR Pass (isDarkBackground=${prep.isDark})...`);
    const res1 = await worker.recognize(firstPassCanvas);
    let combinedText = (res1.data.text || "").trim();
    let conf = res1.data.confidence || 50;

    // Check if key Legal Metrology fields are missing or text is sparse
    const isSparse = combinedText.length < 50;
    const hasKeyFields = /(?:mrp|rs\.|₹)/i.test(combinedText) && /(?:kg|g|gm|ml|l)\b/i.test(combinedText);

    if ((isSparse || !hasKeyFields) && secondPassCanvas) {
        console.log("[Tesseract] Incomplete text on primary pass. Running Secondary Polarity Pass...");
        try {
            const res2 = await worker.recognize(secondPassCanvas);
            const text2 = (res2.data.text || "").trim();
            if (text2.length > 10) {
                combinedText = `${combinedText}\n${text2}`;
                conf = Math.max(conf, res2.data.confidence || 50);
            }
        } catch (err) {
            console.warn("[Tesseract] Secondary polarity pass skipped:", err.message);
        }
    }

    return { text: combinedText, confidence: conf / 100 };
}

/**
 * Extracts label fields from package photos using client-side Tesseract.js OCR.
 * Automatically handles multi-image panels, computer vision contrast enhancement,
 * unsharp sharpening, dual-polarity text detection, and registered barcode corroboration.
 * 
 * @param {Blob|string|Array<Blob|string>} imageBlobOrDataUrl
 * @param {Object} [options]
 * @param {string} [options.language='eng']
 * @param {string} [options.langPath]
 * @param {Object} [options.barcodeData] - Pre-scanned barcode metadata
 * @returns {Promise<Object>} Structured LabelFields
 */
export async function extractLabelFields(imageBlobOrDataUrl, options = {}) {
    const lang = options.language || "eng";
    const rawImages = Array.isArray(imageBlobOrDataUrl) ? imageBlobOrDataUrl : [imageBlobOrDataUrl];
    const validImages = rawImages.filter(Boolean);

    if (validImages.length === 0) {
        throw new Error("No valid image provided for Tesseract OCR.");
    }

    const worker = await getWorker(lang, options);

    let allText = "";
    let maxConf = 0.5;

    for (let i = 0; i < validImages.length; i++) {
        console.log(`[Tesseract] Processing label photo ${i + 1} of ${validImages.length}...`);
        const { text, confidence } = await recognizeWithDualPolarity(worker, validImages[i]);
        if (text) {
            allText += `\n${text}`;
            if (confidence > maxConf) maxConf = confidence;
        }
    }

    console.log(`[Tesseract] Completed OCR extraction (${allText.length} characters recognized).`);

    // Run heuristic rule-based field parser with barcode data corroboration
    const parsedData = parseOcrText(allText, maxConf, options.barcodeData);

    // Attach raw OCR debug details
    parsedData.rawOcrText = allText.trim();
    parsedData.source = "tesseract";

    return parsedData;
}

