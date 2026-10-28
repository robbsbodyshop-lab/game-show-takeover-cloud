import { useId, useState } from 'react';
import { Button, Label, Marquee, MemoryCardMenu, Panel, Stripes, type MemoryCardItem } from '@/design';
import type { TeamSummary } from '@/data/types';
import { StatusPanel } from './StatusPanel';
import { MAX_NICKNAME } from './usePhoneFlow';
import styles from './phone.module.css';

export interface TeamPickerProps {
  code: string;
  teams: readonly TeamSummary[];
  /** No teams yet: the host has not finished setup. The parent polls every 5 s. */
  settingUp: boolean;
  initialNickname: string;
  onPick: (team: number, nickname: string) => void;
  onChangeRoom: () => void;
}

/** Choose a team (phone N is team N) and optionally a nickname. */
export const TeamPicker = ({
  code,
  teams,
  settingUp,
  initialNickname,
  onPick,
  onChangeRoom,
}: TeamPickerProps) => {
  const nicknameId = useId();
  const [nickname, setNickname] = useState(initialNickname);

  if (settingUp) {
    return (
      <main className={styles.page}>
        <StatusPanel
          title="Host is still setting up"
          detail={`Room ${code}. This page updates by itself.`}
          spinner
        >
          <Button variant="quiet" onClick={onChangeRoom}>
            Change room
          </Button>
        </StatusPanel>
      </main>
    );
  }

  const items: MemoryCardItem[] = teams.map((team) => ({
    id: String(team.id),
    title: team.name,
    icon: <span className={styles.swatch} style={{ backgroundColor: team.color }} />,
  }));

  return (
    <main className={styles.page}>
      <Marquee as="h1" className={styles.title}>
        Pick your team
      </Marquee>
      <Panel className={styles.panel}>
        <Stripes />
        <div className={styles.field}>
          <Label htmlFor={nicknameId}>Nickname (optional)</Label>
          <input
            id={nicknameId}
            className={styles.input}
            value={nickname}
            maxLength={MAX_NICKNAME}
            autoComplete="off"
            onChange={(event) => {
              setNickname(event.target.value);
            }}
          />
        </div>
        <MemoryCardMenu
          label="Teams"
          items={items}
          columns={2}
          onSelect={(id) => {
            onPick(Number(id), nickname);
          }}
        />
        <p className={styles.hint}>Room {code}</p>
        <Button variant="quiet" onClick={onChangeRoom}>
          Change room
        </Button>
      </Panel>
    </main>
  );
};
