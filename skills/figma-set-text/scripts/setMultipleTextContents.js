// setMultipleTextContents.js - ported batch text replacement utility
// Source: cursor-talk-to-figma-mcp/src/cursor_mcp_plugin/code.js line 2161-2428

// Helper function: delay for consistent timing
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Helper function: generate a unique commandId
function generateCommandId() {
  return (
    "cmd_" +
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}

// Helper function: send progress updates for tracking
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

  // Include chunk information when available
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

  // Also log to the console for the Plugin API execution context.
  console.log(`Progress update: ${status} - ${progress}% - ${message}`);

  return update;
}

function describeFontName(fontName) {
  if (!fontName) return "unknown";
  if (fontName === figma.mixed) return "mixed";
  if ("family" in fontName && "style" in fontName) {
    return `${fontName.family} ${fontName.style}`;
  }
  return "unknown";
}

// Helper function: set characters with font handling
const setCharacters = async (node, characters, options) => {
  const fallbackFont = (options && options.fallbackFont) || {
    family: "Inter",
    style: "Regular",
  };

  try {
    if (node.fontName === figma.mixed) {
      // For mixed fonts, use the first character's font when available.
      if ((node.characters || "").length > 0) {
        const firstCharFont = node.getRangeFontName(0, 1);
        await figma.loadFontAsync(firstCharFont);
        node.fontName = firstCharFont;
      } else {
        await figma.loadFontAsync(fallbackFont);
        node.fontName = fallbackFont;
      }
    } else {
      // Load the current font.
      await figma.loadFontAsync({
        family: node.fontName.family,
        style: node.fontName.style,
      });
    }
  } catch (err) {
    console.warn(
      `Failed to load "${describeFontName(node.fontName)}" font and replaced with fallback "${fallbackFont.family} ${fallbackFont.style}"`,
      err
    );
    await figma.loadFontAsync(fallbackFont);
    node.fontName = fallbackFont;
  }

  try {
    node.characters = characters;
    return true;
  } catch (err) {
    console.warn(`Failed to set characters. Skipped.`, err);
    return false;
  }
};

// Helper function: setTextContent (ported version)
async function setTextContent(params) {
  const { nodeId, text } = params || {};

  if (!nodeId) {
    throw new Error("Missing nodeId parameter");
  }

  if (text === undefined) {
    throw new Error("Missing text parameter");
  }

  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) {
    throw new Error(`Node not found with ID: ${nodeId}`);
  }

  if (node.type !== "TEXT") {
    throw new Error(`Node is not a text node: ${nodeId}`);
  }

  try {
    const didSetCharacters = await setCharacters(node, text);
    if (!didSetCharacters) {
      throw new Error("Failed to set characters");
    }

    return {
      id: node.id,
      name: node.name,
      characters: node.characters,
      fontName: node.fontName,
    };
  } catch (error) {
    throw new Error(`Error setting text content: ${error.message}`);
  }
}

