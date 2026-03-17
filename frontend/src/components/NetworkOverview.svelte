<script>
  export let overview = null;
  export let nodes = [];

  const fmtAgo = (ts) => {
    if (!ts) return 'N/A';
    const deltaSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (deltaSec < 60) return `${deltaSec}s ago`;
    if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)}m ago`;
    return `${Math.floor(deltaSec / 3600)}h ago`;
  };
</script>

<section class="panel">
  <div class="cards">
    <article>
      <h3>Heads</h3>
      <p>{overview?.headsAgree ? 'In Sync' : 'Diverged'}</p>
    </article>
    <article>
      <h3>Highest Seen</h3>
      <p>{overview?.highestSeenBlock ?? 'N/A'}</p>
    </article>
    <article>
      <h3>Highest Indexed</h3>
      <p>{overview?.highestProcessedBlock ?? 'N/A'}</p>
    </article>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Node</th>
          <th>Seen</th>
          <th>Indexed</th>
          <th>Lag</th>
          <th>Queue</th>
          <th>Last Indexed</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {#if !nodes.length}
          <tr>
            <td colspan="7" class="empty">No node data yet</td>
          </tr>
        {:else}
          {#each nodes as node}
            <tr>
              <td>{node.nodeId}</td>
              <td>{node.latestSeenBlock ?? 'N/A'}</td>
              <td>{node.latestProcessedBlock ?? 'N/A'}</td>
              <td>{node.lagBlocks ?? 'N/A'}</td>
              <td>{node.queueDepth}{node.queuePaused ? ' (paused)' : ''}</td>
              <td>{fmtAgo(node.lastProcessedAt)}</td>
              <td>
                {#if node.isDisabled}
                  <span class="pill down">Disabled</span>
                {:else if node.lastErrorAt}
                  <span class="pill warn">Error</span>
                {:else}
                  <span class="pill ok">Healthy</span>
                {/if}
              </td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
</section>


