export type SectionStatus = 'loading' | 'ready' | 'empty' | 'error';

export interface SectionState<T> {
    status: SectionStatus;
    data?: T;
    error?: string;
}

export function loadingSection<T>(): SectionState<T> {
    return { status: 'loading' };
}

export function readySection<T>(data: T): SectionState<T> {
    return { status: 'ready', data };
}

export function emptySection<T>(): SectionState<T> {
    return { status: 'empty' };
}

export function errorSection<T>(message = 'Unable to load this section.'): SectionState<T> {
    return { status: 'error', error: message };
}

export function getCollectionSectionState<T>(
    value: T[] | undefined,
    error?: unknown
): SectionState<T[]> {
    if (error !== undefined && error !== null) return errorSection(String(error));
    if (value === undefined) return loadingSection<T[]>();
    if (value.length === 0) return emptySection<T[]>();
    return readySection(value);
}
