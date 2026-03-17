<script>
  import { onDestroy, onMount, tick } from "svelte";

  export let blocks = [];
  export let onSelect = () => {};
  export let highlightedHashes = [];
  export let isPaused = false;
  export let isFollowingLive = true;
  export let historyLoading = false;
  export let onTogglePause = () => {};
  export let onNeedHistory = () => {};
  export let onFollowLiveChange = () => {};
  export let onJumpToLive = () => {};

  const statusColors = {
    canonical: "#22c55e",
    pending: "#facc15",
    "rolled-back": "#f97316",
  };
  let rowHeight = 96;
  let blockWidth = 160;
  let blockHeight = 56;
  const blockRadius = 9;
  const visibleWindowMs = 60 * 1000;
  const targetTickCount = 9;
  const tickStepsMs = [
    5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000, 900000, 1800000,
  ];

  let nowMs = Date.now();
  let scroller;
  let lastKnownBlockCount = 0;
  let nowTimer;
  let viewportWidth = 1280;
  let historyTriggerLocked = false;

  const sortedBlocks = (items) =>
    [...items].sort((a, b) => {
      if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
      if (a.blockHeight !== b.blockHeight) return a.blockHeight - b.blockHeight;
      return a.hash.localeCompare(b.hash);
    });

  const nodeSort = (a, b) => {
    const aNum = Number(a.replace(/\D+/g, ""));
    const bNum = Number(b.replace(/\D+/g, ""));
    if (!Number.isNaN(aNum) && !Number.isNaN(bNum) && aNum !== bNum)
      return aNum - bNum;
    return a.localeCompare(b);
  };

  const ago = (timestamp, now) => {
    const delta = Math.max(0, now - timestamp);
    if (delta < 60000) return `${Math.floor(delta / 1000)} sec ago`;
    if (delta < 3600000) return `${Math.floor(delta / 60000)} min ago`;
    if (delta < 86400000) return `${Math.floor(delta / 3600000)} hr ago`;
    return `${Math.floor(delta / 86400000)} day ago`;
  };

  const pickTickStep = (spanMs) => {
    for (const step of tickStepsMs) {
      if (spanMs / step <= targetTickCount) return step;
    }
    return tickStepsMs[tickStepsMs.length - 1];
  };

  const colorFor = (status) => statusColors[status] || "#94a3b8";
  const shortHash = (hash) => (hash ? `${hash.slice(0, 8)}...` : "N/A");

  function jumpToLiveEdge() {
    if (!scroller) return;
    scroller.scrollLeft = scroller.scrollWidth;
  }

  function handleScroll() {
    if (!scroller) return;
    const remaining =
      scroller.scrollWidth - scroller.clientWidth - scroller.scrollLeft;
    if (remaining > 120 && isFollowingLive) onFollowLiveChange(false);

    if (
      scroller.scrollLeft < 240 &&
      !historyLoading &&
      !historyTriggerLocked &&
      !isFollowingLive
    ) {
      historyTriggerLocked = true;
      Promise.resolve(onNeedHistory()).finally(() => {
        historyTriggerLocked = false;
      });
    }
  }

  $: nodeIds = [...new Set(blocks.map((b) => b.nodeId))].sort(nodeSort);
  $: highlightedSet = new Set(highlightedHashes);
  $: isMobileLayout = viewportWidth <= 760;
  $: blockWidth = isMobileLayout ? 124 : 160;
  $: blockHeight = isMobileLayout ? 50 : 56;
  $: rowHeight = isMobileLayout ? 82 : 96;
  $: dataMinTs = blocks.length ? Math.min(...blocks.map((b) => b.timestamp)) : nowMs - visibleWindowMs;
  $: dataMaxTs = blocks.length ? Math.max(...blocks.map((b) => b.timestamp)) : nowMs;
  $: minTime = Math.min(dataMinTs, nowMs - visibleWindowMs);
  $: maxTime = Math.max(dataMaxTs, nowMs);
  $: spanMs = Math.max(visibleWindowMs, maxTime - minTime);
  $: timelineWidth = Math.max(1200, Math.round((spanMs / 1000) * 1.1));
  $: toX = (timestamp) => ((timestamp - minTime) / spanMs) * timelineWidth;

  $: rows = nodeIds.map((nodeId) => {
    const positioned = sortedBlocks(
      blocks.filter((b) => b.nodeId === nodeId),
    ).map((block) => ({
      ...block,
      x: toX(block.timestamp),
    }));

    const connectors = positioned.slice(1).map((block, index) => {
      const previous = positioned[index];
      const left = previous.x + blockWidth / 2;
      const right = block.x - blockWidth / 2;
      return {
        left,
        width: Math.max(8, right - left),
        status: block.status,
      };
    });

    return { nodeId, blocks: positioned, connectors };
  });

  $: tickStep = pickTickStep(spanMs);
  $: firstTick = Math.ceil(minTime / tickStep) * tickStep;
  $: ticks = (() => {
    const values = [];
    for (let ts = firstTick; ts <= maxTime; ts += tickStep) values.push(ts);
    return values;
  })();

  $: if (isFollowingLive && scroller && blocks.length !== lastKnownBlockCount) {
    lastKnownBlockCount = blocks.length;
    tick().then(jumpToLiveEdge);
  }

  onMount(() => {
    const handleResize = () => {
      viewportWidth = window.innerWidth;
    };
    handleResize();
    window.addEventListener("resize", handleResize);

    nowTimer = setInterval(() => {
      if (!isPaused && isFollowingLive) nowMs = Date.now();
    }, 1000);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  });

  onDestroy(() => {
    clearInterval(nowTimer);
  });
