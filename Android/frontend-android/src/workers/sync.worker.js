/* eslint-disable no-restricted-globals */

self.onmessage = async (e) => {
    const data = e.data;
    
    if (data.type === 'START_SYNC') {
        const { transactions, apiUrl, token } = data.payload;
        const CHUNK_SIZE = 50;

        try {
            for (let i = 0; i < transactions.length; i += CHUNK_SIZE) {
                const chunk = transactions.slice(i, i + CHUNK_SIZE);
                
                try {
                    const response = await fetch(`${apiUrl}/api/transactions/sync/bulk`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ transactions: chunk }),
                    });

                    if (response.ok) {
                        const result = await response.json();
                        // Report chunk success progressively
                        self.postMessage({
                            type: 'CHUNK_RESULT',
                            payload: {
                                synced_ids: result.synced_ids || [],
                                failed: result.failed || []
                            }
                        });
                    } else if (response.status === 404) {
                        // --- Fix 3: Bulk endpoint does not exist ---
                        // Signal main thread to fallback to single sync
                        // WITHOUT marking any transactions as failed
                        self.postMessage({ type: 'BULK_NOT_FOUND' });
                        return; // Exit the for-loop entirely
                    } else {
                        const errText = await response.text();
                        // Mark entire chunk as failed
                        const failedRecords = chunk.map(tx => ({ id: tx.id, error: `HTTP ${response.status}: ${errText}` }));
                        self.postMessage({
                            type: 'CHUNK_RESULT',
                            payload: {
                                synced_ids: [],
                                failed: failedRecords
                            }
                        });
                    }
                } catch (networkError) {
                    // Network dropped or similar
                    const failedRecords = chunk.map(tx => ({ id: tx.id, error: `Network error: ${networkError.message}` }));
                    self.postMessage({
                        type: 'CHUNK_RESULT',
                        payload: {
                            synced_ids: [],
                            failed: failedRecords
                        }
                    });
                    
                    // Stop processing further chunks if network fails completely
                    break;
                }
            }
            
            // Tell main thread we are done with all chunks
            self.postMessage({ type: 'SYNC_COMPLETE' });

        } catch (error) {
            self.postMessage({
                type: 'SYNC_FATAL_ERROR',
                error: error.message
            });
        }
    }
};
