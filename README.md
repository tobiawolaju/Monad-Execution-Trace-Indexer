# Monad Execution Trace Indexer

A **reorg-aware, multi-node blockchain indexer** for the Monad chain that ingests blocks, extracts transaction traces, handles forks/rollbacks, and powers a live multi-node dashboard with advanced visualization.

---

## Table of Contents

- [What It Is](#what-it-is)  
- [Purpose](#purpose)  
- [Features](#features)  
- [Architecture](#architecture)  
- [Backend](#backend)  
- [Frontend](#frontend)  
- [Storage](#storage)  
- [Setup](#setup)  
- [License](#license)  

---

## What It Is

This project is a **high-fidelity blockchain indexer** that:

- Reads blocks from multiple nodes via RPC endpoints  
- Tracks forks and reorgs, performing rollback when necessary  
- Extracts **opcode-level transaction traces**  
- Tracks **parallel execution metadata**  
- Supports ephemeral, real-time storage for live dashboards  
- Provides REST and WebSocket APIs for frontend consumption  

Think of it as a **real-time, instruction-level blockchain explorer backend** with multi-node visualization.

---

## Purpose

- Provide **low-level execution visibility** for high-throughput parallel chains  
- Help developers analyze transactions, execution order, and node reliability  
- Visualize **forks, rollbacks, and canonical chain** in real-time  
- Enable live dashboards with pause, rewind, and block-level detail inspection  

---

## Features

### Backend
- Multi-node block ingestion via HTTP/WebSocket RPC  
- Reorg detection and rollback handling  
- Opcode-level transaction trace extraction  
- Parallel execution tracking  
- Data normalization for consistent storage  
- REST API for historical queries  
- WebSocket API for real-time updates  

### Frontend
- Horizontal timeline = block height  
- Vertical stacking = nodes  
- Color-coded blocks: canonical, rolled-back, pending  
- Live canonical chain overlay  
- Pause and rewind functionality  
- Clickable block details: transaction traces, parallel execution metadata  
- Optional WASM processing for heavy parsing/visualization  

### Storage
- Firebase Realtime Database for ephemeral storage (last 1-hour data)  
- Time-indexed blocks for fast lookup and querying  

---

## Architecture

```

+-----------+       +--------------------+       +----------------+
| Node1 RPC |       |                    |       |                |
| Node2 RPC |  ---> | Node.js Indexer    | --->  | Firebase RTDB  |
| Node3 RPC |       |                    |       |                |
+-----------+       +--------------------+       +----------------+
|                             ^
v                             |
+------------------+                 |
| REST + WebSocket |-----------------+
| APIs             |
+------------------+
|
v
+-----------------+
| Frontend        |
| SolidJS/Svelte  |
| + WASM          |
+-----------------+

```

- Indexer pulls blocks from multiple nodes  
- Handles forks and rollbacks automatically  
- Stores normalized block + transaction + trace data in Firebase  
- Frontend displays **multi-node chains**, canonical overlay, and interactive block details  

---

## Backend

- **Block Ingestion:** Poll or subscribe to nodes via RPC  
- **Reorg Handling:** Detect forks, rollback affected blocks, apply canonical blocks  
- **Trace Extraction:** Parse opcode-level execution for each transaction  
- **Parallel Metadata:** Track which transactions executed concurrently  
- **API:** REST for historical queries, WebSocket for live updates  

---

## Frontend

- **Visualization:** Horizontal timeline = block height, vertical = nodes  
- **Live Updates:** Shows canonical chain on top  
- **Pause / Rewind:** User can pause streaming and inspect last 1-hour of blocks  
- **Details Modal:** Click a block to see full transaction traces and parallel execution info  

---

## Storage

- Ephemeral, real-time storage via **Firebase Realtime Database**  
- Keeps **last 1-hour** of blocks and transactions for performance  
- Stores canonical status per block for easy dashboard rendering  

---

## Setup

1. Clone the repo  
2. Configure `.env` with:
```

NODE1_RPC=[https://node1.monad.xyz:8545](https://node1.monad.xyz:8545)
NODE2_RPC=[https://node2.monad.xyz:8545](https://node2.monad.xyz:8545)
NODE3_RPC=wss://node3.monad.xyz:8546
FIREBASE_CONFIG=<your_firebase_config>

````
3. Install dependencies:
```bash
npm install
````

4. Start backend:

   ```bash
   npm run dev
   ```
5. Start frontend:

   ```bash
   npm run start
   ```
6. Open dashboard in browser to see live multi-node chain visualization

---

## License

MIT License

```
