import type { HostSettingsRecord } from '../../types';
import { emptySettings } from '../../schemas';
import type { SettingsRepo } from '../SettingsRepo';
import { attempt, requireUserId, toJson, type MemoryBackend } from './memoryBackend';

function copy(record: HostSettingsRecord): HostSettingsRecord {
  return toJson(record) as HostSettingsRecord;
}

export function createMemorySettingsRepo(backend: MemoryBackend): SettingsRepo {
  return {
    load() {
      return attempt(() => copy(backend.settings.get(requireUserId(backend)) ?? emptySettings()));
    },

    save(partial) {
      return attempt(() => {
        const userId = requireUserId(backend);
        const current = backend.settings.get(userId) ?? emptySettings();
        const stored = copy({
          feud: partial.feud ?? current.feud,
          wheel: partial.wheel ?? current.wheel,
          app: partial.app ?? current.app,
        });
        backend.settings.set(userId, stored);
        return copy(stored);
      });
    },
  };
}