// Main function: setMultipleTextContents
async function setMultipleTextContents(params) {
  const { nodeId, text } = params || {};
  const commandId = params?.commandId || generateCommandId();

  if (!text || !Array.isArray(text)) {
    const errorMsg = "Missing required parameter: text array";

    // Send an error progress update
    await sendProgressUpdate(
      commandId,
      "set_multiple_text_contents",
      "error",
      0,
      0,
      0,
      errorMsg,
      { error: errorMsg }
    );

    throw new Error(errorMsg);
  }

  if (nodeId !== undefined && typeof nodeId !== "string") {
    throw new Error("Invalid optional parameter: nodeId must be a string when provided");
  }

  const scopeMsg = nodeId ? ` within context node ${nodeId}` : "";
  console.log(`Starting text replacement${scopeMsg} with ${text.length} text replacements`);

  // Send the started progress update
  await sendProgressUpdate(
    commandId,
    "set_multiple_text_contents",
    "started",
    0,
    text.length,
    0,
    `Starting text replacement for ${text.length} nodes`,
    { totalReplacements: text.length, contextNodeId: nodeId ?? null }
  );

  // Prepare the result array and counters
  const results = [];
  let successCount = 0;
  let failureCount = 0;

  // Split text replacements into chunks of 5
  const CHUNK_SIZE = 5;
  const chunks = [];

  for (let i = 0; i < text.length; i += CHUNK_SIZE) {
    chunks.push(text.slice(i, i + CHUNK_SIZE));
  }

  console.log(`Split ${text.length} replacements into ${chunks.length} chunks`);

  // Send the chunking info update
  await sendProgressUpdate(
    commandId,
    "set_multiple_text_contents",
    "in_progress",
    5, // 5% progress for planning phase
    text.length,
    0,
    `Preparing to replace text in ${text.length} nodes using ${chunks.length} chunks`,
    {
      totalReplacements: text.length,
      chunks: chunks.length,
      chunkSize: CHUNK_SIZE,
    }
  );

  // Process each chunk sequentially
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex];
    console.log(
      `Processing chunk ${chunkIndex + 1}/${chunks.length} with ${chunk.length} replacements`
    );

    // Send the chunk processing start update
    await sendProgressUpdate(
      commandId,
      "set_multiple_text_contents",
      "in_progress",
      Math.round(5 + (chunkIndex / chunks.length) * 90), // 5-95% for processing
      text.length,
      successCount + failureCount,
      `Processing text replacements chunk ${chunkIndex + 1}/${chunks.length}`,
      {
        currentChunk: chunkIndex + 1,
        totalChunks: chunks.length,
        successCount,
        failureCount,
      }
    );

    // Process replacements within a chunk in parallel
    const chunkPromises = chunk.map(async (replacement) => {
      if (!replacement.nodeId || replacement.text === undefined) {
        console.error(`Missing nodeId or text for replacement`);
        return {
          success: false,
          nodeId: replacement.nodeId || "unknown",
          error: "Missing nodeId or text in replacement entry",
        };
      }

      try {
        console.log(
          `Attempting to replace text in node: ${replacement.nodeId}`
        );

        // Get the target text node, verify that it exists, and read the original text
        const textNode = await figma.getNodeByIdAsync(replacement.nodeId);

        if (!textNode) {
          console.error(`Text node not found: ${replacement.nodeId}`);
          return {
            success: false,
            nodeId: replacement.nodeId,
            error: `Node not found: ${replacement.nodeId}`,
          };
        }

        if (textNode.type !== "TEXT") {
          console.error(
            `Node is not a text node: ${replacement.nodeId} (type: ${textNode.type})`
          );
          return {
            success: false,
            nodeId: replacement.nodeId,
            error: `Node is not a text node: ${replacement.nodeId} (type: ${textNode.type})`,
          };
        }

        // Save the original text for the result
        const originalText = textNode.characters;
        console.log(`Original text: "${originalText}"`);
        console.log(`Will replace with: "${replacement.text}"`);

        // Highlight the node before changing its text
        let originalFills;
        try {
          // Save the original fills so they can be restored later
          originalFills = JSON.parse(JSON.stringify(textNode.fills));
          // Apply the highlight color: orange with 30% opacity
          textNode.fills = [
            {
              type: "SOLID",
              color: { r: 1, g: 0.5, b: 0 },
              opacity: 0.3,
            },
          ];
        } catch (highlightErr) {
          console.error(
            `Error highlighting text node: ${highlightErr.message}`
          );
          // Continue anyway because highlighting is only visual feedback
        }

        // Use setTextContent to handle font loading and text updates
        await setTextContent({
          nodeId: replacement.nodeId,
          text: replacement.text,
        });

        // Keep the highlight briefly after the text change, then restore the original fills
        if (originalFills) {
          try {
            // Use the delay helper to keep timing consistent
            await delay(500);
            textNode.fills = originalFills;
          } catch (restoreErr) {
            console.error(`Error restoring fills: ${restoreErr.message}`);
          }
        }

        console.log(
          `Successfully replaced text in node: ${replacement.nodeId}`
        );
        return {
          success: true,
          nodeId: replacement.nodeId,
          originalText: originalText,
          replacedText: replacement.text,
        };
      } catch (error) {
        console.error(
          `Error replacing text in node ${replacement.nodeId}: ${error.message}`
        );
        return {
          success: false,
          nodeId: replacement.nodeId,
          error: `Error applying replacement: ${error.message}`,
        };
      }
    });

    // Wait for every replacement in this chunk to finish
    const chunkResults = await Promise.all(chunkPromises);

    // Aggregate the results for this chunk
    chunkResults.forEach((result) => {
      if (result.success) {
        successCount++;
      } else {
        failureCount++;
      }
      results.push(result);
    });

    // Send the chunk completion update with partial results
    await sendProgressUpdate(
      commandId,
      "set_multiple_text_contents",
      "in_progress",
      Math.round(5 + ((chunkIndex + 1) / chunks.length) * 90), // 5-95% for processing
      text.length,
      successCount + failureCount,
      `Completed chunk ${chunkIndex + 1}/${chunks.length}. ${successCount} successful, ${failureCount} failed so far.`,
      {
        currentChunk: chunkIndex + 1,
        totalChunks: chunks.length,
        successCount,
        failureCount,
        chunkResults: chunkResults,
      }
    );

    // Add a short delay between chunks to reduce load on Figma
    if (chunkIndex < chunks.length - 1) {
      console.log("Pausing between chunks to avoid overloading Figma...");
      await delay(1000); // 1 second delay between chunks
    }
  }

  console.log(
    `Replacement complete: ${successCount} successful, ${failureCount} failed`
  );

  // Send the completed progress update
  await sendProgressUpdate(
    commandId,
    "set_multiple_text_contents",
    "completed",
    100,
    text.length,
    successCount + failureCount,
    `Text replacement complete: ${successCount} successful, ${failureCount} failed`,
    {
      totalReplacements: text.length,
      replacementsApplied: successCount,
      replacementsFailed: failureCount,
      completedInChunks: chunks.length,
      results: results,
    }
  );

  return {
    success: failureCount === 0,
    nodeId: nodeId ?? null,
    replacementsApplied: successCount,
    replacementsFailed: failureCount,
    totalReplacements: text.length,
    results: results,
    completedInChunks: chunks.length,
    commandId,
  };
}

// Export the main function and helpers for reuse in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    setMultipleTextContents,
    setTextContent,
    setCharacters,
    generateCommandId,
    sendProgressUpdate,
    delay
  };
}
