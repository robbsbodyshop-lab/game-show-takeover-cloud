import { useState } from 'react';
import { Button, Dialog } from '@/design';
import type { EventAction, EventSession, TeamEdit } from '@/engines/event';
import { editsFromTeams } from './editsFromTeams';
import { TeamEditor } from './TeamEditor';
import { validateTeamEdits } from './teamsValidation';
import styles from './EditTeamsDialog.module.css';

export interface EditTeamsDialogProps {
  open: boolean;
  session: EventSession;
  dispatch: (action: EventAction) => void;
  onClose: () => void;
}

/** Edit Teams from the hub (HOST_FEATURE_INVENTORY.md 2.4): renames keep scores; a new team count resets the order. */
export const EditTeamsDialog = ({ open, session, dispatch, onClose }: EditTeamsDialogProps) => {
  const [draft, setDraft] = useState<TeamEdit[]>(() => editsFromTeams(session.teams));
  const validation = validateTeamEdits(draft);
  const countChanged = draft.length !== session.teams.length;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Edit teams"
      dismissOnBackdrop={false}
      className={styles.dialog}
    >
      <TeamEditor value={draft} validation={validation} onChange={setDraft} />
      {countChanged ? (
        <p className={styles.warn} role="status">
          Changing the number of teams clears the play order
          {draft.length < session.teams.length ? ' and removes the last teams with their scores' : ''}.
        </p>
      ) : null}
      <div className={styles.actions}>
        <Button
          variant="confirm"
          disabled={!validation.ok}
          onClick={() => {
            dispatch({ type: 'SET_TEAMS', teams: draft });
            onClose();
          }}
        >
          Save teams
        </Button>
        <Button variant="quiet" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Dialog>
  );
};
