/**
 * Single import point for the host channel so the stage never reaches into `src/host` from many
 * places. The real implementation lives in `src/host/hostChannel.ts` (T11); if its signature
 * changes, only this file needs touching.
 */
export { createStageHostChannel, type StageHostChannel } from '@/host/hostChannel';
