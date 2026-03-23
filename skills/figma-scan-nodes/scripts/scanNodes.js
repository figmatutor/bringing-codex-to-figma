// scanNodes.js - generic node scanning utility
// Execute this through mcp__figma__use_figma or an equivalent Plugin API runner.
//
// Usage:
//   scanNodes({ nodeId: "0:1", types: ["TEXT"], useChunking: true, chunkSize: 10 })
//   scanNodes({ nodeId: "0:1", types: ["FRAME", "COMPONENT"], includeInvisible: false })
//   scanNodes({ nodeId: "0:1", types: [] })  // all nodes

// ─── Inline helpers ─────────────────────────────────────────────────────────

function generateCommandId() {
  return (
    "cmd_" +
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendProgressUpdate(
  commandId,
  commandType,
  status,
  progress,
  totalItems,
  processedItems,
  message,
  payload = null
) {
  const update = {
    type: "command_progress",
    commandId,
    commandType,
    status,
    progress,
    totalItems,
    processedItems,
    message,
    timestamp: Date.now(),
  };

  if (payload) {
    if (
      payload.currentChunk !== undefined &&
      payload.totalChunks !== undefined
    ) {
      update.currentChunk = payload.currentChunk;
      update.totalChunks = payload.totalChunks;
      update.chunkSize = payload.chunkSize;
    }
    update.payload = payload;
  }

  console.log(`Progress update: ${status} - ${progress}% - ${message}`);
  await delay(0);
  return update;
}

// Recursively collect a flattened node list. Skip invisible nodes unless includeInvisible is true.
async function collectNodesToProcess(
  node,
  parentPath = [],
  depth = 0,
  nodesToProcess = [],
  includeInvisible = false
) {
  if (!includeInvisible && node.visible === false) return;

  const nodePath = [...parentPath, node.name || `Unnamed ${node.type}`];
  nodesToProcess.push({ node, parentPath: nodePath, depth });

  if ("children" in node) {
    for (const child of node.children) {
      await collectNodesToProcess(
        child,
        nodePath,
        depth + 1,
        nodesToProcess,
        includeInvisible
      );
    }
  }
}

// Extract type-specific metadata.
function processNode(node, parentPath, depth) {
  const base = {
    id: node.id,
    name: node.name || `Unnamed ${node.type}`,
    type: node.type,
    x: typeof node.x === "number" ? node.x : 0,
    y: typeof node.y === "number" ? node.y : 0,
    width: typeof node.width === "number" ? node.width : 0,
    height: typeof node.height === "number" ? node.height : 0,
    visible: node.visible !== false,
    path: parentPath.join(" > "),
    depth,
  };

  if (node.type === "TEXT") {
    let fontFamily = "";
    let fontStyle = "";
    if (node.fontName && node.fontName !== figma.mixed) {
      if ("family" in node.fontName) fontFamily = node.fontName.family;
      if ("style" in node.fontName) fontStyle = node.fontName.style;
    }
    return {
      ...base,
      characters: node.characters,
      fontSize: typeof node.fontSize === "number" ? node.fontSize : 0,
      fontFamily,
      fontStyle,
    };
  }

  if (node.type === "COMPONENT" || node.type === "INSTANCE") {
    return {
      ...base,
      componentId: node.mainComponent?.id ?? null,
    };
  }

  return base;
}

// ─── Main function ──────────────────────────────────────────────────────────

async function scanNodes(params) {
  const {
    nodeId,
    types = [],
    useChunking = true,
    chunkSize = 10,
    commandId = generateCommandId(),
    includeInvisible = false,
  } = params || {};

  if (!nodeId) {
    throw new Error("Missing required parameter: nodeId");
  }

  if (useChunking && (!Number.isInteger(chunkSize) || chunkSize <= 0)) {
    throw new Error("Invalid chunkSize: must be a positive integer when useChunking is true");
  }

  const filterByType = types.length > 0;
  const commandType = "scan_nodes";

  console.log(
    `Starting scanNodes from node ID: ${nodeId}, types: ${
      filterByType ? types.join(", ") : "ALL"
    }, chunking: ${useChunking}`
  );

  const rootNode = await figma.getNodeByIdAsync(nodeId);

  if (!rootNode) {
    await sendProgressUpdate(
      commandId,
      commandType,
      "error",
      0,
      0,
      0,
      `Node with ID ${nodeId} not found`,
      { error: `Node not found: ${nodeId}` }
    );
    throw new Error(`Node with ID ${nodeId} not found`);
  }

  // Collect a flattened list of all nodes.
  await sendProgressUpdate(
    commandId,
    commandType,
    "started",
    0,
    0,
    0,
    `Starting scan of "${rootNode.name || nodeId}"`,
    { types, chunkSize, includeInvisible }
  );

  const nodesToProcess = [];
  await collectNodesToProcess(
    rootNode,
    [],
    0,
    nodesToProcess,
    includeInvisible
  );

  const totalNodes = nodesToProcess.length;
  console.log(`Collected ${totalNodes} total nodes`);

  await sendProgressUpdate(
    commandId,
    commandType,
    "in_progress",
    5,
    totalNodes,
    0,
    `Collected ${totalNodes} nodes. Filtering and processing...`,
    { totalNodes, chunkSize }
  );

  if (!useChunking) {
    // Non-chunked path
    const results = [];
    for (const { node, parentPath, depth } of nodesToProcess) {
      if (!filterByType || types.includes(node.type)) {
        try {
          results.push(processNode(node, parentPath, depth));
        } catch (err) {
          console.error(`Error processing node ${node.id}: ${err.message}`);
        }
      }
    }

    await sendProgressUpdate(
      commandId,
      commandType,
      "completed",
      100,
      totalNodes,
      totalNodes,
      `Scan complete. Found ${results.length} nodes.`,
      { nodes: results }
    );

    figma.closePlugin(
      JSON.stringify({
        success: true,
        count: results.length,
        nodes: results,
        searchedTypes: filterByType ? types : ["ALL"],
        commandId,
      })
    );
    return;
  }

  // Chunked path
  const totalChunks = Math.ceil(totalNodes / chunkSize);
  console.log(`Processing in ${totalChunks} chunks of ${chunkSize}`);

  const allResults = [];
  let processedNodes = 0;
  let chunksProcessed = 0;

  for (let i = 0; i < totalNodes; i += chunkSize) {
    const chunkEnd = Math.min(i + chunkSize, totalNodes);
    const chunk = nodesToProcess.slice(i, chunkEnd);

    await sendProgressUpdate(
      commandId,
      commandType,
      "in_progress",
      Math.round(5 + (chunksProcessed / totalChunks) * 90),
      totalNodes,
      processedNodes,
      `Processing chunk ${chunksProcessed + 1}/${totalChunks}`,
      {
        currentChunk: chunksProcessed + 1,
        totalChunks,
        chunkSize,
        nodesFound: allResults.length,
      }
    );

    for (const { node, parentPath, depth } of chunk) {
      if (!filterByType || types.includes(node.type)) {
        try {
          allResults.push(processNode(node, parentPath, depth));
        } catch (err) {
          console.error(`Error processing node ${node.id}: ${err.message}`);
        }
      }
      await delay(5);
    }

    processedNodes += chunk.length;
    chunksProcessed++;

    await sendProgressUpdate(
      commandId,
      commandType,
      "in_progress",
      Math.round(5 + (chunksProcessed / totalChunks) * 90),
      totalNodes,
      processedNodes,
      `Chunk ${chunksProcessed}/${totalChunks} done. ${allResults.length} nodes found so far.`,
      {
        currentChunk: chunksProcessed,
        totalChunks,
        chunkSize,
        nodesFound: allResults.length,
      }
    );

    if (i + chunkSize < totalNodes) {
      await delay(50);
    }
  }

  await sendProgressUpdate(
    commandId,
    commandType,
    "completed",
    100,
    totalNodes,
    processedNodes,
    `Scan complete. Found ${allResults.length} nodes.`,
    { nodes: allResults, processedNodes, chunks: chunksProcessed }
  );

  figma.closePlugin(
    JSON.stringify({
      success: true,
      count: allResults.length,
      nodes: allResults,
      searchedTypes: filterByType ? types : ["ALL"],
      commandId,
    })
  );
}

// Export for reuse in other scripts or tests.
if (typeof module !== "undefined" && module.exports) {
  module.exports = { scanNodes, processNode, collectNodesToProcess };
}
