<script>
  import { onDestroy, onMount, tick } from "svelte";
  import { Chart, BubbleController, LineController, PointElement, LineElement, LinearScale, Tooltip, Legend } from 'chart.js';

  Chart.register(BubbleController, LineController, PointElement, LineElement, LinearScale, Tooltip, Legend);

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
  const visibleWindowMs = 60 * 1000;
  const targetTickCount = 9;
  const tickStepsMs = [
    5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000, 900000, 1800000,
  ];

  let nowMs = Date.now();
  let scroller;
  let chartCanvas;
  let chartInstance;
  let lastKnownBlockCount = 0;
  let nowTimer;
  let viewportWidth = 1280;
  let historyTriggerLocked = false;

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
  $: rowHeight = isMobileLayout ? 82 : 96;
  $: dataMinTs = blocks.length ? Math.min(...blocks.map((b) => b.timestamp)) : nowMs - visibleWindowMs;
  $: dataMaxTs = blocks.length ? Math.max(...blocks.map((b) => b.timestamp)) : nowMs;
  $: minTime = Math.min(dataMinTs, nowMs - visibleWindowMs);
  $: maxTime = Math.max(dataMaxTs, nowMs);
  $: spanMs = Math.max(visibleWindowMs, maxTime - minTime);
  $: timelineWidth = Math.max(1200, Math.round((spanMs / 1000) * 80)); // 80px per second for better visibility
  $: toX = (timestamp) => ((timestamp - minTime) / spanMs) * timelineWidth;

  $: if (isFollowingLive && scroller && blocks.length !== lastKnownBlockCount) {
    lastKnownBlockCount = blocks.length;
    tick().then(jumpToLiveEdge);
  }

  $: tickStep = pickTickStep(spanMs);
  $: firstTick = Math.ceil(minTime / tickStep) * tickStep;
  $: ticks = (() => {
    const values = [];
    for (let ts = firstTick; ts <= maxTime; ts += tickStep) values.push(ts);
    return values;
  })();

  function initChart() {
    if (!chartCanvas) return;
    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(chartCanvas, {
      type: 'bubble',
      data: {
        datasets: []
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        animation: false,
        layout: { padding: { top: 10, bottom: 10 } },
        scales: {
          x: { display: false, type: 'linear', min: minTime, max: maxTime },
          y: { 
            display: true, 
            type: 'linear', 
            min: -0.5, 
            max: nodeIds.length - 0.5, 
            reverse: true,
            ticks: { display: false },
            grid: {
              color: 'rgba(63, 63, 70, 0.5)',
              drawBorder: false,
              lineWidth: 1
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(18, 18, 20, 0.95)',
            titleColor: '#a855f7',
            bodyColor: '#fafafa',
            borderColor: 'rgba(168, 85, 247, 0.4)',
            borderWidth: 1,
            padding: 12,
            cornerRadius: 10,
            callbacks: {
              label: (ctx) => {
                if (ctx.dataset.type === 'line') return null;
                const b = ctx.raw.block;
                return [
                  `Block #${b.blockHeight}`,
                  `Hash: ${b.hash.slice(0, 12)}...`,
                  `Transactions: ${b.transactions?.length || 0}`,
                  `Status: ${b.status}`
                ];
              }
            }
          }
        },
        onClick: (event, elements) => {
          const activeElements = chartInstance.getElementsAtEventForMode(event, 'nearest', { intersect: true }, true);
          if (activeElements.length > 0) {
            const index = activeElements[0].index;
            const datasetIndex = activeElements[0].datasetIndex;
            const dataPoint = chartInstance.data.datasets[datasetIndex].data[index];
            if (dataPoint.block) {
              onSelect(dataPoint.block);
            }
          }
        }
      }
    });
  }

  $: if (chartInstance) {
    chartInstance.options.scales.x.min = minTime;
    chartInstance.options.scales.x.max = maxTime;
    chartInstance.options.scales.y.max = nodeIds.length - 0.5;

    const datasets = [];

    nodeIds.forEach((nodeId, nodeIdx) => {
      const nodeBlocks = blocks.filter(b => b.nodeId === nodeId).sort((a,b) => a.timestamp - b.timestamp);
      
      // Connectors (Lines)
      if (nodeBlocks.length > 1) {
        datasets.push({
          type: 'line',
          label: `${nodeId}-connectors`,
          data: nodeBlocks.map(b => ({ x: b.timestamp, y: nodeIdx })),
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          tension: 0,
          order: 2
        });
      }

      // Blocks (Bubbles)
      datasets.push({
        type: 'bubble',
        label: nodeId,
        data: nodeBlocks.map(b => ({
          x: b.timestamp,
          y: nodeIdx,
          r: Math.min(25, Math.max(8, Math.sqrt(b.transactions?.length || 0) * 4.5)),
          block: b
        })),
        backgroundColor: nodeBlocks.map(b => colorFor(b.status)),
        borderColor: nodeBlocks.map(b => highlightedSet.has(`${b.nodeId}:${b.hash}`) ? '#ffffff' : 'rgba(0,0,0,0.1)'),
        borderWidth: nodeBlocks.map(b => highlightedSet.has(`${b.nodeId}:${b.hash}`) ? 4 : 1),
        hoverRadius: 32,
        order: 1
      });
    });

    chartInstance.data.datasets = datasets;
    chartInstance.update('none');
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

    initChart();

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  });

  onDestroy(() => {
    clearInterval(nowTimer);
    if (chartInstance) chartInstance.destroy();
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
    {#each nodeIds as nodeId}
      <div class="node-label" style="height: {rowHeight}px">{nodeId}</div>
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

    <div class="chart-container" style="width: {timelineWidth}px; height: {nodeIds.length * rowHeight}px; position: relative;">
      <canvas bind:this={chartCanvas} width={timelineWidth} height={nodeIds.length * rowHeight}></canvas>
    </div>
  </div>
</div>

<style>
  .chart-container canvas {
    display: block;
    cursor: crosshair;
  }
</style>



