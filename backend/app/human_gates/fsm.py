from enum import Enum
from dataclasses import dataclass
from typing import List, Dict, Optional, Any
from datetime import datetime

class ObligationState(Enum):
    NOT_STARTED = "NOT_STARTED"
    DATA_COLLECTED = "DATA_COLLECTED"
    RECONCILED = "RECONCILED"
    RULES_CHECKED = "RULES_CHECKED"
    REVIEW_PENDING = "REVIEW_PENDING"
    REVIEWED = "REVIEWED"
    SIGNING_PENDING = "SIGNING_PENDING"
    SIGNED = "SIGNED"
    TRANSMITTING = "TRANSMITTING"
    FILED = "FILED"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    FAILED = "FAILED"

@dataclass
class StateTransition:
    from_state: str
    to_state: str
    actor_id: str
    gate_id: Optional[str]
    timestamp: datetime
    metadata: Optional[Dict[str, Any]]

class ObligationFSM:
    def __init__(self):
        self.transitions = {
            ObligationState.NOT_STARTED: [ObligationState.DATA_COLLECTED, ObligationState.FAILED],
            ObligationState.DATA_COLLECTED: [ObligationState.RECONCILED, ObligationState.FAILED],
            ObligationState.RECONCILED: [ObligationState.RULES_CHECKED, ObligationState.FAILED],
            ObligationState.RULES_CHECKED: [ObligationState.REVIEW_PENDING, ObligationState.FAILED],
            ObligationState.REVIEW_PENDING: [ObligationState.REVIEWED, ObligationState.FAILED],
            ObligationState.REVIEWED: [ObligationState.SIGNING_PENDING, ObligationState.FAILED],
            ObligationState.SIGNING_PENDING: [ObligationState.SIGNED, ObligationState.FAILED],
            ObligationState.SIGNED: [ObligationState.TRANSMITTING, ObligationState.FAILED],
            ObligationState.TRANSMITTING: [ObligationState.FILED, ObligationState.FAILED],
            ObligationState.FILED: [ObligationState.ACKNOWLEDGED, ObligationState.FAILED],
            ObligationState.ACKNOWLEDGED: [ObligationState.FAILED],
            ObligationState.FAILED: []
        }
        self.history: Dict[str, List[StateTransition]] = {}
        self.states: Dict[str, ObligationState] = {}

    def transition(self, obligation_id: str, from_state: ObligationState, to_state: ObligationState, actor_id: str, gate_id: Optional[str] = None, metadata: Optional[Dict[str, Any]] = None) -> bool:
        current_state = self.get_state(obligation_id)
        if current_state != from_state:
            return False
            
        if not self.can_transition(from_state, to_state):
            return False
            
        transition = StateTransition(
            from_state=from_state.value,
            to_state=to_state.value,
            actor_id=actor_id,
            gate_id=gate_id,
            timestamp=datetime.now(),
            metadata=metadata
        )
        
        if obligation_id not in self.history:
            self.history[obligation_id] = []
            
        self.history[obligation_id].append(transition)
        self.states[obligation_id] = to_state
        return True

    def get_state(self, obligation_id: str) -> ObligationState:
        return self.states.get(obligation_id, ObligationState.NOT_STARTED)

    def can_transition(self, from_state: ObligationState, to_state: ObligationState) -> bool:
        if to_state == ObligationState.FAILED:
            return True
        return to_state in self.transitions.get(from_state, [])

    def get_valid_transitions(self, current_state: ObligationState) -> List[str]:
        return [state.value for state in self.transitions.get(current_state, [])] + [ObligationState.FAILED.value]

    def get_history(self, obligation_id: str) -> List[StateTransition]:
        return self.history.get(obligation_id, [])
