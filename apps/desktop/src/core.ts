/**
 * Single entry point for everything desktop needs from @bigbrother/core.
 *
 * We import core's source modules directly (via the workspace symlink) instead of the package root so that
 * desktop only depends on the archive utilities and parsers, not on the insights engine (which is built
 * separately and is not needed on the server side). tsx/vitest resolve the .ts sources without a build step.
 */
export type { Archive, Claim, Event, Kind, ParseResult, Parser, Source } from '../../../packages/core/src/types.ts';
export { ZipArchive, MapArchive, MultiArchive, zipArchiveStreaming, defaultKeep, norm } from '../../../packages/core/src/util/archive.ts';
export { parseAll, detectSources as detectArchiveSources, parsers } from '../../../packages/core/src/parsers/index.ts';
