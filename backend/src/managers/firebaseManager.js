import fs from 'fs';
import admin from 'firebase-admin';
import { config } from '../config/index.js';

function sanitizeForRTDB(input) {
  if (input === undefined || input === null) return null;
  if (Array.isArray(input)) return input.map((item) => sanitizeForRTDB(item));
  if (typeof input === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(input)) out[key] = sanitizeForRTDB(value);
    return out;
  }
  return input;
}

function sanitizeKey(key) {
  // RTDB path tokens cannot contain: . # $ [ ] /
  return String(key).replace(/[.#$\[\]/]/g, '_');
}

async function loadServiceAccount(path) {
  if (!path) throw new Error('Missing service account path (ServeiceAccuntJson)');

  if (path.startsWith('http://') || path.startsWith('https://')) {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to fetch service account from URL: ${response.statusText}`);
    }
    const serviceAccount = await response.json();
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    return serviceAccount;
  }

  const raw = fs.readFileSync(path, 'utf8');
  const serviceAccount = JSON.parse(raw);
  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }
  return serviceAccount;
}

export class FirebaseManager {
  constructor() {
    this.db = null;
  }

  async initFirebase() {
    const serviceAccount = await loadServiceAccount(config.firebase.serviceAccountJsonPath);
    const databaseURL = config.firebase.databaseURL || serviceAccount.databaseURL;

    if (!databaseURL) {
      throw new Error('Missing FIREBASE_DATABASE_URL (or databaseURL in service account JSON)');
    }

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL
      });
    }

    this.db = admin.database();
    return this.db;
  }

  async verifyDatabaseConnection() {
    if (!this.db) throw new Error('Firebase not initialized');

    // Use a normal writable node; `.info/*` is not suitable for Admin SDK health checks.
    const healthRef = this.db.ref('_healthcheck/bootstrap');
    await healthRef.set({ ts: Date.now(), ok: true });
    await healthRef.remove();
  }

  async writeBlockBundle(block, tracesByTxHash = {}) {
    if (!this.db) throw new Error('Firebase not initialized');

    const updates = {};
    updates[`blocks/${block.blockHeight}`] = sanitizeForRTDB({
      hash: block.hash,
      parentHash: block.parentHash,
      timestamp: block.timestamp,
      txCount: block.transactions.length,
      nodeId: block.nodeId,
      status: block.status
    });
    updates[`blockHashIndex/${sanitizeKey(block.hash)}`] = block.blockHeight;

    for (const tx of block.transactions) {
      const txKey = sanitizeKey(tx.hash);

      updates[`transactions/${txKey}`] = sanitizeForRTDB({
        txHash: tx.hash,
        blockHeight: block.blockHeight,
        timestamp: block.timestamp,
        from: tx.from,
        to: tx.to,
        gasUsed: tx.gasUsed ?? null,
        status: tx.status
      });

      updates[`traces/${txKey}`] = sanitizeForRTDB({
        txHash: tx.hash,
        timestamp: block.timestamp,
        opcodeSummary: tracesByTxHash[tx.hash]?.opcodeSummary ?? {},
        executionMetadata: tracesByTxHash[tx.hash]?.executionMetadata ?? {},
        parallelGroup: tracesByTxHash[tx.hash]?.parallelGroup ?? null
      });
    }

    await this.db.ref().update(updates);
  }

  async rollbackBlocks(fromHeight, toHeight) {
    if (!this.db) throw new Error('Firebase not initialized');
    const updates = {};
    for (let h = fromHeight; h <= toHeight; h += 1) {
      updates[`blocks/${h}`] = null;
    }
    await this.db.ref().update(updates);
  }

  async cleanupOldData(maxAgeMs = 5 * 60 * 1000) {
    if (!this.db) throw new Error('Firebase not initialized');
    
    const cutoffTs = Date.now() - maxAgeMs;
    console.log(`Cleanup: Removing data older than ${maxAgeMs / 60000} minutes (before ${new Date(cutoffTs).toISOString()})`);

    try {
      // Find old blocks.
      const oldBlocksRef = this.db.ref('blocks').orderByChild('timestamp').endAt(cutoffTs).limitToFirst(500);
      const snap = await oldBlocksRef.get();
      if (!snap.exists()) {
        console.log('Cleanup: No old blocks found.');
        return;
      }

      const oldBlocks = snap.val();
      const updates = {};
      let totalDeleted = 0;

      for (const [height, block] of Object.entries(oldBlocks)) {
        updates[`blocks/${height}`] = null;
        if (block.hash) {
          const hashKey = sanitizeKey(block.hash);
          updates[`blockHashIndex/${hashKey}`] = null;
          
          // Note: In an ideal world, we would also find the transactions of this block.
          // But since we don't store a list of hashes in the block object, we'd need to search.
          // However, we can use the fact that we have transactions referenced by the same hashKey if they are single-node traces.
          // The current indexer uses block-hash as the key for transactions and traces if it's a "bundle".
          // Wait, look at line 91-109 in writeBlockBundle: it uses `sanitizeKey(tx.hash)`.
        }
        totalDeleted += 1;
      }

      // Special case: if there are many transactions, we might not know their hashes easily.
      // But we can clean up the transactions and traces by their own timestamp if we added one.
      // Since they don't have one, we can either:
      // 1. Just clear the main folders if the whole thing is requested.
      // 2. Clear anything older than X blocks.
      
      // Let's stick to the user's "simply delete the whole thing" if it's getting too big, 
      // but try the node-by-node approach first.
      
      await this.db.ref().update(updates);
      console.log(`Cleanup: Deleted ${totalDeleted} blocks and their hash index entries.`);

      // Also cleanup transactions and traces independently using their own indices.
      const oldTxsRef = this.db.ref('transactions').orderByChild('timestamp').endAt(cutoffTs).limitToFirst(500);
      const txSnap = await oldTxsRef.get();
      if (txSnap.exists()) {
        const txUpdates = {};
        Object.keys(txSnap.val()).forEach(key => {
          txUpdates[`transactions/${key}`] = null;
          txUpdates[`traces/${key}`] = null;
        });
        await this.db.ref().update(txUpdates);
        console.log(`Cleanup: Deleted ${Object.keys(txUpdates).length / 2} transactions and traces.`);
      }
    } catch (error) {
      console.error('Cleanup: Error during data removal:', error.message);
    }
  }

  async loadHistoricalBlocks({ beforeTs, limit = 200 }) {
    if (!this.db) throw new Error('Firebase not initialized');
    const ref = this.db.ref('blocks').orderByChild('timestamp').endAt(beforeTs - 1).limitToLast(limit);
    const snap = await ref.get();
    if (!snap.exists()) return [];

    const value = snap.val() || {};
    return Object.entries(value)
      .map(([height, block]) => ({
        blockHeight: Number(height),
        hash: block?.hash || null,
        parentHash: block?.parentHash || null,
        timestamp: Number(block?.timestamp) || 0,
        nodeId: block?.nodeId || 'unknown',
        status: block?.status || 'canonical',
        transactions: []
      }))
      .filter((b) => b.hash)
      .sort((a, b) => a.timestamp - b.timestamp);
  }
}
