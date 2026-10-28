import type { HostSettingsRecord } from '../types';

/** The signed-in host's settings. Groups are replaced as a whole; groups not named are kept. */
export interface SettingsRepo {
  /** Defaults (three empty groups) when nothing has been saved yet. */
  load(): Promise<HostSettingsRecord>;
  /** Returns the full record after the save. */
  save(partial: Partial<HostSettingsRecord>): Promise<HostSettingsRecord>;
}
