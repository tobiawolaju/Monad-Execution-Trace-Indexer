import { FirebaseManager } from './src/managers/firebaseManager.js';

/**
 * Reset script to clear the Firebase Realtime Database.
 * This will delete everything at the root node (/).
 * 
 * Usage: node reset.js
 */
async function reset() {
  console.log('Starting Firebase reset...');
  const fm = new FirebaseManager();
  try {
    const db = await fm.initFirebase();
    console.log(`Connected to Firebase: ${db.app.options.databaseURL}`);
    
    // List of top-level nodes to clear.
    const nodes = ['blocks', 'blockHashIndex', 'transactions', 'traces', '_healthcheck'];
    
    for (const node of nodes) {
      console.log(`Deleting /${node}...`);
      await db.ref(`/${node}`).remove();
    }
    
    console.log('SUCCESS: Firebase reset complete. Specified nodes have been deleted.');
    process.exit(0);
  } catch (error) {
    console.error('ERROR: Failed to reset Firebase:', error.message);
    process.exit(1);
  }
}

reset();