</script>

<div class="legend">
  <span><i class="dot canonical"></i>Canonical</span>
  <span><i class="dot pending"></i>Pending</span>
  <span><i class="dot rolled-back"></i>Rolled Back</span>
  <div class="legend-controls">
    <button
      class="live-btn"
      on:click={onTogglePause}
      aria-label={isPaused ? "Play live updates" : "Pause live updates"}
      title={isPaused ? "Play" : "Pause"}
    >
      {#if isPaused}
        &#9654;
      {:else}
        &#10074;&#10074;
      {/if}
    </button>
    <button
      class="live-btn jump-btn"
      on:click={() => {
        nowMs = Date.now();
        onFollowLiveChange(true);
        onJumpToLive();
        tick().then(jumpToLiveEdge);
      }}
      disabled={isFollowingLive}
      aria-label="Jump to live"
      title="Jump to live"
    >
      Jump to Live
    </button>
  </div>
</div>

<div class="board">
  <div class="left-column">
    <div class="corner">Nodes</div>
    {#each rows as row}
      <div class="node-label">{row.nodeId}</div>
    {/each}
  </div>

  <div class="timeline-scroll" bind:this={scroller} on:scroll={handleScroll}>
    <div class="timeline-header" style={`width:${timelineWidth}px`}>
      {#each ticks as t}
        <div class="tick" style={`left:${toX(t)}px`}>
          <span>{ago(t, nowMs)}</span>
        </div>
      {/each}
    </div>

    {#each rows as row}
      <div
        class="track"
        style={`width:${timelineWidth}px; height:${rowHeight}px`}
      >
        {#each row.connectors as connector}
          <div
            class="connector"
            style={`left:${connector.left}px; width:${connector.width}px; background:${colorFor(connector.status)}`}
          ></div>
        {/each}

        {#each row.blocks as block (block.hash)}
          <button
            class="block status-{block.status}"
            class:new-block={highlightedSet.has(
              `${block.nodeId}:${block.hash}`,
            )}
            style={`--block-half:${blockHeight / 2}px; left:${block.x - blockWidth / 2}px; width:${blockWidth}px; height:${blockHeight}px; border-radius:${blockRadius}px`}
            title={`${block.nodeId} #${block.blockHeight} (${block.status})`}
            on:click={() => onSelect(block)}
          >
            <span class="block-main">#{block.blockHeight}</span>
            <span class="block-sub">{shortHash(block.hash)}</span>
            <span class="block-sub">{ago(block.timestamp, nowMs)}</span>
          </button>
        {/each}
      </div>
    {/each}
  </div>
</div>


