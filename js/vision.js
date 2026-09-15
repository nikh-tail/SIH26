// ============================================================
// GEMINI VISION MULTIMODAL EXTRACTION ENGINE
// (Calls secure backend endpoint defined in CONFIG.VISION_PROXY_URL)
// ============================================================

const VisionEngine = {
    async analyzeLabel(imageBase64, barcodeData = null) {
        const endpoint = CONFIG.VISION_PROXY_URL;
        const images = Array.isArray(imageBase64) ? imageBase64 : [imageBase64];

        console.log('[Vision] Starting request:', {
            endpoint,
            imageCount: images.length,
            hasBarcodeData: Boolean(barcodeData)
        });

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageBase64: images[0],
                    imageBase64s: images,
                    barcodeData
                })
            });

            if (!response.ok) {
                const errorBody = await response.text();
                console.error('[Vision] Backend HTTP error:', {
                    status: response.status,
                    statusText: response.statusText,
                    body: errorBody
                });
                throw new Error(`Server at ${endpoint} returned HTTP ${response.status}: ${errorBody}`);
            }

            const result = await response.json();
            console.log('[Vision] Backend response:', {
                success: result?.success,
                simulated: result?.simulated,
                hasData: Boolean(result?.data),
                error: result?.error,
                modelUsed: result?.modelUsed
            });

            if (result && result.data) {
                return {
                    success: result.success !== false,
                    data: result.data,
                    rawResponse: result.rawResponse
                };
            }

            console.error('[Vision] Unexpected backend response structure:', result);
            throw new Error(result?.error || 'Unexpected response structure from backend');
        } catch (error) {
            console.error(`[Vision] API call to ${endpoint} failed:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }
};
