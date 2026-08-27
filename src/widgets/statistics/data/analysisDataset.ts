import { Card, PluginRem } from '@remnote/plugin-sdk';

export type AnalysisContextMode = 'Global' | 'Current';
export type AnalysisScopeMode = 'descendants' | 'comprehensive';

export interface AnalysisDataset {
    cards: Card[];
    contextMode: AnalysisContextMode;
    scopeMode: AnalysisScopeMode;
    contextRemId?: string;
}

export interface AnalysisDatasetRequest {
    contextMode: AnalysisContextMode;
    scopeMode: AnalysisScopeMode;
    contextRem?: PluginRem;
    globalCards?: Card[];
}

export interface AnalysisDatasetLoaders {
    getAllCards: () => Promise<Card[]>;
    getDescendants: (contextRem: PluginRem) => Promise<PluginRem[]>;
    getComprehensiveContextRems: (contextRem: PluginRem) => Promise<PluginRem[]>;
    getCards: (rem: PluginRem) => Promise<Card[] | undefined>;
}

export interface AnalysisDatasetResolution {
    dataset?: AnalysisDataset;
    error?: string;
}

const SCOPE_ERROR = 'The selected Rem scope could not be loaded.';
const BULK_FETCH_THRESHOLD = 200;

export function createAnalysisDataset(
    request: Pick<AnalysisDatasetRequest, 'contextMode' | 'scopeMode' | 'contextRem'>,
    cards: Card[],
): AnalysisDataset {
    return {
        cards,
        contextMode: request.contextMode,
        scopeMode: request.scopeMode,
        contextRemId: request.contextRem?._id,
    };
}

export async function resolveAnalysisDataset(
    request: AnalysisDatasetRequest,
    loaders: AnalysisDatasetLoaders,
): Promise<AnalysisDatasetResolution> {
    if (request.contextMode === 'Global') {
        if (request.globalCards === undefined) return {};
        return { dataset: createAnalysisDataset(request, request.globalCards) };
    }

    if (!request.contextRem) return {};

    try {
        const scopedRems = request.scopeMode === 'descendants'
            ? [request.contextRem, ...await loaders.getDescendants(request.contextRem)]
            : await loaders.getComprehensiveContextRems(request.contextRem);

        const cards: Card[] = [];
        if (scopedRems.length > BULK_FETCH_THRESHOLD) {
            const allSystemCards = await loaders.getAllCards();
            const scopeRemIds = new Set(scopedRems.map(rem => rem._id));
            cards.push(...allSystemCards.filter(card => scopeRemIds.has(card.remId)));
        } else {
            await Promise.all(scopedRems.map(async rem => {
                const remCards = await loaders.getCards(rem);
                if (remCards && remCards.length > 0) cards.push(...remCards);
            }));
        }

        return { dataset: createAnalysisDataset(request, cards) };
    } catch (error) {
        console.error('Stats Plugin: Error loading context data:', error);
        return {
            dataset: createAnalysisDataset(request, []),
            error: SCOPE_ERROR,
        };
    }
}
