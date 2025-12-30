import { PluginRem } from '@remnote/plugin-sdk';

/**
 * Gathers a comprehensive scope of Rems related to the context Rem.
 * Includes:
 * 1. Descendants
 * 2. Rems in the same Document or Portal context
 * 3. Rems in the Folder Queue
 * 4. Sources
 * 5. Rems referencing the context Rem
 */
export async function getComprehensiveContextRems(contextRem: PluginRem): Promise<PluginRem[]> {
  console.log(`[Statistics] Gathering comprehensive scope for ${contextRem._id}...`);

  // 1. Descendants
  const descendants = await contextRem.getDescendants();
  
  // 2. Document / Portal Context
  // Captures rems if the context is a document or inside a portal
  const allRemsInContext = await contextRem.allRemInDocumentOrPortal() || [];

  // 3. Folder Queue
  // Captures rems if the context is a folder with a queue
  const folderQueueRems = await contextRem.allRemInFolderQueue() || [];

  // 4. Sources
  // Captures sources attached to this rem
  const sources = await contextRem.getSources() || [];

  // 5. Referencing Rems
  // Captures rems that link to or tag this rem
  // Note: The reference snippet included logic to resolve parent Rems for specific PowerUp slots.
  // Without those specific PowerUp codes, we include all referencing Rems directly.
  const referencingRems = await contextRem.remsReferencingThis() || [];

  // Deduplicate using a Set of IDs
  const uniqueIds = new Set<string>();
  const uniqueRems: PluginRem[] = [];

  const addRems = (rems: PluginRem[]) => {
    rems.forEach((rem) => {
      if (rem && !uniqueIds.has(rem._id)) {
        uniqueIds.add(rem._id);
        uniqueRems.push(rem);
      }
    });
  };

  // Add Self
  addRems([contextRem]);
  
  // Add all gathered categories
  addRems(descendants);
  addRems(allRemsInContext);
  addRems(folderQueueRems);
  addRems(sources);
  addRems(referencingRems);

  console.log(`[Statistics] Scope gathered. Found ${uniqueRems.length} unique Rems.`);
  return uniqueRems;
}