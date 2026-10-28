/**
 * The team phone at `/play` (T10): room code -> team -> BUZZ / podium. The flow lives in
 * `usePhoneFlow`, the live connection in `useStageLink`; this component only picks the screen.
 */
import { Button } from '@/design';
import { JoinScreen } from './JoinScreen';
import { PlayScreen } from './PlayScreen';
import { StatusPanel } from './StatusPanel';
import { TeamPicker } from './TeamPicker';
import { usePhoneFlow } from './usePhoneFlow';
import styles from './phone.module.css';

export interface PhoneAppProps {
  /** Query string to read `room` from; defaults to `window.location.search`. */
  search?: string;
}

export const PhoneApp = ({ search }: PhoneAppProps) => {
  const flow = usePhoneFlow(search ?? window.location.search);
  const { state } = flow;

  switch (state.phase) {
    case 'signing-in':
      return (
        <main className={styles.page}>
          <StatusPanel title="Getting ready…" spinner />
        </main>
      );
    case 'sign-in-failed':
      return (
        <main className={styles.page}>
          <StatusPanel title="Could not sign in" detail="Check your connection and try again.">
            <Button size="lg" onClick={flow.retrySignIn}>
              Try again
            </Button>
          </StatusPanel>
        </main>
      );
    case 'code':
      return (
        <JoinScreen
          key={state.nonce}
          initialCode={state.code}
          error={state.error}
          onSubmit={flow.submitCode}
          onChangeRoom={flow.changeRoom}
        />
      );
    case 'joining':
      return (
        <main className={styles.page}>
          <StatusPanel title={`Joining room ${state.code}…`} spinner />
        </main>
      );
    case 'team':
      return (
        <TeamPicker
          key={state.code}
          code={state.code}
          teams={state.teams}
          settingUp={state.settingUp}
          initialNickname={flow.nickname}
          onPick={flow.pickTeam}
          onChangeRoom={flow.changeRoom}
        />
      );
    case 'play':
      return flow.userId === null ? null : (
        <PlayScreen
          key={`${state.code}:${String(state.team)}`}
          code={state.code}
          team={state.team}
          teams={state.teams}
          nickname={flow.nickname}
          userId={flow.userId}
          onTeams={flow.stageTeams}
          onGiveUp={flow.giveUp}
          onChangeTeam={flow.changeTeam}
          onChangeRoom={flow.changeRoom}
        />
      );
  }
};
