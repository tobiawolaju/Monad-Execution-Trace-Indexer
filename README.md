## Monad Execution Trace Indexer
**Category:** Tooling / Blockchain Analytics  
**What it is:** A reorg-aware indexer that ingests Monad blocks to produce transaction traces, opcode-level execution data, and parallel execution metadata.  
**Why it matters:** Monad’s parallel execution + EVM compatibility is powerful but opaque. This tool answers key questions like:
- Which transactions executed in parallel?  
- When did conflicts force serialization?  
- Gas usage vs execution order.  
**Skills Highlighted:** EVM internals, block building logic, reorg handling, trace semantics.
